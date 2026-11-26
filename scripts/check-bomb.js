/**
 * Guards the bombs' defining behaviour.
 *
 * Six systems now share one module, and each has something that is invisible
 * when it breaks:
 *
 *   blast / contact   flat damage inside the radius, to both sides
 *   cluster           bomblets that tile the spread, on one shared fuse
 *   field             no blast damage at all; burning ground that ignites
 *   every timed one   escapable at the cruise of the engine that unlocked
 *                     its fuse rung, and never under the hard floor
 *
 * That last one carries the most weight. The engine bay gates how short a
 * fuse may be, which is the only place a flying fitting reaches into the
 * armament — so the gate's promise is checked here rather than merely stated
 * in config: for every system, every unlocked rung, and the engine that
 * unlocked it, leaving at cruise the instant you drop must clear the radius.
 *
 * The friendly-fire half is the easiest thing in the game to break silently —
 * nothing on screen tells you the player stopped being damageable by their own
 * bomb, and it would quietly turn a high-risk weapon into a free one.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { createWorld } from "../src/world.js";
import { dropBomb } from "../src/entities/weapons.js";
import { updateBombs } from "../src/entities/bombs.js";
import { spawnEnemy, updateBurning } from "../src/entities/enemy.js";
import { updatePlayerBurn } from "../src/entities/player.js";
import {
  BOMBS, BOMB_IDS, BOMB, ENGINES, ENGINE_IDS, ENEMY_TYPES, PLAYER, TPS,
  CANNON, resolveBomb, maxFuseRung, DEFAULT_LOADOUT,
} from "../src/config.js";
/** Tough enough to survive any bomb, so its hull loss reads as the damage. */
const DUMMY = "leviathan";

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures++;
  console.log(`  ${condition ? "pass" : "FAIL"}  ${name}${condition ? "" : `  ${detail}`}`);
}

/**
 * A loadout carrying `bombId` with every one of its ladders at `rung`, on
 * whichever engine is named. The engine matters: it is what decides how far
 * up the FUSE ladder the resolved bomb is allowed to be.
 */
const TOP_ENGINE = ENGINE_IDS[ENGINE_IDS.length - 1];

function loadoutFor(bombId, { rung = 0, engine = TOP_ENGINE } = {}) {
  const loadout = { ...DEFAULT_LOADOUT, armour: "aegis", engine, bomb: bombId };
  for (const [prop, ladder] of Object.entries(BOMBS[bombId].props)) {
    loadout[`${bombId}.${prop}`] = Math.min(rung, ladder.tiers.length - 1);
  }
  return loadout;
}

/** The bomb a loadout actually produces, which is what every check measures. */
const specFor = (bombId, opts) => resolveBomb(loadoutFor(bombId, opts));

/** A world with that bomb fitted, the player parked and damageable. */
function worldFor(bombId, opts) {
  const world = createWorld(loadoutFor(bombId, opts));
  world.player.x = 0;
  world.player.y = 0;
  world.player.hp = 100000; // measure the hit rather than dying to it
  world.player.invuln = 0;  // spawn protection would mask friendly fire
  return world;
}

/**
 * Runs one bomb to detonation with a dummy enemy and the player parked at
 * fixed distances, and reports what the blast did to each.
 *
 * `ticks` runs past the fuse by default; an incendiary needs its field to
 * burn out too, so callers can ask for longer.
 */
