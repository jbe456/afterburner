/**
 * Enemy spawning, AI and damage resolution.
 *
 * The AI is a three-state machine re-evaluated on a timer rather than every
 * tick, which stops jets from oscillating between decisions and makes their
 * behaviour readable in the air:
 *
 *   pursue — fly an intercept, leading the player's position
 *   evade  — break hard, used when too close or when the player has angles
 *   patrol — idle wander, only once the player is dead
 */

import { rand, clamp, steer, angDiff, TAU } from "../core/math.js";
import {
  ARENA_HALF, CARRIER, ENEMY, ENEMY_TYPES, enemyWeapon, CANNON, LAVA,
} from "../config.js";
import {
  fireGun, fireEnemyMissile, dropEnemyBomb, fireEnemyFlame, fireEnemyLaser,
} from "./weapons.js";
import { burst, explode } from "./effects.js";
import {
  resolveRockContact, isWedged, hottestLavaTouching, nudgeOutOfRock,
} from "./lava.js";
import { maybeDropPickup } from "./pickups.js";
import { sfx } from "../core/audio.js";

/** Enemies turn back once they get this close to the arena wall. */
const WALL_MARGIN = 500;

/**
 * @param {number|null} [groupBearing]
 *   Shared approach bearing for a swarm, so its members enter together from
 *   one quarter of the sky instead of surrounding you on arrival. Each still
 *   gets a little scatter, or they would fly in as a line.
 */
export function spawnEnemy(world, typeName, groupBearing = null) {
  const type = ENEMY_TYPES[typeName];

  // A ship does not arrive on a ring around you. It comes in off the edge of
  // the arena and crosses, which is the whole shape of the encounter: it is
  // somewhere else, and closing with it is your decision rather than its.
  if (type.carrier) {
    const edge = ARENA_HALF - CARRIER.edgeInset;
    const bearing = Math.random() * TAU;
    return spawnEnemyAt(
      world,
      typeName,
      Math.cos(bearing) * edge,
      Math.sin(bearing) * edge,
      bearing + Math.PI + rand(-0.5, 0.5), // across the map, not along the rim
    );
  }

  const bearing = groupBearing === null
    ? Math.random() * TAU
    : groupBearing + rand(-0.3, 0.3);
  const range = rand(ENEMY.spawnDistance[0], ENEMY.spawnDistance[1]);
  const limit = ARENA_HALF - 300;

  const x = clamp(world.player.x + Math.cos(bearing) * range, -limit, limit);
  const y = clamp(world.player.y + Math.sin(bearing) * range, -limit, limit);

  return spawnEnemyAt(
    world, typeName, x, y,
    Math.atan2(world.player.y - y, world.player.x - x),
  );
}

/**
 * Put an aircraft or a ship into the world at an exact place and heading.
 * The single door everything enters by, as `damageEnemy` is the single door
 * everything leaves by — carriers launch through here too.
 *
 * @returns the new entity, so a caller can go on to claim it.
 */
export function spawnEnemyAt(world, typeName, x, y, angle) {
  const type = ENEMY_TYPES[typeName];

  const e = {
    type: typeName,
    x, y, angle,
    speed: type.speed,
    hp: type.hp,
    maxHp: type.hp,
    radius: type.radius,
    fireCooldown: rand(20, 80), // staggered, so a wave doesn't volley in unison
    // Staggered well apart, or a pair of Basilisks would salvo together.
    missileCooldown: type.missile ? rand(90, type.missile.cooldown) : 0,
    bombCooldown: type.bomb ? rand(60, type.bomb.cooldown) : 0,
    mode: "pursue",
    modeTimer: 0,
    evadeDir: Math.random() < 0.5 ? 1 : -1,
    trail: [],
    flash: 0,
    /** Set by incendiary rounds: {ticksLeft, dps}. */
    burn: null,
    /**
     * Damage per second from poison warheads, which never lifts. A plain
     * running total rather than a list of stacks: poison is a rate, and two
     * rates are one rate, so there is nothing a second number would record.
     */
    poison: 0,
    /** Ticks left frozen. Freezing is a state, so there is only ever one. */
    frozen: 0,
    /** Set while this aircraft belongs to a carrier's deck; see carrier.js. */
    onDeck: null,
  };

  if (type.carrier) {
    /** Marks this as a ship: carrier.js flies it, and updateEnemy leaves it. */
    e.carrier = true;
    /** Aircraft occupying a deck slot — landing, parked, or rolling. */
    e.deck = [];
    e.launchCooldown = rand(30, type.carrier.launchInterval);
    e.samCooldown = rand(30, type.sam.cooldown);
    /** A swarm draw, streaming off the deck one at a time. */
    e.swarmQueue = [];
    e.swarmTimer = 0;
  }

  // Terrain outlives waves, so a spawn point chosen by the wave logic can
  // be inside a wall that did not exist when the run started. Put it down
  // where there is room rather than let it grind its way out on camera.
  nudgeOutOfRock(world, e, e.radius);

  world.enemies.push(e);
  return e;
}

