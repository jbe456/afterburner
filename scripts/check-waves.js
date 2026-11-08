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

import { composeWave, waveSize, startWave } from "../src/waves.js";
import { createWorld } from "../src/world.js";
import { angDiff } from "../src/core/math.js";
import { ENEMY_TYPES, ENEMY_TYPE_IDS, enemyDps } from "../src/config.js";
import { HULL_NAMES } from "../src/render/hulls.js";

import { WAVES } from "../src/config.js";

const WAVES_CHECKED = 40;
const WAVES_STAGGER = WAVES.spawnStagger;
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
let undersized = 0;
let brokenSwarm = [];

for (let wave = 1; wave <= WAVES_CHECKED; wave++) {
  for (let s = 0; s < SAMPLES; s++) {
    const picks = composeWave(wave);

    if (picks.length === 0) empty++;
    // A swarm fills one slot with several aircraft, so a wave can exceed its
    // slot count but must never fall short of it.
    if (picks.length < waveSize(wave)) undersized++;

    const counts = Object.create(null);
    for (const id of picks) {
      counts[id] = (counts[id] ?? 0) + 1;
      if (wave < ENEMY_TYPES[id].fromWave) tooEarly.push(`${id} in wave ${wave}`);
      if (seenAt[id] === undefined || wave < seenAt[id]) seenAt[id] = wave;
    }
    for (const [id, n] of Object.entries(counts)) {
      const type = ENEMY_TYPES[id];
      // Caps count draws, not aircraft: a swarm of 7 capped at 2 means 14.
      const drawn = type.swarm ? n / type.swarm : n;
      if (type.swarm && !Number.isInteger(drawn)) {
        brokenSwarm.push(`${n}x ${id} is not a whole number of swarms of ${type.swarm}`);
      }
      if (type.maxPerWave && drawn > type.maxPerWave) {
        overCap.push(`${drawn} draws of ${id} in wave ${wave} (cap ${type.maxPerWave})`);
      }
    }
  }
}

console.log(`\nWAVE COMPOSITION (waves 1-${WAVES_CHECKED}, ${SAMPLES} samples each)`);
check("no wave is ever empty", empty === 0, `${empty} empty waves`);
check("no wave is smaller than its slot count", undersized === 0, `${undersized} short waves`);
check("swarms always arrive whole", brokenSwarm.length === 0, brokenSwarm[0] ?? "");
check("nothing appears before its fromWave", tooEarly.length === 0, tooEarly[0] ?? "");
check("per-wave caps are respected", overCap.length === 0, overCap[0] ?? "");

// Dead content check: a type nothing can ever draw is a bug, not a design.
console.log("\nROSTER REACHABILITY");
for (const id of ENEMY_TYPE_IDS) {
  const type = ENEMY_TYPES[id];
  check(`${type.name} actually shows up (from wave ${type.fromWave})`,
    seenAt[id] !== undefined, "never drawn in any sample");
}

// A misspelled shape silently falls back to the plain fighter hull, so the
// Leviathan would quietly fly a Scout's silhouette and nothing would complain.
console.log("\nHULLS");
const badShapes = ENEMY_TYPE_IDS.filter((id) => !HULL_NAMES.includes(ENEMY_TYPES[id].shape));
check("every enemy names a hull that exists", badShapes.length === 0,
  badShapes.map((id) => `${id}: ${ENEMY_TYPES[id].shape}`).join(", "));
check("every hull is used by something",
  HULL_NAMES.every((h) => h === "jet" || ENEMY_TYPE_IDS.some((id) => ENEMY_TYPES[id].shape === h)),
  "an unused hull is dead code");

// Swarms have to arrive as a cloud, not as a queue of separate contacts:
// same quarter of the sky, near enough the same moment.
console.log("\nSWARM ARRIVAL");
{
  const swarmIds = ENEMY_TYPE_IDS.filter((id) => ENEMY_TYPES[id].swarm);
  check("at least one type swarms", swarmIds.length > 0);

  for (const id of swarmIds) {
    const type = ENEMY_TYPES[id];
    const groups = [];

    // The composer is random, so draw waves until this type turns up. A wave
    // may contain more than one swarm; each is a contiguous run in the queue
    // and is entitled to its own approach bearing, so they are checked apart.
    for (let attempt = 0; attempt < 400 && groups.length < 6; attempt++) {
      const world = createWorld({ plane: "viper" });
      world.wave = type.fromWave - 1;
      startWave(world);

      let run = null;
      for (const entry of world.spawnQueue) {
        if (entry.type === id) {
          run = run ?? [];
          run.push(entry);
        } else if (run) {
          groups.push(run);
          run = null;
        }
      }
      if (run) groups.push(run);
    }

    if (!groups.length) { check(`${type.name} was drawn at all`, false, "never appeared"); continue; }

    // Two draws that land next to each other merge into one bigger cloud, so
    // a group is a whole number of swarms rather than exactly one.
    const sized = groups.every((g) => g.length % type.swarm === 0);
    check(`${type.name} groups are whole swarms of ${type.swarm}`, sized,
      `saw sizes ${[...new Set(groups.map((g) => g.length))].join(", ")}`);

    const sameBearing = groups.every(
      (g) => g.every((e) => e.bearing !== null && Math.abs(angDiff(e.bearing, g[0].bearing)) < 1e-9));
    check(`${type.name} members of a group share an approach bearing`, sameBearing);

    // Each group must be tighter than the same aircraft arriving one by one.
    const loose = groups.filter((g) => {
      const spread = Math.max(...g.map((e) => e.delay)) - Math.min(...g.map((e) => e.delay));
      return spread >= (g.length - 1) * WAVES_STAGGER;
    });
    check(`${type.name} arrives as a cloud rather than a queue`, loose.length === 0,
      `${loose.length} group(s) no tighter than a normal queue`);
  }
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
