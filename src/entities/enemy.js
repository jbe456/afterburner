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
import { ARENA_HALF, ENEMY, ENEMY_TYPES } from "../config.js";
import { fireGun } from "./weapons.js";
import { burst, explode } from "./effects.js";
import { maybeDropPickup } from "./pickups.js";
import { sfx } from "../core/audio.js";

/** Enemies turn back once they get this close to the arena wall. */
const WALL_MARGIN = 500;

export function spawnEnemy(world, typeName) {
  const type = ENEMY_TYPES[typeName];
  const bearing = Math.random() * TAU;
  const range = rand(ENEMY.spawnDistance[0], ENEMY.spawnDistance[1]);
  const limit = ARENA_HALF - 300;

  const x = clamp(world.player.x + Math.cos(bearing) * range, -limit, limit);
  const y = clamp(world.player.y + Math.sin(bearing) * range, -limit, limit);

  world.enemies.push({
    type: typeName,
    x, y,
    angle: Math.atan2(world.player.y - y, world.player.x - x),
    speed: type.speed,
    hp: type.hp,
    maxHp: type.hp,
    radius: type.radius,
    fireCooldown: rand(20, 80), // staggered, so a wave doesn't volley in unison
    mode: "pursue",
    modeTimer: 0,
    evadeDir: Math.random() < 0.5 ? 1 : -1,
    trail: [],
    flash: 0,
  });
}

export function updateEnemy(world, e) {
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
  if (e.trail.length > 16) e.trail.shift();
  if (e.flash > 0) e.flash--;

  if (e.fireCooldown > 0) e.fireCooldown--;
  const canShoot = player.alive && e.mode !== "evade" && range < type.range
    && offBoresight < ENEMY.fireCone && e.fireCooldown <= 0;
  if (canShoot) {
    fireGun(world, e, false);
    e.fireCooldown = type.fireCd + rand(0, 10);
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
 * Apply damage. Returns true if this killed the enemy.
 * This is the single place an enemy leaves the world.
 */
export function damageEnemy(world, e, amount, hitX, hitY) {
  e.hp -= amount;
  e.flash = 5;
  burst(world, hitX, hitY, 5, "#ffd9a0", 3, 3, 16);
  sfx.hit();

  if (e.hp > 0) return false;

  const type = ENEMY_TYPES[e.type];
  explode(world, e.x, e.y, e.type === "heavy");
  world.score += type.score;
  world.kills++;

  const i = world.enemies.indexOf(e);
  if (i !== -1) world.enemies.splice(i, 1);

  maybeDropPickup(world, e.x, e.y);
  return true;
}
