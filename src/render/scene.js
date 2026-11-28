/**
 * The world pass: everything drawn in world coordinates, behind the HUD.
 *
 * The camera sits on the jet with a slight lead toward the cursor, so you see
 * a little more of where you are looking. Its position is stored on the world
 * because the HUD needs it to line overlays up with world objects.
 */

import { rand, clamp, TAU } from "../core/math.js";
import { viewport } from "../core/viewport.js";
import { input } from "../core/input.js";
import {
  ARENA_HALF, ARENA_SIZE, ENEMY_TYPES, LOCK, BOMB, PLAYER, LAVA,
} from "../config.js";
import { drawHull, drawHullShadow } from "./hulls.js";
import { PICKUP_COLOUR, PICKUP_GLYPH } from "../entities/pickups.js";

const GRID = 320;
/** How far the camera leans toward the cursor, as a fraction of the offset. */
const CAMERA_LEAD = 0.12;

export function drawScene(world) {
  const { ctx, w, h } = viewport;
  updateCamera(world);

  drawBackdrop(ctx, w, h, world);
  drawClouds(world, 0);

  ctx.save();
  // Shake is applied to the world transform only, so the HUD stays rock steady.
  const s = world.shake;
  ctx.translate(w / 2 - world.camX + rand(-s, s), h / 2 - world.camY + rand(-s, s));

  drawBoundary(ctx);
  // Terrain, so it goes under everything that flies — a wall drawn over your
  // own jet would hide the thing you are steering.
  drawLava(ctx, world);
  drawSamEnvelopes(ctx, world);
  drawBombs(ctx, world);
  drawPickups(ctx, world);
  drawTrails(ctx, world);
  drawFlames(ctx, world);
  drawAircraft(ctx, world);
  drawLockReticle(ctx, world);
  drawMissiles(ctx, world);
  drawBullets(ctx, world);
  drawParticles(ctx, world);
  drawShockwaves(ctx, world);

  ctx.restore();

  drawClouds(world, 1); // near layer passes over the top
}

function updateCamera(world) {
  const { mouse } = input;
  const leadX = mouse.active ? (mouse.x - viewport.w / 2) * CAMERA_LEAD : 0;
  const leadY = mouse.active ? (mouse.y - viewport.h / 2) * CAMERA_LEAD : 0;
  world.camX = world.player.x + leadX;
  world.camY = world.player.y + leadY;
}

function drawBackdrop(ctx, w, h, world) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#16222e");
  sky.addColorStop(1, "#0d141c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Ground grid, offset so it tiles seamlessly as the camera moves.
  ctx.strokeStyle = "rgba(90,150,200,.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const ox = -(((world.camX - w / 2) % GRID) + GRID) % GRID;
  const oy = -(((world.camY - h / 2) % GRID) + GRID) % GRID;
  for (let x = ox; x < w; x += GRID) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = oy; y < h; y += GRID) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}

