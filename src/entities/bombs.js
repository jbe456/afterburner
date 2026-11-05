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
import { BOMB } from "../config.js";
import { burst, addShake } from "./effects.js";
import { damageEnemy } from "./enemy.js";
import { damagePlayer } from "./player.js";

export function updateBombs(world) {
  // Recomputed each tick so the HUD can warn without reaching into this module.
  world.playerInBlast = playerInBlastZone(world);

  for (let i = world.bombs.length - 1; i >= 0; i--) {
    const bomb = world.bombs[i];
    bomb.fuse--;

    playFuseBeep(bomb);

    // A lazy plume so a live bomb is findable against a busy background.
    if (bomb.fuse % 7 === 0) {
      world.particles.push({
        x: bomb.x + rand(-5, 5), y: bomb.y + rand(-5, 5),
        vx: rand(-0.25, 0.25), vy: rand(-0.6, -0.2),
        life: 40, maxLife: 40, color: "#6c7a8a", size: 4,
      });
    }

    if (bomb.fuse <= 0) {
      detonate(world, bomb);
      world.bombs.splice(i, 1);
    }
  }
}

/** Beeps slowly at first, then faster as the fuse runs down. */
function playFuseBeep(bomb) {
  const urgency = 1 - bomb.fuse / BOMB.fuse;
  const interval = Math.max(
    BOMB.fastBeepInterval,
    Math.round(BOMB.slowBeepInterval - urgency * (BOMB.slowBeepInterval - BOMB.fastBeepInterval)),
  );
  if (bomb.fuse % interval === 0) sfx.bombTick(urgency);
}

/** Levels everything inside the blast radius, without taking sides. */
function detonate(world, bomb) {
  const { x, y } = bomb;

  // Enemies first, iterating backwards because damageEnemy removes entries.
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (Math.hypot(e.x - x, e.y - y) <= BOMB.blastRadius) {
      damageEnemy(world, e, BOMB.damage, e.x, e.y);
    }
  }

  // Then the player, on exactly the same terms.
  const player = world.player;
  if (player.alive && Math.hypot(player.x - x, player.y - y) <= BOMB.blastRadius) {
    damagePlayer(world, BOMB.damage);
  }

  bloom(world, x, y);
}

/** The detonation itself: flash, fireball, rings and a long shake. */
function bloom(world, x, y) {
  world.blastFlash = 1;
  addShake(world, 30);
  sfx.nuke();

  burst(world, x, y, 90, "#fff6d8", 16, 11, 70);
  burst(world, x, y, 70, "#ffb03a", 12, 15, 95);
  burst(world, x, y, 55, "#ff5a28", 8, 19, 120);
  burst(world, x, y, 45, "#3a3a44", 5, 26, 180);

  // Three staggered rings, the outermost matching the true blast radius so
  // the kill zone is legible after the fact.
  world.rings.push({ x, y, radius: 10, maxRadius: BOMB.blastRadius * 0.45, life: 1 });
  world.rings.push({ x, y, radius: 10, maxRadius: BOMB.blastRadius * 0.78, life: 1.3 });
  world.rings.push({ x, y, radius: 10, maxRadius: BOMB.blastRadius, life: 1.6 });

  // A ragged ring of debris thrown out along the blast edge.
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * TAU;
    const speed = rand(9, 15);
    world.particles.push({
      x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: rand(60, 110), maxLife: 110, color: "#ffd9a0", size: rand(4, 9),
    });
  }
}

/** True if the player is standing in a blast they will not survive. */
function playerInBlastZone(world) {
  const p = world.player;
  if (!p.alive) return false;
  return world.bombs.some(
    (b) => Math.hypot(p.x - b.x, p.y - b.y) <= BOMB.blastRadius,
  );
}
