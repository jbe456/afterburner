/**
 * Guards the system bay's defining behaviour.
 *
 * The ring shield is the first fitting in the game whose whole effect is a
 * flag. Nothing about it is visible in a damage figure, so every way it can
 * break is a way it breaks silently:
 *
 *   the trigger     one press, one charge — and `isDown` cannot tell a press
 *                   from a hold, so a level-read trigger would spend the
 *                   whole rack one ring at a time while C stayed down
 *   the window      immunity for exactly the fitted duration, not a tick
 *                   more, and not reset by a second press inside it
 *   the immunity    every damage path, not just bullets — a fire already
 *                   burning is put out rather than suppressed, because a
 *                   suppressed fire resumes the moment the ring drops
 *   the supply      blue squares exist only when a device is fitted, give
 *                   two charges, and never overfill the rack
 *
 * The trigger half carries the most weight. A shield that quietly drains to
 * zero while you hold the key reads as a game that ate your charges, and no
 * readout on screen would say otherwise.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { createWorld } from "../src/world.js";
import { updatePlayer, updatePlayerBurn, damagePlayer, ignitePlayer } from "../src/entities/player.js";
import { maybeDropPickup, updatePickups } from "../src/entities/pickups.js";
import { input } from "../src/core/input.js";
import {
  SYSTEMS, SYSTEM_IDS, SYSTEM, PICKUPS, TPS, DEFAULT_LOADOUT, resolveSystem,
} from "../src/config.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures++;
  console.log(`  ${condition ? "pass" : "FAIL"}  ${name}${condition ? "" : `  ${detail}`}`);
}

/** A world with the ring at given rungs, past its spawn invulnerability. */
function world(durationRung = 0, ammoRung = 0) {
  const w = createWorld({
    ...DEFAULT_LOADOUT,
    "ring.duration": durationRung,
    "ring.ammo": ammoRung,
  });
  w.player.invuln = 0;
  return w;
}

/** Hold or release C, then run one tick. */
function tick(w, holdingC = false) {
  input.keys.KeyC = holdingC;
  updatePlayer(w);
}

/** A clean press: C must be seen down after being up, which is one tick each. */
function press(w) {
  tick(w, false);
  tick(w, true);
}

// --- the ladders ------------------------------------------------------------
console.log("THE LADDERS");
{
  const ring = SYSTEMS.ring;
  check("DURATION runs 2 s to 8 s in four rungs",
    JSON.stringify(ring.props.duration.tiers) === JSON.stringify([2, 4, 6, 8]));
  check("AMMO runs 2 to 5 in four rungs",
    JSON.stringify(ring.props.ammo.tiers) === JSON.stringify([2, 3, 4, 5]));

  for (let rung = 0; rung < 4; rung++) {
    const spec = resolveSystem({ ...DEFAULT_LOADOUT, "ring.duration": rung });
    check(`rung ${rung} resolves to ${spec.seconds} s of ticks`,
      spec.duration === Math.round(spec.seconds * TPS));
  }

  // Neither ladder is gated: the fuse gate exists because fuse length is
  // physically coupled to escape speed, and nothing here is coupled to a
  // fitting in another bay.
  const onWorstEngine = resolveSystem(
    { ...DEFAULT_LOADOUT, engine: "spark", "ring.duration": 3, "ring.ammo": 3 });
  check("the top rungs need nothing from another bay",
    onWorstEngine.seconds === 8 && onWorstEngine.carried === 5);
}

// --- the trigger ------------------------------------------------------------
console.log("\nTHE TRIGGER");
{
  const w = world(0, 0);
  check("the rack starts full at the AMMO rung", w.player.charges === 2);
  check("no ring before the key is touched", w.player.shield === 0);

  press(w);
  check("one press raises the ring", w.player.shield > 0);
  check("one press spends one charge", w.player.charges === 1);
}

{
  // The one that would be invisible: hold C and watch the rack.
  const w = world(0, 3);
  const span = w.player.system.duration;
  for (let i = 0; i < span * 4; i++) tick(w, true);
  check("holding C spends exactly one charge, not the rack",
    w.player.charges === 4, `charges ${w.player.charges}`);
}

{
  const w = world(0, 0);
  press(w);
  const before = w.player.shield;
  tick(w, false);
  tick(w, true);          // a second press, well inside the window
  check("a press inside the window spends nothing", w.player.charges === 1);
  check("a press inside the window does not refresh the ring",
    w.player.shield < before, `${w.player.shield} vs ${before}`);
}

{
  const w = world(0, 0);
  const span = w.player.system.duration;
  /** Spend a charge and wait the ring out, so the next press is unobstructed. */
  const cycle = () => {
    press(w);
    for (let i = 0; i < span; i++) tick(w, false);
  };

  cycle();
  cycle();                // rack is empty now
  check("both charges were spendable", w.player.charges === 0);

  press(w);
  check("a press at zero charges raises nothing",
    w.player.shield === 0, `shield ${w.player.shield}`);
}