function runScenario(bombId, {
  enemyDistance, playerDistance, enemyType = DUMMY, rung = 0, extraTicks = 5,
  engine = TOP_ENGINE,
}) {
  const world = worldFor(bombId, { rung, engine });
  const spec = world.player.bomb;

  dropBomb(world);
  const bomb = world.bombs[0];
  bomb.x = 0;
  bomb.y = 0; // pin to the origin so the distances below are exact

  spawnEnemy(world, enemyType);
  const enemy = world.enemies[0];
  enemy.x = enemyDistance;
  enemy.y = 0;
  const enemyHpBefore = enemy.hp;
  const playerHpBefore = world.player.hp;

  let detonatedAt = null;
  let fieldsAfterDetonation = 0;
  let bombletsAfterDetonation = 0;
  for (let tick = 1; tick <= spec.fuse + extraTicks; tick++) {
    world.player.x = playerDistance;
    world.player.y = 0;
    enemy.x = enemyDistance;
    enemy.y = 0;
    const before = world.bombs.length;
    updateBombs(world);
    updateBurning(world);
    updatePlayerBurn(world);
    if (before === 1 && world.bombs.length === 0) {
      detonatedAt = tick;
      fieldsAfterDetonation = world.fields.length;
      bombletsAfterDetonation = world.bomblets.length;
    }
  }

  return {
    detonatedAt,
    fieldsAfterDetonation,
    bombletsAfterDetonation,
    fieldsNow: world.fields.length,
    bombletsNow: world.bomblets.length,
    enemyDamage: enemyHpBefore - enemy.hp,
    playerDamage: playerHpBefore - world.player.hp,
    enemyAlive: world.enemies.includes(enemy),
    enemyBurning: enemy.burn !== null && enemy.burn !== undefined,
  };
}

const MECHANIC = (id) => BOMBS[id].trigger;
const TIMED = BOMB_IDS.filter((id) => MECHANIC(id) !== "contact");
const CONTACT = BOMB_IDS.filter((id) => MECHANIC(id) === "contact");

// --- the plain circle: blast bombs -----------------------------------------
for (const bombId of BOMB_IDS.filter((id) => MECHANIC(id) === "blast")) {
  const spec = specFor(bombId);
  const R = spec.blastRadius;
  const FAR = R * 4;

  console.log(`\n${spec.name} — ${spec.carried} carried, ${R} m blast, ${spec.damage} damage`);

  const inside = runScenario(bombId, { enemyDistance: R - 1, playerDistance: R * 0.5 });
  check("an enemy just inside takes the bomb's damage",
    inside.enemyDamage === spec.damage, `took ${inside.enemyDamage}`);
  check("the player's own bomb damages the player",
    inside.playerDamage === spec.damage, `took ${inside.playerDamage}`);

  const outside = runScenario(bombId, { enemyDistance: R + 1, playerDistance: R + 1 });
  check("nothing just outside is touched",
    outside.enemyDamage === 0 && outside.playerDamage === 0,
    `enemy ${outside.enemyDamage}, player ${outside.playerDamage}`);

  // At the top rung, because a stock frag charge is not meant to kill outright.
  const weak = runScenario(bombId, {
    enemyDistance: R * 0.5, playerDistance: FAR, enemyType: "fighter", rung: 4,
  });
  check("a light aircraft inside a maxed blast dies", !weak.enemyAlive);

  const timing = runScenario(bombId, { enemyDistance: FAR, playerDistance: FAR });
  check(`fuse runs exactly ${spec.fuse} ticks (${(spec.fuse / TPS).toFixed(1)}s)`,
    timing.detonatedAt === spec.fuse, `detonated at ${timing.detonatedAt}`);
}

// --- cluster ---------------------------------------------------------------
/**
 * Two waves: the parent blast on its fuse, then the submunitions it throws,
 * which land `bombletFlight` ticks later somewhere inside `footprint`. Both
 * halves have to be real, and both have to be escapable.
 */
