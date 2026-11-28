/**
 * Guards the two warheads that do not explode.
 *
 * Every one of these fails silently. A poison mark that quietly expires, a
 * freeze that adds instead of resetting, a frozen carrier whose launch timer
 * kept running under the ice — all of them look completely normal on screen,
 * and the first sign of any of them is a run that feels wrong for a reason
 * nobody can name.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { createWorld } from "../src/world.js";
import { fireMissile } from "../src/entities/weapons.js";
import { updateMissiles } from "../src/entities/projectiles.js";
import {
  spawnEnemyAt, updateEnemy, updateBurning, updatePoison, ignite,
  poisonEnemy, freezeEnemy,
} from "../src/entities/enemy.js";
import { updateCarriers } from "../src/entities/carrier.js";
import {
  MISSILES, MISSILE_IDS, DEFAULT_LOADOUT, resolveMissile, TPS,
} from "../src/config.js";

let failures = 0;

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "pass" : "FAIL"}  ${label}${ok || !detail ? "" : `  ${detail}`}`);
  if (!ok) failures++;
}

/** A loadout carrying `warhead` with its ladders pushed to named rungs. */
function load(warhead, rungs = {}) {
  const props = MISSILES[warhead].props;
  const out = { ...DEFAULT_LOADOUT, missile: warhead };
  for (const [prop, rung] of Object.entries(rungs)) {
    out[`${warhead}.${prop}`] =
      rung === "max" ? props[prop].tiers.length - 1 : rung;
  }
  return out;
}

/**
 * A world with the player at the origin and one target directly ahead, close
 * enough that an unguided shot cannot miss it.
 */
function withTarget(warhead, rungs = {}, type = "fighter", range = 260) {
  const world = createWorld(load(warhead, rungs));
  world.player.x = 0;
  world.player.y = 0;
  world.player.angle = 0;
  const target = spawnEnemyAt(world, type, range, 0, Math.PI);
  return { world, target, spec: world.player.missile };
}

/**
 * Put a target where it will actually shoot back if left alone: outside the
 * distance at which it breaks away, inside its weapon's reach, pinned into
 * pursue so it does not wander off, and with its trigger ready.
 *
 * The freeze checks are worthless without this. An aircraft parked at 260 m
 * is inside ENEMY.breakDistance and spends the whole window evading, which
 * fires nothing — so "a frozen aircraft fires nothing" would pass against a
 * freeze that did not work at all.
 */
function armed(target) {
  target.mode = "pursue";
  target.modeTimer = 10_000;
  target.fireCooldown = 0;
  return target;
}

/** Fire one missile and fly it until it has hit something or burned out. */
function fireAndLand(world) {
  fireMissile(world);
  for (let t = 0; t < 400 && world.missiles.length; t++) updateMissiles(world);
  // Launch cooldowns are what stop a second shot; clear it between shots so a
  // test can land several without simulating ninety idle ticks each time.
  world.player.missileCooldown = 0;
}

// --- the table ---------------------------------------------------------------

console.log("THE BAY");

{
  check("the bay carries three warheads", MISSILE_IDS.length === 3,
    `${MISSILE_IDS.length} fitted`);
  check("every warhead declares an effect",
    MISSILE_IDS.every((id) => typeof MISSILES[id].effect === "string"));
  check("every warhead declares its own resupply",
    MISSILE_IDS.every((id) => Number.isInteger(MISSILES[id].resupply)));
  check("every warhead climbs guidance, ammo and reach",
    MISSILE_IDS.every((id) =>
      ["guidance", "ammo", "reach"].every((p) => MISSILES[id].props[p])));

  // Rate of fire is shared on purpose: a short cooldown on the poison would
  // have multiplied with POTENCY and the mark count at once.
  const cooldowns = MISSILE_IDS.map((id) => resolveMissile(load(id)).cooldown);
  check("all three share one cooldown", new Set(cooldowns).size === 1,
    `${cooldowns.join(", ")}`);

  // A crate is a reprieve, not a reload. Scaled to what one missile is worth,
  // which is why the poison — where one missile is a kill on anything — puts
  // back a single round against the explosive's three.
  const scaled = MISSILE_IDS.map((id) => {
    const resupply = resolveMissile(load(id)).resupply;
    const smallestRack = resolveMissile(load(id, { ammo: 0 })).carried;
    return { id, resupply, smallestRack, ok: resupply <= smallestRack };
  });
  check("no crate puts back more than the smallest rack of that warhead holds",
    scaled.every((r) => r.ok),
    scaled.map((r) => `${r.id} ${r.resupply}/${r.smallestRack}`).join(", "));
  check("the poison crate is the meanest of the three",
    scaled.find((r) => r.id === "poison").resupply
      === Math.min(...scaled.map((r) => r.resupply)));
}

