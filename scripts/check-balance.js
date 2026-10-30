/**
 * Guards the roster's design rule: no airframe may be better than another at
 * everything. Each plane must lose to each other plane on at least one axis.
 *
 * This is easy to break while tuning — bump one number and a plane can quietly
 * become strictly better than another, which collapses the choice the hangar
 * is meant to offer. Run it after touching PLANES in src/config.js.
 *
 *   npm test    (or: bun test)
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { PLANES, PLANE_IDS, planeDps } from "../src/config.js";

/** Every axis is phrased so that higher is better. */
const AXES = {
  hull: (p) => p.maxHp,
  topSpeed: (p) => p.maxSpeed,
  agility: (p) => p.turnRate,
  firepower: (p) => planeDps(p),
  missiles: (p) => p.maxMissiles,
  smallness: (p) => -p.radius, // a smaller hitbox is harder to hit
  accel: (p) => p.accel,
  slowFlight: (p) => -p.minSpeed, // flying slower means turning tighter
  reach: (p) => p.bulletSpeed,
};

const axisNames = Object.keys(AXES);
const failures = [];

console.table(PLANE_IDS.map((id) => {
  const plane = PLANES[id];
  const row = { plane: plane.name };
  for (const axis of axisNames) row[axis] = Number(AXES[axis](plane).toFixed(2));
  return row;
}));

for (const a of PLANE_IDS) {
  for (const b of PLANE_IDS) {
    if (a === b) continue;
    const A = PLANES[a], B = PLANES[b];

    const wins = axisNames.filter((axis) => AXES[axis](A) > AXES[axis](B));
    const losses = axisNames.filter((axis) => AXES[axis](A) < AXES[axis](B));

    if (losses.length === 0) {
      failures.push(`${A.name} is never worse than ${B.name} — it dominates on: ${wins.join(", ")}`);
    } else if (wins.length === 0) {
      failures.push(`${A.name} beats ${B.name} at nothing — it is strictly worse`);
    } else {
      console.log(`  ${A.name} > ${B.name} at: ${wins.join(", ")}`);
    }
  }
}

if (failures.length) {
  console.error("\nFAIL — the roster has a dominant airframe:");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`\nPASS — ${PLANE_IDS.length} airframes, every matchup is a tradeoff`);