// --- the window -------------------------------------------------------------
console.log("\nTHE WINDOW");
for (let rung = 0; rung < 4; rung++) {
  const w = world(rung, 3);
  const span = w.player.system.duration;

  press(w);
  // The trigger tick is the first of the span, so span-1 remain after it.
  for (let i = 0; i < span - 1; i++) tick(w, false);
  const stillUp = w.player.shield > 0;
  tick(w, false);
  const down = w.player.shield === 0;

  check(`rung ${rung} lasts its full ${w.player.system.seconds} s`, stillUp);
  check(`rung ${rung} ends at exactly ${span} ticks`, down);
}

// --- the immunity -----------------------------------------------------------
console.log("\nTHE IMMUNITY");
{
  const w = world(3, 0);
  press(w);
  const hp = w.player.hp;
  damagePlayer(w, 500);
  check("direct damage does nothing while the ring is up", w.player.hp === hp);

  // Every path goes through damagePlayer, and the ring sets the same flag
  // spawn protection does, so there is one immunity rather than two.
  check("the ring raises the same flag spawn protection uses", w.player.invuln > 0);
}

{
  const w = world(3, 0);
  ignitePlayer(w, { dps: 60, duration: 240 });
  check("the player can be set alight", w.player.burn !== null);

  press(w);
  check("raising the ring puts the fire out", w.player.burn === null);

  // And it stays out: a suppressed fire would resume the moment it dropped.
  const hp = w.player.hp;
  for (let i = 0; i < w.player.system.duration + 120; i++) {
    tick(w, false);
    updatePlayerBurn(w);
  }
  check("the fire does not resume when the ring drops", w.player.hp === hp,
    `lost ${hp - w.player.hp}`);
}

{
  // Once it is down, the aircraft is damageable again.
  const w = world(0, 0);
  press(w);
  for (let i = 0; i < w.player.system.duration + 2; i++) tick(w, false);
  const hp = w.player.hp;
  damagePlayer(w, 10);
  check("the aircraft is damageable again once the ring drops",
    w.player.hp === hp - 10);
}

// --- the supply -------------------------------------------------------------
console.log("\nTHE SUPPLY");
{
  check("a blue square is worth two charges", SYSTEM.resupply === 2);
  check("the shield takes its share out of the ammo half, not off the top",
    PICKUPS.repairShare === 0.6 && PICKUPS.shieldShare === 0.5);
}

/**
 * One kill's worth of rolls, fed in order: the drop roll, then the repair
 * roll, then the shield roll. Feeding a sequence rather than a constant is
 * what makes the three-way split testable at all — a constant either never
 * drops anything or always picks the same branch.
 */
function dropWith(w, rolls) {
  const real = Math.random;
  let i = 0;
  Math.random = () => rolls[i++] ?? 0.5;
  try {
    w.pickups.length = 0;
    maybeDropPickup(w, 0, 0);
    return w.pickups[0]?.kind;
  } finally {
    Math.random = real;
  }
}

{
  const w = world(0, 3);
  //                      drop   repair  shield
  check("a roll past the drop chance drops nothing",
    dropWith(w, [0.9]) === undefined);
  check("under the repair share comes up green",
    dropWith(w, [0.1, 0.1]) === "repair");
  check("past it and past the shield share comes up yellow",
    dropWith(w, [0.1, 0.9, 0.9]) === "ammo");
  check("past it and under the shield share comes up blue",
    dropWith(w, [0.1, 0.9, 0.3]) === "shield");
}

{
  // No device fitted, no blue squares — the roll that would have gone blue
  // falls back to the yellow crate rather than dropping something unspendable.
  const w = world(0, 0);
  w.player.system = null;
  check("a blue square never drops with no device fitted",
    dropWith(w, [0.1, 0.9, 0.3]) === "ammo");
}

{
  const w = world(0, 3);                     // rack of 5
  w.player.charges = 1;
  w.pickups.push({ x: 0, y: 0, kind: "shield", life: 100, bob: 0 });
  updatePickups(w);
  check("a blue square puts two charges back", w.player.charges === 3);

  w.player.charges = 4;
  w.pickups.push({ x: 0, y: 0, kind: "shield", life: 100, bob: 0 });
  updatePickups(w);
  check("the rack never overfills", w.player.charges === 5);

  w.pickups.push({ x: 0, y: 0, kind: "shield", life: 100, bob: 0 });
  updatePickups(w);
  check("a square collected at full is consumed rather than refused",
    w.player.charges === 5 && w.pickups.length === 0);
}

// --- the bay ----------------------------------------------------------------
console.log("\nTHE BAY");
{
  check("the loadout defaults to a fitted device",
    SYSTEMS[DEFAULT_LOADOUT.system] !== undefined);
  check("every device declares the two things the bay reads",
    SYSTEM_IDS.every((id) => SYSTEMS[id].props.duration && SYSTEMS[id].props.ammo));
  check("every device has a name and a short form",
    SYSTEM_IDS.every((id) => SYSTEMS[id].name && SYSTEMS[id].short));
}

if (failures) {
  console.error(`\nFAIL — ${failures} system check(s) failed`);
  process.exit(1);
}
console.log("\nPASS — the ring is pressed once, lasts its rung, and puts fires out");
