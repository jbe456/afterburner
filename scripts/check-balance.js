/**
 * Guards the two promises the hangar makes about the roster:
 *
 *   1. No airframe is better than another at everything — each must lose to
 *      each other plane on at least one axis. Easy to break while tuning: bump
 *      one number and a plane quietly becomes strictly better than another,
 *      collapsing the choice into a single correct answer.
 *
 *   2. Every airframe carries an identical loadout. Planes differ in how they
 *      fly, never in what they shoot. A stat that drifts back onto PLANES
 *      would reintroduce a damage difference with nothing on screen to show it.
 *
 * Run after touching PLANES or PLAYER in src/config.js.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { PLANES, PLANE_IDS } from "../src/config.js";
import { createWorld } from "../src/world.js";
import { fireGun, fireMissile } from "../src/entities/weapons.js";

/**
 * Every axis is phrased so that higher is better.
 *
 * Weapons are shared across all airframes, so there are no firepower axes
 * here — the whole comparison is about handling and survivability.
 */
const AXES = {
  hull: (p) => p.maxHp,
  topSpeed: (p) => p.maxSpeed,
  agility: (p) => p.turnRate,
  accel: (p) => p.accel,
  smallness: (p) => -p.radius, // a smaller hitbox is harder to hit
  slowFlight: (p) => -p.minSpeed, // flying slower means turning tighter
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

// --- 2. every airframe shoots the same ------------------------------------
/** Fires one of everything and reports what actually came out. */
function observeLoadout(planeId) {
  const world = createWorld(planeId);
  const p = world.player;
  p.x = 0; p.y = 0; p.angle = 0; p.speed = 0;

  fireGun(world, p, true);
  const round = world.bullets[0];

  p.lock = null;
  fireMissile(world);

  return {
    plane: PLANES[planeId].name,
    missileLoad: p.missiles + 1, // one was just fired
    missileCooldown: p.missileCooldown,
    bombs: p.bombs,
    barrels: world.bullets.length,
    bulletDamage: round.damage,
    bulletSpeed: Number(Math.hypot(round.vx, round.vy).toFixed(3)),
    bulletLife: round.life,
  };
}

const loadouts = PLANE_IDS.map(observeLoadout);
console.table(loadouts);

const loadoutKeys = Object.keys(loadouts[0]).filter((k) => k !== "plane");
const varying = loadoutKeys.filter((k) => new Set(loadouts.map((l) => l[k])).size > 1);

if (varying.length) {
  console.error(`\nFAIL — loadout still varies by airframe: ${varying.join(", ")}`);
  process.exit(1);
}

console.log("\nPASS — every airframe fires an identical gun and carries an identical load");
