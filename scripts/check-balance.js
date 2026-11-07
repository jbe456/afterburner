/**
 * Guards the promises the hangar makes about everything you can choose.
 *
 *   1. Within each category — airframe, cannon, missile, bomb — no option is
 *      better than another at everything. Each must lose to each sibling on
 *      at least one axis. Easy to break while tuning: bump one number and an
 *      option quietly becomes strictly better, collapsing a real choice into
 *      a single correct answer.
 *
 *   2. Every airframe carries an identical loadout. Planes differ in how they
 *      fly, never in what they shoot, so a weapon stat drifting back onto
 *      PLANES would reintroduce a damage difference with nothing on screen to
 *      show it.
 *
 * Run after touching PLANES, CANNONS, MISSILES, BOMBS or PLAYER in config.js.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import {
  PLANES, PLANE_IDS, CANNONS, CANNON_IDS, MISSILES, MISSILE_IDS,
  BOMBS, BOMB_IDS, PLAYER, TICK_MS,
} from "../src/config.js";
import { createWorld } from "../src/world.js";
import { fireGun, fireMissile } from "../src/entities/weapons.js";
import { agility } from "../src/entities/player.js";

const TPS = 1000 / TICK_MS;
let failures = 0;

/**
 * Asserts that no option in `ids` beats another on every axis.
 * Axes are phrased so higher is always better.
 */
function assertNoDominance(category, ids, table, axes) {
  const axisNames = Object.keys(axes);

  console.log(`\n${category}`);
  console.table(ids.map((id) => {
    const row = { option: table[id].name };
    for (const a of axisNames) row[a] = Number(axes[a](table[id]).toFixed(3));
    return row;
  }));

  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const A = table[a], B = table[b];
      const wins = axisNames.filter((n) => axes[n](A) > axes[n](B));
      const losses = axisNames.filter((n) => axes[n](A) < axes[n](B));

      if (losses.length === 0) {
        console.error(`  FAIL  ${A.name} is never worse than ${B.name} — dominates on ${wins.join(", ")}`);
        failures++;
      } else if (wins.length === 0) {
        console.error(`  FAIL  ${A.name} beats ${B.name} at nothing — strictly worse`);
        failures++;
      } else {
        console.log(`  ${A.name} > ${B.name} at: ${wins.join(", ")}`);
      }
    }
  }
}

// --- airframes: hull against top speed, and nothing else ------------------
assertNoDominance("AIRFRAMES", PLANE_IDS, PLANES, {
  hull: (p) => p.maxHp,
  topSpeed: (p) => p.maxSpeed,
});

// --- cannons ---------------------------------------------------------------
assertNoDominance("CANNONS", CANNON_IDS, CANNONS, {
  /** Sustained damage on one target, which is what rate of fire really buys. */
  dps: (c) => (c.barrels * c.damage * TPS) / c.cooldown,
  burst: (c) => c.barrels * c.damage,
  rateOfFire: (c) => 1 / c.cooldown,
  accuracy: (c) => -c.spread,
  reach: (c) => c.bulletSpeed,
  pierce: (c) => c.pierce,
  burnDps: (c) => (c.burn ? c.burn.dps : 0),
});

// --- missiles --------------------------------------------------------------
assertNoDominance("MISSILES", MISSILE_IDS, MISSILES, {
  carried: (m) => m.carried,
  damage: (m) => m.damage,
  splashDamage: (m) => m.splashDamage,
  splashRadius: (m) => m.splashRadius,
  guidance: (m) => m.turnRate,
  salvo: (m) => m.perShot,
  reload: (m) => 1 / m.cooldown,
  /** Not needing a lock is a real advantage in a knife fight. */
  freeToFire: (m) => (m.requiresLock ? 0 : 1),
});

// --- bombs -----------------------------------------------------------------
assertNoDominance("BOMBS", BOMB_IDS, BOMBS, {
  carried: (b) => b.carried,
  blastRadius: (b) => b.blastRadius,
  /** A shorter fuse pays off sooner, which is its own kind of better. */
  fuseSpeed: (b) => -b.fuse,
  readyAgain: (b) => -b.dropCooldown,
});

// --- every airframe shoots the same ---------------------------------------
/** Fires one of everything and reports what actually came out. */
function observeLoadout(planeId) {
  const world = createWorld({ plane: planeId });
  const p = world.player;
  p.x = 0; p.y = 0; p.angle = 0; p.speed = 0;

  fireGun(world, p, true);
  const round = world.bullets[0];

  p.lock = null;
  fireMissile(world);

  return {
    plane: PLANES[planeId].name,
    missileLoad: p.missiles + p.missile.perShot, // a salvo was just fired
    missileCooldown: p.missileCooldown,
    bombs: p.bombs,
    barrels: world.bullets.length,
    bulletDamage: round.damage,
    bulletSpeed: Number(Math.hypot(round.vx, round.vy).toFixed(3)),
    bulletLife: round.life,
    // Handling is shared too: only hull and top speed may vary.
    turnRateAt5: Number(agility({ ...p, speed: 5 }).toFixed(5)),
    turnRateAt7: Number(agility({ ...p, speed: 7 }).toFixed(5)),
    hitboxRadius: PLAYER.radius,
  };
}

console.log("\nSHARED LOADOUT (same weapons on every airframe)");
const loadouts = PLANE_IDS.map(observeLoadout);
console.table(loadouts);

const keys = Object.keys(loadouts[0]).filter((k) => k !== "plane");
const varying = keys.filter((k) => new Set(loadouts.map((l) => l[k])).size > 1);
if (varying.length) {
  console.error(`  FAIL  loadout varies by airframe: ${varying.join(", ")}`);
  failures++;
}

if (failures) {
  console.error(`\nFAIL — ${failures} problem(s)`);
  process.exit(1);
}
console.log("\nPASS — every category is a real choice, and all airframes shoot the same");
