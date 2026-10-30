/**
 * Wave pacing. Spawns are queued as countdowns rather than timers, so they
 * stay in lockstep with the simulation and stop cleanly when paused.
 */

import { WAVES } from "./config.js";
import { spawnEnemy } from "./entities/enemy.js";
import { showBanner } from "./world.js";
import { sfx } from "./core/audio.js";

export function startWave(world) {
  world.wave++;
  const count = Math.min(
    WAVES.baseCount + Math.floor(world.wave * WAVES.growth),
    WAVES.maxCount,
  );

  for (let i = 0; i < count; i++) {
    world.spawnQueue.push({ type: pickType(world.wave, i), delay: i * WAVES.spawnStagger });
  }

  sfx.wave();
  showBanner(world, `WAVE ${world.wave}`, 150);
}

function pickType(wave, index) {
  if (wave >= WAVES.aceFromWave && index % 3 === 2) return "ace";
  if (wave >= WAVES.heavyFromWave && index % 4 === 3) return "heavy";
  return "fighter";
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
