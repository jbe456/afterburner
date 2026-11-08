/**
 * Wave pacing. Spawns are queued as countdowns rather than timers, so they
 * stay in lockstep with the simulation and stop cleanly when paused.
 */

import { WAVES, ENEMY_TYPES, ENEMY_TYPE_IDS } from "./config.js";
import { spawnEnemy } from "./entities/enemy.js";
import { showBanner } from "./world.js";
import { sfx } from "./core/audio.js";

export function startWave(world) {
  world.wave++;

  composeWave(world.wave).forEach((type, i) => {
    world.spawnQueue.push({ type, delay: i * WAVES.spawnStagger });
  });

  sfx.wave();
  showBanner(world, `WAVE ${world.wave}`, 150);
}

export const waveSize = (wave) =>
  Math.min(WAVES.baseCount + Math.floor(wave * WAVES.growth), WAVES.maxCount);

/**
 * Picks the enemies for a wave by weighted draw from whatever has unlocked by
 * then, so the roster escalates on its own instead of following a schedule
 * that has to be rewritten every time a type is added.
 *
 * Heavier types carry a lower weight, and the worst of them a hard cap, so a
 * late wave is mostly ordinary aircraft with a couple of serious ones in it
 * rather than a wall of Dreadnoughts.
 *
 * Exported for the wave checks, which care that every wave is non-empty, that
 * nothing arrives before its time, and that the caps hold.
 */
export function composeWave(wave) {
  const taken = Object.create(null);
  const picks = [];

  for (let i = 0; i < waveSize(wave); i++) {
    const pool = ENEMY_TYPE_IDS.filter((id) => {
      const type = ENEMY_TYPES[id];
      if (wave < type.fromWave) return false;
      return !type.maxPerWave || (taken[id] ?? 0) < type.maxPerWave;
    });
    if (!pool.length) break; // every unlocked type is capped out

    const id = weightedPick(pool);
    taken[id] = (taken[id] ?? 0) + 1;
    picks.push(id);
  }

  return picks;
}

function weightedPick(pool) {
  const total = pool.reduce((sum, id) => sum + ENEMY_TYPES[id].weight, 0);
  let roll = Math.random() * total;
  for (const id of pool) {
    roll -= ENEMY_TYPES[id].weight;
    if (roll <= 0) return id;
  }
  return pool[pool.length - 1];
}

export function updateWaves(world) {
  // Release anything whose countdown has elapsed.
  for (let i = world.spawnQueue.length - 1; i >= 0; i--) {
    if (--world.spawnQueue[i].delay > 0) continue;
    spawnEnemy(world, world.spawnQueue[i].type);
    world.spawnQueue.splice(i, 1);
  }

  if (!world.player.alive) return;
  if (world.enemies.length > 0 || world.spawnQueue.length > 0) {
    world.waveTimer = 0; // re-arm for the next lull
    return;
  }

  if (world.waveTimer === 0) {
    world.waveTimer = WAVES.interval;
  } else if (world.waveTimer > 0 && --world.waveTimer === 0) {
    startWave(world);
    world.waveTimer = -1; // fired; waits for the queue to drain before re-arming
  }
}
