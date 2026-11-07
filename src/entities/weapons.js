/**
 * Firing: turning a trigger pull into projectiles.
 * The projectiles' own flight and impact live in projectiles.js.
 *
 * The player's three weapons are chosen in the hangar and hang off the player
 * as `cannon`, `missile` and `bomb` specs; enemies keep using their own type
 * profile. Nothing here knows which specific weapon was picked — it reads
 * whatever spec it is handed.
 */

import { rand } from "../core/math.js";
import { sfx } from "../core/audio.js";
import { ENEMY, ENEMY_TYPES, LOCK, MISSILE } from "../config.js";
import { muzzleFlash, addShake } from "./effects.js";

/** Where each barrel sits relative to the nose, by barrel count. */
const BARREL_OFFSETS = { 1: [0], 2: [-11, 11], 3: [-14, 0, 14] };

/**
 * Cannon fire. Rounds inherit half the shooter's velocity, so a fast pass
 * genuinely throws shots further forward rather than firing from a standstill.
 */
export function fireGun(world, shooter, isPlayer) {
  const spec = isPlayer ? shooter.cannon : ENEMY_TYPES[shooter.type];

  // Enemy profiles happen to use the same field names for these two.
  const spread = spec.spread;
  const damage = spec.damage;
  const speed = isPlayer ? spec.bulletSpeed : ENEMY.bulletSpeed;
  const life = isPlayer ? spec.bulletLife : ENEMY.bulletLife;
  const offsets = isPlayer ? (BARREL_OFFSETS[spec.barrels] ?? [0]) : [0];

  for (const offset of offsets) {
    const angle = shooter.angle + rand(-spread, spread);
    const x = shooter.x + Math.cos(angle) * 20 + Math.cos(angle + Math.PI / 2) * offset;
    const y = shooter.y + Math.sin(angle) * 20 + Math.sin(angle + Math.PI / 2) * offset;

    world.bullets.push({
      x, y,
      prevX: x, prevY: y, // tracers are drawn as the segment travelled this tick
      vx: Math.cos(angle) * speed + Math.cos(shooter.angle) * shooter.speed * 0.5,
      vy: Math.sin(angle) * speed + Math.sin(shooter.angle) * shooter.speed * 0.5,
      life,
      damage,
      friendly: isPlayer,
      /** How many more aircraft this round can pass through. */
      pierce: isPlayer ? spec.pierce : 1,
      /** Already-struck targets, so one round cannot hit the same jet twice. */
      struck: null,
      burn: isPlayer ? spec.burn : null,
      color: isPlayer ? spec.tracer : "#ff8a5c",
      width: isPlayer ? spec.tracerWidth : 2.6,
    });
  }

  muzzleFlash(
    world,
    shooter.x + Math.cos(shooter.angle) * 22,
    shooter.y + Math.sin(shooter.angle) * 22,
    isPlayer ? 10 : 7,
  );
  isPlayer ? sfx.gun() : sfx.enemyGun();
}

/** True if the chosen missile is willing to leave the rail right now. */
export function missileReady(player) {
  if (player.missiles <= 0 || player.missileCooldown > 0) return false;
  if (!player.missile.requiresLock) return true;
  return Boolean(player.lock) && player.lockTime >= LOCK.ticksToSolid;
}

/**
 * Launch missiles. Guided types inherit the current lock and re-acquire in
 * flight; unguided ones fly where the nose was pointing and nowhere else.
 */
export function fireMissile(world) {
  const player = world.player;
  if (!missileReady(world.player)) return;

  const spec = player.missile;
  const salvo = Math.min(spec.perShot, player.missiles);
  player.missiles -= salvo;
  player.missileCooldown = spec.cooldown;

  for (let i = 0; i < salvo; i++) {
    // Alternate rails so a salvo visibly comes off both wings.
    const side = i % 2 === 0 ? 1 : -1;
    const perpendicular = player.angle + Math.PI / 2;
    // Unguided rockets get a touch of dispersion; guided ones do not need it.
    const aim = spec.turnRate > 0 ? player.angle : player.angle + rand(-0.035, 0.035);

    world.missiles.push({
      spec,
      x: player.x + Math.cos(perpendicular) * 14 * side,
      y: player.y + Math.sin(perpendicular) * 14 * side,
      angle: aim,
      speed: spec.launchSpeed,
      target: spec.turnRate > 0 ? player.lock : null,
      life: spec.life,
      arming: MISSILE.armingDelay,
    });
  }

  sfx.missile();
  addShake(world, 3);
}

/**
 * Leave a bomb at the jet's current position. It inherits no velocity — the
 * whole point is that it stays put while you do not.
 */
export function dropBomb(world) {
  const player = world.player;
  if (player.bombs <= 0 || player.bombCooldown > 0) return;

  const spec = player.bomb;
  player.bombs--;
  player.bombCooldown = spec.dropCooldown;

  world.bombs.push({
    spec,
    // Drop from the tail so it doesn't appear to spawn on the nose.
    x: player.x - Math.cos(player.angle) * 18,
    y: player.y - Math.sin(player.angle) * 18,
    fuse: spec.fuse,
  });

  sfx.bombArm();
}
