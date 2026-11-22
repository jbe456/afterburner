/**
 * Guards the carrier, whose rules are mostly invisible when they break.
 *
 * A carrier is the one enemy that creates other enemies and that holds other
 * enemies in a state the AI never sees, so the failures here are the quiet
 * kind: a deck that oversubscribes, aircraft left parked on a ship that is
 * already wreckage, or a launched aircraft that never leaves "taking off" and
 * therefore never fights and never stops counting toward the wave.
 *
 * The last of those is the one that matters most — waves advance only when
 * `world.enemies` empties, so anything stuck in a deck state forever stops the
 * run dead.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { createWorld } from "../src/world.js";
import { simulate } from "../src/simulate.js";
import { spawnEnemy, damageEnemy } from "../src/entities/enemy.js";
import { hangarPool } from "../src/entities/carrier.js";
import {
  CARRIER, ENEMY_TYPES, ENEMY_TYPE_IDS, WAVES, enemyDps,
} from "../src/config.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures++;
  console.log(`  ${condition ? "pass" : "FAIL"}  ${name}${condition ? "" : `  ${detail}`}`);
}

const CARRIER_IDS = ENEMY_TYPE_IDS.filter((id) => ENEMY_TYPES[id].carrier);

/** A world holding one carrier at the origin, with the player well clear. */
function withCarrier(id, { wave = ENEMY_TYPES[id].fromWave, playerAt = 6000 } = {}) {
  const world = createWorld({});
  world.wave = wave;
  world.player.x = playerAt;
  world.player.y = 0;
  world.player.invuln = 0;
  world.player.hp = 1e9; // the fight is not what is under test here

  spawnEnemy(world, id);
  const ship = world.enemies.find((e) => e.carrier);
  ship.x = 0;
  ship.y = 0;
  ship.angle = 0;
  return { world, ship };
}

const run = (world, ticks) => { for (let i = 0; i < ticks; i++) simulate(world); };

/**
 * The player flies itself: left alone for a few seconds it travels hundreds of
 * units, which silently moves it in and out of a SAM envelope and makes any
 * measurement of range mean something other than what it says. Pinning it puts
 * the carrier's own behaviour under test instead of the jet's.
 */
function runPinned(world, ticks, onTick = () => false) {
  const { x, y } = world.player;
  for (let i = 0; i < ticks; i++) {
    simulate(world);
    world.player.x = x;
    world.player.y = y;
    if (onTick()) return;
  }
}

// --- the roster -------------------------------------------------------------

console.log("CARRIER ROSTER");
check("there is at least one carrier", CARRIER_IDS.length > 0);

for (const id of CARRIER_IDS) {
  const type = ENEMY_TYPES[id];
  check(`${type.name} has something to launch at wave ${type.fromWave}`,
    hangarPool(type.fromWave).length > 0, "its hangar is empty on the wave it unlocks");
}

{
  // A carrier that could launch a carrier would breed without limit, and the
  // group cap in composeWave would not see a single one of them.
  const breeding = CARRIER_IDS.filter((id) =>
    hangarPool(ENEMY_TYPES[id].fromWave).some((launched) => ENEMY_TYPES[launched].carrier));
  check("no carrier can launch another carrier", breeding.length === 0, breeding.join(", "));
}

{
  // The tiers have to actually escalate, or there is no ladder — only four
  // entries that happen to share a hull.
  const tiers = CARRIER_IDS
    .map((id) => ENEMY_TYPES[id])
    .sort((a, b) => a.fromWave - b.fromWave);

  const harder = tiers.every((t, i) => i === 0 || t.hp > tiers[i - 1].hp);
  check("each carrier tier has a stronger hull than the last", harder,
    tiers.map((t) => t.hp).join(" -> "));

  const faster = tiers.every((t, i) =>
    i === 0 || t.carrier.launchInterval < tiers[i - 1].carrier.launchInterval);
  check("each carrier tier launches more often than the last", faster,
    tiers.map((t) => t.carrier.launchInterval).join(" -> "));

  const fiercer = tiers.every((t, i) => i === 0 || enemyDps(t) > enemyDps(tiers[i - 1]));
  check("each carrier tier's battery is fiercer than the last", fiercer,
    tiers.map((t) => Math.round(enemyDps(t))).join(" -> "));
}

// --- launching --------------------------------------------------------------

console.log("\nLAUNCHING");

for (const id of CARRIER_IDS) {
  const type = ENEMY_TYPES[id];
  const { world, ship } = withCarrier(id);

  // Long enough for several intervals, plus the takeoff runs they entail.
  run(world, type.carrier.launchInterval * 4 + CARRIER.takeoffTicks * 2);

  const launched = world.enemies.filter((e) => e !== ship);
  check(`${type.name} puts aircraft in the air`, launched.length > 0,
    "nothing launched in four intervals");

  check(`${type.name} launches only what its hangar holds`,
    launched.every((e) => hangarPool(world.wave).includes(e.type)),
    [...new Set(launched.map((e) => e.type))].join(", "));

  check(`${type.name} never oversubscribes its ${CARRIER.deckSlots}-slot deck`,
    ship.deck.length <= CARRIER.deckSlots, `${ship.deck.length} aboard`);
}

