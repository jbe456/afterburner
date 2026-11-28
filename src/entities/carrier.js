/**
 * Carriers: the ships, their decks, and everything that happens on them.
 *
 * A carrier is not an aircraft and is not flown by the enemy AI. It ignores
 * the player completely — it crosses the map on the heading it arrived on,
 * turns away from the wall, and does two things the whole time it is alive:
 * it launches aircraft, and it takes back damaged ones and repairs them.
 *
 * Everything here works through two plain fields, so `enemy.js` needs no
 * import from this file and there is no cycle between them:
 *
 *   e.carrier   this entity is a ship; enemy.js leaves it alone
 *   e.onDeck    this aircraft is on a ship's deck; enemy.js leaves it alone
 *
 * The deck is the whole balance of the thing. It has `CARRIER.deckSlots` and
 * takeoffs, landing approaches and repairs all compete for them, so an attack
 * that keeps a carrier's aircraft hurt is also an attack on its ability to
 * launch more. Aircraft on a deck stay in `world.enemies`: they are targets,
 * they still count for wave clearance, and sinking the ship takes them with it.
 */

import { steer, rand } from "../core/math.js";
import {
  ARENA_HALF, CARRIER, ENEMY_TYPES, ENEMY_TYPE_IDS, WAVES, LAVA,
} from "../config.js";
import { spawnEnemyAt, damageEnemy } from "./enemy.js";
import { resolveRockContact, firstRockOnRay } from "./lava.js";
import { fireSam } from "./weapons.js";

/** Carriers turn back this far from the arena wall, as aircraft do. */
const WALL_MARGIN = 700;

/**
 * One tick of every carrier, then one tick of everything sitting on a deck.
 *
 * Two passes rather than one: a launch pushes into `world.enemies`, and the
 * aircraft it pushes should be serviced only once its ship has already moved,
 * or it would spend its first tick parked where the ship used to be.
 */
export function updateCarriers(world) {
  for (const e of world.enemies) if (e.carrier) updateCarrier(world, e);
  for (const e of world.enemies) if (e.onDeck) serviceDeck(world, e);
}

function updateCarrier(world, ship) {
  const type = ENEMY_TYPES[ship.type];

  // A frozen ship is a statue: it does not steer, move, shoot, launch or
  // service a deck, and every timer it holds — SAM, launch interval, swarm
  // stagger — is held where it stood rather than running down out of sight.
  // Returning before any of them is what guarantees that; a ship whose
  // cooldowns kept ticking would thaw and immediately empty its whole deck.
  if (ship.frozen > 0) { ship.frozen--; if (ship.flash > 0) ship.flash--; return; }

  // The only thing that ever changes its mind for it.
  if (Math.abs(ship.x) > ARENA_HALF - WALL_MARGIN
      || Math.abs(ship.y) > ARENA_HALF - WALL_MARGIN) {
    ship.angle = steer(ship.angle, Math.atan2(-ship.y, -ship.x), type.turn);
  }
  ship.x += Math.cos(ship.angle) * ship.speed;
  ship.y += Math.sin(ship.angle) * ship.speed;

  // A wall stops a ship exactly as it stops an aircraft. It does not steer
  // around one — the heading it arrived on is still the only heading it has —
  // it simply stops, and spends its battery digging through instead. See
  // `fireBattery`: that is where a wall does its real damage to a carrier.
  if (resolveRockContact(world, ship, ship.radius)) {
    damageEnemy(world, ship, ship.speed * LAVA.impactDamagePerSpeed, ship.x, ship.y,
      { quiet: true });
    if (!world.enemies.includes(ship)) return;
  }

  if (ship.flash > 0) ship.flash--;

  fireBattery(world, ship, type);
  recover(world, ship);
  launch(world, ship, type);
}

/**
 * The SAM battery. All-aspect and no cone at all: it does not have a nose to
 * point, so the only thing that decides whether it shoots is whether you are
 * inside the envelope.
 */
