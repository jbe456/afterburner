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
import { fireGun, fireMissile, fireEnemyMissile, dropEnemyBomb } from "../src/entities/weapons.js";
import { updateBullets, updateFlames, updateMissiles } from "../src/entities/projectiles.js";
import { spawnEnemy, updateBurning } from "../src/entities/enemy.js";
import { CANNONS, MISSILES, RADAR_RANGE, ENEMY_TYPES, ENEMY_TYPE_IDS } from "../src/config.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures++;
  console.log(`  ${condition ? "pass" : "FAIL"}  ${name}${condition ? "" : `  ${detail}`}`);
}

/** A world with the given loadout and enemies parked along the +X axis. */
function setup(loadout, enemyXs = []) {
  const world = createWorld({ plane: "viper", ...loadout });
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
console.log("\nCANNONS");

for (const id of Object.keys(CANNONS)) {
  const spec = CANNONS[id];
  const { world, player } = setup({ cannon: id });
  fireGun(world, player, true);
  const expected = spec.kind === "flame" ? 0 : spec.barrels;
  check(`${spec.name} emits ${expected} round(s) per pull`,
    world.bullets.length === expected, `got ${world.bullets.length}`);
}

{
  // Three fighters in a line; one Avenger round should go through all three.
  const { world, player, enemies } = setup({ cannon: "avenger" }, [200, 400, 600]);
  fireGun(world, player, true);
  for (let t = 0; t < 120 && world.bullets.length; t++) updateBullets(world);

  const killed = enemies.filter((e) => !world.enemies.includes(e)).length;
  check("one AVENGER round kills three aircraft in a line",
    killed === 3, `killed ${killed}`);
}

{
  // A Vulcan round must stop at the first target it touches.
  const { world, player, enemies } = setup({ cannon: "vulcan" }, [200, 400, 600]);
  // One round is not lethal, so compare damage taken rather than kills.
  const before = enemies.map((e) => e.hp);
  fireGun(world, player, true);
  for (let t = 0; t < 120 && world.bullets.length; t++) updateBullets(world);
  const hit = enemies.filter((e, i) => e.hp < before[i]).length;
  check("a VULCAN round stops at the first aircraft", hit === 1, `hit ${hit}`);
}

{
  // The flamethrower fires a cone, not a projectile.
  const { world, player } = setup({ cannon: "firebelt" }, [150]);
  fireGun(world, player, true);
  check("FIREBELT produces no bullets", world.bullets.length === 0);
  check("FIREBELT produces a flame cone", world.flames.length === 1);
}

{
  // Everything inside the cone catches fire; nothing outside it is touched.
  const spec = CANNONS.firebelt;
  const inCone = 150;              // within range, dead ahead
  const behind = -150;             // within range, but behind the nose
  const tooFar = spec.range + 300; // dead ahead, well beyond the cone

  const { world, player, enemies } = setup({ cannon: "firebelt" }, [inCone, behind, tooFar]);
  const [front, back, distant] = enemies;
  const before = enemies.map((e) => e.hp);

  fireGun(world, player, true);
  updateFlames(world);

  check("flame ignites an aircraft inside the cone", Boolean(front.burn));
  // The Firebelt's damage is all fire: the cone itself must do none.
  check("the flame itself deals no direct damage", front.hp === before[0],
    `hp ${before[0]} -> ${front.hp}`);
  check("flame does not reach behind the jet", back.hp === before[1] && !back.burn);
  check("flame does not reach past its range", distant.hp === before[2] && !distant.burn);

  // The fire is what actually hurts.
  updateBurning(world);
  check("the fire it starts does the damage", front.hp < before[0],
    `hp still ${front.hp}`);
}

{
  // The cone outlives its effect by one tick so the renderer can draw it.
  const { world, player, enemies } = setup({ cannon: "firebelt" }, [150]);
  const target = enemies[0];

  fireGun(world, player, true);
  updateFlames(world);
  check("the cone survives a tick so it can be drawn", world.flames.length === 1);

  updateFlames(world);
  check("the cone is cleaned up next tick", world.flames.length === 0);
}

{
  // Burning does not stack: re-lighting an already-burning target refreshes
  // the fire rather than doubling its rate.
  const { world, player, enemies } = setup({ cannon: "firebelt" }, [150]);
  const target = enemies[0];

  fireGun(world, player, true);
  updateFlames(world);
  const singleRate = (() => {
    const before = target.hp;
    updateBurning(world);
    return before - target.hp;
  })();

  for (let i = 0; i < 5; i++) { fireGun(world, player, true); updateFlames(world); }
  const before = target.hp;
  updateBurning(world);
  const afterRelights = before - target.hp;

  check("re-lighting refreshes the fire rather than stacking it",
    Math.abs(afterRelights - singleRate) < 1e-9,
    `${singleRate} -> ${afterRelights} per tick`);
  check("the fire burns at the configured rate",
    Math.abs(singleRate - CANNONS.firebelt.burn.dps / 60) < 1e-9,
    `${singleRate} per tick`);
}

{
  // Fire keeps working after you stop, and kills on its own.
  const { world, player, enemies } = setup({ cannon: "firebelt" }, [150]);
  const target = enemies[0];
  fireGun(world, player, true);
  updateFlames(world);

  const hpAfterFlame = target.hp;
  updateBurning(world);
  updateBurning(world);
  check("burn damages over time with no further hits", target.hp < hpAfterFlame,
    `hp ${hpAfterFlame} -> ${target.hp}`);

  for (let t = 0; t < 300; t++) updateBurning(world);
  check("a sustained burn is lethal on its own",
    !world.enemies.includes(target), `survived with ${target.hp.toFixed(1)} hp`);
}

{
  // And the plain guns must not set anything alight.
  const { world, player, enemies } = setup({ cannon: "vulcan" }, [200]);
  fireGun(world, player, true);
  for (let t = 0; t < 120 && world.bullets.length; t++) updateBullets(world);
  check("VULCAN does not ignite", !enemies[0].burn);
}

// --- missiles --------------------------------------------------------------
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
console.log("\nENEMY GUNS");

for (const id of ENEMY_TYPE_IDS) {
  const type = ENEMY_TYPES[id];
  const barrels = type.barrels ?? 1;

  const world = createWorld({ plane: "viper" });
  spawnEnemy(world, id);
  const enemy = world.enemies[0];
  enemy.x = 0; enemy.y = 0; enemy.angle = 0;

  fireGun(world, enemy, false);
  check(`${type.name} fires ${barrels} round(s) per burst`,
    world.bullets.length === barrels, `got ${world.bullets.length}`);
  check(`${type.name}'s rounds are hostile`,
    world.bullets.every((b) => !b.friendly));
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
console.log("\nPASS — pierce, flame cones, ignition, salvos and seeker envelopes all behave");
