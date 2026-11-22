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
import { ARENA_HALF, CARRIER, ENEMY, ENEMY_TYPES, enemyWeapon } from "../config.js";
import {
  fireGun, fireEnemyMissile, dropEnemyBomb, fireEnemyFlame, fireEnemyLaser,
} from "./weapons.js";
import { burst, explode } from "./effects.js";
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

  world.enemies.push(e);
  return e;
}

export function updateEnemy(world, e) {
  // Carriers and anything on one of their decks are flown by carrier.js, in
  // its own pass. Two plain fields rather than an import, so neither file
  // depends on the other.
  if (e.carrier || e.onDeck) return;

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
  if (!lined) return;

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
 * Ticks every fire currently burning. Runs as its own pass because damage
 * here can kill, and killing mutates the enemy list.
 */
export function updateBurning(world) {
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
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
