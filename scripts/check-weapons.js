/**
 * Guards the mechanics that make the weapon choice mean something, as opposed
 * to the raw numbers that check-balance.js already compares.
 *
 * Each of these is invisible when it breaks: a pierce that stops at the first
 * target, a flame cone that quietly damages twice, or a seeker that stops
 * finding targets behind the jet all look completely normal on screen.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { createWorld } from "../src/world.js";
import { updateBombs } from "../src/entities/bombs.js";
import {
  fireGun, fireMissile, fireEnemyMissile, dropEnemyBomb, sprayFlame, fireLaser,
  fireEnemyFlame, fireEnemyLaser,
} from "../src/entities/weapons.js";
import { updateBullets, updateFlames, updateMissiles } from "../src/entities/projectiles.js";
import { spawnEnemy, updateBurning } from "../src/entities/enemy.js";
import {
  WEAPONS, MISSILES, RADAR_RANGE, ENEMY_TYPES, ENEMY_TYPE_IDS,
  DEFAULT_LOADOUT, resolveWeapons, CANNON, enemyWeapon, enemyDps,
} from "../src/config.js";
import { updatePlayerBurn } from "../src/entities/player.js";

/**
 * A loadout carrying `weapon`, with its properties pushed to given rungs.
 * Only one forward weapon can be fitted, so the weapon is always stated.
 */
function fit(weapon, overrides = {}) {
  const out = { ...DEFAULT_LOADOUT, weapon };
  for (const [key, rung] of Object.entries(overrides)) {
    const [track, prop] = key.split(".");
    const tiers = WEAPONS[track].props[prop].tiers;
    out[key] = rung === "max" ? tiers.length - 1 : rung;
  }
  return out;
}

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures++;
  console.log(`  ${condition ? "pass" : "FAIL"}  ${name}${condition ? "" : `  ${detail}`}`);
}

/** A world with the given loadout and enemies parked along the +X axis. */
function setup(loadout, enemyXs = []) {
  const world = createWorld({ ...DEFAULT_LOADOUT, ...loadout });
  const p = world.player;
  p.x = 0; p.y = 0; p.angle = 0; p.speed = 0; p.invuln = 0;

  const enemies = enemyXs.map((x) => {
    spawnEnemy(world, "fighter");
    const e = world.enemies[world.enemies.length - 1];
    e.x = x; e.y = 0;
    return e;
  });
  return { world, player: p, enemies };
}

// --- cannons ---------------------------------------------------------------
console.log("\nCANNON");

{
  // Slots are barrels: every one of them must put a round in the air.
  for (const [rung, slots] of WEAPONS.cannon.props.slots.tiers.entries()) {
    const { world, player } = setup(fit("cannon", { "cannon.slots": rung }));
    fireGun(world, player, true);
    check(`${slots} slots fire ${slots} rounds`,
      world.bullets.length === slots, `got ${world.bullets.length}`);
  }
}

{
  // Reach is a distance, so a round must die at it rather than fly forever.
  for (const rung of [0, 4, 9]) {
    const loadout = fit("cannon", { "cannon.reach": rung });
    const { reach, bulletLife } = resolveWeapons(loadout).cannon;
    const travelled = bulletLife * CANNON.bulletSpeed;
    check(`reach ${reach} m expires within a tick of its range (flew ${travelled})`,
      Math.abs(travelled - reach) <= CANNON.bulletSpeed, `flew ${travelled}`);
  }
}

{
  // Rate is shots per second, which is what the cooldown has to deliver.
  for (const rung of [0, 5, 9]) {
    const { rate, cooldown } = resolveWeapons(fit("cannon", { "cannon.rate": rung })).cannon;
    const actual = 60 / cooldown;
    check(`rate ${rate}/s lands within half a shot of its cadence`,
      Math.abs(actual - rate) < 0.5, `fires ${actual.toFixed(2)}/s`);
  }
}

