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
import { ENEMY, ENEMY_TYPES, MISSILE, CANNON } from "../config.js";
import { muzzleFlash, addShake } from "./effects.js";

/**
 * Where the barrels sit across the wings, in symmetric pairs working outward.
 * Generated so any even slot count has somewhere to fire from.
 */
function barrelOffsets(count) {
  if (count <= 1) return [0];
  // An odd count keeps one on the centreline; the rest go out in pairs.
  const out = count % 2 ? [0] : [];
  for (let pair = 0; pair < Math.floor(count / 2); pair++) {
    const x = 9 + pair * 7;
    out.push(-x, x);
  }
  return out;
}

/**
 * Cannon fire. Rounds inherit half the shooter's velocity, so a fast pass
 * genuinely throws shots further forward rather than firing from a standstill.
 */
export function fireGun(world, shooter, isPlayer) {
  const spec = isPlayer ? shooter.cannon : ENEMY_TYPES[shooter.type];

  const spread = isPlayer ? CANNON.spread : spec.spread;
  const damage = spec.damage;
  // Enemy types may override the shared round speed; most do not.
  const speed = isPlayer ? CANNON.bulletSpeed : (spec.bulletSpeed ?? ENEMY.bulletSpeed);
  const life = isPlayer ? spec.bulletLife : ENEMY.bulletLife;
  const offsets = isPlayer
    ? barrelOffsets(spec.slots)
    : barrelOffsets(spec.barrels ?? 1);

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
      burn: null,
      color: isPlayer ? CANNON.tracer : "#ff8a5c",
      width: isPlayer ? CANNON.tracerWidth : 2.6,
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
 * Nose weapons emit no projectiles. Each pushes one short-lived shape per
 * tick and projectiles.js resolves what it touches, keeping the usual split
 * between creating a weapon effect and applying it.
 */
/**
 * One tick of a nose weapon, from whoever is firing it. The cone and the beam
 * differ only in how `touches` measures them, so they share a shape.
 */
function pushEmission(world, source, kind, spec, friendly) {
  world.flames.push({
    kind,
    friendly,
    x: source.x + Math.cos(source.angle) * 16,
    y: source.y + Math.sin(source.angle) * 16,
    angle: source.angle,
    range: spec.range,
    halfAngle: CANNON.flameConeHalfAngle,
    halfWidth: CANNON.laserHalfWidth,
    burn: { dps: spec.damage, duration: CANNON.burnDuration },
    /** Set once its effect has landed; it then lives one frame to be drawn. */
    spent: false,
  });
}

/** Burning fuel, thrown forward and spreading as it goes. */
function flameParticles(world, source, spec, count) {
  for (let i = 0; i < count; i++) {
    const a = source.angle + rand(-CANNON.flameConeHalfAngle, CANNON.flameConeHalfAngle);
    const reach = rand(0.2, 1) * spec.range;
    const speed = reach / 18;
    world.particles.push({
      x: source.x + Math.cos(source.angle) * 16,
      y: source.y + Math.sin(source.angle) * 16,
      vx: Math.cos(a) * speed + Math.cos(source.angle) * source.speed,
      vy: Math.sin(a) * speed + Math.sin(source.angle) * source.speed,
      life: rand(10, 20),
      maxLife: 20,
      color: Math.random() < 0.45 ? "#fff0b8" : Math.random() < 0.6 ? "#ff9a30" : "#ff5a28",
      size: rand(5, 11),
    });
  }
}

/** An enemy's flame cone. Same weapon, pointed the other way. */
export function fireEnemyFlame(world, enemy, spec) {
  pushEmission(world, enemy, "cone", spec, false);
  flameParticles(world, enemy, spec, 2);
  if (world.time % 12 === 0) sfx.enemyFlame();
}

/** An enemy's beam. */
export function fireEnemyLaser(world, enemy, spec) {
  pushEmission(world, enemy, "beam", spec, false);
  if (world.time % 12 === 0) sfx.enemyLaser();
}

export function sprayFlame(world, player) {
  const spec = player.flame;
  pushEmission(world, player, "cone", spec, true);

  flameParticles(world, player, spec, 3);

  // Re-open the roar often enough that it never audibly gutters out.
  if (world.time % 4 === 0) sfx.flame();
}

/**
 * The laser is a line rather than a cone: a fixed-width beam out to its reach
 * that sets light to anything it crosses, exactly as the flame does.
 */
export function fireLaser(world, player) {
  pushEmission(world, player, "beam", player.laser, true);
  if (world.time % 6 === 0) sfx.laser();
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
      friendly: true,
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
 * An enemy launching homing missiles at the player. Unlike the player's, these
 * never need a lock: their target is the only thing they ever chase.
 */
export function fireEnemyMissile(world, enemy, spec) {
  const player = world.player;

  for (let i = 0; i < spec.salvo; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const perpendicular = enemy.angle + Math.PI / 2;
    world.missiles.push({
      spec,
      friendly: false,
      x: enemy.x + Math.cos(perpendicular) * 12 * side,
      y: enemy.y + Math.sin(perpendicular) * 12 * side,
      angle: enemy.angle + rand(-0.12, 0.12),
      speed: spec.speed,
      target: player,
      life: spec.life,
      arming: MISSILE.armingDelay,
    });
  }

  sfx.enemyMissile();
}

/** An enemy seeding a mine along its track. */
export function dropEnemyBomb(world, enemy, spec) {
  world.bombs.push({
    spec,
    x: enemy.x - Math.cos(enemy.angle) * 20,
    y: enemy.y - Math.sin(enemy.angle) * 20,
    fuse: spec.fuse,
    arming: spec.armTime ?? 0,
  });
  sfx.bombArm();
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
    // Contact mines need a moment to go live, or you set off your own drop.
    arming: spec.armTime ?? 0,
  });

  sfx.bombArm();
}
