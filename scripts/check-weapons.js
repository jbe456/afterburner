/**
 * Guards the mechanics that make the weapon choice mean something, as opposed
 * to the raw numbers that check-balance.js already compares.
 *
 * Each of these is invisible when it breaks: a pierce that stops at the first
 * target, an incendiary that does no burn damage, or a lock requirement that
 * silently lets AMRAAMs off the rail all look completely normal on screen.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

import { createWorld } from "../src/world.js";
import { fireGun, fireMissile } from "../src/entities/weapons.js";
import { updateBullets } from "../src/entities/projectiles.js";
import { spawnEnemy, updateBurning } from "../src/entities/enemy.js";
import { CANNONS, MISSILES, LOCK } from "../src/config.js";

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
  check(`${spec.name} fires ${spec.barrels} round(s) per pull`,
    world.bullets.length === spec.barrels, `got ${world.bullets.length}`);
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
  // Firebelt must keep damaging after the round has landed and firing stopped.
  const { world, player, enemies } = setup({ cannon: "firebelt" }, [200]);
  const target = enemies[0];
  fireGun(world, player, true);
  for (let t = 0; t < 120 && world.bullets.length; t++) updateBullets(world);

  check("FIREBELT ignites what it hits", Boolean(target.burn), "no burn state");

  const hpAfterImpact = target.hp;
  updateBurning(world);
  updateBurning(world);
  const burning = target.hp < hpAfterImpact;
  check("burn damages over time with no further hits", burning,
    `hp ${hpAfterImpact} -> ${target.hp}`);

  for (let t = 0; t < 200; t++) updateBurning(world);
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
  const { world, player, enemies } = setup({ missile: id }, [400]);

  // Give every type a solid lock so only the lock *requirement* is under test.
  player.lock = enemies[0];
  player.lockTime = LOCK.ticksToSolid;

  fireMissile(world);
  check(`${spec.name} launches ${spec.perShot} per pull`,
    world.missiles.length === spec.perShot, `got ${world.missiles.length}`);
  check(`${spec.name} draws ${spec.perShot} from the rack`,
    player.missiles === spec.carried - spec.perShot, `left ${player.missiles}`);
}

{
  // AMRAAM must refuse to launch without a solid lock, and fire with one.
  const { world, player, enemies } = setup({ missile: "amraam" }, [400]);

  player.lock = null;
  fireMissile(world);
  check("AMRAAM will not launch with no lock", world.missiles.length === 0);

  player.lock = enemies[0];
  player.lockTime = LOCK.ticksToSolid - 1;
  fireMissile(world);
  check("AMRAAM will not launch on a partial lock", world.missiles.length === 0);

  player.lockTime = LOCK.ticksToSolid;
  fireMissile(world);
  check("AMRAAM launches on a solid lock", world.missiles.length === 1);
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
console.log("\nPASS — pierce, ignition, salvo size and lock requirements all behave");
