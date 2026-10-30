/**
 * Firing: turning a trigger pull into projectiles.
 * The projectiles' own flight and impact live in projectiles.js.
 */

import { rand } from "../core/math.js";
import { sfx } from "../core/audio.js";
import { PLAYER, ENEMY, ENEMY_TYPES } from "../config.js";
import { muzzleFlash, addShake } from "./effects.js";

/**
 * Cannon fire. The player fires a pair of converging tracers from wing roots;
 * enemies fire a single, less accurate round.
 *
 * Rounds inherit half the shooter's velocity, so a fast pass genuinely throws
 * shots further forward rather than firing from a standing start.
 */
export function fireGun(world, shooter, isPlayer) {
  // The player's numbers come from the chosen airframe; enemies' from their type.
  const profile = isPlayer ? shooter.stats : ENEMY_TYPES[shooter.type];
  const spread = isPlayer ? profile.gunSpread : profile.spread;
  const damage = isPlayer ? profile.gunDamage : profile.damage;
  const speed = isPlayer ? profile.bulletSpeed : ENEMY.bulletSpeed;
  const life = isPlayer ? PLAYER.bulletLife : ENEMY.bulletLife;
  const barrels = isPlayer ? [-11, 11] : [0];

  for (const offset of barrels) {
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
      color: isPlayer ? "#aef5ff" : "#ff8a5c",
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

/**
 * Launch a missile. It inherits the current lock, but will re-acquire a new
 * target in flight if that one dies — see projectiles.js.
 */
export function fireMissile(world) {
  const player = world.player;
  if (player.missiles <= 0 || player.missileCooldown > 0) return;

  player.missiles--;
  player.missileCooldown = player.stats.missileCooldown;

  // Alternate rails so consecutive launches visibly come from each wing.
  const side = player.missiles % 2 === 0 ? 1 : -1;
  const perpendicular = player.angle + Math.PI / 2;

  world.missiles.push({
    x: player.x + Math.cos(perpendicular) * 14 * side,
    y: player.y + Math.sin(perpendicular) * 14 * side,
    angle: player.angle,
    speed: 5, // slow off the rail, then accelerates hard
    target: player.lock,
    life: 230,
    arming: 10,
  });

  sfx.missile();
  addShake(world, 3);
}