// --- poison ------------------------------------------------------------------

console.log("\nPOISON");

{
  const { world, target, spec } = withTarget("poison", { potency: "max" });
  const before = target.hp;
  fireAndLand(world);

  check("a poison missile deals nothing on contact", target.hp === before,
    `${before - target.hp} dealt`);
  check("it leaves its potency as a mark", target.poison === spec.potency,
    `${target.poison} vs ${spec.potency}`);
}

{
  // No splash: a second aircraft a few metres from the impact is untouched,
  // where an explosive of the same reach would have caught it.
  const { world, target } = withTarget("poison", { potency: "max" });
  const bystander = spawnEnemyAt(world, "fighter", 300, 30, Math.PI);
  const before = bystander.hp;
  fireAndLand(world);

  check("it splashes nothing", bystander.hp === before && bystander.poison === 0,
    `${before - bystander.hp} dealt, ${bystander.poison} marked`);
  check("only what it struck is marked", target.poison > 0);
}

{
  // Poison is a rate, and two rates are one rate. This is the opposite rule
  // to `ignite`, which keeps the fiercer fire rather than summing them.
  const { world, target, spec } = withTarget("poison", { potency: "max", ammo: "max" });
  fireAndLand(world);
  fireAndLand(world);
  fireAndLand(world);

  check("marks add rather than refresh", target.poison === spec.potency * 3,
    `${target.poison} vs ${spec.potency * 3}`);
}

{
  // The whole identity of the warhead: it does not lift, so one missile is a
  // kill on anything given long enough.
  //
  // Deliberately the weakest rung on the heaviest aircraft, so the target is
  // still alive at the end of the window — a check that passed because the
  // thing it was watching had died would be no check at all.
  const { world, target } = withTarget("poison", { potency: 0 }, "leviathan");
  fireAndLand(world);
  const marked = target.poison;

  for (let t = 0; t < TPS * 30; t++) updatePoison(world);

  check("the target is still alive to be measured", world.enemies.includes(target));
  check("the mark never expires", target.poison === marked,
    `${target.poison} after 30 s, was ${marked}`);
  check("and it was still draining the whole time", target.hp < target.maxHp);
}

{
  // Exactly the ladder, per second, and no more.
  const { world, target, spec } = withTarget("poison", { potency: 2 }, "leviathan");
  fireAndLand(world);
  const before = target.hp;
  for (let t = 0; t < TPS; t++) updatePoison(world);

  const dealt = before - target.hp;
  check("one mark deals its potency over one second",
    Math.abs(dealt - spec.potency) < 0.001, `${dealt.toFixed(3)} vs ${spec.potency}`);
}

{
  const { world, target, spec } = withTarget("poison", { potency: 2, ammo: "max" }, "leviathan");
  fireAndLand(world);
  fireAndLand(world);
  const before = target.hp;
  for (let t = 0; t < TPS; t++) updatePoison(world);

  const dealt = before - target.hp;
  check("two marks deal twice as much over the same second",
    Math.abs(dealt - spec.potency * 2) < 0.001,
    `${dealt.toFixed(3)} vs ${spec.potency * 2}`);
}

{
  // It kills through the same door everything else leaves by, so the score
  // and the crate it drops are not special cases.
  const { world, target } = withTarget("poison", { potency: "max" }, "scout");
  const score = world.score;
  fireAndLand(world);

  let ticks = 0;
  while (world.enemies.includes(target) && ticks < TPS * 60) { updatePoison(world); ticks++; }

  check("a mark eventually kills what it is on", !world.enemies.includes(target),
    `still alive after ${(ticks / TPS).toFixed(1)} s`);
  check("a poison kill scores", world.score > score);
  check("a poison kill counts", world.kills === 1, `${world.kills}`);
}