for (const bombId of BOMB_IDS.filter((id) => MECHANIC(id) === "cluster")) {
  for (const rung of [0, 4]) {
    const spec = specFor(bombId, { rung });
    const label = rung === 0 ? "stock" : "maxed";

    console.log(`\n${spec.name} (${label}) — ${spec.blastRadius} m parent,`
      + ` then ${spec.bomblets} bomblets of ${spec.bombletRadius} m`
      + ` out to ${spec.scatterRange} m, ${spec.damage} damage each`);

    // Wave one, measured on the tick the parent goes off: a plain blast.
    const parent = runScenario(bombId, {
      enemyDistance: spec.blastRadius - 1, playerDistance: spec.blastRadius - 1,
      rung, extraTicks: 0,
    });
    check("the parent goes off as an ordinary bomb",
      parent.enemyDamage === spec.damage, `enemy took ${parent.enemyDamage}`);
    check("and takes the player with it on the same terms",
      parent.playerDamage === spec.damage, `player took ${parent.playerDamage}`);
    check(`on its own ${spec.fuse}-tick fuse`,
      parent.detonatedAt === spec.fuse, `detonated at ${parent.detonatedAt}`);

    // Wave two: it must actually throw something, and that something must
    // still be in the air a tick after the parent went off.
    check(`it throws ${spec.bomblets} submunitions`,
      parent.bombletsAfterDetonation === spec.bomblets,
      `threw ${parent.bombletsAfterDetonation}`);

    // Where the spray actually goes. Bearings and distances are randomised, so
    // this measures the geometry of the whole throw rather than asking whether
    // one parked target got unlucky.
    const landings = landingDistances(bombId, rung);
    check("every submunition lands rather than hanging in the air",
      landings.length === spec.bomblets, `${landings.length} of ${spec.bomblets} landed`);
    check(`the spray reaches past the ${spec.blastRadius} m parent blast`,
      Math.max(...landings) > spec.blastRadius,
      `furthest landed at ${Math.round(Math.max(...landings))} m`);
    check(`and never past the ${spec.scatterRange} m it is thrown`,
      Math.max(...landings) <= spec.scatterRange + 1e-6,
      `furthest landed at ${Math.round(Math.max(...landings))} m`);

    // Beyond the whole footprint nothing can be reached, which is what the
    // outer ring drawn on the ground promises.
    const beyond = spec.footprint + 2;
    const clear = runScenario(bombId, {
      enemyDistance: beyond, playerDistance: beyond,
      rung, extraTicks: spec.bombletFlight + 5,
    });
    check(`nothing beyond the ${spec.footprint} m footprint is touched`,
      clear.enemyDamage === 0 && clear.playerDamage === 0,
      `enemy ${clear.enemyDamage}, player ${clear.playerDamage}`);
  }

  // What a submunition does where it lands, tested on one placed by hand —
  // the throw is randomised, so parking a target and hoping proves nothing.
  {
    const spec = specFor(bombId, { rung: 4 });
    const landed = runPlacedBomblet(bombId, { at: 900, distance: spec.bombletRadius - 1 });
    check("a submunition that lands damages whatever is inside it",
      landed.enemyDamage === spec.damage, `enemy took ${landed.enemyDamage}`);
    check("including the player, on the same terms",
      landed.playerDamage === spec.damage, `player took ${landed.playerDamage}`);

    const missed = runPlacedBomblet(bombId, { at: 900, distance: spec.bombletRadius + 1 });
    check("and nothing just outside it",
      missed.enemyDamage === 0 && missed.playerDamage === 0,
      `enemy ${missed.enemyDamage}, player ${missed.playerDamage}`);
  }

  // The product the README quotes. The parent costs one DAMAGE figure of its
  // own, so a maxed drop delivers (1 + bomblets) x damage in total.
  const top = specFor(bombId, { rung: 4 });
  const total = (1 + top.bomblets) * top.damage;
  const biggestSingle = Math.max(...BOMB_IDS
    .filter((id) => MECHANIC(id) === "blast")
    .map((id) => specFor(id, { rung: 4 }).damage));
  check(`maxed yield (parent + ${top.bomblets} x ${top.damage} = ${total})`
    + ` stays within the heaviest single bomb (${biggestSingle})`,
    total <= biggestSingle, "the cluster out-damages everything");
}

/**
 * Drops a cluster, lets it go off, and reports how far from the drop point
 * each submunition was when it detonated.
 */
