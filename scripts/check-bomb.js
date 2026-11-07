/**
 * Guards the bombs' defining behaviour: each detonates on its own fuse and
 * kills everything inside its own radius *without taking sides*.
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
import { BOMBS, BOMB_IDS, PLAYER, TICK_MS } from "../src/config.js";

const TPS = 1000 / TICK_MS;

/**
 * Runs one bomb to detonation with an enemy and the player parked at fixed
 * distances from it, and reports who was left standing.
 */
function runScenario(bombId, { enemyDistance, playerDistance }) {
  const spec = BOMBS[bombId];
  const world = createWorld({ plane: "viper", bomb: bombId });
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
  for (let tick = 1; tick <= spec.fuse + 5; tick++) {
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

let failures = 0;

for (const bombId of BOMB_IDS) {
  const spec = BOMBS[bombId];
  const R = spec.blastRadius;
  const FAR = R * 4;

  const cases = [
    ["enemy just inside the blast dies",
      { enemyDistance: R - 1, playerDistance: FAR }, (r) => r.enemyAlive === false],
    ["enemy just outside the blast survives",
      { enemyDistance: R + 1, playerDistance: FAR }, (r) => r.enemyAlive === true],
    ["the player's own bomb kills the player",
      { enemyDistance: FAR, playerDistance: R * 0.5 }, (r) => r.playerAlive === false],
    ["player just outside the blast survives",
      { enemyDistance: FAR, playerDistance: R + 1 }, (r) => r.playerAlive === true],
    [`fuse runs exactly ${spec.fuse} ticks (${(spec.fuse / TPS).toFixed(1)}s)`,
      { enemyDistance: FAR, playerDistance: FAR }, (r) => r.detonatedAt === spec.fuse],
  ];

  console.log(`\n${spec.name} — ${spec.carried} carried, ${R} m blast`);
  for (const [name, args, check] of cases) {
    const result = runScenario(bombId, args);
    const ok = check(result);
    if (!ok) failures++;
    console.log(`  ${ok ? "pass" : "FAIL"}  ${name}${ok ? "" : `  got ${JSON.stringify(result)}`}`);
  }

  // Every bomb must be escapable: leaving at cruise the instant you drop it
  // has to clear the radius before the fuse ends, or the weapon is a suicide
  // button rather than a decision.
  const escape = PLAYER.cruiseSpeed * spec.fuse;
  const ok = escape > R;
  if (!ok) failures++;
  console.log(`  ${ok ? "pass" : "FAIL"}  escapable at cruise (${Math.round(escape)} travelled vs ${R} blast)`);
}

if (failures) {
  console.error(`\nFAIL — ${failures} bomb behaviour check(s) failed`);
  process.exit(1);
}
console.log(`\nPASS — all ${BOMB_IDS.length} bombs kill friend and foe inside their own radius, on their own fuse`);