{
  // Regular rounds stop at the first aircraft; piercing go through three.
  const line = [200, 400, 600];

  const plain = setup(fit("cannon", { "cannon.type": 0, "cannon.damage": "max", "cannon.reach": "max" }), line);
  // One barrel, or two rounds would kill two aircraft without piercing at all
  // and the test would pass for the wrong reason.
  plain.world.player.cannon.slots = 1;
  fireGun(plain.world, plain.player, true);
  for (let t = 0; t < 200 && plain.world.bullets.length; t++) updateBullets(plain.world);
  const plainKills = plain.enemies.filter((e) => !plain.world.enemies.includes(e)).length;
  check("a regular round stops at the first aircraft", plainKills === 1, `killed ${plainKills}`);

  const pierce = setup(fit("cannon", { "cannon.type": 1, "cannon.damage": "max", "cannon.reach": "max" }), line);
  // One barrel again, so three kills can only mean one round went through three.
  pierce.world.player.cannon.slots = 1;
  fireGun(pierce.world, pierce.player, true);
  for (let t = 0; t < 200 && pierce.world.bullets.length; t++) updateBullets(pierce.world);
  const pierceKills = pierce.enemies.filter((e) => !pierce.world.enemies.includes(e)).length;
  check("a piercing round goes through three", pierceKills === 3, `killed ${pierceKills}`);
}

console.log("\nFLAME");

{
  const { world, player } = setup(fit("flame", { "flame.reach": 2 }), [80, -80, 4000]);
  const [front, back, distant] = world.enemies;

  check("fitted when selected", player.flame !== null);
  check("and the guns are put away", player.cannon === null);

  sprayFlame(world, player);
  updateFlames(world);

  check("ignites what is in the cone", Boolean(front.burn));
  check("the cone itself deals no damage", front.hp === ENEMY_TYPES.fighter.hp);
  check("does not reach behind", !back.burn);
  check("does not reach past its range", !distant.burn);

  updateBurning(world);
  check("the fire it starts does the damage", front.hp < ENEMY_TYPES.fighter.hp);
}

console.log("\nLASER");

{
  // A beam is a line: far along it is fine, far off to the side is not.
  const reach = WEAPONS.laser.props.reach.tiers.at(-1);
  const { world, player, enemies } = setup(
    fit("laser", { "laser.damage": "max", "laser.reach": "max" }),
    [reach * 0.9, reach * 0.9, reach * 1.5]);
  const [onBeam, offBeam, beyond] = enemies;
  offBeam.y = 400;          // directly abeam, well off the line

  check("fitted when selected", player.laser !== null);
  check("and the guns are put away", player.cannon === null);

  fireLaser(world, player);
  updateFlames(world);

  check("ignites a target far down the beam", Boolean(onBeam.burn));
  check("misses one off to the side", !offBeam.burn);
  check("stops at its reach", !beyond.burn);
}

console.log("\nONE WEAPON AT A TIME");

{
  for (const weapon of Object.keys(WEAPONS)) {
    const { player } = setup(fit(weapon));
    const carried = ["cannon", "flame", "laser"].filter((k) => player[k]);
    check(`choosing ${weapon} carries only ${weapon}`,
      carried.length === 1 && carried[0] === weapon, `carries ${carried.join(", ")}`);
  }

  // Rungs survive being switched away from and back.
  const stashed = fit("flame", { "flame.damage": "max" });
  const away = { ...stashed, weapon: "cannon" };
  const back = { ...away, weapon: "flame" };
  check("a weapon's rungs are kept while it is put away",
    resolveWeapons(back).flame.damage === WEAPONS.flame.props.damage.tiers.at(-1));
}

console.log("\nMISSILES");

for (const id of Object.keys(MISSILES)) {
  const spec = MISSILES[id];
  const { world, player } = setup({ missile: id }, [400]);

  // No lock given: nothing should need one any more.
  fireMissile(world);
  check(`${spec.name} launches ${spec.perShot} per pull`,
    world.missiles.length === spec.perShot, `got ${world.missiles.length}`);
  check(`${spec.name} draws ${spec.perShot} from the rack`,
    player.missiles === spec.carried - spec.perShot, `left ${player.missiles}`);
}