export function updateEnemy(world, e) {
  // Carriers and anything on one of their decks are flown by carrier.js, in
  // its own pass. Two plain fields rather than an import, so neither file
  // depends on the other.
  if (e.carrier || e.onDeck) return;

  // Frozen is the whole of this function and nothing else: no steering, no
  // movement, no trigger. Returning here rather than zeroing a dozen fields
  // is what makes "it cannot move and it cannot fire" one readable claim
  // instead of a list that a later weapon could quietly fall off.
  //
  // What it deliberately does not touch: fires and poison already on the
  // aircraft, which tick in their own passes, and missiles it launched before
  // it froze, which are their own entities and keep flying.
  if (tickFrozen(e)) return;

  const type = ENEMY_TYPES[e.type];
  const player = world.player;

  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const range = Math.hypot(dx, dy);
  const bearingToPlayer = Math.atan2(dy, dx);
  const offBoresight = Math.abs(angDiff(bearingToPlayer, e.angle));

  if (--e.modeTimer <= 0) chooseMode(e, player, dx, dy, range);

  let desiredHeading;
  if (e.mode === "evade") {
    desiredHeading = e.angle + e.evadeDir * 0.6;
    e.speed += clamp(type.speed * 1.15 - e.speed, -0.1, 0.07); // firewall it
  } else if (e.mode === "patrol") {
    desiredHeading = e.angle + Math.sin(world.time * 0.01 + e.x * 0.001) * 0.3;
  } else {
    desiredHeading = Math.atan2(...aimPoint(player, range, e));
    e.speed += clamp(type.speed - e.speed, -0.08, 0.05);
  }

  // Wall avoidance overrides whatever the AI wanted to do.
  if (Math.abs(e.x) > ARENA_HALF - WALL_MARGIN || Math.abs(e.y) > ARENA_HALF - WALL_MARGIN) {
    desiredHeading = Math.atan2(-e.y, -e.x);
  }

  e.angle = steer(e.angle, desiredHeading, type.turn);
  e.x += Math.cos(e.angle) * e.speed;
  e.y += Math.sin(e.angle) * e.speed;

  // Nothing above looked where it was going. Aircraft have never avoided
  // anything in this game and they do not start now: a wall drawn across
  // their approach is a trap precisely because they fly into it, grind along
  // it, and burn on whatever is still molten. What stops that being a jet
  // welded to a rock forever is `fireForwardWeapon`, which lets one that has
  // been stuck a full second shoot its way out.
  if (resolveRockContact(world, e, e.radius)) {
    damageEnemy(world, e, e.speed * LAVA.impactDamagePerSpeed, e.x, e.y, { quiet: true });
    if (!world.enemies.includes(e)) return;
  }

  e.trail.push({ x: e.x - Math.cos(e.angle) * 16, y: e.y - Math.sin(e.angle) * 16 });
  if (e.trail.length > (type.trail ?? 16)) e.trail.shift();
  if (e.flash > 0) e.flash--;

  fireForwardWeapon(world, e, type, player, range, offBoresight);
  updateOrdnance(world, e, type, player, range, offBoresight);
}

/**
 * Whichever single forward weapon this type carries.
 *
 * Guns go off on a cooldown; a flame or a beam is continuous, emitting every
 * tick the target is in front of it, exactly as the player's do.
 */
function fireForwardWeapon(world, e, type, player, range, offBoresight) {
  if (e.fireCooldown > 0) e.fireCooldown--;

  const lined = player.alive && e.mode !== "evade"
    && range < type.range && offBoresight < ENEMY.fireCone;

  // Dumb about flying into rock, pragmatic about leaving it.
  //
  // A jet that is lined up on you and has a wall in the way needs nothing
  // special: it shoots at you, and the wall eats the rounds, which is the
  // same thing as shooting the wall. The case that needs saying out loud is
  // the one where it has nothing to shoot at and is wedged anyway — out of
  // range, or breaking away — because that jet would otherwise sit parked on
  // a rock for the rest of the wave. Its nose is already buried in the thing
  // stopping it, so permission to fire is the whole of the fix; no aiming is
  // required and none is done.
  //
  // This is the only place an aircraft acknowledges terrain at all, and it is
  // deliberately about the gun rather than the stick. Letting them *steer*
  // around walls would make walls decorative.
  if (!lined && !isWedged(e)) return;

  switch (enemyWeapon(type)) {
    case "flame":
      fireEnemyFlame(world, e, type.flame);
      break;
    case "laser":
      fireEnemyLaser(world, e, type.laser);
      break;
    default:
      if (e.fireCooldown <= 0) {
        fireGun(world, e, false);
        e.fireCooldown = type.fireCd + rand(0, 10);
      }
  }
}

