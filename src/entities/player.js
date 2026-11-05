/**
 * The player's jet: flight model, weapons handling and missile lock.
 *
 * The flight model is the heart of the game. Turn rate scales *inversely*
 * with airspeed, so slowing down turns tighter. That one rule is what makes
 * throttle management, rather than reflexes, decide a turning fight.
 *
 * Per-airframe numbers live on `player.stats` (see PLANES in config.js); only
 * the handful of properties every jet shares come from PLAYER.
 */

import { clamp, angDiff, rand } from "../core/math.js";
import { input, isDown } from "../core/input.js";
import { viewport } from "../core/viewport.js";
import { sfx } from "../core/audio.js";
import {
  PLAYER, PLANES, DEFAULT_PLANE, LOCK, BOMB,
  ARENA_HALF, ARENA_DAMAGE_EDGE, EDGE_DAMAGE_PER_TICK,
} from "../config.js";
import { fireGun, fireMissile, dropBomb } from "./weapons.js";
import { explode, addShake } from "./effects.js";

/** Ticks between the jet being hit and the game-over screen appearing. */
const DEATH_DELAY = 72;

export function createPlayer(planeId = DEFAULT_PLANE) {
  const stats = PLANES[planeId] ?? PLANES[DEFAULT_PLANE];
  return {
    /** The chosen airframe's full stat block. */
    stats,
    x: 0,
    y: 0,
    angle: -Math.PI / 2, // nose north
    speed: stats.cruiseSpeed,
    hp: stats.maxHp,
    alive: true,
    gunCooldown: 0,
    missiles: stats.maxMissiles,
    missileCooldown: 0,
    /** Bombs are carried identically by every airframe — see BOMB in config.js. */
    bombs: BOMB.maxCarried,
    bombCooldown: 0,
    invuln: PLAYER.spawnInvuln,
    /** Current lock target, or null. */
    lock: null,
    /** Ticks the current target has been held; a solid lock needs LOCK.ticksToSolid. */
    lockTime: 0,
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

  if ((input.mouse.left || isDown("Space")) && p.gunCooldown <= 0) {
    fireGun(world, p, true);
    p.gunCooldown = p.stats.gunCooldown;
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
    turn = clamp(angDiff(desired, p.angle) / p.stats.turnRate, -1, 1);
  }

  p.angle += turn * agility(p);
}

/**
 * Effective turn rate. Flying slower turns tighter, which is why throttle
 * management decides a turning fight — and why a low minSpeed is an agility
 * stat in disguise.
 */
export function agility(p) {
  return p.stats.turnRate * (1.35 - 0.5 * (p.speed / p.stats.maxSpeed));
}

function applyThrottle(p) {
  const s = p.stats;
  const burning = isDown("KeyW", "ArrowUp", "ShiftLeft", "ShiftRight");
  const braking = isDown("KeyS", "ArrowDown");

  const target = burning ? s.maxSpeed : braking ? s.minSpeed : s.cruiseSpeed;
  p.speed += clamp(target - p.speed, -s.brake, s.accel);
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
