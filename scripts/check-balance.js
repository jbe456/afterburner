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
  ARMOUR, ARMOUR_IDS, ENGINES, ENGINE_IDS, WEAPONS, WEAPON_IDS,
  MISSILES, MISSILE_IDS, BOMBS, BOMB_IDS, PLAYER, DEFAULT_LOADOUT,
  WEAPON_PROP_KEYS, resolveWeapons, KMH_PER_SPEED_UNIT,
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
// --- the forward weapons, which are ladders too ---------------------------
for (const track of WEAPON_IDS) {
  const spec = WEAPONS[track];
  for (const [prop, ladder] of Object.entries(spec.props)) {
    assertLadder(`${spec.label} ${ladder.label}`,
      ladder.tiers.map((_, i) => i),
      Object.fromEntries(ladder.tiers.map((v, i) => [i, { name: ladder.format(v), value: v }])),
      "value", (rung) => rung.value);
  }
}

// A weapon that starts fitted cannot be "not fitted" later, and one that
// starts unfitted must actually be off at rung zero.
console.log("\nSTOCK FORWARD WEAPONS");
{
  const stock = resolveWeapons(DEFAULT_LOADOUT);
  const checks = [
    ["the wing guns are always fitted", stock.cannon.slots >= 2],
    ["they start on the lowest rung", stock.cannon.damage === WEAPONS.cannon.props.damage.tiers[0]],
    ["the flame starts unfitted", stock.flame === null],
    ["the laser starts unfitted", stock.laser === null],
  ];
  for (const [name, ok] of checks) {
    if (!ok) failures++;
    console.log(`  ${ok ? "pass" : "FAIL"}  ${name}`);
  }
}

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

// --- every engine must still be flyable -----------------------------------
/**
 * Turn rate falls as you go faster. That is the design, but the scaling is
 * linear and an engine fast enough drives it to zero and then through it,
 * at which point the stick works backwards. The floor in PLAYER prevents
 * that; this proves the floor is doing its job for every engine on the
 * ladder, including ones added later.
 */
console.log("\nTURN RATE AT FULL THROTTLE");
const MAX_SECONDS_PER_180 = 6;
console.table(ENGINE_IDS.map((id) => {
  const engine = ENGINES[id];
  const rate = agility({ speed: engine.maxSpeed });
  return {
    engine: engine.name,
    kmh: Math.round(engine.maxSpeed * KMH_PER_SPEED_UNIT),
    "rad/tick": Number(rate.toFixed(5)),
    "s per 180": Number((Math.PI / rate / 60).toFixed(1)),
  };
}));

for (const id of ENGINE_IDS) {
  const engine = ENGINES[id];
  const rate = agility({ speed: engine.maxSpeed });
  const seconds = Math.PI / rate / 60;

  if (rate <= 0) {
    console.error(`  FAIL  ${engine.name} inverts the controls at full throttle`);
    failures++;
  } else if (seconds > MAX_SECONDS_PER_180) {
    console.error(`  FAIL  ${engine.name} needs ${seconds.toFixed(1)}s to turn 180`
      + ` (limit ${MAX_SECONDS_PER_180}s)`);
    failures++;
  } else {
    console.log(`  pass  ${engine.name} turns 180 in ${seconds.toFixed(1)}s`);
  }
}

// --- hull and engine must not touch the guns ------------------------------
/** Fires one of everything and reports what actually came out. */
function observeLoadout(armourId, engineId) {
  const world = createWorld({ ...DEFAULT_LOADOUT, armour: armourId, engine: engineId });
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