function drawClouds(world, layer) {
  const { ctx, w, h } = viewport;
  const parallax = layer === 0 ? 0.45 : 1.15;

  for (const c of world.clouds) {
    if (c.layer !== layer) continue;
    const sx = w / 2 + (c.x - world.camX) * parallax;
    const sy = h / 2 + (c.y - world.camY) * parallax;
    if (sx < -200 || sx > w + 200 || sy < -200 || sy > h + 200) continue;

    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = layer === 0 ? "#8fb6d6" : "#cfe4f5";
    for (const b of c.blobs) {
      ctx.beginPath();
      ctx.ellipse(sx + b.x * parallax, sy + b.y * parallax,
        b.r * parallax, b.r * 0.62 * parallax, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawBoundary(ctx) {
  ctx.strokeStyle = "rgba(255,90,90,.35)";
  ctx.lineWidth = 6;
  ctx.setLineDash([40, 28]);
  ctx.strokeRect(-ARENA_HALF, -ARENA_HALF, ARENA_SIZE, ARENA_SIZE);
  ctx.setLineDash([]);
}

/** The square's fill, at the same wash as its outline. */
const PICKUP_FILL = {
  repair: "rgba(93,219,160,.22)",
  ammo: "rgba(255,209,102,.22)",
  shield: "rgba(78,168,255,.22)",
};

function drawPickups(ctx, world) {
  for (const p of world.pickups) {
    const bob = Math.sin(p.bob) * 4;
    // Blink out over the last two seconds of life.
    ctx.globalAlpha = p.life < 120 && Math.floor(p.life / 6) % 2 ? 0.25 : 1;

    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.bob * 0.3);
    ctx.fillStyle = PICKUP_FILL[p.kind];
    ctx.strokeStyle = PICKUP_COLOUR[p.kind];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-11, -11, 22, 22);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = PICKUP_COLOUR[p.kind];
    ctx.font = "bold 15px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(PICKUP_GLYPH[p.kind], p.x, p.y + bob + 1);
    ctx.globalAlpha = 1;
  }
}

/**
 * Live bombs, drawn under everything else, each with the blast radius it will
 * clear. Showing the real radius is what makes the weapon fair: you can see
 * whether you are out of it rather than having to guess.
 */
function drawBombs(ctx, world) {
  drawFields(ctx, world);
  drawBomblets(ctx, world);

  for (const bomb of world.bombs) {
    const contact = bomb.spec.trigger === "contact";
    const field = bomb.spec.trigger === "field";
    const cluster = bomb.spec.trigger === "cluster";
    // A fused bomb grows more urgent as it counts down; a mine just waits.
    const urgency = contact ? 0.3 : 1 - bomb.fuse / bomb.spec.fuse;
    // Blink faster as the fuse runs down.
    const blinkRate = Math.max(4, Math.round(26 - urgency * 22));
    const lit = Math.floor(world.time / blinkRate) % 2 === 0;
    const live = bomb.arming <= 0;

    // Danger zone. A mine may sit for a minute, so its wash is much lighter
    // than a fused bomb's — several of them overlapping should not drown the
    // sky in red.
    ctx.save();
    ctx.globalAlpha = contact ? 0.055 : 0.1 + urgency * 0.3;
    ctx.fillStyle = field ? "#ff8a3a" : "#ff3b2f";
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, bomb.spec.blastRadius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = contact ? 0.3 : 0.35 + urgency * 0.55;
    ctx.strokeStyle = field ? (lit ? "#ffb03a" : "#ff8a3a") : lit ? "#ff6b5c" : "#ff3b2f";
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 16]);
    ctx.lineDashOffset = -world.time * 0.6;
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, bomb.spec.blastRadius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // A cluster's solid circle is only the parent blast. The submunitions
    // reach much further, so the edge of what the drop can touch is drawn as
    // a faint outer ring — otherwise standing just outside the red circle
    // would look safe when it is not.
    if (cluster) {
      ctx.globalAlpha = 0.18 + urgency * 0.22;
      ctx.strokeStyle = "#ff8c42";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.spec.footprint, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    // Casing
    const size = bomb.spec.blastRadius >= 1000 ? 1.5 : bomb.spec.blastRadius <= 200 ? 0.7 : 1;
    ctx.save();
    ctx.translate(bomb.x, bomb.y);
    ctx.scale(size, size);
    ctx.fillStyle = "#2b3542";
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#47556a";
    ctx.fillRect(-13, -2, 26, 4);
    ctx.fillStyle = live && lit ? "#ff5544" : "#5a2520";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (contact) {
      // The ring you must not cross. Drawn solid and bright, because unlike
      // the blast circle this one is the thing that actually sets it off.
      ctx.save();
      ctx.globalAlpha = live ? 0.75 : 0.3;
      ctx.strokeStyle = live ? "#ff8c42" : "#6f8ba6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bomb.x, bomb.y, bomb.spec.triggerRadius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    } else {
      // Countdown, sat just above the casing
      ctx.font = "bold 20px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = urgency > 0.7 ? "#ff5544" : "#ffd166";
      ctx.fillText(String(Math.ceil(bomb.fuse / 60)), bomb.x, bomb.y - 24);
      ctx.textBaseline = "alphabetic";
    }
  }
}

/**
 * Submunitions thrown by a cluster, mid-flight. Each is drawn with the blast
 * it is about to make, faintly, so a spray coming at you can be read before it
 * lands rather than after.
 */
function drawBomblets(ctx, world) {
  for (const b of world.bomblets) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#ff3b2f";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ffd166";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Burning ground left by an incendiary. Drawn as fire rather than as a danger
 * circle, because it is already doing its damage — there is nothing to count
 * down to, only ground to be off.
 */
/**
 * The sprayer's ribbons, molten through cooling to rock.
 *
 * Each segment is drawn as a round-capped stroke along its own spine, which
 * is exactly the capsule the simulation collides against — so the wall you
 * can see and the wall you cannot fly through are the same shape, to within
 * the wobble. That matters more here than anywhere else in this renderer: the
 * entire promise of the weapon is that the line you flew is the wall you
 * built, and a drawing that flattered the geometry would be a lie the pilot
 * discovers by dying.
 *
 * Three passes rather than one, because a single stroke per segment reads as
 * a pipe: an outer crust, the body, and a brighter core that fades out as the
 * rock cools. Only what is on screen is touched — terrain never expires, so
 * by the late waves the pool is far larger than the view.
 */
function drawLava(ctx, world) {
  const segments = world.lava.segments;
  if (segments.length === 0) return;

  const halfW = viewport.w / 2 + 120;
  const halfH = viewport.h / 2 + 120;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const seg of segments) {
    if (Math.abs(seg.ax - world.camX) > halfW || Math.abs(seg.ay - world.camY) > halfH) {
      continue;
    }

    // 0 while molten, 1 once set. Drives colour and shimmer together, so the
    // transition is one continuous cooling rather than a state that pops.
    const cooled = clamp(
      (seg.age - LAVA.swellTicks) / (LAVA.hardenTicks - LAVA.swellTicks), 0, 1);
    // A slow crawl along the ribbon while it is still liquid, dying out as it
    // sets. Seeded per segment so the wobble sits still rather than racing.
    const live = 1 - cooled;
    const wobble = 1 + Math.sin(world.time * 0.11 + seg.seed) * 0.09 * live;
    const r = seg.r * wobble;

    ctx.beginPath();
    ctx.moveTo(seg.ax, seg.ay);
    ctx.lineTo(seg.bx, seg.by);

    // Crust: dark from the first tick, so even fresh lava has an edge rather
    // than glowing away into the ground.
    ctx.strokeStyle = mix("#7a3a1c", "#2b2b33", cooled);
    ctx.lineWidth = r * 2;
    ctx.globalAlpha = 1;
    ctx.stroke();

    ctx.strokeStyle = mix("#ff5a28", "#3c3a44", cooled);
    ctx.lineWidth = r * 1.55;
    ctx.stroke();

    if (live > 0.02) {
      ctx.globalAlpha = live;
      ctx.strokeStyle = mix("#ffd166", "#4a4452", cooled * 0.6);
      ctx.lineWidth = r * 0.75;
      ctx.stroke();
    }

    // Cracks, but only once there is rock to crack. One short stroke across
    // the ribbon per segment: at the density segments are laid, that reads as
    // a fractured surface without drawing a texture nobody asked for.
    if (cooled > 0.75) {
      ctx.globalAlpha = (cooled - 0.75) * 2.2;
      ctx.strokeStyle = "#6b4a3a";
      ctx.lineWidth = 1.4;
      const mx = (seg.ax + seg.bx) / 2;
      const my = (seg.ay + seg.by) / 2;
      const across = Math.atan2(seg.by - seg.ay, seg.bx - seg.ax) + Math.PI / 2 + seg.seed;
      ctx.beginPath();
      ctx.moveTo(mx - Math.cos(across) * r * 0.8, my - Math.sin(across) * r * 0.8);
      ctx.lineTo(mx + Math.cos(across) * r * 0.8, my + Math.sin(across) * r * 0.8);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** Blend two "#rrggbb" strings. Only this module needs it, so it lives here. */
function mix(from, to, t) {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (shift) => {
    const lo = (a >> shift) & 255;
    const hi = (b >> shift) & 255;
    return Math.round(lo + (hi - lo) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function drawFields(ctx, world) {
  for (const field of world.fields) {
    const t = field.life / field.maxLife;
    const flicker = 0.85 + 0.15 * Math.sin(world.time * 0.3 + field.x);

    ctx.save();
    ctx.globalAlpha = (0.1 + t * 0.22) * flicker;
    ctx.fillStyle = "#ff6b2a";
    ctx.beginPath();
    ctx.arc(field.x, field.y, field.radius, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = (0.35 + t * 0.4) * flicker;
    ctx.strokeStyle = "#ffb03a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(field.x, field.y, field.radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/** Condensation trails, fading from transparent at the tail to solid at the jet. */
function drawTrail(ctx, trail, rgb, width) {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length;
    ctx.strokeStyle = `rgba(${rgb},${(t * 0.4).toFixed(3)})`;
    ctx.lineWidth = width * t;
    ctx.beginPath();
    ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
}

function drawTrails(ctx, world) {
  for (const e of world.enemies) drawTrail(ctx, e.trail, "255,140,110", 4);
  if (world.player.alive) drawTrail(ctx, world.player.trail, "170,225,255", 5);
}

function drawAircraft(ctx, world) {
  const { player, enemies, time } = world;

  for (const e of enemies) {
    const type = ENEMY_TYPES[e.type];
    drawHullShadow(ctx, type.shape, e.x, e.y, e.angle, type.scale);
  }
  if (player.alive) drawHullShadow(ctx, "jet", player.x, player.y, player.angle, PLAYER.scale);

  for (const e of enemies) {
    const type = ENEMY_TYPES[e.type];
    // Three states can sit on one aircraft at once, so each gets its own
    // channel rather than competing for the same ring: freeze recolours the
    // hull, fire rings it close in and flickering, poison rings it further
    // out and steady. Any combination of the three stays readable.
    drawHull(ctx, type.shape, e.x, e.y, e.angle, type.scale,
      e.frozen > 0 ? FROZEN_HULL : type.color,
      e.frozen > 0 ? FROZEN_ACCENT : type.accent,
      e.flash > 0, 0.4, time);
    if (e.burn) drawBurning(ctx, e, time);
    if (e.poison > 0) drawPoisoned(ctx, e);
    if (e.frozen > 0) drawFrozen(ctx, e, time);
    if (e.hp < e.maxHp) drawHealthPip(ctx, e);
  }

  if (player.alive) {
    // Blink while the spawn invulnerability lasts — but not under a ring,
    // which is the same immunity said a different way. Strobing the aircraft
    // for eight seconds would bury the thing the ring is there to show.
    const blink = player.invuln > 0 && player.shield <= 0
      && Math.floor(time / 4) % 2 === 0;
    if (!blink) {
      drawHull(ctx, "jet", player.x, player.y, player.angle, PLAYER.scale,
        PLAYER.color, PLAYER.accent, false, 0.35 + player.boost * 0.65, time);
    }
    if (player.shield > 0) drawShield(ctx, player, time);
  }
}

/**
 * The ring, drawn as its own countdown: a faint full circle for where it
 * reaches, and a bright arc that unwinds clockwise from the nose as the
 * seconds go. You read how long you have left without looking away from the
 * aircraft, which at eight seconds in a crowded fight is the whole point.
 *
 * It deflects nothing — there is no barrier here, only immunity — so the
 * radius is chosen to sit clear of the hull and is not a collision figure.
 */
function drawShield(ctx, player, time) {
  const left = player.shield / Math.max(1, player.shieldSpan);
  const pulse = 1 + Math.sin(time * 0.18) * 0.02;
  const radius = SHIELD_RADIUS * pulse;

  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.fillStyle = "rgba(78,168,255,.07)";
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "rgba(78,168,255,.28)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // The arc that actually runs out. Starts at the top and closes clockwise.
  ctx.strokeStyle = "#4ea8ff";
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * left);
  ctx.stroke();

  ctx.restore();
}

/** How far out the ring is drawn. Cosmetic: nothing is tested against it. */
const SHIELD_RADIUS = 46;

/**
 * The flamethrower's cone. Drawn under the aircraft so the jet sits on top of
 * its own fire, with a soft radial falloff and a flickering edge rather than
 * a hard wedge.
 */
function drawFlames(ctx, world) {
  for (const emission of world.flames) {
    ctx.save();
    ctx.translate(emission.x, emission.y);
    ctx.rotate(emission.angle);
    ctx.globalCompositeOperation = "lighter";

    if (emission.kind === "beam") drawBeam(ctx, world, emission);
    else drawCone(ctx, world, emission);

    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }
}

/** Three nested cones, narrowing and brightening toward the nozzle. */
function drawCone(ctx, world, emission) {
  const flicker = 0.85 + Math.sin(world.time * 1.3) * 0.15;
  const reach = emission.range * flicker;

  const layers = [
    [emission.halfAngle, reach, "rgba(255,80,20,0.30)"],
    [emission.halfAngle * 0.68, reach * 0.86, "rgba(255,150,40,0.34)"],
    [emission.halfAngle * 0.34, reach * 0.62, "rgba(255,235,170,0.42)"],
  ];
  for (const [halfAngle, length, color] of layers) {
    const grad = ctx.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(0.55, color.replace(/[\d.]+\)$/, "0.18)"));
    grad.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, length, -halfAngle, halfAngle);
    ctx.closePath();
    ctx.fill();
  }
}

/** A hard white core inside a wide glow, held straight out from the nose. */
function drawBeam(ctx, world, emission) {
  const pulse = 0.88 + Math.sin(world.time * 0.9) * 0.12;
  // A beam stops at the wall it is cutting into, rather than being drawn
  // straight through it — the simulation already stops there, and a beam that
  // visibly crossed a wall would make the wall look like a decal.
  const length = emission.blockedAt
    ? Math.hypot(emission.blockedAt.x - emission.x, emission.blockedAt.y - emission.y)
    : emission.range;

  // Yours is violet, theirs is red — you should never have to work out whose
  // beam is crossing the screen.
  const layers = emission.friendly
    ? [
        [emission.halfWidth * 3.4, "rgba(120,60,255,0.22)"],
        [emission.halfWidth * 1.7, "rgba(190,110,255,0.42)"],
        [emission.halfWidth * 0.7, "rgba(245,230,255,0.95)"],
      ]
    : [
        [emission.halfWidth * 3.4, "rgba(255,40,40,0.20)"],
        [emission.halfWidth * 1.7, "rgba(255,90,80,0.40)"],
        [emission.halfWidth * 0.7, "rgba(255,225,215,0.92)"],
      ];

  for (const [width, color] of layers) {
    const grad = ctx.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(0.86, color);
    grad.addColorStop(1, emission.friendly ? "rgba(190,110,255,0)" : "rgba(255,90,80,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, -width * pulse, length, width * 2 * pulse);
  }

  // A brighter knot where it leaves the nose.
  ctx.fillStyle = emission.friendly ? "rgba(245,230,255,0.9)" : "rgba(255,225,215,0.9)";
  ctx.beginPath();
  ctx.ellipse(0, 0, emission.halfWidth * 1.6, emission.halfWidth * 2.2, 0, 0, TAU);
  ctx.fill();
}

/** A flickering halo on an aircraft that is on fire. */
function drawBurning(ctx, e, time) {
  const flicker = 0.55 + Math.sin(time * 0.6 + e.x) * 0.2;
  ctx.save();
  ctx.globalAlpha = flicker;
  ctx.strokeStyle = "#ff8a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius + 6, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** What a frozen hull is painted in, in place of its own colours. */
const FROZEN_HULL = "#2f6f9e";
const FROZEN_ACCENT = "#bfe6ff";

/**
 * The poison ring: steady where the fire's flickers, and further out so the
 * two never sit on top of each other. It reads how heavily marked something
 * is — one missile is faint, a full rack is solid — which is the only way to
 * tell from outside how long a target has left.
 */
function drawPoisoned(ctx, e) {
  // Saturates at five marks, by which point the target is dying fast enough
  // that a brighter ring would tell you nothing you cannot already see.
  const weight = Math.min(e.poison / 150, 1);
  ctx.save();
  ctx.globalAlpha = 0.35 + weight * 0.5;
  ctx.strokeStyle = "#46d97a";
  ctx.lineWidth = 1.5 + weight * 2;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.radius + 10, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/**
 * Frost on a stopped aircraft. The hull is already recoloured, so this is
 * only the spines that say it is held rather than merely painted blue —
 * and they are still, because everything about the aircraft is.
 */
function drawFrozen(ctx, e, time) {
  ctx.save();
  ctx.globalAlpha = 0.5 + Math.sin(time * 0.08) * 0.12;
  ctx.strokeStyle = "#bfe6ff";
  ctx.lineWidth = 1.5;
  const r = e.radius + 4;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r);
    ctx.lineTo(e.x + Math.cos(a) * (r + 5), e.y + Math.sin(a) * (r + 5));
    ctx.stroke();
  }
  ctx.restore();
}

function drawHealthPip(ctx, e) {
  if (e.carrier) return drawCarrierHealth(ctx, e);
  const w = Math.max(34, e.radius * 1.9), h = 3.5, y = e.y - e.radius - 16;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(e.x - w / 2, y, w, h);
  ctx.fillStyle = "#ff6b6b";
  ctx.fillRect(e.x - w / 2, y, w * (e.hp / e.maxHp), h);
}

/**
 * A hull that takes a sustained minute needs more than a pip. The bar is as
 * wide as the ship and carries the number, because a bar creeping a tenth of
 * a percent a second is indistinguishable from a bar that is not moving.
 */
function drawCarrierHealth(ctx, e) {
  const frac = Math.max(0, e.hp / e.maxHp);
  const w = e.radius * 2.2, h = 7, y = e.y - e.radius - 30;

  ctx.fillStyle = "rgba(0,0,0,.6)";
  ctx.fillRect(e.x - w / 2, y, w, h);
  ctx.fillStyle = frac > 0.5 ? "#ff8a5c" : frac > 0.25 ? "#ff6b6b" : "#ff4040";
  ctx.fillRect(e.x - w / 2, y, w * frac, h);
  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(e.x - w / 2, y, w, h);

  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    `${ENEMY_TYPES[e.type].name.toUpperCase()}  ${Math.max(0, Math.ceil(e.hp))}`,
    e.x, y - 7,
  );
  ctx.textAlign = "left";
}

/**
 * The SAM envelope, drawn on the ground the same way a bomb's blast radius is:
 * the circle means exactly what it looks like. Cross it and the battery opens
 * up, so "if you get too close" is something you can see rather than learn.
 */
function drawSamEnvelopes(ctx, world) {
  for (const e of world.enemies) {
    if (!e.carrier) continue;
    const spec = ENEMY_TYPES[e.type].sam;
    const inside = world.player.alive
      && Math.hypot(world.player.x - e.x, world.player.y - e.y) < spec.range;
    const pulse = inside ? 0.34 + Math.sin(world.time * 0.14) * 0.12 : 0.13;

    ctx.strokeStyle = `rgba(255,90,70,${pulse.toFixed(3)})`;
    ctx.lineWidth = inside ? 3 : 2;
    ctx.setLineDash([16, 14]);
    ctx.beginPath();
    ctx.arc(e.x, e.y, spec.range, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Corner brackets that converge and turn red as the lock goes solid. */
function drawLockReticle(ctx, world) {
  const { player, time } = world;
  if (!player.alive || !player.lock) return;

  const solid = player.lockTime >= LOCK.ticksToSolid;
  const size = solid ? 26 : 26 + (40 - player.lockTime);

  ctx.strokeStyle = solid ? "#ff4d4d" : "rgba(255,210,100,.7)";
  ctx.lineWidth = 2;
  ctx.save();
  ctx.translate(player.lock.x, player.lock.y);
  if (!solid) ctx.rotate(time * 0.05);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(size, size - 9);
    ctx.lineTo(size, size);
    ctx.lineTo(size - 9, size);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMissiles(ctx, world) {
  for (const m of world.missiles) {
    // The head is the warhead's colour and glows in it, so what is in the air
    // is identifiable before it arrives. Enemy missiles declare no effect and
    // keep the orange head they have always had.
    const head = m.spec.colour ?? "#ff6b35";
    const glows = m.spec.effect && m.spec.effect !== "blast";

    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.fillStyle = "#e8edf2";
    ctx.fillRect(-9, -2, 18, 4);
    if (glows) {
      ctx.shadowColor = head;
      ctx.shadowBlur = 12;
    }
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.moveTo(9, -2); ctx.lineTo(14, 0); ctx.lineTo(9, 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#9fb0c0";
    ctx.fillRect(-9, -5, 4, 10);
    ctx.restore();
  }
}

function drawBullets(ctx, world) {
  ctx.lineCap = "round";
  for (const b of world.bullets) {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width;
    ctx.globalAlpha = Math.min(1, b.life / 12); // fade as the round expires
    ctx.beginPath();
    ctx.moveTo(b.prevX, b.prevY);
    ctx.lineTo(b.x + b.vx * 0.9, b.y + b.vy * 0.9);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = "butt";
}

function drawParticles(ctx, world) {
  for (const p of world.particles) {
    const t = p.life / p.maxLife;
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    const s = p.size * (0.4 + t * 0.6);
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

function drawShockwaves(ctx, world) {
  for (const r of world.rings) {
    ctx.globalAlpha = Math.max(0, r.life) * 0.5;
    ctx.strokeStyle = "#ffd9a0";
    ctx.lineWidth = 3 * r.life;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
