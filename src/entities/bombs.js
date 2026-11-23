/**
 * The bomb: a munition you leave behind rather than fire.
 *
 * It does not move, it cannot be shot down, and when its fuse runs out it does
 * something indiscriminate to everything inside its radius — including yours.
 * Dropping one is a commitment to be somewhere else before it goes off.
 *
 * Four mechanics share this module, told apart by `spec.trigger`:
 *
 *   blast     the plain circle: flat damage inside the radius, once
 *   contact   no fuse; waits to be touched, then the same circle
 *   cluster   splits into bomblets that tile a spread, all on one fuse
 *   field     no blast damage at all; leaves the ground burning behind it
 *
 * Deliberately indiscriminate: nothing here makes a distinction between the
 * player and the enemy, which is what gives the weapon its cost.
 */

import { rand, TAU } from "../core/math.js";
import { sfx } from "../core/audio.js";
import { BOMB, CANNON, PLAYER } from "../config.js";
import { burst, addShake } from "./effects.js";
import { damageEnemy, ignite } from "./enemy.js";
import { damagePlayer, ignitePlayer } from "./player.js";

/**
 * How far in from the spray's full reach the nearest submunition lands. The
 * rest are spread between this and the full range, so a cluster covers a band
 * around the parent rather than a neat ring at one distance.
 */
const SCATTER_MIN = 0.45;

export function updateBombs(world) {
  // Recomputed each tick so the HUD can warn without reaching into this module.
  world.playerInBlast = playerInBlastZone(world);

  for (let i = world.bombs.length - 1; i >= 0; i--) {
    const bomb = world.bombs[i];
    const timed = Number.isFinite(bomb.spec.fuse);

    if (bomb.arming > 0) bomb.arming--;

    const contact = bomb.spec.trigger === "contact";

    if (timed) {
      bomb.fuse--;
      // Mines do not tick audibly; several of them would be a racket.
      if (!contact) playFuseBeep(bomb);
    }

    // A lazy plume so a live bomb is findable against a busy background.
    if (world.time % 7 === 0) {
      world.particles.push({
        x: bomb.x + rand(-5, 5), y: bomb.y + rand(-5, 5),
        vx: rand(-0.25, 0.25), vy: rand(-0.6, -0.2),
        life: 40, maxLife: 40, color: "#6c7a8a", size: 4,
      });
    }

    // Either condition sets it off, so a mine can also carry a long fuse as a
    // self-clearing timeout rather than littering the sky forever.
    const triggered = (timed && bomb.fuse <= 0)
      || (contact && bomb.arming <= 0 && touchedBy(world, bomb) !== null);

    if (triggered) {
      detonate(world, bomb);
      world.bombs.splice(i, 1);
    }
  }

  updateBomblets(world);
  updateFields(world);
}

/**
 * The first aircraft close enough to set a contact mine off, or null.
 *
 * It does not look at whose side anyone is on — flying into your own mine
 * works exactly as well as an enemy doing it.
 */
function touchedBy(world, bomb) {
  const reach = bomb.spec.triggerRadius;

  for (const e of world.enemies) {
    if (Math.hypot(e.x - bomb.x, e.y - bomb.y) <= reach + e.radius) return e;
  }

  const p = world.player;
  if (p.alive && Math.hypot(p.x - bomb.x, p.y - bomb.y) <= reach + PLAYER.radius) return p;

  return null;
}

/** Beeps slowly at first, then faster as the fuse runs down. */
function playFuseBeep(bomb) {
  const urgency = 1 - bomb.fuse / bomb.spec.fuse;
  const interval = Math.max(
    BOMB.fastBeepInterval,
    Math.round(BOMB.slowBeepInterval - urgency * (BOMB.slowBeepInterval - BOMB.fastBeepInterval)),
  );
  if (bomb.fuse % interval === 0) sfx.bombTick(urgency);
}

/** What the fuse running out actually does, which is not the same for all four. */
function detonate(world, bomb) {
  const spec = bomb.spec;

  if (spec.trigger === "cluster") return detonateCluster(world, bomb);
  if (spec.trigger === "field") return detonateField(world, bomb);

  // blast and contact are the same circle; only how they were set off differs.
  blastAt(world, bomb.x, bomb.y, spec.blastRadius, spec.damage);
  bloom(world, bomb.x, bomb.y, spec.blastRadius);
}

/**
 * The parent goes off as a plain bomb, and the detonation throws its
 * submunitions outward on a spray. They fly for `bombletFlight` ticks and then
 * go off where they land — which is why a cluster's real footprint is bigger
 * than the circle drawn under it, and why it is the one system whose danger
 * arrives in two waves.
 */
