/**
 * Guards the bombs' defining behaviour: each detonates on its own fuse and
 * deals its own damage to everything inside its own radius, without taking
 * sides.
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
import { BOMBS, BOMB_IDS, ENEMY_TYPES, PLAYER, TICK_MS } from "../src/config.js";

const TPS = 1000 / TICK_MS;
/** Tough enough to survive any bomb, so its hull loss reads as the damage. */
const DUMMY = "leviathan";

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures++;
  console.log(`  ${condition ? "pass" : "FAIL"}  ${name}${condition ? "" : `  ${detail}`}`);
}

/**
 * Runs one bomb to detonation with a dummy enemy and the player parked at
 * fixed distances, and reports what the blast did to each.
 */
function runScenario(bombId, { enemyDistance, playerDistance, enemyType = DUMMY }) {
  const spec = BOMBS[bombId];
  const world = createWorld({ plane: "bastion", bomb: bombId });
  world.player.x = 0;
  world.player.y = 0;
  world.player.hp = 100000; // measure the hit rather than dying to it
  world.player.invuln = 0;  // spawn protection would mask friendly fire

  dropBomb(world);
  const bomb = world.bombs[0];
  bomb.x = 0;
  bomb.y = 0; // pin to the origin so the distances below are exact

  spawnEnemy(world, enemyType);
  const enemy = world.enemies[0];
  enemy.x = enemyDistance;
  enemy.y = 0;
  const enemyHpBefore = enemy.hp;
  const playerHpBefore = world.player.hp;

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
    enemyDamage: enemyHpBefore - enemy.hp,
    playerDamage: playerHpBefore - world.player.hp,
    enemyAlive: world.enemies.includes(enemy),
  };
}

for (const bombId of BOMB_IDS) {
  const spec = BOMBS[bombId];
  const R = spec.blastRadius;
  const FAR = R * 4;

  console.log(`\n${spec.name} — ${spec.carried} carried, ${R} m blast, ${spec.damage} damage`);

  const inside = runScenario(bombId, { enemyDistance: R - 1, playerDistance: R * 0.5 });
  check("an enemy just inside takes the bomb's damage",
    inside.enemyDamage === spec.damage, `took ${inside.enemyDamage}`);
  check("the player's own bomb damages the player",
    inside.playerDamage === spec.damage, `took ${inside.playerDamage}`);

  const outside = runScenario(bombId, { enemyDistance: R + 1, playerDistance: R + 1 });
  check("nothing just outside is touched",
    outside.enemyDamage === 0 && outside.playerDamage === 0,
    `enemy ${outside.enemyDamage}, player ${outside.playerDamage}`);

  const weak = runScenario(bombId, { enemyDistance: R * 0.5, playerDistance: FAR, enemyType: "fighter" });
  check("a light aircraft inside the blast dies", !weak.enemyAlive);

  const timing = runScenario(bombId, { enemyDistance: FAR, playerDistance: FAR });
  check(`fuse runs exactly ${spec.fuse} ticks (${(spec.fuse / TPS).toFixed(1)}s)`,
    timing.detonatedAt === spec.fuse, `detonated at ${timing.detonatedAt}`);

  // Every bomb must be escapable: leaving at cruise the instant you drop it
  // has to clear the radius before the fuse ends, or it is a suicide button
  // rather than a decision.
  const escape = PLAYER.cruiseSpeed * spec.fuse;
  check(`escapable at cruise (${Math.round(escape)} travelled vs ${R} blast)`, escape > R);
}

// Bigger blast, bigger bang — the rule the roster is built on.
console.log("\nDAMAGE SCALES WITH BLAST");
const bySize = [...BOMB_IDS].sort((a, b) => BOMBS[a].blastRadius - BOMBS[b].blastRadius);
for (let i = 1; i < bySize.length; i++) {
  const small = BOMBS[bySize[i - 1]];
  const big = BOMBS[bySize[i]];
  check(`${big.name} out-damages ${small.name}`, big.damage > small.damage,
    `${small.damage} vs ${big.damage}`);
}

// The heaviest thing in the sky should not fall to one bomb.
const toughest = ENEMY_TYPES[DUMMY];
check(`a ${toughest.name} survives the largest bomb`,
  toughest.hp > Math.max(...BOMB_IDS.map((id) => BOMBS[id].damage)),
  "the boss dies to a single drop");

if (failures) {
  console.error(`\nFAIL — ${failures} bomb behaviour check(s) failed`);
  process.exit(1);
}
console.log(`\nPASS — all ${BOMB_IDS.length} bombs deal their own damage to both sides, on their own fuse`);