{
  // AMRAAM is all-aspect: no lock needed, and it will take a target that is
  // directly behind the jet, anywhere inside radar range.
  const { world, player, enemies } = setup({ missile: "amraam" }, []);
  spawnEnemy(world, "fighter");
  const chaser = world.enemies[0];
  chaser.x = -1800; // on our six, well outside any forward cone
  chaser.y = 0;

  player.lock = null;
  fireMissile(world);
  check("AMRAAM launches with no lock at all", world.missiles.length === 1);
  check("AMRAAM acquires a target behind the jet",
    world.missiles[0].target === chaser, "took no target");
}

{
  // And it must still respect the radar's edge.
  const { world, player } = setup({ missile: "amraam" }, []);
  spawnEnemy(world, "fighter");
  world.enemies[0].x = RADAR_RANGE + 400;
  world.enemies[0].y = 0;

  player.lock = null;
  fireMissile(world);
  check("AMRAAM takes no target beyond radar range",
    world.missiles[0].target === null);
}

{
  // The Sidewinder's seeker looks forward only — that is its limitation.
  const { world, player } = setup({ missile: "sidewinder" }, []);
  spawnEnemy(world, "fighter");
  world.enemies[0].x = -400;
  world.enemies[0].y = 0;

  player.lock = null;
  fireMissile(world);
  check("AIM-9 will not acquire a target behind the jet",
    world.missiles[0].target === null);
}

{
  // Hydra is unguided: no lock needed, and it must ignore the target entirely.
  const { world, player, enemies } = setup({ missile: "hydra" }, [400]);
  player.lock = null;
  fireMissile(world);
  check("HYDRA launches with no lock at all", world.missiles.length === 2);
  check("HYDRA takes no target", world.missiles.every((m) => m.target === null));

  // Put a target hard off to one side; a guided missile would turn for it.
  enemies[0].x = 600; enemies[0].y = 600;
  const headings = world.missiles.map((m) => m.angle);
  for (let t = 0; t < 60; t++) {
    for (const m of world.missiles) {
      m.x += Math.cos(m.angle) * m.speed;
      m.y += Math.sin(m.angle) * m.speed;
    }
  }
  check("HYDRA flies straight past a target it could have chased",
    world.missiles.every((m, i) => m.angle === headings[i]));
}

// --- enemy guns ------------------------------------------------------------
console.log("\nENEMY FORWARD WEAPONS");

{
  // Exactly one forward weapon apiece. A type carrying two would be an
  // accident, and nothing on screen would say so.
  //
  // Carriers are the stated exception: they are ships, they carry none of the
  // three, and their armament is the SAM battery checked below.
  const doubled = ENEMY_TYPE_IDS.filter((id) => {
    const t = ENEMY_TYPES[id];
    if (t.carrier) return false;
    return [t.flame, t.laser, t.damage !== undefined].filter(Boolean).length !== 1;
  });
  check("every aircraft carries exactly one forward weapon", doubled.length === 0,
    doubled.join(", "));

  // ...and the exception has to be exactly that, or a ship with a cannon
  // bolted on would slip through the check above unnoticed.
  const armedShips = ENEMY_TYPE_IDS.filter((id) => {
    const t = ENEMY_TYPES[id];
    return t.carrier && (t.flame || t.laser || t.damage !== undefined);
  });
  check("a carrier carries no forward weapon at all", armedShips.length === 0,
    armedShips.join(", "));

  const unarmedShips = ENEMY_TYPE_IDS.filter(
    (id) => ENEMY_TYPES[id].carrier && !ENEMY_TYPES[id].sam);
  check("every carrier carries a SAM battery", unarmedShips.length === 0,
    unarmedShips.join(", "));

  // enemyDps falls through to the gun formula, which needs `damage` and
  // `fireCd`. A type with neither returns NaN, and NaN silently poisons the
  // escalation check in check-waves.js rather than failing it.
  const notANumber = ENEMY_TYPE_IDS.filter((id) => !Number.isFinite(enemyDps(ENEMY_TYPES[id])));
  check("every type reports a finite dps", notANumber.length === 0,
    notANumber.join(", "));
}