function detonateCluster(world, bomb) {
  const spec = bomb.spec;

  // Wave one: an ordinary blast, on exactly the terms a frag charge gets.
  blastAt(world, bomb.x, bomb.y, spec.blastRadius, spec.damage);
  bloom(world, bomb.x, bomb.y, spec.blastRadius);

  // Wave two: the firework. Evenly spread bearings with a little jitter, so a
  // dozen submunitions do not land in a recognisable pattern.
  const step = TAU / spec.bomblets;
  for (let i = 0; i < spec.bomblets; i++) {
    const angle = i * step + rand(-step * 0.35, step * 0.35);
    const reach = spec.scatterRange * rand(SCATTER_MIN, 1);
    const flight = Math.max(8, Math.round(spec.bombletFlight * rand(0.8, 1)));

    world.bomblets.push({
      x: bomb.x,
      y: bomb.y,
      vx: (Math.cos(angle) * reach) / flight,
      vy: (Math.sin(angle) * reach) / flight,
      life: flight,
      radius: spec.bombletRadius,
      damage: spec.damage,
    });
  }
}

/**
 * Submunitions in the air. They do nothing but travel and expire; everything
 * dangerous about them happens when they land, on the same indiscriminate
 * terms as the bomb that threw them.
 */
function updateBomblets(world) {
  for (let i = world.bomblets.length - 1; i >= 0; i--) {
    const b = world.bomblets[i];

    b.x += b.vx;
    b.y += b.vy;

    // A short smoke trail, so a spray in flight is visible rather than a
    // surprise arriving from the middle of the screen.
    if (world.time % 2 === 0) {
      world.particles.push({
        x: b.x, y: b.y, vx: rand(-0.2, 0.2), vy: rand(-0.4, -0.1),
        life: 16, maxLife: 16, color: "#8a94a6", size: 3,
      });
    }

    if (--b.life > 0) continue;

    blastAt(world, b.x, b.y, b.radius, b.damage);
    // One light bloom each: a dozen full ones would bury the frame.
    bloom(world, b.x, b.y, b.radius, { quiet: true });
    world.bomblets.splice(i, 1);
    world.bombletsLandedThisTick = true;
  }

  // One shake and one report for however many landed this tick, rather than a
  // dozen overlapping bangs. `boom` rather than `nuke`, because the flight
  // times are jittered: the spray crackles across several ticks, and a dozen
  // warhead reports in a row would be a mess where a dozen small ones read as
  // the firework it is.
  if (world.bombletsLandedThisTick) {
    addShake(world, 6);
    sfx.boom();
    world.bombletsLandedThisTick = false;
  }
}

/**
 * No blast damage at all: the detonation leaves the ground burning, and the
 * field does the killing over the next few seconds.
 */
function detonateField(world, bomb) {
  const { blastRadius, damage, fieldDuration } = bomb.spec;

  world.fields.push({
    x: bomb.x,
    y: bomb.y,
    radius: blastRadius,
    /** Burn rate per second handed to the same ignition the flame uses. */
    dps: damage,
    life: fieldDuration,
    maxLife: fieldDuration,
  });

  // It still announces itself, but as a fire rather than a shockwave: no
  // white-out, a softer shake, and the ring left behind as the field edge.
  addShake(world, 10);
  sfx.nuke();
  burst(world, bomb.x, bomb.y, 60, "#ffb03a", 10, 12, 90);
  burst(world, bomb.x, bomb.y, 40, "#ff5a28", 7, 15, 120);
  world.rings.push({ x: bomb.x, y: bomb.y, radius: 10, maxRadius: blastRadius, life: 1.4 });
}

/**
 * Burning ground. Anything inside is set alight every tick it stays there, so
 * the fire keeps being refreshed while you are in it and then follows you out
 * for `CANNON.burnDuration` — the same behaviour the flame and the beam have.
 */
function updateFields(world) {
  for (let i = world.fields.length - 1; i >= 0; i--) {
    const field = world.fields[i];

    if (--field.life <= 0) { world.fields.splice(i, 1); continue; }

    igniteAt(world, field.x, field.y, field.radius, {
      dps: field.dps, duration: CANNON.burnDuration,
    });

    // Embers, thinning out as the field burns down.
    if (world.time % 2 === 0) {
      const a = Math.random() * TAU;
      const r = field.radius * Math.sqrt(Math.random());
      world.particles.push({
        x: field.x + Math.cos(a) * r, y: field.y + Math.sin(a) * r,
        vx: rand(-0.3, 0.3), vy: rand(-1.1, -0.4),
        life: 36, maxLife: 36,
        color: Math.random() < 0.5 ? "#ff8a3a" : "#ffd166",
        size: 4 * (field.life / field.maxLife) + 2,
      });
    }
  }
}

