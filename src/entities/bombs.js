/**
 * The bomb: a munition you leave behind rather than fire.
 *
 * It does not move, it cannot be shot down, and when the fuse runs out it
 * kills every aircraft inside its blast radius — including yours. Dropping
 * one is a commitment to be somewhere else in five seconds.
 *
 * Deliberately indiscriminate: the detonation makes no distinction between
 * the player and the enemy, which is what gives the weapon its cost.
 */

import { rand, TAU } from "../core/math.js";
import { sfx } from "../core/audio.js";
import { BOMB, PLAYER } from "../config.js";
import { burst, addShake } from "./effects.js";
import { damageEnemy } from "./enemy.js";
import { damagePlayer } from "./player.js";

export function updateBombs(world) {
  // Recomputed each tick so the HUD can warn without reaching into this module.
  world.playerInBlast = playerInBlastZone(world);

  for (let i = world.bombs.length - 1; i >= 0; i--) {
    const bomb = world.bombs[i];
    const timed = Number.isFinite(bomb.spec.fuse);

    if (bomb.arming > 0) bomb.arming--;

    if (timed) {
      bomb.fuse--;
      playFuseBeep(bomb);
    }

    // A lazy plume so a live bomb is findable against a busy background.
    if (world.time % 7 === 0) {
      world.particles.push({
        x: bomb.x + rand(-5, 5), y: bomb.y + rand(-5, 5),
        vx: rand(-0.25, 0.25), vy: rand(-0.6, -0.2),
        life: 40, maxLife: 40, color: "#6c7a8a", size: 4,
      });
    }

    const triggered = timed
      ? bomb.fuse <= 0
      : bomb.arming <= 0 && touchedBy(world, bomb) !== null;

    if (triggered) {
      detonate(world, bomb);
      world.bombs.splice(i, 1);
    }
  }
}

/**
 * The first aircraft close enough to set a contact mine off, or null.
 *
 * It does not look at whose side anyone is on — flying into your own mine
 * works exactly as well as an enemy doing it.
 */
function touchedBy(world, bomb) {
  const reach = bomb.spec.triggerRadius;

  for (const e of world.enemies) {
    if (Math.hypot(e.x - bomb.x, e.y - bomb.y) <= reach + e.radius) return e;
  }

  const p = world.player;
  if (p.alive && Math.hypot(p.x - bomb.x, p.y - bomb.y) <= reach + PLAYER.radius) return p;

  return null;
}

/** Beeps slowly at first, then faster as the fuse runs down. */
function playFuseBeep(bomb) {
  const urgency = 1 - bomb.fuse / bomb.spec.fuse;
  const interval = Math.max(
    BOMB.fastBeepInterval,
    Math.round(BOMB.slowBeepInterval - urgency * (BOMB.slowBeepInterval - BOMB.fastBeepInterval)),
  );
  if (bomb.fuse % interval === 0) sfx.bombTick(urgency);
}

/** Levels everything inside the blast radius, without taking sides. */
function detonate(world, bomb) {
  const { x, y } = bomb;
  const radius = bomb.spec.blastRadius;
  const damage = bomb.spec.damage;

  // Enemies first, iterating backwards because damageEnemy removes entries.
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (Math.hypot(e.x - x, e.y - y) <= radius) {
      damageEnemy(world, e, damage, e.x, e.y);
    }
  }

  // Then the player, on exactly the same terms.
  const player = world.player;
  if (player.alive && Math.hypot(player.x - x, player.y - y) <= radius) {
    damagePlayer(world, damage);
  }

  bloom(world, x, y, radius);
}

/**
 * The detonation itself: flash, fireball, rings and a long shake, all scaled
 * to the blast so a stick of dynamite does not look like a warhead.
 */
function bloom(world, x, y, radius) {
  // 1.0 at the Mk 82's radius; bigger bombs overshoot, dynamite undershoots.
  const scale = radius / 500;

  world.blastFlash = Math.min(1, 0.45 + scale * 0.55);
  addShake(world, Math.min(30, 12 + scale * 18));
  sfx.nuke();

  const n = (base) => Math.round(base * Math.min(1.6, 0.45 + scale * 0.75));
  burst(world, x, y, n(90), "#fff6d8", 16, 11 * scale + 4, 70);
  burst(world, x, y, n(70), "#ffb03a", 12, 15 * scale + 4, 95);
  burst(world, x, y, n(55), "#ff5a28", 8, 19 * scale + 4, 120);
  burst(world, x, y, n(45), "#3a3a44", 5, 26 * scale + 5, 180);

  // Three staggered rings, the outermost matching the true blast radius so
  // the kill zone is legible after the fact.
  world.rings.push({ x, y, radius: 10, maxRadius: radius * 0.45, life: 1 });
  world.rings.push({ x, y, radius: 10, maxRadius: radius * 0.78, life: 1.3 });
  world.rings.push({ x, y, radius: 10, maxRadius: radius, life: 1.6 });

  // A ragged ring of debris thrown out along the blast edge.
  for (let i = 0; i < n(40); i++) {
    const a = Math.random() * TAU;
    const speed = rand(9, 15) * Math.min(1.8, 0.5 + scale);
    world.particles.push({
      x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: rand(60, 110), maxLife: 110, color: "#ffd9a0", size: rand(4, 9),
    });
  }
}

/**
 * True if the player should be told to move.
 *
 * For a timed bomb that means standing anywhere in the blast, because it is
 * going off regardless. For a contact mine it means being close enough to set
 * it off — sitting inside a mine's blast radius is only dangerous if somebody
 * touches it, and warning about every mine on the map would be noise.
 */
function playerInBlastZone(world) {
  const p = world.player;
  if (!p.alive) return false;

  return world.bombs.some((b) => {
    const distance = Math.hypot(p.x - b.x, p.y - b.y);
    return b.spec.trigger === "contact"
      ? b.arming <= 0 && distance <= b.spec.triggerRadius + PLAYER.radius
      : distance <= b.spec.blastRadius;
  });
}
