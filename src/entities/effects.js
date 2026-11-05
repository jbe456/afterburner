/**
 * Purely cosmetic simulation: debris particles, shockwave rings and camera
 * shake. Nothing here affects gameplay, so it can be thinned freely if a
 * machine struggles.
 */

import { rand, TAU } from "../core/math.js";
import { sfx } from "../core/audio.js";

const MAX_SHAKE = 30;

/** Throw `count` particles outward from a point. */
export function burst(world, x, y, count, color, speed, size, life) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * TAU;
    const s = rand(speed * 0.2, speed);
    world.particles.push({
      x, y,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s,
      life: rand(life * 0.5, life),
      maxLife: life,
      color,
      size: rand(size * 0.5, size),
    });
  }
}

/** Fire, embers, smoke and a shockwave — the full kill effect. */
export function explode(world, x, y, big = false) {
  burst(world, x, y, big ? 46 : 26, "#ffd166", big ? 9 : 6, big ? 7 : 5, big ? 48 : 32);
  burst(world, x, y, big ? 30 : 16, "#ff6b35", big ? 6 : 4, big ? 11 : 8, big ? 62 : 40);
  burst(world, x, y, big ? 20 : 10, "#4a4a52", big ? 3 : 2, big ? 16 : 11, big ? 90 : 60);
  world.rings.push({ x, y, radius: 6, maxRadius: big ? 190 : 110, life: 1 });
  addShake(world, big ? 16 : 9);
  sfx.boom(big);
}

export function addShake(world, amount) {
  world.shake = Math.min(world.shake + amount, MAX_SHAKE);
}

/** Muzzle flash: a single bright, stationary, very short-lived particle. */
export function muzzleFlash(world, x, y, size) {
  world.particles.push({ x, y, vx: 0, vy: 0, life: 4, maxLife: 4, color: "#fff3c4", size });
}

export function updateEffects(world) {
  const { particles, rings } = world;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.94; // air drag, so debris settles instead of flying forever
    p.vy *= 0.94;
    if (--p.life <= 0) particles.splice(i, 1);
  }

  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.radius += (r.maxRadius - r.radius) * 0.16; // ease outward
    r.life -= 0.045;
    if (r.life <= 0) rings.splice(i, 1);
  }

  if (world.shake > 0) world.shake *= 0.88;
  if (world.hitFlash > 0) world.hitFlash -= 0.04;
  if (world.blastFlash > 0) world.blastFlash -= 0.022;
  if (world.banner.time > 0) world.banner.time--;
}