/** Levels everything inside a radius, without taking sides. */
function blastAt(world, x, y, radius, damage) {
  // Enemies first, iterating backwards because damageEnemy removes entries.
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (Math.hypot(e.x - x, e.y - y) <= radius) {
      damageEnemy(world, e, damage, e.x, e.y);
    }
  }

  // Then the player, on exactly the same terms.
  const player = world.player;
  if (player.alive && Math.hypot(player.x - x, player.y - y) <= radius) {
    damagePlayer(world, damage);
  }
}

/** Sets everything inside a radius alight, on the same indiscriminate terms. */
function igniteAt(world, x, y, radius, burn) {
  for (const e of world.enemies) {
    if (Math.hypot(e.x - x, e.y - y) <= radius) ignite(world, e, burn);
  }

  const player = world.player;
  if (player.alive && Math.hypot(player.x - x, player.y - y) <= radius) {
    ignitePlayer(world, burn);
  }
}

/**
 * The detonation itself: flash, fireball, rings and a long shake, all scaled
 * to the blast so a frag charge does not look like a warhead.
 *
 * `quiet` leaves out the screen-level effects, for the dozen bomblets of a
 * cluster that share one shake and one report between them.
 */
function bloom(world, x, y, radius, { quiet = false } = {}) {
  // 1.0 at the HE bomb's radius; bigger bombs overshoot, frag undershoots.
  const scale = radius / 500;

  if (!quiet) {
    world.blastFlash = Math.min(1, 0.45 + scale * 0.55);
    addShake(world, Math.min(30, 12 + scale * 18));
    sfx.nuke();
  }

  const budget = quiet ? 0.35 : 1;
  const n = (base) => Math.round(base * Math.min(1.6, 0.45 + scale * 0.75) * budget);
  burst(world, x, y, n(90), "#fff6d8", 16, 11 * scale + 4, 70);
  burst(world, x, y, n(70), "#ffb03a", 12, 15 * scale + 4, 95);
  burst(world, x, y, n(55), "#ff5a28", 8, 19 * scale + 4, 120);
  burst(world, x, y, n(45), "#3a3a44", 5, 26 * scale + 5, 180);

  // Three staggered rings, the outermost matching the true blast radius so
  // the kill zone is legible after the fact. A bomblet gets the one ring.
  if (!quiet) {
    world.rings.push({ x, y, radius: 10, maxRadius: radius * 0.45, life: 1 });
    world.rings.push({ x, y, radius: 10, maxRadius: radius * 0.78, life: 1.3 });
  }
  world.rings.push({ x, y, radius: 10, maxRadius: radius, life: quiet ? 1.1 : 1.6 });

  // A ragged ring of debris thrown out along the blast edge.
  for (let i = 0; i < n(40); i++) {
    const a = Math.random() * TAU;
    const speed = rand(9, 15) * Math.min(1.8, 0.5 + scale);
    world.particles.push({
      x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: rand(60, 110), maxLife: 110, color: "#ffd9a0", size: rand(4, 9),
    });
  }
}

/**
 * True if the player should be told to move.
 *
 * For a timed bomb that means standing anywhere in the blast, because it is
 * going off regardless. For a contact mine it means being close enough to set
 * it off — sitting inside a mine's blast radius is only dangerous if somebody
 * touches it, and warning about every mine on the map would be noise. For
 * burning ground it means standing in it, which is already costing hull.
 */
function playerInBlastZone(world) {
  const p = world.player;
  if (!p.alive) return false;

  const inBomb = world.bombs.some((b) => {
    const distance = Math.hypot(p.x - b.x, p.y - b.y);
    return b.spec.trigger === "contact"
      ? b.arming <= 0 && distance <= b.spec.triggerRadius + PLAYER.radius
      : distance <= b.spec.blastRadius;
  });

  if (inBomb) return true;

  if (world.fields.some((f) => Math.hypot(p.x - f.x, p.y - f.y) <= f.radius)) {
    return true;
  }

  // A submunition about to land on you counts: there is nothing to see on the
  // ground yet, so the HUD warning is the only notice you get.
  return world.bomblets.some(
    (b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.radius);
}