{
  // The deck is the governor on everything, so it has to hold under the worst
  // case: the fastest catapult in the game running flat out for a long time.
  const id = CARRIER_IDS[CARRIER_IDS.length - 1];
  const { world, ship } = withCarrier(id);

  let worst = 0;
  for (let i = 0; i < 3000; i++) {
    simulate(world);
    worst = Math.max(worst, ship.deck.length);
    if (ship.deck.length > CARRIER.deckSlots) break;
  }
  check(`${ENEMY_TYPES[id].name}'s deck holds under sustained launching`,
    worst <= CARRIER.deckSlots, `peaked at ${worst}`);
}

{
  // Nothing may sit in a deck state forever: waves advance only when the sky
  // empties, so an aircraft that never finishes its takeoff run is a run that
  // never ends.
  const id = CARRIER_IDS[0];
  const { world, ship } = withCarrier(id);
  run(world, ENEMY_TYPES[id].carrier.launchInterval + CARRIER.takeoffTicks + 30);

  const launched = world.enemies.filter((e) => e !== ship);
  check("a launched aircraft is eventually released to the AI",
    launched.length > 0 && launched.some((e) => !e.onDeck),
    `${launched.filter((e) => e.onDeck).length} of ${launched.length} still on the deck`);
}

{
  // A swarm draw is thirty aircraft through a three-slot deck. It has to
  // stream rather than arrive at once, and it has to finish.
  const swarmId = ENEMY_TYPE_IDS.find((id) => ENEMY_TYPES[id].swarm && !ENEMY_TYPES[id].carrier);
  const id = CARRIER_IDS[0];
  const { world, ship } = withCarrier(id, { wave: 40 });

  ship.launchCooldown = 1;
  ship.swarmQueue = Array(ENEMY_TYPES[swarmId].swarm).fill(swarmId);
  const swarmSize = ship.swarmQueue.length;

  let worst = 0;
  // Streaming at swarmStagger with a short run, but gated by the deck, so
  // allow generous time: what is under test is that it drains at all.
  for (let i = 0; i < swarmSize * WAVES.swarmStagger * 8; i++) {
    simulate(world);
    worst = Math.max(worst, ship.deck.length);
  }

  check(`a swarm of ${swarmSize} streams off the deck rather than arriving at once`,
    worst <= CARRIER.deckSlots, `peaked at ${worst} on the deck`);
  check(`the swarm queue drains`, ship.swarmQueue.length === 0,
    `${ship.swarmQueue.length} still queued`);
  check(`all ${swarmSize} of the swarm reach the air`,
    world.enemies.filter((e) => e.type === swarmId).length >= swarmSize,
    `${world.enemies.filter((e) => e.type === swarmId).length} airborne`);
}

// --- recovery and repair ----------------------------------------------------

console.log("\nRECOVERY");

{
  const id = CARRIER_IDS[0];
  const { world, ship } = withCarrier(id);

  // A badly hurt fighter, parked alongside and well inside landing range.
  spawnEnemy(world, "fighter");
  const hurt = world.enemies.find((e) => e.type === "fighter");
  hurt.x = 300; hurt.y = 0;
  hurt.hp = hurt.maxHp * 0.2;

  run(world, 1);
  check("a damaged aircraft is claimed by a nearby carrier", hurt.onDeck !== null,
    "it was left to fly on");

  run(world, CARRIER.repairTicks + 600);
  check("a repaired aircraft comes back at full health", hurt.hp === hurt.maxHp,
    `${hurt.hp} of ${hurt.maxHp}`);
  check("a repaired aircraft eventually leaves the deck", hurt.onDeck === null,
    `still ${hurt.onDeck?.state}`);
}

{
  const id = CARRIER_IDS[0];
  const { world, ship } = withCarrier(id);

  spawnEnemy(world, "fighter");
  const healthy = world.enemies.find((e) => e.type === "fighter");
  healthy.x = 300; healthy.y = 0;

  run(world, 30);
  check("an undamaged aircraft is left alone", healthy.onDeck === null);
}

{
  // The deck is a place to be killed, not a sanctuary. An aircraft parked on
  // it must still be a target, and must still count for wave clearance.
  const id = CARRIER_IDS[0];
  const { world, ship } = withCarrier(id);

  spawnEnemy(world, "fighter");
  const hurt = world.enemies.find((e) => e.type === "fighter");
  hurt.x = 150; hurt.y = 0;
  hurt.hp = hurt.maxHp * 0.2;
  run(world, 90);

  check("a parked aircraft is still in world.enemies", world.enemies.includes(hurt));

  const before = world.enemies.length;
  damageEnemy(world, hurt, 1e9, hurt.x, hurt.y);
  check("a parked aircraft can be killed", !world.enemies.includes(hurt),
    `${before} -> ${world.enemies.length}`);
  check("killing it frees its deck slot", !ship.deck.includes(hurt),
    `${ship.deck.length} still aboard`);
}

