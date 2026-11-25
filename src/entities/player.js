/**
 * The player's jet: flight model, weapons handling and missile lock.
 *
 * The flight model is the heart of the game. Turn rate scales *inversely*
 * with airspeed, so slowing down turns tighter. That one rule is what makes
 * throttle management, rather than reflexes, decide a turning fight.
 *
 * There is one airframe. Two fittings change how it flies — armour sets how
 * much it absorbs, the engine sets top speed — and both hang off the player
 * as specs. Everything else comes from PLAYER.
 */

import { clamp, angDiff, rand } from "../core/math.js";
import { input, isDown } from "../core/input.js";
import { viewport } from "../core/viewport.js";
import { sfx } from "../core/audio.js";
import {
  PLAYER, ARMOUR, ENGINES, DEFAULT_LOADOUT, LOCK,
  resolveWeapons, resolveMissile, resolveBomb,
  ARENA_HALF, ARENA_DAMAGE_EDGE, EDGE_DAMAGE_PER_TICK,
} from "../config.js";
import { fireGun, fireMissile, dropBomb, sprayFlame, fireLaser } from "./weapons.js";
import { explode, addShake } from "./effects.js";

/** Ticks between the jet being hit and the game-over screen appearing. */
const DEATH_DELAY = 72;

/**
 * @param {{armour?:string, engine?:string, cannon?:string, missile?:string,
 *          bomb?:string}} loadout
 *   Ids chosen in the hangar. Anything missing or unrecognised — a fitting
 *   removed since the choice was saved — falls back to the default.
 */
export function createPlayer(loadout = {}) {
  const pick = (table, id, fallback) => table[id] ?? table[fallback];

  const armour = pick(ARMOUR, loadout.armour, DEFAULT_LOADOUT.armour);
  const engine = pick(ENGINES, loadout.engine, DEFAULT_LOADOUT.engine);

  // The forward weapon comes from ladder rungs rather than a named model.
  // Exactly one of the three resolves; the other two come back null.
  const { weapon, cannon, flame, laser } = resolveWeapons({ ...DEFAULT_LOADOUT, ...loadout });

  // So does the missile: one airframe whose guidance, rack, warhead and
  // burn distance are all rungs rather than a model picked off a shelf.
  const missile = resolveMissile({ ...DEFAULT_LOADOUT, ...loadout });

  // And so does the bomb, with one extra input: the fitted engine, which
  // gates how short a fuse the system is allowed to run. Resolved against the
  // engine actually picked above, so an unrecognised engine id cannot unlock
  // a fuse the airframe has no business carrying.
  const bomb = resolveBomb({ ...DEFAULT_LOADOUT, ...loadout, engine: engine.id });

  return {
    /** How much the hull absorbs. */
    armour,
    /** Top speed and cruise; nothing about the armament but the fuse gate. */
    engine,
    /** Which forward weapon is carried: "cannon", "flame" or "laser". */
    weapon,
    /** The one that is carried holds numbers; the other two are null. */
    cannon,
    flame,
    laser,
    missile,
    bomb,
    x: 0,
    y: 0,
    angle: -Math.PI / 2, // nose north
    speed: engine.cruiseSpeed ?? PLAYER.cruiseSpeed,
    hp: armour.maxHp,
    alive: true,
    gunCooldown: 0,
    missiles: missile.carried,
    missileCooldown: 0,
    bombs: bomb.carried,
    bombCooldown: 0,
    invuln: PLAYER.spawnInvuln,
    /** Current lock target, or null. */
    lock: null,
    /** Ticks the current target has been held; a solid lock needs LOCK.ticksToSolid. */
    lockTime: 0,
    /** Set by an enemy flame or beam: {ticksLeft, dps}. */
    burn: null,
    /** 0..1, drives the exhaust flame. */
    boost: 0,
    trail: [],
  };
}

export function updatePlayer(world) {
  const p = world.player;
  if (!p.alive) return;

  applySteering(p);
  applyThrottle(p);

  p.x += Math.cos(p.angle) * p.speed;
  p.y += Math.sin(p.angle) * p.speed;

  enforceArena(world, p);

  p.trail.push({ x: p.x - Math.cos(p.angle) * 18, y: p.y - Math.sin(p.angle) * 18 });
  if (p.trail.length > PLAYER.trailLength) p.trail.shift();

  if (p.gunCooldown > 0) p.gunCooldown--;
  if (p.missileCooldown > 0) p.missileCooldown--;
  if (p.bombCooldown > 0) p.bombCooldown--;
  if (p.invuln > 0) p.invuln--;

  // Exactly one forward weapon is fitted: the guns on their own cadence, a
  // nose weapon continuously while the trigger is held.
  if (input.mouse.left || isDown("Space")) {
    if (p.cannon && p.gunCooldown <= 0) {
      fireGun(world, p, true);
      // Added rather than assigned, so a fractional cooldown carries its
      // remainder forward: 7.5 ticks fires on 8, 7, 8, 7 and averages the
      // 8/s the rung promises. The counter never runs below zero while the
      // trigger is off, so holding fire banks no free bursts.
      p.gunCooldown += p.cannon.cooldown;
    }
    if (p.flame) sprayFlame(world, p);
    if (p.laser) fireLaser(world, p);
  }
  if ((input.mouse.right || isDown("KeyF", "KeyX")) && p.missileCooldown <= 0) {
    fireMissile(world);
  }
  if (isDown("KeyB") && p.bombCooldown <= 0) {
    dropBomb(world);
  }

  updateLock(world, p);
}

