/**
 * Flight and impact of everything already in the air: cannon rounds and
 * missiles. Firing them is weapons.js's job.
 *
 * Each projectile carries the spec it was fired from, so this module never
 * needs to know which weapon the player chose in the hangar.
 */

import { dist2, angDiff, steer, rand } from "../core/math.js";
import { sfx } from "../core/audio.js";
import { PLAYER } from "../config.js";
import { burst, explode, addShake } from "./effects.js";
import { damageEnemy, ignite } from "./enemy.js";
import { damagePlayer, ignitePlayer } from "./player.js";

export function updateBullets(world) {
  const { bullets, enemies, player } = world;

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.prevX = b.x;
    b.prevY = b.y;
    b.x += b.vx;
    b.y += b.vy;

    if (--b.life <= 0) { bullets.splice(i, 1); continue; }

    if (b.friendly) {
      if (resolveFriendlyHit(world, b, enemies)) bullets.splice(i, 1);
    } else if (player.alive && player.invuln <= 0 && dist2(b, player) < (PLAYER.radius + 5) ** 2) {
      damagePlayer(world, b.damage);
      burst(world, b.x, b.y, 7, "#ff9a6b", 3.5, 3, 18);
      addShake(world, 4);
      sfx.hit();
      bullets.splice(i, 1);
    }
  }
}

/**
 * Resolves the flamethrower's cone: everything caught in it takes damage and
 * catches fire. Unlike a bullet there is nothing to dodge inside the cone and
 * nothing to miss with — the tradeoff is that the cone is very short.
 */
export function updateFlames(world) {
  for (let i = world.flames.length - 1; i >= 0; i--) {
    const emission = world.flames[i];

    // An emission burns once, then survives until the next tick purely so the
    // renderer has something to draw — otherwise it would be created and
    // consumed between frames and never appear on screen.
    if (emission.spent) { world.flames.splice(i, 1); continue; }

    if (emission.friendly) {
      for (let k = world.enemies.length - 1; k >= 0; k--) {
        const e = world.enemies[k];
        if (touches(emission, e)) ignite(world, e, emission.burn);
      }
    } else {
      const p = world.player;
      const target = { x: p.x, y: p.y, radius: PLAYER.radius };
      if (p.alive && touches(emission, target)) ignitePlayer(world, emission.burn);
    }

    emission.spent = true;
  }
}

/**
 * Whether an aircraft is inside a nose weapon's reach: a wedge for the flame,
 * a line for the laser. Neither deals damage on contact — both set light to
 * what they touch, and the fire does the work.
 */
function touches(emission, e) {
  const dx = e.x - emission.x;
  const dy = e.y - emission.y;
  const distance = Math.hypot(dx, dy);
  if (distance > emission.range + e.radius) return false;

  if (emission.kind === "cone") {
    return Math.abs(angDiff(Math.atan2(dy, dx), emission.angle)) <= emission.halfAngle;
  }

  // Beam: project onto the line, then measure how far off it the target sits.
  const along = dx * Math.cos(emission.angle) + dy * Math.sin(emission.angle);
  if (along < 0 || along > emission.range) return false;
  const across = Math.abs(-dx * Math.sin(emission.angle) + dy * Math.cos(emission.angle));
  return across <= emission.halfWidth + e.radius;
}

/**
 * Applies a player round to whatever it touched.
 * @returns true if the round is spent and should be removed.
 */
function resolveFriendlyHit(world, b, enemies) {
  let target = null;
  for (const e of enemies) {
    if (b.struck && b.struck.includes(e)) continue; // already punched through this one
    if (dist2(b, e) < (e.radius + 5) ** 2) { target = e; break; }
  }
  if (!target) return false;

  if (b.burn) ignite(world, target, b.burn);
  const killed = damageEnemy(world, target, b.damage, b.x, b.y);

  // Piercing rounds carry on through, but never re-hit the same aircraft.
  if (--b.pierce > 0) {
    if (!killed) (b.struck ??= []).push(target);
    return false;
  }
  return true;
}

export function updateMissiles(world) {
  const { missiles, enemies } = world;

  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    const spec = m.spec;

    if (m.arming > 0) m.arming--;
    m.speed = Math.min(m.speed + spec.accel, spec.maxSpeed);

    if (!m.friendly) {
      // An enemy missile only ever chases one thing, and never loses it.
      if (!world.player.alive) m.target = null;
      if (m.target) {
        const bearing = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        m.angle = steer(m.angle, bearing, spec.turnRate);
      }
    } else if (spec.turnRate > 0) {
      // Guided types chase; unguided ones simply fly where they were pointed.
      if (m.target && !enemies.includes(m.target)) m.target = null;
      if (!m.target) m.target = reacquire(m, enemies);
      if (m.target) {
        const bearing = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        m.angle = steer(m.angle, bearing, spec.turnRate);
      }
    }

    m.x += Math.cos(m.angle) * m.speed;
    m.y += Math.sin(m.angle) * m.speed;

    world.particles.push({
      x: m.x - Math.cos(m.angle) * 9,
      y: m.y - Math.sin(m.angle) * 9,
      vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4),
      life: 22, maxLife: 22,
      color: m.friendly ? "#c8d4e0" : "#e0a0a0",
      size: 5,
    });

    if (--m.life <= 0) {
      explode(world, m.x, m.y, false); // burned out, self-destructs
      missiles.splice(i, 1);
      continue;
    }

    const hit = m.arming <= 0
      && (m.friendly ? detonateIfHit(world, m) : detonateIfHitPlayer(world, m));
    if (hit) missiles.splice(i, 1);
  }
}

/**
 * An enemy missile reaching the player. It splashes the player only — the
 * bombs are the indiscriminate weapon, not these.
 */
function detonateIfHitPlayer(world, m) {
  const player = world.player;
  if (!player.alive) return false;
  if (dist2(m, player) >= (PLAYER.radius + m.spec.hitRadius) ** 2) return false;

  explode(world, m.x, m.y, false);
  damagePlayer(world, m.spec.damage);
  addShake(world, 7);
  return true;
}

/**
 * Find a new target mid-flight, inside the missile's own seeker envelope.
 * An all-aspect seeker will happily turn around for something behind it.
 */
function reacquire(m, enemies) {
  const spec = m.spec;
  let best = null;
  let bestDist2 = spec.acquireRange ** 2;
  for (const e of enemies) {
    const d2 = dist2(m, e);
    if (d2 >= bestDist2) continue;
    if (Math.abs(angDiff(Math.atan2(e.y - m.y, e.x - m.x), m.angle)) > spec.acquireCone) continue;
    bestDist2 = d2;
    best = e;
  }
  return best;
}

/** Returns true if the missile found something and went off. */
function detonateIfHit(world, m) {
  const spec = m.spec;

  let struck = null;
  for (const e of world.enemies) {
    if (dist2(m, e) < (e.radius + spec.hitRadius) ** 2) { struck = e; break; }
  }
  if (!struck) return false;

  explode(world, m.x, m.y, spec.splashRadius > 150);

  // Splash: iterate backwards because damageEnemy may remove entries.
  for (let k = world.enemies.length - 1; k >= 0; k--) {
    const other = world.enemies[k];
    const d = Math.hypot(other.x - m.x, other.y - m.y);
    if (d >= spec.splashRadius) continue;
    damageEnemy(
      world, other,
      other === struck ? spec.damage : spec.splashDamage,
      other.x, other.y,
    );
  }
  return true;
}