function landingDistances(bombId, rung) {
  const world = worldFor(bombId, { rung });
  const spec = world.player.bomb;

  dropBomb(world);
  world.bombs[0].x = 0;
  world.bombs[0].y = 0;

  const landed = [];
  let seen = new Set();
  for (let tick = 1; tick <= spec.fuse + spec.bombletFlight + 5; tick++) {
    const before = world.bomblets.map((b) => b);
    updateBombs(world);
    for (const b of before) {
      if (!world.bomblets.includes(b) && !seen.has(b)) {
        seen.add(b);
        landed.push(Math.hypot(b.x, b.y));
      }
    }
  }
  return landed;
}

/**
 * Puts one submunition in the air aimed at a known point, with a dummy and the
 * player parked `distance` from it, and runs it to the ground. Deterministic,
 * unlike a real throw.
 */
function runPlacedBomblet(bombId, { at, distance }) {
  const world = worldFor(bombId, { rung: 4 });
  const spec = world.player.bomb;

  spawnEnemy(world, DUMMY);
  const enemy = world.enemies[0];
  const enemyHpBefore = enemy.hp;
  const playerHpBefore = world.player.hp;

  const flight = spec.bombletFlight;
  world.bomblets.push({
    x: 0, y: 0, vx: at / flight, vy: 0, life: flight,
    radius: spec.bombletRadius, damage: spec.damage,
  });

  for (let tick = 1; tick <= flight + 2; tick++) {
    enemy.x = at + distance; enemy.y = 0;
    world.player.x = at - distance; world.player.y = 0;
    updateBombs(world);
  }

  return {
    enemyDamage: enemyHpBefore - enemy.hp,
    playerDamage: playerHpBefore - world.player.hp,
  };
}

// --- incendiary ------------------------------------------------------------
for (const bombId of BOMB_IDS.filter((id) => MECHANIC(id) === "field")) {
  const spec = specFor(bombId);
  const R = spec.blastRadius;

  console.log(`\n${spec.name} — ${R} m field, ${spec.damage}/s,`
    + ` burning for ${(spec.fieldDuration / TPS).toFixed(1)}s`);

  // One tick past detonation: the field exists, and nothing has been blasted.
  const born = runScenario(bombId, {
    enemyDistance: R * 0.5, playerDistance: R * 0.5, extraTicks: 1,
  });
  check("the detonation leaves burning ground behind it",
    born.fieldsAfterDetonation === 1, `${born.fieldsAfterDetonation} fields`);
  // Not "no damage": the field starts burning the moment it exists. What
  // must not happen is a lump — the figure has to be burn-rate shaped.
  check("and deals no blast damage of its own, only burn",
    born.enemyDamage <= (spec.damage / TPS) * 2 + 1e-6,
    `enemy took ${born.enemyDamage.toFixed(2)} on the tick it went off`);

  // Let the field burn: now both sides should be alight and losing hull.
  const burning = runScenario(bombId, {
    enemyDistance: R * 0.5, playerDistance: R * 0.5, extraTicks: 60,
  });
  check("anything standing in the field is set alight",
    burning.enemyBurning, "the enemy never caught fire");
  check("the field damages the enemy over time",
    burning.enemyDamage > 0, `took ${burning.enemyDamage}`);
  check("and damages the player on exactly the same terms",
    burning.playerDamage > 0, `took ${burning.playerDamage}`);

  const clear = runScenario(bombId, {
    enemyDistance: R + 1, playerDistance: R + 1, extraTicks: 60,
  });
  check("nothing just outside the field is lit",
    clear.enemyDamage === 0 && clear.playerDamage === 0 && !clear.enemyBurning,
    `enemy ${clear.enemyDamage}, player ${clear.playerDamage}`);

  // The field is a lifetime, not a permanent hazard.
  const expired = runScenario(bombId, {
    enemyDistance: R + 1, playerDistance: R + 1, extraTicks: spec.fieldDuration + 2,
  });
  check(`the ground stops burning after ${spec.fieldDuration} ticks`,
    expired.fieldsNow === 0, `${expired.fieldsNow} fields still alight`);

  // Which is why its fuse ladder is the longest for its size: the danger it
  // creates outlives its own detonation.
  const sameSize = BOMB_IDS.filter((id) =>
    BOMBS[id].props.fuse && id !== bombId && BOMBS[id].blastRadius <= R);
  check("its fuse is longer than any smaller system's",
    sameSize.every((id) => specFor(id).fuse < spec.fuse),
    sameSize.map((id) => `${id} ${specFor(id).fuse}`).join(", "));
}