{
  // The SAM is the one enemy weapon with no equivalent on your aircraft, so
  // it is measured against the nearest thing you carry: a missile, and the
  // reach of a fully upgraded beam. A battery that out-ranged everything you
  // own would make closing with a carrier impossible rather than costly.
  const ships = ENEMY_TYPE_IDS
    .map((id) => ENEMY_TYPES[id])
    .filter((t) => enemyWeapon(t) === "sam");

  check("at least one type carries a SAM", ships.length > 0);

  const bestMissile = Math.max(...Object.values(MISSILES).map((m) => m.damage));
  const hardest = Math.max(...ships.map((t) => t.sam.damage));
  check(`no SAM out-damages your best missile's ${bestMissile}`,
    hardest < bestMissile, `hardest ${hardest}`);

  const beamReach = resolveWeapons(
    fit("laser", { "laser.reach": "max" }),
  ).laser.range;
  const furthest = Math.max(...ships.map((t) => t.sam.range));
  check(`no SAM envelope out-ranges your maxed beam's ${beamReach} m`,
    furthest < beamReach, `furthest ${furthest} m`);

  // The envelope has to be a decision, not an ambush: it must be visible on
  // the radar well before you are inside it.
  check(`every SAM envelope sits inside radar range (${RADAR_RANGE} m)`,
    furthest < RADAR_RANGE, `furthest ${furthest} m`);
}

{
  // Enemy nose weapons stay under a fully upgraded player's. Losing to
  // something you cannot out-shoot even when maxed is not a difficulty curve.
  const best = (weapon) => resolveWeapons(
    fit(weapon, { [`${weapon}.damage`]: "max", [`${weapon}.reach`]: "max" }),
  )[weapon];

  for (const kind of ["flame", "laser"]) {
    const ceiling = best(kind);
    const carriers = ENEMY_TYPE_IDS
      .map((id) => ENEMY_TYPES[id])
      .filter((t) => enemyWeapon(t) === kind);

    const fiercest = Math.max(...carriers.map((t) => (t.flame ?? t.laser).damage));
    const longest = Math.max(...carriers.map((t) => (t.flame ?? t.laser).range));

    check(`no enemy ${kind} out-damages ${ceiling.damage}/s`,
      fiercest < ceiling.damage, `fiercest ${fiercest}/s`);
    check(`no enemy ${kind} out-ranges ${ceiling.range} m`,
      longest < ceiling.range, `longest ${longest} m`);
  }
}

for (const id of ENEMY_TYPE_IDS) {
  const type = ENEMY_TYPES[id];
  if (enemyWeapon(type) !== "gun") continue;

  const barrels = type.barrels ?? 1;
  const world = createWorld({});
  spawnEnemy(world, id);
  const enemy = world.enemies[0];
  enemy.x = 0; enemy.y = 0; enemy.angle = 0;

  fireGun(world, enemy, false);
  check(`${type.name} fires ${barrels} round(s) per burst`,
    world.bullets.length === barrels, `got ${world.bullets.length}`);
  check(`${type.name}'s rounds are hostile`,
    world.bullets.every((b) => !b.friendly));
}

