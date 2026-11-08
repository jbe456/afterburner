/**
 * Guards what the hangar promises about each row of fittings.
 *
 *   1. Weapons are choices. Within cannon, missile and bomb, no option is
 *      better than another at everything — each must lose to each sibling on
 *      at least one axis. Easy to break while tuning: bump one number and an
 *      option quietly becomes strictly better, collapsing a real choice into
 *      a single correct answer.
 *
 *   2. Hull and engine are ladders. They are deliberately ordered weakest to
 *      strongest with nothing traded against them, so the check here is the
 *      opposite one — that the order actually holds. Until a cost is attached
 *      (weight against agility, or a budget across the rows) these are not
 *      choices and should not be tested as though they were.
 *
 *   3. The fittings that decide how the aircraft flies must not touch what it
 *      shoots. Armour and engine change hull and speed, nothing else.
 *
 * Run after touching ARMOUR, ENGINES, CANNONS, MISSILES, BOMBS or PLAYER.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import {
  ARMOUR, ARMOUR_IDS, ENGINES, ENGINE_IDS, CANNONS, CANNON_IDS,
  MISSILES, MISSILE_IDS, BOMBS, BOMB_IDS, PLAYER,
  cannonDps, cannonReach, cannonLingering, cannonRate, KMH_PER_SPEED_UNIT,
} from "../src/config.js";
import { createWorld } from "../src/world.js";
import { fireGun, fireMissile } from "../src/entities/weapons.js";
import { agility } from "../src/entities/player.js";

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

/**
 * Asserts a row is ordered weakest to strongest as declared. A ladder has no
 * tradeoff by design, so the only thing worth checking is that its order is
 * real — a typo that made the middle rung the best would otherwise be silent.
 */
function assertLadder(category, ids, table, label, read) {
  console.log(`\n${category} (a ladder, not a choice)`);
  console.table(ids.map((id) => ({ option: table[id].name, [label]: read(table[id]) })));

  for (let i = 1; i < ids.length; i++) {
    const below = table[ids[i - 1]];
    const rung = table[ids[i]];
    const ok = read(rung) > read(below);
    if (!ok) failures++;
    console.log(`  ${ok ? "pass" : "FAIL"}  ${rung.name} beats ${below.name}`
      + (ok ? "" : `  ${read(below)} -> ${read(rung)}`));
  }
}

// --- the two fittings that decide how it flies ----------------------------
assertLadder("HULL", ARMOUR_IDS, ARMOUR, "hull", (a) => a.maxHp);
assertLadder("ENGINE", ENGINE_IDS, ENGINES, "km/h",
  (e) => Math.round(e.maxSpeed * KMH_PER_SPEED_UNIT));

// --- cannons ---------------------------------------------------------------
assertNoDominance("CANNONS", CANNON_IDS, CANNONS, {
  /** Sustained damage on one target, fire included. */
  dps: cannonDps,
  /** Damage landed by a single trigger event. */
  burst: (c) => (c.kind === "flame" ? c.damage : c.barrels * c.damage),
  /** How far it can actually hurt something, in world units. */
  reach: cannonReach,
  /** Shots per second; unbounded for a weapon with no discrete shots. */
  rate: cannonRate,
  /**
   * Damage that keeps landing after the weapon stops touching the target.
   * This is the Firebelt's only win, and the reason it is not dominated now
   * that its fire is folded into the damage figure.
   */
  lingering: cannonLingering,
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
  /** How far, and over how wide an arc, the seeker can find a target itself. */
  acquisition: (m) => m.acquireRange,
  allAspect: (m) => m.acquireCone,
});

// --- bombs -----------------------------------------------------------------
assertNoDominance("BOMBS", BOMB_IDS, BOMBS, {
  carried: (b) => b.carried,
  blastRadius: (b) => b.blastRadius,
  damage: (b) => b.damage,
  /** A shorter fuse pays off sooner, which is its own kind of better. */
  fuseSpeed: (b) => -b.fuse,
  readyAgain: (b) => -b.dropCooldown,
  /** Waiting to be touched means never having to time anything. */
  contact: (b) => (b.trigger === "contact" ? 1 : 0),
});

// --- hull and engine must not touch the guns ------------------------------
/** Fires one of everything and reports what actually came out. */
function observeLoadout(armourId, engineId) {
  const world = createWorld({ armour: armourId, engine: engineId });
  const p = world.player;
  p.x = 0; p.y = 0; p.angle = 0; p.speed = 0;

  fireGun(world, p, true);
  const round = world.bullets[0];

  p.lock = null;
  fireMissile(world);

  return {
    fitted: `${ARMOUR[armourId].short} + ${ENGINES[engineId].short}`,
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

console.log("\nSHARED LOADOUT (hull and engine must not change the guns)");
const loadouts = ARMOUR_IDS.flatMap((a) => ENGINE_IDS.map((e) => observeLoadout(a, e)));
console.table(loadouts);

const keys = Object.keys(loadouts[0]).filter((k) => k !== "fitted");
const varying = keys.filter((k) => new Set(loadouts.map((l) => l[k])).size > 1);
if (varying.length) {
  console.error(`  FAIL  loadout varies with hull or engine: ${varying.join(", ")}`);
  failures++;
}

if (failures) {
  console.error(`\nFAIL — ${failures} problem(s)`);
  process.exit(1);
}
console.log("\nPASS — weapons are real choices, the ladders hold, and fittings do not touch the guns");
