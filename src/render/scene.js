/**
 * The world pass: everything drawn in world coordinates, behind the HUD.
 *
 * The camera sits on the jet with a slight lead toward the cursor, so you see
 * a little more of where you are looking. Its position is stored on the world
 * because the HUD needs it to line overlays up with world objects.
 */

import { rand, TAU } from "../core/math.js";
import { viewport } from "../core/viewport.js";
import { input } from "../core/input.js";
import { ARENA_HALF, ARENA_SIZE, ENEMY_TYPES, LOCK, BOMB } from "../config.js";
import { drawJet, drawJetShadow } from "./jet.js";

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
  drawBombs(ctx, world);
  drawPickups(ctx, world);
  drawTrails(ctx, world);
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

function drawPickups(ctx, world) {
  for (const p of world.pickups) {
    const bob = Math.sin(p.bob) * 4;
    const repair = p.kind === "repair";
    // Blink out over the last two seconds of life.
    ctx.globalAlpha = p.life < 120 && Math.floor(p.life / 6) % 2 ? 0.25 : 1;

    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.bob * 0.3);
    ctx.fillStyle = repair ? "rgba(93,219,160,.22)" : "rgba(255,209,102,.22)";
    ctx.strokeStyle = repair ? "#5ddba0" : "#ffd166";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-11, -11, 22, 22);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = repair ? "#5ddba0" : "#ffd166";
    ctx.font = "bold 15px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(repair ? "+" : "M", p.x, p.y + bob + 1);
    ctx.globalAlpha = 1;
  }
}

/**
 * Live bombs, drawn under everything else, each with the blast radius it will
 * clear. Showing the real radius is what makes the weapon fair: you can see
 * whether you are out of it rather than having to guess.
 */
function drawBombs(ctx, world) {
  for (const bomb of world.bombs) {
    const urgency = 1 - bomb.fuse / BOMB.fuse;
    const seconds = Math.ceil(bomb.fuse / 60);
    // Blink faster as the fuse runs down.
    const blinkRate = Math.max(4, Math.round(26 - urgency * 22));
    const lit = Math.floor(world.time / blinkRate) % 2 === 0;

    // Danger zone
    ctx.save();
    ctx.globalAlpha = 0.1 + urgency * 0.3;
    ctx.fillStyle = "#ff3b2f";
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, BOMB.blastRadius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.35 + urgency * 0.55;
    ctx.strokeStyle = lit ? "#ff6b5c" : "#ff3b2f";
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 16]);
    ctx.lineDashOffset = -world.time * 0.6;
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, BOMB.blastRadius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Casing
    ctx.save();
    ctx.translate(bomb.x, bomb.y);
    ctx.fillStyle = "#2b3542";
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#47556a";
    ctx.fillRect(-13, -2, 26, 4);
    ctx.fillStyle = lit ? "#ff5544" : "#5a2520";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Countdown, sat just above the casing
    ctx.font = "bold 20px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = urgency > 0.7 ? "#ff5544" : "#ffd166";
    ctx.fillText(String(seconds), bomb.x, bomb.y - 24);
    ctx.textBaseline = "alphabetic";
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

  for (const e of enemies) drawJetShadow(ctx, e.x, e.y, e.angle, ENEMY_TYPES[e.type].scale);
  if (player.alive) drawJetShadow(ctx, player.x, player.y, player.angle, player.stats.scale);

  for (const e of enemies) {
    const type = ENEMY_TYPES[e.type];
    drawJet(ctx, e.x, e.y, e.angle, type.scale, type.color, type.accent, e.flash > 0, 0.4, time);
    if (e.hp < e.maxHp) drawHealthPip(ctx, e);
  }

  if (player.alive) {
    // Blink while the spawn invulnerability lasts.
    const blink = player.invuln > 0 && Math.floor(time / 4) % 2 === 0;
    if (!blink) {
      const s = player.stats;
      drawJet(ctx, player.x, player.y, player.angle, s.scale,
        s.color, s.accent, false, 0.35 + player.boost * 0.65, time);
    }
  }
}

function drawHealthPip(ctx, e) {
  const w = 34, h = 3.5, y = e.y - e.radius - 16;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(e.x - w / 2, y, w, h);
  ctx.fillStyle = "#ff6b6b";
  ctx.fillRect(e.x - w / 2, y, w * (e.hp / e.maxHp), h);
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
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.fillStyle = "#e8edf2";
    ctx.fillRect(-9, -2, 18, 4);
    ctx.fillStyle = "#ff6b35";
    ctx.beginPath();
    ctx.moveTo(9, -2); ctx.lineTo(14, 0); ctx.lineTo(9, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#9fb0c0";
    ctx.fillRect(-9, -5, 4, 10);
    ctx.restore();
  }
}

function drawBullets(ctx, world) {
  ctx.lineCap = "round";
  for (const b of world.bullets) {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.friendly ? 3.2 : 2.6;
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