// --- contact mines ---------------------------------------------------------
/**
 * Drops a mine, then flies the given aircraft past it at `passDistance` and
 * reports whether it went off and what it cost.
 */
function runMineScenario(bombId, {
  passDistance, mover = "player", waitTicks = 400, rung = 0, engine = TOP_ENGINE,
}) {
  const world = worldFor(bombId, { rung, engine });
  const spec = world.player.bomb;

  dropBomb(world);
  const bomb = world.bombs[0];
  bomb.x = 0;
  bomb.y = 0;

  spawnEnemy(world, DUMMY);
  const enemy = world.enemies[0];
  // Park whichever is not the subject well out of the way.
  const far = spec.blastRadius * 5;
  enemy.x = mover === "enemy" ? passDistance : far;
  enemy.y = 0;

  const enemyHpBefore = enemy.hp;
  const playerHpBefore = world.player.hp;

  let detonatedAt = null;
  let stillArmedAt = null;
  for (let tick = 1; tick <= waitTicks; tick++) {
    world.player.x = mover === "player" ? passDistance : far;
    world.player.y = 0;
    enemy.x = mover === "enemy" ? passDistance : far;
    enemy.y = 0;
    if (tick === spec.armTime - 1 && world.bombs.length === 1) stillArmedAt = tick;
    const before = world.bombs.length;
    updateBombs(world);
    if (before === 1 && world.bombs.length === 0 && detonatedAt === null) detonatedAt = tick;
  }

  return {
    detonatedAt,
    survivedArming: stillArmedAt !== null,
    enemyDamage: enemyHpBefore - enemy.hp,
    playerDamage: playerHpBefore - world.player.hp,
  };
}

for (const bombId of CONTACT) {
  // At the top rung: a stock mine's trigger ring is smaller than the player's
  // own hitbox, which is the point of it, but makes a near-miss test moot.
  const spec = specFor(bombId, { rung: 4 });
  const trigger = spec.triggerRadius;

  console.log(`\n${spec.name} (maxed) — ${spec.carried} carried,`
    + ` touched at ${trigger} m, ${spec.damage} damage`);

  const untouched = runMineScenario(bombId, { passDistance: spec.blastRadius * 4, rung: 4 });
  check("sits there indefinitely when nothing comes near",
    untouched.detonatedAt === null, `went off at tick ${untouched.detonatedAt}`);
  check("and harms nobody while it waits",
    untouched.playerDamage === 0 && untouched.enemyDamage === 0);

  const byPlayer = runMineScenario(bombId, { passDistance: trigger * 0.5, rung: 4 });
  check("the player setting it off detonates it", byPlayer.detonatedAt !== null);
  check("and the player takes its damage",
    byPlayer.playerDamage === spec.damage, `took ${byPlayer.playerDamage}`);
  check("it does not go off before it is armed",
    byPlayer.detonatedAt >= spec.armTime, `went off at tick ${byPlayer.detonatedAt}`);

  const byEnemy = runMineScenario(bombId, { passDistance: trigger * 0.5, mover: "enemy", rung: 4 });
  check("an enemy setting it off detonates it", byEnemy.detonatedAt !== null);
  check("and that enemy takes its damage",
    byEnemy.enemyDamage === spec.damage, `took ${byEnemy.enemyDamage}`);

  // Just outside the trigger: close enough to be inside the blast, but the
  // mine has no reason to go off.
  const nearMiss = runMineScenario(bombId, {
    passDistance: trigger + PLAYER.radius + 5, rung: 4,
  });
  check("passing just outside the trigger leaves it armed",
    nearMiss.detonatedAt === null, `went off at tick ${nearMiss.detonatedAt}`);

  // The ring is derived from the warhead, so climbing DAMAGE makes the mine
  // deadlier and twitchier at once — the trade that stands in for the
  // downside ladder it does not have.
  const stock = specFor(bombId, { rung: 0 });
  check("the trigger ring widens with the warhead",
    stock.triggerRadius < spec.triggerRadius,
    `${stock.triggerRadius} m -> ${spec.triggerRadius} m`);
  check("a stock mine must be almost collided with",
    stock.triggerRadius < PLAYER.radius, `${stock.triggerRadius} m`);
}