for (const id of ENEMY_TYPE_IDS) {
  const type = ENEMY_TYPES[id];
  const kind = enemyWeapon(type);
  if (kind === "gun" || kind === "sam") continue;

  const world = createWorld({});
  const p = world.player;
  p.x = 0; p.y = 0; p.invuln = 0; p.hp = 100000;

  spawnEnemy(world, id);
  const enemy = world.enemies[0];
  // Sat off the nose at half its reach, pointed straight at the player.
  enemy.x = -type.range * 0.5; enemy.y = 0; enemy.angle = 0;

  const spec = type.flame ?? type.laser;
  const fire = () => (kind === "flame"
    ? fireEnemyFlame(world, enemy, spec)
    : fireEnemyLaser(world, enemy, spec));

  fire();
  updateFlames(world);
  check(`${type.name}'s ${kind} sets the player alight`,
    p.burn?.dps === spec.damage, `burn ${JSON.stringify(p.burn)}`);

  const before = p.hp;
  updatePlayerBurn(world);
  check(`${type.name}'s fire then damages the player`, p.hp < before);

  // And it must not touch its own side.
  spawnEnemy(world, "fighter");
  const friend = world.enemies[1];
  friend.x = enemy.x + 40; friend.y = 0;
  const friendHp = friend.hp;
  fire();
  updateFlames(world);
  check(`${type.name} does not burn its own side`,
    !friend.burn && friend.hp === friendHp);
}

// --- enemy ordnance --------------------------------------------------------
console.log("\nENEMY ORDNANCE");

{
  // Every type that declares a launcher must actually use it.
  for (const id of ENEMY_TYPE_IDS) {
    const type = ENEMY_TYPES[id];
    if (!type.missile) continue;

    const { world, player } = setup({}, []);
    spawnEnemy(world, id);
    const enemy = world.enemies[0];
    enemy.x = 500; enemy.y = 0; enemy.angle = Math.PI;

    fireEnemyMissile(world, enemy, type.missile);
    check(`${type.name} launches ${type.missile.salvo} missile(s)`,
      world.missiles.length === type.missile.salvo, `got ${world.missiles.length}`);
    check(`${type.name}'s missiles are hostile and chase the player`,
      world.missiles.every((m) => m.friendly === false && m.target === player));
  }
}

{
  // An enemy missile must damage the player, and must not stop on its friends.
  const { world, player } = setup({}, []);
  player.invuln = 0;
  spawnEnemy(world, "lancer");
  const shooter = world.enemies[0];
  shooter.x = 320; shooter.y = 0; shooter.angle = Math.PI;

  // A bystander parked right on the missile's path home.
  spawnEnemy(world, "fighter");
  const bystander = world.enemies[1];
  bystander.x = 160; bystander.y = 0;
  const bystanderHp = bystander.hp;

  fireEnemyMissile(world, shooter, ENEMY_TYPES.lancer.missile);
  const hpBefore = player.hp;
  for (let t = 0; t < 200 && world.missiles.length; t++) updateMissiles(world);

  check("an enemy missile reaches and damages the player", player.hp < hpBefore,
    `hp unchanged at ${player.hp}`);
  check("it does not detonate on its own side", bystander.hp === bystanderHp,
    `bystander took ${bystanderHp - bystander.hp}`);
}

{
  // Enemy mines are the same indiscriminate weapon the player carries.
  const { world, player } = setup({}, []);
  player.invuln = 0;
  const spec = ENEMY_TYPES.sower.bomb;

  spawnEnemy(world, "sower");
  const sower = world.enemies[0];
  sower.x = 0; sower.y = 0; sower.angle = 0;

  spawnEnemy(world, "fighter");
  const neighbour = world.enemies[1];
  neighbour.x = 40; neighbour.y = 0;

  dropEnemyBomb(world, sower, spec);
  const bomb = world.bombs[0];
  bomb.x = 0; bomb.y = 0;
  check("a Sower leaves a mine behind it", world.bombs.length === 1);

  player.x = 60; player.y = 0;
  for (let t = 0; t <= spec.fuse; t++) {
    player.x = 60; player.y = 0;
    updateBombs(world);
  }

  check("an enemy mine kills the player", !player.alive);
  check("an enemy mine kills enemies too", !world.enemies.includes(neighbour));
}

if (failures) {
  console.error(`\nFAIL — ${failures} weapon behaviour check(s) failed`);
  process.exit(1);
}
console.log("\nPASS — slots, reach, rate, pierce, flame, laser, salvos and seekers all behave");