{
  // Fire and poison are separate fields and separate rules; neither clears
  // the other, or fitting a flamethrower would quietly cancel your rack.
  const { world, target } = withTarget("poison", { potency: "max" }, "leviathan");
  fireAndLand(world);
  ignite(world, target, { dps: 40, duration: 120 });

  const before = target.hp;
  for (let t = 0; t < 60; t++) { updateBurning(world); updatePoison(world); }

  check("a fire and a mark both run on one aircraft",
    target.burn !== null && target.poison > 0);
  check("the two damages sum", before - target.hp > 40, `${(before - target.hp).toFixed(1)}`);
}

// --- freeze ------------------------------------------------------------------

console.log("\nFREEZE");

{
  const { world, target, spec } = withTarget("freeze", { duration: "max" });
  const before = target.hp;
  fireAndLand(world);

  check("a freeze missile deals nothing, ever", target.hp === before,
    `${before - target.hp} dealt`);
  check("it holds for its rung", target.frozen === spec.freezeTicks,
    `${target.frozen} vs ${spec.freezeTicks}`);
  check("its rung is stated in seconds and run in ticks",
    spec.freezeTicks === spec.freezeSeconds * TPS);
}

{
  // The rule the whole warhead turns on: frozen is a state, so a second hit
  // resets the window rather than adding to it. A hit three seconds into an
  // eight second freeze leaves eight, not thirteen.
  const { world, target, spec } = withTarget("freeze", { duration: "max", ammo: "max" });
  fireAndLand(world);
  for (let t = 0; t < TPS * 3; t++) updateEnemy(world, target);

  const midway = target.frozen;
  fireAndLand(world);

  check("a second hit resets rather than adds",
    target.frozen === spec.freezeTicks, `${target.frozen} vs ${spec.freezeTicks}`);
  check("resetting still extends what was left",
    target.frozen > midway, `${target.frozen} vs ${midway}`);
  check("it can never hold longer than one rung",
    target.frozen <= spec.freezeTicks);
}

{
  // Measured against a control flown in the same world with no freeze on it,
  // so the two claims are "it stopped" and "it would not have", rather than
  // one claim and an assumption.
  const control = withTarget("freeze", { duration: "max" }, "fighter", 500);
  armed(control.target);
  const controlAt = { x: control.target.x, y: control.target.y };
  for (let t = 0; t < 120; t++) updateEnemy(control.world, control.target);

  check("the control aircraft flies when left alone",
    Math.hypot(control.target.x - controlAt.x, control.target.y - controlAt.y) > 50);
  check("the control aircraft shoots when left alone",
    control.world.bullets.length > 0, `${control.world.bullets.length} rounds`);

  const { world, target } = withTarget("freeze", { duration: "max" }, "fighter", 500);
  armed(target);
  fireAndLand(world);

  const at = { x: target.x, y: target.y };
  const roundsOnImpact = world.bullets.length;
  for (let t = 0; t < 120; t++) updateEnemy(world, target);

  check("a frozen aircraft does not move",
    target.x === at.x && target.y === at.y,
    `drifted ${Math.hypot(target.x - at.x, target.y - at.y).toFixed(1)}`);
  check("a frozen aircraft is stopped, not coasting", target.speed === 0);
  check("a frozen aircraft fires nothing",
    world.bullets.length === roundsOnImpact,
    `${world.bullets.length - roundsOnImpact} rounds`);
}

{
  // It thaws, and what it was doing before resumes.
  const { world, target, spec } = withTarget("freeze", { duration: 0 });
  fireAndLand(world);
  for (let t = 0; t < spec.freezeTicks; t++) updateEnemy(world, target);

  check("the freeze runs out", target.frozen === 0, `${target.frozen} left`);

  const at = { x: target.x, y: target.y };
  for (let t = 0; t < 60; t++) updateEnemy(world, target);
  check("a thawed aircraft flies again",
    Math.hypot(target.x - at.x, target.y - at.y) > 1);
}

{
  // Held, but not protected. This is what "can't move and can't fire but can
  // receive damage" means at the only place it could go wrong.
  const { world, target } = withTarget("freeze", { duration: "max" }, "leviathan");
  fireAndLand(world);
  poisonEnemy(target, 60);
  ignite(world, target, { dps: 40, duration: 600 });

  const before = target.hp;
  for (let t = 0; t < TPS; t++) {
    updateEnemy(world, target);
    updateBurning(world);
    updatePoison(world);
  }

  check("a frozen aircraft still burns and still rots",
    before - target.hp > 90, `${(before - target.hp).toFixed(1)} in a second`);
  check("and is still frozen while it takes it", target.frozen > 0);
}

// --- freezing a ship ---------------------------------------------------------