// --- sinking ----------------------------------------------------------------

console.log("\nSINKING");

{
  const id = CARRIER_IDS[0];
  const { world, ship } = withCarrier(id);

  // Fill the deck: two under repair and whatever the catapult has going.
  for (let n = 0; n < 2; n++) {
    spawnEnemy(world, "fighter");
    const hurt = world.enemies[world.enemies.length - 1];
    hurt.x = 150 + n * 40; hurt.y = 0;
    hurt.hp = hurt.maxHp * 0.2;
  }
  run(world, 60);

  const aboard = ship.deck.slice();
  check("the deck has aircraft on it to lose", aboard.length > 0);

  damageEnemy(world, ship, 1e9, ship.x, ship.y);

  check("the carrier leaves the world", !world.enemies.includes(ship));
  check("everything on its deck dies with it",
    aboard.every((e) => !world.enemies.includes(e)),
    `${aboard.filter((e) => world.enemies.includes(e)).length} survived the sinking`);
  check("no wreck is left holding a deck reference",
    aboard.every((e) => e.onDeck === null));
}

{
  // The whole run hangs on this: a carrier must be able to leave the sky
  // empty, or the wave it belongs to can never end.
  const id = CARRIER_IDS[0];
  const { world, ship } = withCarrier(id);
  run(world, 400); // let it launch a few

  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (world.enemies.includes(e)) damageEnemy(world, e, 1e9, e.x, e.y);
  }
  check("the sky can be cleared of a carrier and its brood",
    world.enemies.length === 0, `${world.enemies.length} left`);
}

// --- the battery ------------------------------------------------------------

console.log("\nTHE BATTERY");

for (const id of CARRIER_IDS) {
  const type = ENEMY_TYPES[id];

  {
    // Caught on the tick they leave the rail: a SAM fired at half its own
    // envelope reaches the player and is gone again well inside a cooldown,
    // so looking at world.missiles afterwards finds an empty array and proves
    // nothing either way.
    const { world } = withCarrier(id, { playerAt: type.sam.range * 0.5 });
    let fired = [];
    runPinned(world, type.sam.cooldown + 10, () => {
      fired = world.missiles.filter((m) => !m.friendly);
      return fired.length > 0;
    });
    check(`${type.name} fires on something inside its envelope`, fired.length > 0);
    check(`${type.name} fires a salvo of ${type.sam.salvo}`,
      fired.length === type.sam.salvo, `${fired.length} away`);
    check(`${type.name}'s SAMs are hostile and chase the player`,
      fired.length > 0 && fired.every((m) => m.target === world.player));
  }

  {
    const { world } = withCarrier(id, { playerAt: type.sam.range * 1.6 });
    runPinned(world, type.sam.cooldown * 2);
    check(`${type.name} holds fire outside its envelope`,
      world.missiles.length === 0, `${world.missiles.length} away`);
  }
}

// --- movement ---------------------------------------------------------------

console.log("\nMOVEMENT");

{
  // It ignores you entirely. Parked at the origin pointing along +X with the
  // player sitting square off the beam, five seconds of travel must leave the
  // heading untouched and the ship further from the player, not nearer.
  const id = CARRIER_IDS[0];
  const { world, ship } = withCarrier(id);
  world.player.x = 0;
  world.player.y = 2500;

  const heading = ship.angle;
  const before = Math.hypot(world.player.x - ship.x, world.player.y - ship.y);
  runPinned(world, 300);
  const after = Math.hypot(world.player.x - ship.x, world.player.y - ship.y);

  check("a carrier holds its heading with the player off the beam",
    Math.abs(ship.angle - heading) < 1e-9, `${heading} -> ${ship.angle}`);
  check("a carrier makes way along that heading", ship.x > 100 && ship.y === 0,
    `(${Math.round(ship.x)}, ${Math.round(ship.y)})`);
  check("a carrier does not close on the player", after > before,
    `${Math.round(before)} -> ${Math.round(after)}`);
}

{
  // It has to stay in the arena. Nothing recovers a ship that sails out of it.
  const id = CARRIER_IDS[0];
  const { world, ship } = withCarrier(id);
  run(world, 4000);
  const limit = 7000 / 2;
  check("a carrier stays inside the arena",
    Math.abs(ship.x) < limit && Math.abs(ship.y) < limit,
    `(${Math.round(ship.x)}, ${Math.round(ship.y)})`);
}

if (failures) {
  console.error(`\nFAIL — ${failures} carrier check(s) failed`);
  process.exit(1);
}
console.log(`\nPASS — ${CARRIER_IDS.length} carriers launch, repair, defend and sink`);