function fireBattery(world, ship, type) {
  if (ship.samCooldown > 0) ship.samCooldown--;
  if (ship.samCooldown > 0) return;

  // A ship that cannot get past a wall points its battery at the wall.
  //
  // This is the whole of what a carrier does about terrain, and it is also
  // the best reason to build a wall in front of one: the same launcher cannot
  // be shooting at you and digging at the same time. Walling a Supercarrier
  // off does not stop it for long — its battery is the nastiest in the game,
  // so it digs fastest — but for as long as it is digging it is stationary
  // and silent, which is the longest any boss in this game is ever harmless.
  const blockage = firstRockOnRay(
    world, ship.x, ship.y, ship.angle, ship.radius + LAVA.shipLookahead);
  if (blockage) {
    fireSam(world, ship, type.sam, blockage);
    ship.samCooldown = type.sam.cooldown;
    return;
  }

  if (!world.player.alive) return;

  const range = Math.hypot(world.player.x - ship.x, world.player.y - ship.y);
  if (range > type.sam.range) return;

  fireSam(world, ship, type.sam);
  ship.samCooldown = type.sam.cooldown;
}

// --- launching --------------------------------------------------------------

function deckFull(ship) {
  return ship.deck.length >= CARRIER.deckSlots;
}

/**
 * Put another aircraft in the air.
 *
 * A swarm draw is not thirty simultaneous catapult shots: it fills a queue
 * that streams off the deck at the same stagger `startWave` uses, with a
 * short takeoff run so three are rolling at once rather than thirty.
 */
function launch(world, ship, type) {
  if (!world.player.alive) return;

  if (ship.swarmQueue.length) {
    if (ship.swarmTimer > 0) ship.swarmTimer--;
    if (ship.swarmTimer <= 0 && !deckFull(ship)) {
      launchOne(world, ship, ship.swarmQueue.pop(), CARRIER.swarmTakeoffTicks);
      ship.swarmTimer = WAVES.swarmStagger;
    }
    return; // one draw at a time; the interval resumes once the swarm is away
  }

  if (ship.launchCooldown > 0) ship.launchCooldown--;
  if (ship.launchCooldown > 0 || deckFull(ship)) return;

  const id = drawFromHangar(world.wave);
  if (!id) return;

  const swarm = ENEMY_TYPES[id].swarm;
  if (swarm) {
    for (let n = 0; n < swarm; n++) ship.swarmQueue.push(id);
    ship.swarmTimer = 0;
  } else {
    launchOne(world, ship, id, CARRIER.takeoffTicks);
  }
  ship.launchCooldown = type.carrier.launchInterval;
}

/**
 * What a carrier is holding. Anything the wave composer could legally draw by
 * now, carriers excepted — including swarms and the capped heavyweights,
 * whose caps govern what a *wave* contains rather than what a ship carries.
 *
 * Exported for the carrier checks, which care that this is never empty.
 */
export function hangarPool(wave) {
  return ENEMY_TYPE_IDS.filter((id) => {
    const type = ENEMY_TYPES[id];
    return !type.carrier && wave >= type.fromWave;
  });
}

function drawFromHangar(wave) {
  const pool = hangarPool(wave);
  if (!pool.length) return null;

  const total = pool.reduce((sum, id) => sum + ENEMY_TYPES[id].weight, 0);
  let roll = Math.random() * total;
  for (const id of pool) {
    roll -= ENEMY_TYPES[id].weight;
    if (roll <= 0) return id;
  }
  return pool[pool.length - 1];
}

/** One aircraft off the bow, rolling rather than flying. */
function launchOne(world, ship, typeName, takeoffTicks) {
  const offset = ship.radius * CARRIER.bowOffset;
  const plane = spawnEnemyAt(
    world, typeName,
    ship.x + Math.cos(ship.angle) * offset,
    ship.y + Math.sin(ship.angle) * offset,
    ship.angle,
  );
  plane.speed = ship.speed; // it has to build its own speed up from the deck
  plane.onDeck = { ship, state: "takeoff", timer: takeoffTicks };
  ship.deck.push(plane);
}

// --- recovery ---------------------------------------------------------------

/**
 * Take damaged aircraft back aboard. The carrier reaches for them rather than
 * their AI deciding to land, which keeps every deck rule in this one file.
 *
 * A slot is reserved the moment one is claimed, so two carriers cannot both
 * book the same aircraft and a deck cannot be oversubscribed in flight.
 */
function recover(world, ship) {
  if (deckFull(ship)) return;

  for (const e of world.enemies) {
    if (e.carrier || e.onDeck) continue;
    if (e.hp >= ENEMY_TYPES[e.type].hp * CARRIER.landThreshold) continue;
    if (Math.hypot(e.x - ship.x, e.y - ship.y) > CARRIER.landRange) continue;

    e.onDeck = { ship, state: "approach", timer: 0 };
    ship.deck.push(e);
    if (deckFull(ship)) return;
  }
}

