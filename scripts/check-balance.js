/**
 * Guards what the hangar promises about each row of fittings.
 *
 *   1. Everything is a ladder now. Hull, engine, the three forward weapons,
 *      the missile and all six bombs are climbed rather than chosen between,
 *      so what has to hold is that each ladder's order is real — a typo that
 *      made the middle rung the best would otherwise be silent. Most rise;
 *      a ladder marked `down` (only a bomb's FUSE, so far) must fall.
 *
 *   2. Hull and engine must not touch what the aircraft shoots, with one
 *      declared exception: the engine gates how short a bomb fuse may be.
 *      That coupling is deliberate — a shorter fuse is only safe because a
 *      faster aircraft clears the blast sooner — so it is asserted to exist
 *      rather than asserted away, and `check-bomb.js` holds it honest.
 *
 * There is no longer a no-dominance check. The bomb bay used to be its last
 * caller, and bombs are now progression: six systems whose AMMO, DAMAGE and
 * FUSE endpoints are typed by hand, with nothing claiming that one cannot be
 * better than another at everything. What is left is the table below, printed
 * without assertions, so a tuning mistake is visible in test output.
 *
 * Run after touching ARMOUR, ENGINES, WEAPONS, MISSILES, BOMBS, SYSTEMS or
 * PLAYER.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import {
  ARMOUR, ARMOUR_IDS, ENGINES, ENGINE_IDS, WEAPONS, WEAPON_IDS,
  MISSILES, MISSILE_IDS, BOMBS, BOMB_IDS, BOMB, SYSTEMS, SYSTEM_IDS,
  PLAYER, DEFAULT_LOADOUT,
  resolveWeapons, resolveBomb, maxFuseRung, KMH_PER_SPEED_UNIT,
} from "../src/config.js";
import { createWorld } from "../src/world.js";
import { fireGun, fireMissile } from "../src/entities/weapons.js";
import { agility } from "../src/entities/player.js";

let failures = 0;

/**
 * Asserts a row is ordered weakest to strongest as declared. A ladder has no
 * tradeoff by design, so the only thing worth checking is that its order is
 * real — a typo that made the middle rung the best would otherwise be silent.
 */
