/**
 * Firing: turning a trigger pull into projectiles.
 * The projectiles' own flight and impact live in projectiles.js.
 *
 * The player's three weapons are chosen in the hangar and hang off the player
 * as `cannon`, `missile` and `bomb` specs; enemies keep using their own type
 * profile. Nothing here knows which specific weapon was picked — it reads
 * whatever spec it is handed.
 */

import { rand, angDiff } from "../core/math.js";
import { sfx } from "../core/audio.js";
import { ENEMY, ENEMY_TYPES, MISSILE } from "../config.js";
import { muzzleFlash, addShake } from "./effects.js";

/** Where each barrel sits relative to the nose, by barrel count. */
const BARREL_OFFSETS = { 1: [0], 2: [-11, 11], 3: [-14, 0, 14] };

/**
 * Cannon fire. Rounds inherit half the shooter's velocity, so a fast pass
 * genuinely throws shots further forward rather than firing from a standstill.
 */
export function fireGun(world, shooter, isPlayer) {
  const spec = isPlayer ? shooter.cannon : ENEMY_TYPES[shooter.type];
  if (spec.kind === "flame") return sprayFlame(world, shooter, spec);

  // Enemy profiles happen to use the same field names for these two.
  const spread = spec.spread;
  const damage = spec.damage;
  // Enemy types may override the shared round speed; most do not.
  const speed = isPlayer ? spec.bulletSpeed : (spec.bulletSpeed ?? ENEMY.bulletSpeed);
  const life = isPlayer ? spec.bulletLife : ENEMY.bulletLife;
  const offsets = BARREL_OFFSETS[spec.barrels] ?? [0];

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

/**
 * The flamethrower emits no projectiles. It pushes one short-lived cone per
 * tick; projectiles.js resolves what that cone touches, keeping the usual
 * split between creating a weapon effect and applying it.
 */
function sprayFlame(world, player, spec) {
  world.flames.push({
    x: player.x + Math.cos(player.angle) * 16,
    y: player.y + Math.sin(player.angle) * 16,
    angle: player.angle,
    spec,
    /** Set once its damage has landed; it then lives one frame to be drawn. */
    spent: false,
  });

  // Burning fuel, thrown forward and spreading as it goes.
  for (let i = 0; i < 3; i++) {
    const a = player.angle + rand(-spec.coneHalfAngle, spec.coneHalfAngle);
    const reach = rand(0.2, 1) * spec.range;
    const speed = reach / 18;
    world.particles.push({
      x: player.x + Math.cos(player.angle) * 16,
      y: player.y + Math.sin(player.angle) * 16,
      vx: Math.cos(a) * speed + Math.cos(player.angle) * player.speed,
      vy: Math.sin(a) * speed + Math.sin(player.angle) * player.speed,
      life: rand(10, 20),
      maxLife: 20,
      color: Math.random() < 0.45 ? "#fff0b8" : Math.random() < 0.6 ? "#ff9a30" : "#ff5a28",
      size: rand(5, 11),
    });
  }

  // Re-open the roar often enough that it never audibly gutters out.
  if (world.time % 4 === 0) sfx.flame();
}

/** True if the chosen missile is willing to leave the rail right now. */
export function missileReady(player) {
  return player.missiles > 0 && player.missileCooldown <= 0;
}

/**
 * Pick what a guided missile should chase at launch.
 *
 * The player's forward lock wins if there is one, so deliberate aim is
 * respected; otherwise the missile takes the nearest aircraft inside its own
 * acquisition envelope. For the AMRAAM that envelope is the whole radar, in
 * every direction.
 */
function acquireAtLaunch(world, player, spec) {
  if (spec.turnRate <= 0) return null;
  if (player.lock && Math.hypot(player.lock.x - player.x, player.lock.y - player.y) <= spec.acquireRange) {
    return player.lock;
  }

  let best = null;
  let bestRange = spec.acquireRange;
  for (const e of world.enemies) {
    const range = Math.hypot(e.x - player.x, e.y - player.y);
    if (range > bestRange) continue;
    const bearing = Math.atan2(e.y - player.y, e.x - player.x);
    if (Math.abs(angDiff(bearing, player.angle)) > spec.acquireCone) continue;
    bestRange = range;
    best = e;
  }
  return best;
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

  const target = acquireAtLaunch(world, player, spec);

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
      target,
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