function applySteering(p) {
  let turn = 0;
  if (isDown("KeyA", "ArrowLeft")) turn -= 1;
  if (isDown("KeyD", "ArrowRight")) turn += 1;

  // With no key held, steer toward the cursor. The camera lead cancels out of
  // this calculation, so the aim direction is simply cursor-minus-centre.
  if (turn === 0 && input.mouse.active) {
    const desired = Math.atan2(
      input.mouse.y - viewport.h / 2,
      input.mouse.x - viewport.w / 2,
    );
    turn = clamp(angDiff(desired, p.angle) / PLAYER.turnRate, -1, 1);
  }

  p.angle += turn * agility(p);
}

/**
 * Effective turn rate. Flying slower turns tighter, which is why throttle
 * management decides a turning fight.
 *
 * The penalty is measured against a shared reference speed rather than the
 * engine's own maximum, so going fast costs turn however fast your engine
 * happens to go: flat out on the best engine is the worst-turning you will
 * ever be, and throttling back is how you get it back.
 *
 * The factor is floored so a powerful enough engine cannot drive it to zero
 * or past it — below zero the jet would turn the wrong way.
 */
export function agility(p) {
  const factor = 1.35 - 0.5 * (p.speed / PLAYER.agilityReferenceSpeed);
  return PLAYER.turnRate * Math.max(PLAYER.minAgilityFactor, factor);
}

function applyThrottle(p) {
  const burning = isDown("KeyW", "ArrowUp", "ShiftLeft", "ShiftRight");
  const braking = isDown("KeyS", "ArrowDown");

  // Top speed and cruise are both the engine's; the stall is shared, so a
  // strong engine widens the band the throttle moves through rather than
  // sliding it bodily upward.
  const target = burning ? p.engine.maxSpeed
    : braking ? PLAYER.minSpeed
    : (p.engine.cruiseSpeed ?? PLAYER.cruiseSpeed);
  p.speed += clamp(target - p.speed, -PLAYER.brake, PLAYER.accel);
  p.boost = burning ? Math.min(p.boost + 0.12, 1) : Math.max(p.boost - 0.08, 0);
}

/** Outside the combat zone the hull bleeds and the jet is held at the wall. */
function enforceArena(world, p) {
  if (Math.abs(p.x) <= ARENA_DAMAGE_EDGE && Math.abs(p.y) <= ARENA_DAMAGE_EDGE) return;
  p.hp -= EDGE_DAMAGE_PER_TICK;
  world.hitFlash = Math.max(world.hitFlash, 0.25);
  p.x = clamp(p.x, -ARENA_HALF, ARENA_HALF);
  p.y = clamp(p.y, -ARENA_HALF, ARENA_HALF);
  if (p.hp <= 0) killPlayer(world);
}

/** Acquire the nearest enemy inside the forward cone, and hold it. */
function updateLock(world, p) {
  let best = null;
  let bestRange = Infinity;

  for (const e of world.enemies) {
    const range = Math.hypot(e.x - p.x, e.y - p.y);
    if (range > LOCK.range || range >= bestRange) continue;
    const bearing = Math.atan2(e.y - p.y, e.x - p.x);
    if (Math.abs(angDiff(bearing, p.angle)) > LOCK.cone) continue;
    bestRange = range;
    best = e;
  }

  if (best !== p.lock) {
    p.lockTime = 0;
    if (best) sfx.lock();
  }
  p.lock = best;
  if (best) p.lockTime = Math.min(p.lockTime + 1, 40);
}

/**
 * Set the player alight, or refresh a fire already burning. Same rule as the
 * enemy side: the fiercer source wins rather than the most recent one.
 */
export function ignitePlayer(world, burnSpec) {
  const p = world.player;
  if (!p.alive) return;
  if (p.burn && p.burn.dps > burnSpec.dps) {
    p.burn.ticksLeft = burnSpec.duration;
    return;
  }
  p.burn = { ticksLeft: burnSpec.duration, dps: burnSpec.dps };
}

/** Ticks the fire the player is carrying, if any. */
export function updatePlayerBurn(world) {
  const p = world.player;
  if (!p.alive || !p.burn) return;

  if (--p.burn.ticksLeft <= 0) { p.burn = null; return; }
  damagePlayer(world, p.burn.dps / 60);

  if (world.time % 3 === 0) {
    world.particles.push({
      x: p.x + rand(-9, 9), y: p.y + rand(-9, 9),
      vx: rand(-0.4, 0.4), vy: rand(-0.9, -0.3),
      life: 24, maxLife: 24,
      color: Math.random() < 0.6 ? "#ff8a3a" : "#ffd166", size: 5,
    });
  }
}

export function damagePlayer(world, amount) {
  const p = world.player;
  if (!p.alive || p.invuln > 0) return;
  p.hp -= amount;
  world.hitFlash = 1;
  if (p.hp <= 0) killPlayer(world);
}

export function killPlayer(world) {
  const p = world.player;
  if (!p.alive) return;
  p.alive = false;
  p.burn = null;
  p.hp = 0;
  explode(world, p.x, p.y, true);
  addShake(world, 30);
  world.deathTimer = DEATH_DELAY;
}

/**
 * Runs while the wreck falls, between the kill and the game-over screen.
 * Returns true on the tick the screen should appear.
 */
export function updateWreckage(world) {
  if (world.player.alive || world.deathTimer < 0) return false;
  world.deathTimer--;
  if (world.deathTimer === DEATH_DELAY - 11) {
    explode(world, world.player.x + rand(-30, 30), world.player.y + rand(-30, 30), false);
  }
  return world.deathTimer === 0;
}