/**
 * Missiles and mines, for the types that carry them.
 *
 * Missiles need only a loose cone — they steer themselves — so a Lancer can
 * launch from well off the nose. Mines are dropped blind, whenever the thing
 * is near enough that you might fly through where it has been.
 */
function updateOrdnance(world, e, type, player, range, offBoresight) {
  if (type.missile) {
    if (e.missileCooldown > 0) e.missileCooldown--;
    const spec = type.missile;
    const canLaunch = player.alive && e.mode !== "evade"
      && range < spec.range && offBoresight < spec.cone && e.missileCooldown <= 0;
    if (canLaunch) {
      fireEnemyMissile(world, e, spec);
      e.missileCooldown = spec.cooldown + rand(0, 60);
    }
  }

  if (type.bomb) {
    if (e.bombCooldown > 0) e.bombCooldown--;
    // Only worth seeding where the player might actually go.
    if (player.alive && e.bombCooldown <= 0 && range < 1600) {
      dropEnemyBomb(world, e, type.bomb);
      e.bombCooldown = type.bomb.cooldown + rand(0, 90);
    }
  }
}

function chooseMode(e, player, dx, dy, range) {
  if (!player.alive) {
    e.mode = "patrol";
    e.modeTimer = 60;
    return;
  }
  if (range < ENEMY.breakDistance) {
    e.mode = "evade";
    e.modeTimer = 70;
    e.evadeDir = Math.random() < 0.5 ? 1 : -1;
    return;
  }
  if (range > ENEMY.chaseDistance) {
    e.mode = "pursue";
    e.modeTimer = 60;
    return;
  }

  // If the player is sitting on our six with a firing solution, break away.
  const playerOnOurTail =
    Math.abs(angDiff(Math.atan2(-dy, -dx), player.angle)) < 0.4 && range < 900;

  if (playerOnOurTail && Math.random() < 0.7) {
    e.mode = "evade";
    e.modeTimer = rand(45, 90);
    e.evadeDir = Math.random() < 0.5 ? 1 : -1;
  } else {
    e.mode = "pursue";
    e.modeTimer = rand(40, 90);
  }
}

/**
 * Lead pursuit: aim where the player *will* be, scaled by range so distant
 * targets get more lead. Returns [dy, dx] ready for Math.atan2.
 */
function aimPoint(player, range, e) {
  const lead = clamp(range / 13, 0, ENEMY.maxLeadTicks);
  const px = player.x + Math.cos(player.angle) * player.speed * lead;
  const py = player.y + Math.sin(player.angle) * player.speed * lead;
  return [py - e.y, px - e.x];
}

/**
 * Set an enemy alight, or refresh a fire already burning on it.
 *
 * Burn damage does not stack — a longer burn is the reward for staying on
 * target, not a multiplying one. Where two sources overlap, as the flame and
 * the laser will when both are fitted, the fiercer one wins rather than
 * whichever happened to be applied last.
 */
export function ignite(world, e, burnSpec) {
  if (e.burn && e.burn.dps > burnSpec.dps) {
    e.burn.ticksLeft = burnSpec.duration;
    return;
  }
  e.burn = { ticksLeft: burnSpec.duration, dps: burnSpec.dps };
}

/**
 * Add a poison warhead's drain to whatever is already running on a target.
 *
 * The opposite rule to the one above, and deliberately: a fire is a state
 * that one source or another owns, so the fiercer wins; poison is a rate, so
 * rates add. There is no duration because there is no end — the mark runs
 * until the aircraft is dead, which is what makes a single poison missile a
 * kill on anything, and why the rack holds six rather than thirty.
 */
export function poisonEnemy(e, potency) {
  e.poison += potency;
}

/**
 * Stop an aircraft, or reset a freeze already on it.
 *
 * Frozen is binary — nothing is more frozen than frozen — so a second hit
 * cannot add to the first and instead resets the window to its full length,
 * the way `ignite` refreshes a fire. A hit three seconds into an eight
 * second freeze therefore leaves eight, extending it by three. The ceiling
 * on one target is one rung, and holding something longer than that costs a
 * missile every time.
 */
export function freezeEnemy(e, ticks) {
  e.frozen = Math.max(e.frozen, ticks);
}

