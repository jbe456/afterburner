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
import { fireGun, fireMissile } from "../src/entities/weapons.js";
import { updateBullets, updateFlames } from "../src/entities/projectiles.js";
import { spawnEnemy, updateBurning } from "../src/entities/enemy.js";
import { CANNONS, MISSILES, RADAR_RANGE } from "../src/config.js";

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
  // Everything inside the cone burns; nothing outside it is touched.
  const spec = CANNONS.firebelt;
  const inCone = 150;              // within range, dead ahead
  const behind = -150;             // within range, but behind the nose
  const tooFar = spec.range + 300; // dead ahead, well beyond the cone

  const { world, player, enemies } = setup({ cannon: "firebelt" }, [inCone, behind, tooFar]);
  const [front, back, distant] = enemies;
  const before = enemies.map((e) => e.hp);

  fireGun(world, player, true);
  updateFlames(world);

  check("flame damages an aircraft inside the cone", front.hp < before[0]);
  check("flame ignites an aircraft inside the cone", Boolean(front.burn));
  check("flame does not reach behind the jet", back.hp === before[1] && !back.burn);
  check("flame does not reach past its range", distant.hp === before[2] && !distant.burn);
}

{
  // The cone outlives its damage by one tick so the renderer can draw it.
  // That must not turn into damage landing twice.
  const { world, player, enemies } = setup({ cannon: "firebelt" }, [150]);
  const target = enemies[0];
  const before = target.hp;

  fireGun(world, player, true);
  updateFlames(world);
  const afterOne = target.hp;
  const dealt = before - afterOne;

  check("one spray deals its damage once", Math.abs(dealt - CANNONS.firebelt.damage) < 1e-9,
    `dealt ${dealt}`);
  check("the cone survives a tick so it can be drawn", world.flames.length === 1);

  updateFlames(world); // the lingering cone must not hurt anything again
  check("the lingering cone deals no further damage", target.hp === afterOne,
    `hp ${afterOne} -> ${target.hp}`);
  check("the cone is cleaned up next tick", world.flames.length === 0);
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

if (failures) {
  console.error(`\nFAIL — ${failures} weapon behaviour check(s) failed`);
  process.exit(1);
}
console.log("\nPASS — pierce, flame cones, ignition, salvos and seeker envelopes all behave");