// --- the deck ---------------------------------------------------------------

/**
 * One tick of an aircraft that belongs to a deck.
 *
 * In all three states it neither steers for itself nor fires — `enemy.js`
 * skips anything carrying `onDeck` — so a carrier's brood is harmless while
 * it is landing, parked or rolling, and easy to kill in all three.
 */
function serviceDeck(world, plane) {
  const { ship, state } = plane.onDeck;
  const type = ENEMY_TYPES[plane.type];

  // A frozen aircraft holds its deck state wherever it was: mid-approach it
  // stops short of the ship, parked it stops repairing, rolling it stops
  // rolling. The slot stays occupied the whole time, which is the point —
  // freezing something on a deck denies the ship one of its three.
  if (plane.frozen > 0) {
    plane.frozen--;
    plane.speed = 0;
    if (plane.flash > 0) plane.flash--;
    return;
  }

  if (state === "approach") approach(plane, ship, type);
  else if (state === "repair") repair(plane, ship, type);
  else takeoff(world, plane, ship, type);

  if (plane.flash > 0) plane.flash--;
}

/** Flying itself home. The only deck state in which it still moves on its own. */
function approach(plane, ship, type) {
  const bearing = Math.atan2(ship.y - plane.y, ship.x - plane.x);
  plane.angle = steer(plane.angle, bearing, type.turn);
  plane.speed += Math.min(type.speed - plane.speed, 0.05);
  plane.x += Math.cos(plane.angle) * plane.speed;
  plane.y += Math.sin(plane.angle) * plane.speed;

  plane.trail.push({
    x: plane.x - Math.cos(plane.angle) * 16,
    y: plane.y - Math.sin(plane.angle) * 16,
  });
  if (plane.trail.length > (type.trail ?? 16)) plane.trail.shift();

  if (Math.hypot(ship.x - plane.x, ship.y - plane.y) > ship.radius) return;

  plane.onDeck.state = "repair";
  plane.onDeck.timer = CARRIER.repairTicks;
  plane.trail.length = 0; // nothing parked is leaving a contrail
}

/** Parked aft, moving with the ship, hull coming back. A free shot for you. */
function repair(plane, ship, type) {
  park(plane, ship);
  plane.hp = Math.min(plane.maxHp, plane.hp + plane.maxHp / CARRIER.repairTicks);

  if (--plane.onDeck.timer > 0) return;

  plane.hp = plane.maxHp;
  plane.speed = ship.speed;
  plane.onDeck.state = "takeoff";
  plane.onDeck.timer = CARRIER.takeoffTicks;
}

/** Three parking places across the after deck, so they do not stack up. */
function park(plane, ship) {
  const slot = ship.deck.indexOf(plane);
  const across = (slot - (CARRIER.deckSlots - 1) / 2) * ship.radius * 0.34;
  const perpendicular = ship.angle + Math.PI / 2;

  plane.angle = ship.angle;
  plane.x = ship.x - Math.cos(ship.angle) * ship.radius * 0.35
    + Math.cos(perpendicular) * across;
  plane.y = ship.y - Math.sin(ship.angle) * ship.radius * 0.35
    + Math.sin(perpendicular) * across;
}

/** The catapult run: straight down the deck, building speed, guns cold. */
function takeoff(world, plane, ship, type) {
  plane.angle = ship.angle;
  plane.speed += Math.min(type.speed - plane.speed, 0.14);
  plane.x += Math.cos(plane.angle) * plane.speed;
  plane.y += Math.sin(plane.angle) * plane.speed;

  if (world.time % 3 === 0) {
    world.particles.push({
      x: plane.x - Math.cos(plane.angle) * 14 + rand(-4, 4),
      y: plane.y - Math.sin(plane.angle) * 14 + rand(-4, 4),
      vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4),
      life: 16, maxLife: 16, color: "#c9d6e0", size: 5,
    });
  }

  if (--plane.onDeck.timer > 0) return;

  release(plane);
}

/** Hand an aircraft back to the ordinary enemy AI and free its slot. */
export function release(plane) {
  const deck = plane.onDeck.ship.deck;
  const i = deck.indexOf(plane);
  if (i !== -1) deck.splice(i, 1);
  plane.onDeck = null;
}
