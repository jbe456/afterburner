/**
 * Guards wave composition, which is random and therefore easy to break in a
 * way that only shows up on someone's wave 14.
 *
 * The important one is emptiness: waves advance when the sky is cleared, so a
 * wave that composes to nothing would clear instantly and the game would spin
 * through wave numbers forever with nothing to shoot. A `fromWave` typo is all
 * it would take.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { composeWave, waveSize } from "../src/waves.js";
import { ENEMY_TYPES, ENEMY_TYPE_IDS, enemyDps } from "../src/config.js";

const WAVES_CHECKED = 40;
const SAMPLES = 200; // composition is random, so each wave is sampled

let failures = 0;
const seenAt = Object.create(null); // earliest wave each type actually appeared

function check(name, condition, detail = "") {
  if (!condition) failures++;
  console.log(`  ${condition ? "pass" : "FAIL"}  ${name}${condition ? "" : `  ${detail}`}`);
}

let empty = 0;
let tooEarly = [];
let overCap = [];
let wrongSize = 0;

for (let wave = 1; wave <= WAVES_CHECKED; wave++) {
  for (let s = 0; s < SAMPLES; s++) {
    const picks = composeWave(wave);

    if (picks.length === 0) empty++;
    if (picks.length !== waveSize(wave)) wrongSize++;

    const counts = Object.create(null);
    for (const id of picks) {
      counts[id] = (counts[id] ?? 0) + 1;
      if (wave < ENEMY_TYPES[id].fromWave) tooEarly.push(`${id} in wave ${wave}`);
      if (seenAt[id] === undefined || wave < seenAt[id]) seenAt[id] = wave;
    }
    for (const [id, n] of Object.entries(counts)) {
      const cap = ENEMY_TYPES[id].maxPerWave;
      if (cap && n > cap) overCap.push(`${n}x ${id} in wave ${wave} (cap ${cap})`);
    }
  }
}

console.log(`\nWAVE COMPOSITION (waves 1-${WAVES_CHECKED}, ${SAMPLES} samples each)`);
check("no wave is ever empty", empty === 0, `${empty} empty waves`);
check("every wave is the size it should be", wrongSize === 0, `${wrongSize} mismatches`);
check("nothing appears before its fromWave", tooEarly.length === 0, tooEarly[0] ?? "");
check("per-wave caps are respected", overCap.length === 0, overCap[0] ?? "");

// Dead content check: a type nothing can ever draw is a bug, not a design.
console.log("\nROSTER REACHABILITY");
for (const id of ENEMY_TYPE_IDS) {
  const type = ENEMY_TYPES[id];
  check(`${type.name} actually shows up (from wave ${type.fromWave})`,
    seenAt[id] !== undefined, "never drawn in any sample");
}

// Escalation: later waves must be meaningfully harder than early ones.
console.log("\nESCALATION");
const threat = (wave) => {
  let total = 0;
  for (let s = 0; s < SAMPLES; s++) {
    total += composeWave(wave).reduce(
      (sum, id) => sum + ENEMY_TYPES[id].hp + enemyDps(ENEMY_TYPES[id]) * 10, 0);
  }
  return Math.round(total / SAMPLES);
};
const early = threat(2);
const mid = threat(8);
const late = threat(16);
console.log(`  wave 2: ${early}   wave 8: ${mid}   wave 16: ${late}  (hull + 10s of fire)`);
check("wave 8 is harder than wave 2", mid > early * 1.5, `${early} -> ${mid}`);
check("wave 16 is harder than wave 8", late > mid, `${mid} -> ${late}`);

if (failures) {
  console.error(`\nFAIL — ${failures} wave check(s) failed`);
  process.exit(1);
}
console.log(`\nPASS — ${ENEMY_TYPE_IDS.length} enemy types, every wave populated and escalating`);
