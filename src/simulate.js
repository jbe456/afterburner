/**
 * One tick of the game, in order. This file is the table of contents for the
 * simulation: read top to bottom to see exactly what happens each frame and
 * in what sequence.
 */

import { updatePlayer, updateWreckage } from "./entities/player.js";
import { updateEnemy } from "./entities/enemy.js";
import { updateBullets, updateMissiles } from "./entities/projectiles.js";
import { updateBombs } from "./entities/bombs.js";
import { updatePickups } from "./entities/pickups.js";
import { updateEffects } from "./entities/effects.js";
import { updateWaves } from "./waves.js";

/** @returns true on the tick the game-over screen should be shown. */
export function simulate(world) {
  world.time++;

  updatePlayer(world);
  for (const enemy of world.enemies) updateEnemy(world, enemy);

  updateBullets(world);
  updateMissiles(world);
  updateBombs(world);
  updatePickups(world);
  updateEffects(world);
  updateWaves(world);

  return updateWreckage(world);
}
