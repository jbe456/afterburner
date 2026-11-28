/**
 * One tick of the game, in order. This file is the table of contents for the
 * simulation: read top to bottom to see exactly what happens each frame and
 * in what sequence.
 */

import { updatePlayer, updateWreckage, updatePlayerBurn } from "./entities/player.js";
import { updateEnemy, updateBurning, updatePoison } from "./entities/enemy.js";
import { updateCarriers } from "./entities/carrier.js";
import { updateBullets, updateMissiles, updateFlames } from "./entities/projectiles.js";
import { updateBombs } from "./entities/bombs.js";
import { updatePickups } from "./entities/pickups.js";
import { updateEffects } from "./entities/effects.js";
import { updateWaves } from "./waves.js";

/** @returns true on the tick the game-over screen should be shown. */
export function simulate(world) {
  world.time++;

  updatePlayer(world);
  // Ships first: they launch into world.enemies, and what they launch should
  // find its deck already in its new position rather than a tick behind.
  updateCarriers(world);
  for (const enemy of world.enemies) updateEnemy(world, enemy);

  updateBullets(world);
  updateFlames(world);
  updateMissiles(world);
  updateBombs(world);
  updateBurning(world);
  // Alongside the fires and for the same reason: it damages, so it can kill,
  // so it cannot run inside a loop over the list it might shorten.
  updatePoison(world);
  updatePlayerBurn(world);
  updatePickups(world);
  updateEffects(world);
  updateWaves(world);

  return updateWreckage(world);
}
