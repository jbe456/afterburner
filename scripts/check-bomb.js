/**
 * Guards the bomb's defining behaviour: it detonates on a five-second fuse and
 * kills everything inside its radius *without taking sides*.
 *
 * The friendly-fire half is the easiest thing in the game to break silently —
 * nothing on screen tells you the player stopped being damageable by their own
 * bomb, and it would quietly turn a high-risk weapon into a free one.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { createWorld } from "../src/world.js";
import { dropBomb } from "../src/entities/weapons.js";
import { updateBombs } from "../src/entities/bombs.js";
import { spawnEnemy } from "../src/entities/enemy.js";
import { BOMB } from "../src/config.js";

/**
 * Runs one bomb to detonation with an enemy and the player parked at fixed
 * distances from it, and reports who was left standing.
 */
function runScenario({ enemyDistance, playerDistance }) {
  const world = createWorld("viper");
  world.player.x = 0;
  world.player.y = 0;
  world.player.invuln = 0; // spawn protection would mask the friendly-fire check

  dropBomb(world);
  const bomb = world.bombs[0];
  bomb.x = 0;
  bomb.y = 0; // pin to the origin so distances below are exact

  spawnEnemy(world, "fighter");
  const enemy = world.enemies[0];
  enemy.x = enemyDistance;
  enemy.y = 0;

  let detonatedAt = null;
  for (let tick = 1; tick <= BOMB.fuse + 5; tick++) {
    world.player.x = playerDistance;
    world.player.y = 0;
    const before = world.bombs.length;
    updateBombs(world);
    if (before === 1 && world.bombs.length === 0) detonatedAt = tick;
  }

  return {
    detonatedAt,
    enemyAlive: world.enemies.includes(enemy),
    playerAlive: world.player.alive,
  };
}

const R = BOMB.blastRadius;
const FAR = R * 4;

const CASES = [
  ["enemy well inside the blast dies",
    { enemyDistance: R * 0.5, playerDistance: FAR }, (r) => r.enemyAlive === false],
  ["enemy just inside the blast dies",
    { enemyDistance: R - 1, playerDistance: FAR }, (r) => r.enemyAlive === false],
  ["enemy just outside the blast survives",
    { enemyDistance: R + 1, playerDistance: FAR }, (r) => r.enemyAlive === true],
  ["the player's own bomb kills the player",
    { enemyDistance: FAR, playerDistance: R * 0.5 }, (r) => r.playerAlive === false],
  ["player just outside the blast survives",
    { enemyDistance: FAR, playerDistance: R + 1 }, (r) => r.playerAlive === true],
  [`fuse runs exactly ${BOMB.fuse} ticks (${BOMB.fuse / 60}s)`,
    { enemyDistance: FAR, playerDistance: FAR }, (r) => r.detonatedAt === BOMB.fuse],
];

let failures = 0;
for (const [name, args, check] of CASES) {
  const result = runScenario(args);
  const ok = check(result);
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `  got ${JSON.stringify(result)}`}`);
}

if (failures) {
  console.error(`\nFAIL — ${failures} bomb behaviour check(s) failed`);
  process.exit(1);
}

console.log(`\nPASS — bomb kills friend and foe inside ${R} units, on a ${BOMB.fuse / 60}s fuse`);