// --- the fuse gate, which is what makes a short fuse legitimate ------------
/**
 * Every unlocked rung, on the engine that unlocks it, must be escapable at
 * that engine's cruise — flying straight out from the drop point. This is the
 * check the gate exists for: config may type any endpoint it likes, and this
 * is what refuses one that cannot be flown away from.
 */
console.log("\nTHE FUSE GATE IS ESCAPABLE AT THE CRUISE THAT UNLOCKS IT");

for (const bombId of TIMED) {
  const ladder = BOMBS[bombId].props.fuse;
  if (!ladder) continue;

  const rows = [];
  let worst = Infinity;

  for (let rung = 0; rung < ladder.tiers.length; rung++) {
    // The first engine whose gate reaches this rung is the one it is sold on.
    const engineId = ENGINE_IDS.find((id) => maxFuseRung(id) >= rung);
    if (!engineId) continue;

    const spec = specFor(bombId, { rung, engine: engineId });
    const cruise = ENGINES[engineId].cruiseSpeed;

    // A cluster is dangerous twice: the parent blast at the fuse, and the
    // spray landing `bombletFlight` later across a much wider footprint. Both
    // have to be outrun, so the tighter of the two is what counts.
    const waves = [{ ticks: spec.fuse, reach: spec.blastRadius }];
    if (spec.footprint) {
      waves.push({ ticks: spec.fuse + spec.bombletFlight, reach: spec.footprint });
    }

    const margins = waves.map((w) => cruise * w.ticks - w.reach);
    const margin = Math.min(...margins);
    worst = Math.min(worst, margin);

    rows.push({
      rung,
      unlocked_by: ENGINES[engineId].short,
      cruise,
      fuse: `${(spec.fuse / TPS).toFixed(1)}s`,
      travelled: Math.round(cruise * spec.fuse),
      radius: spec.footprint
        ? `${spec.blastRadius} (+${spec.footprint} spray)`
        : spec.blastRadius,
      margin: Math.round(margin),
    });
  }

  console.log(`\n${BOMBS[bombId].name}`);
  console.table(rows);
  check("every unlocked rung clears its own radius at that engine's cruise",
    worst > 0, `tightest margin ${Math.round(worst)}`);
  check(`no rung dips under the ${(BOMB.minFuse / TPS).toFixed(1)}s floor`,
    ladder.tiers.every((_, rung) => specFor(bombId, { rung }).fuse >= BOMB.minFuse),
    "a rung resolves below the floor");
}

// --- the heaviest thing in the sky should not fall to one bomb ------------
console.log("\nTHE BOSS IS NOT A FORMALITY");
const toughest = ENEMY_TYPES[DUMMY];
const heaviest = Math.max(...BOMB_IDS.map((id) => {
  const spec = specFor(id, { rung: 4 });
  // A field does its damage over time, so what it can deliver is its burn
  // rate across the time something would have to sit in it.
  if (spec.trigger === "field") {
    return Math.round(spec.damage * (spec.fieldDuration + CANNON.burnDuration) / TPS);
  }
  return spec.damage;
}));
check(`a ${toughest.name} survives the heaviest single hit (${heaviest})`,
  toughest.hp > heaviest, "the boss dies to a single drop");

if (failures) {
  console.error(`\nFAIL — ${failures} bomb behaviour check(s) failed`);
  process.exit(1);
}
console.log(`\nPASS — all ${BOMB_IDS.length} bomb systems behave, both sides take`
  + ` what they deal, and every unlocked fuse rung can be flown away from`);