function assertLadder(category, ids, table, label, read, { down = false } = {}) {
  console.log(`\n${category} (a ladder, not a choice${down ? ", counting down" : ""})`);
  console.table(ids.map((id) => ({ option: table[id].name, [label]: read(table[id]) })));

  for (let i = 1; i < ids.length; i++) {
    const below = table[ids[i - 1]];
    const rung = table[ids[i]];
    const ok = down ? read(rung) < read(below) : read(rung) > read(below);
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
// --- the forward weapons and the missile, which are ladders too -----------
// There is nothing to rank the warheads against each other: a bay holds one
// at a time and its properties are climbed, so what has to hold is that each
// ladder rises, exactly as for the guns.
const TRACKS = [
  ...WEAPON_IDS.map((id) => ({ label: WEAPONS[id].label, props: WEAPONS[id].props })),
  ...MISSILE_IDS.map((id) => ({ label: MISSILES[id].name, props: MISSILES[id].props })),
  ...BOMB_IDS.map((id) => ({ label: BOMBS[id].name, props: BOMBS[id].props })),
  ...SYSTEM_IDS.map((id) => ({ label: SYSTEMS[id].name, props: SYSTEMS[id].props })),
];

for (const spec of TRACKS) {
  for (const ladder of Object.values(spec.props)) {
    assertLadder(`${spec.label} ${ladder.label}`,
      ladder.tiers.map((_, i) => i),
      Object.fromEntries(ladder.tiers.map((v, i) => [i, { name: ladder.format(v), value: v }])),
      "value", (rung) => rung.value, { down: ladder.down === true });
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


// --- bombs -----------------------------------------------------------------
/**
 * No assertions here. Bombs are six systems whose every endpoint is typed by
 * hand, and nothing claims that one cannot beat another at everything — so
 * what this prints is the whole set at both ends of its ladders, which is the
 * only way a tuning mistake becomes visible.
 *
 * The column worth watching is CLUSTER's: BOMBLETS and DAMAGE multiply, which
 * is how the cannon once reached 15,000 dps, so `maxed yield` states the
 * product rather than leaving it to be worked out.
 */
console.log("\nBOMBS (progression, not a choice — printed, not asserted)");

/**
 * Total damage one drop delivers at a rung set. A cluster's parent costs a
 * DAMAGE figure of its own on top of every submunition it throws, so its
 * yield is (1 + bomblets) x damage.
 */
function yieldOf(spec) {
  return spec.bomblets ? (1 + spec.bomblets) * spec.damage : spec.damage;
}

/** Resolve a system with every ladder at its bottom rung, or every one at top. */
function atRung(id, which) {
  const loadout = { ...DEFAULT_LOADOUT, bomb: id };
  // The strongest engine, so the FUSE gate is never what caps the top row.
  if (which === "top") loadout.engine = ENGINE_IDS[ENGINE_IDS.length - 1];
  for (const [prop, ladder] of Object.entries(BOMBS[id].props)) {
    loadout[`${id}.${prop}`] = which === "top" ? ladder.tiers.length - 1 : 0;
  }
  return resolveBomb(loadout);
}

const fuseText = (spec) =>
  (Number.isFinite(spec.fuse) ? `${(spec.fuse / 60).toFixed(1)}s` : "on touch");

console.table(BOMB_IDS.map((id) => {
  const stock = atRung(id, "stock");
  const top = atRung(id, "top");
  return {
    system: BOMBS[id].name,
    mechanic: BOMBS[id].trigger,
    blast: BOMBS[id].scatterRange
      ? `${BOMBS[id].blastRadius} m (+${BOMBS[id].scatterRange} spray)`
      : `${BOMBS[id].blastRadius} m`,
    ammo: `${stock.carried} -> ${top.carried}`,
    damage: `${stock.damage} -> ${top.damage}`,
    fuse: `${fuseText(stock)} -> ${fuseText(top)}`,
    "maxed yield": yieldOf(top),
    cooldown: `${BOMBS[id].dropCooldown}t`,
  };
}));

// --- the one place a flying fitting reaches into the armament -------------
/**
 * The engine gates how short a bomb fuse may be. That is a deliberate break
 * of the separation asserted further down, so it is checked to *work* rather
 * than checked not to happen: the gate must actually open as the ladder is
 * climbed, and must never reach past the end of a FUSE ladder.
 */
console.log("\nTHE FUSE GATE (the engine bay's one reach into the armament)");

const GATED = BOMB_IDS.filter((id) => BOMBS[id].props.fuse);
console.table(ENGINE_IDS.map((id) => {
  const row = { engine: ENGINES[id].short, cruise: ENGINES[id].cruiseSpeed,
    "fuse rung": maxFuseRung(id) };
  for (const bombId of GATED) {
    const ladder = BOMBS[bombId].props.fuse;
    const rung = Math.min(maxFuseRung(id), ladder.tiers.length - 1);
    row[BOMBS[bombId].short] = ladder.format(ladder.tiers[rung]);
  }
  return row;
}));

{
  const bottom = maxFuseRung(ENGINE_IDS[0]);
  const top = maxFuseRung(ENGINE_IDS[ENGINE_IDS.length - 1]);
  const longest = Math.max(...GATED.map((id) => BOMBS[id].props.fuse.tiers.length - 1));

  const checks = [
    ["the stock engine unlocks the bottom rung and no more", bottom === 0],
    ["the top engine unlocks every rung there is", top >= longest],
    [`the gate needs ${BOMB.fuseRungsPerEngineRung} engine rungs per fuse rung`,
      maxFuseRung(ENGINE_IDS[BOMB.fuseRungsPerEngineRung]) === 1],
    ["a gated fuse really is shorter than a stock one",
      GATED.every((id) => atRung(id, "top").fuse < atRung(id, "stock").fuse)],
    [`no fuse falls below the ${(BOMB.minFuse / 60).toFixed(1)}s floor`,
      GATED.every((id) => atRung(id, "top").fuse >= BOMB.minFuse)],
  ];
  for (const [name, ok] of checks) {
    if (!ok) failures++;
    console.log(`  ${ok ? "pass" : "FAIL"}  ${name}`);
  }
}

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
/**
 * Fires one of everything and reports what actually came out.
 *
 * The bomb's FUSE is deliberately left out of the observation: it is the one
 * armament figure the engine is allowed to move, and the gate above proves it
 * moves. Everything else here must be identical across all 100 combinations.
 */
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
    missileLoad: p.missiles + 1, // one was just fired
    missileCooldown: p.missileCooldown,
    bombs: p.bombs,
    bombDamage: p.bomb.damage,
    bombBlast: p.bomb.blastRadius,
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
console.log("  (a bomb's FUSE is the one exception, and is checked above)");
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
console.log("\nPASS — every ladder holds, the fuse gate opens, and nothing else"
  + " about the armament moves with hull or engine");