console.log("\nA FROZEN CARRIER");

/**
 * A ship inside its own SAM envelope with both timers part-run, so that over
 * the window every one of the four things it does would otherwise happen:
 * it would cross 180 m, empty two salvos, roll one aircraft off the deck, and
 * leave both counters somewhere other than where they started.
 */
function withShip() {
  const world = createWorld(load("freeze", { duration: "max" }));
  world.wave = 12;
  world.player.x = 0;
  world.player.y = 0;
  const ship = spawnEnemyAt(world, "fleetCarrier", 600, 0, 0);
  ship.samCooldown = 40;
  ship.launchCooldown = 90;
  return { world, ship, at: { x: ship.x, y: ship.y } };
}

{
  // The control: everything the freeze is supposed to stop, happening.
  const { world, ship, at } = withShip();
  for (let t = 0; t < 180; t++) updateCarriers(world);

  check("a ship left alone moves",
    Math.hypot(ship.x - at.x, ship.y - at.y) > 50);
  check("a ship left alone fires SAMs", world.missiles.length > 0,
    `${world.missiles.length} away`);
  check("a ship left alone launches", world.enemies.length > 1,
    `${world.enemies.length - 1} in the air`);
  check("a ship left alone runs its timers down",
    ship.samCooldown !== 40 && ship.launchCooldown !== 90,
    `sam ${ship.samCooldown}, launch ${ship.launchCooldown}`);
}

{
  const { world, ship, at } = withShip();
  freezeEnemy(ship, 240);

  for (let t = 0; t < 180; t++) updateCarriers(world);

  check("a frozen ship does not move", ship.x === at.x && ship.y === at.y,
    `drifted ${Math.hypot(ship.x - at.x, ship.y - at.y).toFixed(1)}`);
  check("a frozen ship fires no SAMs", world.missiles.length === 0,
    `${world.missiles.length} away`);
  check("a frozen ship launches nothing", world.enemies.length === 1,
    `${world.enemies.length - 1} in the air`);
  // Held rather than merely idle: a ship whose counters ran down under the
  // ice would thaw and immediately empty its deck, which is the opposite of
  // what spending a missile on it was supposed to buy.
  check("its launch timer is held, not run down",
    ship.launchCooldown === 90, `${ship.launchCooldown} vs 90`);
  check("its SAM timer is held, not run down",
    ship.samCooldown === 40, `${ship.samCooldown} vs 40`);
  check("the freeze itself still runs down", ship.frozen === 60, `${ship.frozen}`);
}

{
  // A ship's freeze is its own. Freezing the deck would be a second rule
  // nobody asked for, and would make one missile worth four.
  const world = createWorld(load("freeze", { duration: "max" }));
  const ship = spawnEnemyAt(world, "fleetCarrier", 600, 0, 0);
  const plane = spawnEnemyAt(world, "fighter", 620, 0, 0);
  plane.onDeck = { ship, state: "repair", timer: 120 };
  ship.deck.push(plane);

  freezeEnemy(ship, 240);
  for (let t = 0; t < 60; t++) updateCarriers(world);

  check("freezing a ship does not freeze what is on its deck",
    plane.frozen === 0, `${plane.frozen} ticks`);
  check("its deck carries on being serviced", plane.onDeck.timer < 120,
    `${plane.onDeck.timer}`);
}

{
  // The other way round: an aircraft frozen on a deck holds the slot, which
  // is a reason to spend a missile on something that is not even flying.
  const world = createWorld(load("freeze", { duration: "max" }));
  const ship = spawnEnemyAt(world, "fleetCarrier", 600, 0, 0);
  const plane = spawnEnemyAt(world, "fighter", 620, 0, 0);
  plane.onDeck = { ship, state: "repair", timer: 120 };
  ship.deck.push(plane);

  freezeEnemy(plane, 240);
  for (let t = 0; t < 60; t++) updateCarriers(world);

  check("a frozen aircraft's deck timer is held",
    plane.onDeck.timer === 120, `${plane.onDeck.timer}`);
  check("and it keeps the slot while it is held",
    ship.deck.includes(plane) && ship.deck.length === 1);
  check("the ship it sits on is unaffected", ship.frozen === 0);
}

// --- the result --------------------------------------------------------------

console.log(
  failures === 0
    ? "\nPASS — the mark never lifts, the freeze resets rather than stacks, and neither warhead deals a point of impact damage"
    : `\nFAIL — ${failures} warhead check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