/**
 * One tick of a freeze, run before anything the aircraft would otherwise do.
 * @returns true while it is still held, which is the caller's cue to stop.
 */
function tickFrozen(e) {
  if (e.frozen <= 0) return false;
  e.frozen--;
  // Held still rather than coasting: "cannot move" reads as a bug if the
  // aircraft keeps sliding across the sky on its last heading.
  e.speed = 0;
  if (e.flash > 0) e.flash--;
  return true;
}

/**
 * Ticks every poison mark in the world. Its own pass for the same reason
 * `updateBurning` is: damage here can kill, and killing mutates the list.
 *
 * Nothing expires and nothing is cleared, so unlike a fire there is no state
 * to retire — an aircraft carrying poison carries it to the ground.
 */
export function updatePoison(world) {
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (e.poison <= 0) continue;

    // Quietly, or a target holding six marks would be six hit sounds and six
    // showers of sparks every single tick.
    damageEnemy(world, e, e.poison / 60, e.x, e.y, { quiet: true });

    if (world.time % 5 === 0) {
      world.particles.push({
        x: e.x + rand(-8, 8), y: e.y + rand(-8, 8),
        vx: rand(-0.25, 0.25), vy: rand(-0.5, -0.1),
        life: 30, maxLife: 30,
        color: Math.random() < 0.6 ? "#46d97a" : "#9bf0b8", size: 4,
      });
    }
  }
}

/**
 * Ticks every fire currently burning. Runs as its own pass because damage
 * here can kill, and killing mutates the enemy list.
 */
export function updateBurning(world) {
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];

    // Molten rock lights whatever is sitting in it, every tick it is sitting
    // there, and the fire then follows it out for `CANNON.burnDuration` — the
    // same bargain the flame, the beam and burning ground already strike. The
    // player half of this is in player.js, because each side owns its own
    // fire and neither module needs to know the other exists.
    const dps = hottestLavaTouching(world, e.x, e.y, e.radius);
    if (dps > 0) ignite(world, e, { dps, duration: CANNON.burnDuration });

    if (!e.burn) continue;

    if (--e.burn.ticksLeft <= 0) { e.burn = null; continue; }

    // Quietly, or every frame would be a hit sound and a shower of sparks.
    damageEnemy(world, e, e.burn.dps / 60, e.x, e.y, { quiet: true });

    if (world.time % 4 === 0) {
      world.particles.push({
        x: e.x + rand(-7, 7), y: e.y + rand(-7, 7),
        vx: rand(-0.3, 0.3), vy: rand(-0.8, -0.3),
        life: 26, maxLife: 26, color: Math.random() < 0.6 ? "#ff8a3a" : "#ffd166", size: 5,
      });
    }
  }
}

/**
 * Apply damage. Returns true if this killed the enemy.
 * This is the single place an enemy leaves the world.
 *
 * `quiet` suppresses the impact sound and sparks, for damage that arrives
 * every tick rather than on a discrete hit.
 */
export function damageEnemy(world, e, amount, hitX, hitY, { quiet = false } = {}) {
  e.hp -= amount;
  if (!quiet) {
    e.flash = 5;
    burst(world, hitX, hitY, 5, "#ffd9a0", 3, 3, 16);
    sfx.hit();
  }

  if (e.hp > 0) return false;

  const type = ENEMY_TYPES[e.type];
  explode(world, e.x, e.y, type.radius >= 20);
  world.score += type.score;
  world.kills++;

  const i = world.enemies.indexOf(e);
  if (i !== -1) world.enemies.splice(i, 1);

  // Anything leaving the world has to let go of the deck it was on, or the
  // ship would go on servicing a wreck and hold the slot forever.
  if (e.onDeck) {
    const deck = e.onDeck.ship.deck;
    const k = deck.indexOf(e);
    if (k !== -1) deck.splice(k, 1);
    e.onDeck = null;
  }
  if (e.carrier) sinkDeck(world, e);

  maybeDropPickup(world, e.x, e.y);
  return true;
}

/**
 * A carrier takes its deck down with it: everything landing, parked or still
 * rolling dies with the ship. That is the payoff for going through the hull
 * rather than picking off what comes out of it, and it is why the deck is
 * worth watching before you commit to the kill.
 *
 * Quietly, because this lands on the same tick as the ship's own explosion
 * and three more hit sounds on top of it is just noise.
 */
function sinkDeck(world, ship) {
  const aboard = ship.deck.slice();
  ship.deck.length = 0;

  for (const plane of aboard) {
    plane.onDeck = null;
    damageEnemy(world, plane, Infinity, plane.x, plane.y, { quiet: true });
  }
}
