/**
 * The HUD: instruments drawn in screen space, over the world pass.
 *
 * Overlays that point at world objects (the gun pipper, threat arrows) are
 * positioned through the camera stored on the world, so they stay glued to
 * what they refer to even as the camera leads toward the cursor.
 */

import { TAU } from "../core/math.js";
import { viewport } from "../core/viewport.js";
import {
  ENEMY_TYPES, ARENA_WARN_EDGE, ARENA_DAMAGE_EDGE, LOCK,
} from "../config.js";

const MONO = "ui-monospace, monospace";
const RADAR_RADIUS = 78;
/** World distance covered by the radar's outer ring. */
const RADAR_RANGE = 2600;
/** How far ahead of the nose the gun pipper floats. */
const PIPPER_DISTANCE = 95;

export function drawHud(world) {
  const { ctx } = viewport;
  ctx.textBaseline = "alphabetic";

  drawDamageVignette(ctx, world);
  drawInstruments(ctx, world);
  drawScoreline(ctx, world);

  // Screen-space origin of the world, used by anything that tracks an object.
  const originX = viewport.w / 2 - world.camX;
  const originY = viewport.h / 2 - world.camY;

  drawPipper(ctx, world, originX, originY);
  drawThreatArrows(ctx, world, originX, originY);
  drawRadar(ctx, world);
  drawBanner(ctx, world);
  drawWarnings(ctx, world);
}

function drawDamageVignette(ctx, world) {
  if (world.hitFlash <= 0) return;
  const { w, h } = viewport;
  const g = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.3,
    w / 2, h / 2, Math.max(w, h) * 0.7,
  );
  g.addColorStop(0, "rgba(255,0,0,0)");
  g.addColorStop(1, `rgba(255,30,30,${(world.hitFlash * 0.55).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Hull, throttle and missile rack, stacked top-left. */
function drawInstruments(ctx, world) {
  const p = world.player;
  const s = p.stats;
  ctx.textAlign = "left";
  ctx.font = `11px ${MONO}`;

  // Hull — labelled with the airframe so you can see what you picked.
  ctx.fillStyle = "#6f8ba6";
  ctx.fillText(s.name, 22, 32);
  const barW = 230, barH = 13;
  const hpFrac = Math.max(0, p.hp / s.maxHp);
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(22, 40, barW, barH);
  ctx.fillStyle = hpFrac > 0.5 ? "#4fd48a" : hpFrac > 0.25 ? "#ffd166" : "#ff5c5c";
  ctx.fillRect(22, 40, barW * hpFrac, barH);
  ctx.strokeStyle = "rgba(190,215,235,.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(22.5, 40.5, barW, barH);
  ctx.fillStyle = "#dfe9f3";
  ctx.font = `bold 10px ${MONO}`;
  ctx.fillText(`${Math.max(0, Math.ceil(p.hp))}%`, 22 + barW + 10, 51);

  // Throttle
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = "#6f8ba6";
  ctx.fillText("THR", 22, 76);
  const thrFrac = (p.speed - s.minSpeed) / (s.maxSpeed - s.minSpeed);
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(52, 67, 160, 8);
  ctx.fillStyle = p.boost > 0.4 ? "#8fd3ff" : "#4a89c0";
  ctx.fillRect(52, 67, 160 * Math.max(0, Math.min(1, thrFrac)), 8);

  // Missile rack
  ctx.fillStyle = "#6f8ba6";
  ctx.fillText("MSL", 22, 100);
  for (let i = 0; i < s.maxMissiles; i++) {
    ctx.fillStyle = i < p.missiles ? "#ffd166" : "rgba(255,209,102,.16)";
    ctx.fillRect(52 + i * 15, 91, 9, 9);
  }
}

function drawScoreline(ctx, world) {
  ctx.textAlign = "right";
  ctx.font = `bold 30px ${MONO}`;
  ctx.fillStyle = "#f4f8fc";
  ctx.fillText(String(world.score).padStart(6, "0"), viewport.w - 22, 46);

  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = "#6f8ba6";
  ctx.fillText(
    `WAVE ${world.wave}   ·   BOGEYS ${world.enemies.length}   ·   KILLS ${world.kills}`,
    viewport.w - 22, 66,
  );
}

/** Gun pipper, projected along the gun line so it is not hidden by the jet. */
function drawPipper(ctx, world, originX, originY) {
  const p = world.player;
  if (!p.alive) return;

  const x = originX + p.x + Math.cos(p.angle) * PIPPER_DISTANCE;
  const y = originY + p.y + Math.sin(p.angle) * PIPPER_DISTANCE;
  const solid = p.lock && p.lockTime >= LOCK.ticksToSolid;

  ctx.strokeStyle = solid ? "rgba(255,80,80,.9)" : "rgba(160,220,255,.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, TAU);
  ctx.moveTo(x - 16, y); ctx.lineTo(x - 9, y);
  ctx.moveTo(x + 9, y); ctx.lineTo(x + 16, y);
  ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 9);
  ctx.moveTo(x, y + 9); ctx.lineTo(x, y + 16);
  ctx.stroke();
}

/** Arrows around the screen edge pointing at enemies you cannot see. */
function drawThreatArrows(ctx, world, originX, originY) {
  const { w, h } = viewport;
  const radius = Math.min(w, h) * 0.42;

  for (const e of world.enemies) {
    const sx = originX + e.x;
    const sy = originY + e.y;
    if (sx > 40 && sx < w - 40 && sy > 40 && sy < h - 40) continue;

    const bearing = Math.atan2(e.y - world.player.y, e.x - world.player.x);
    ctx.save();
    ctx.translate(w / 2 + Math.cos(bearing) * radius, h / 2 + Math.sin(bearing) * radius);
    ctx.rotate(bearing);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = ENEMY_TYPES[e.type].color;
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawRadar(ctx, world) {
  const cx = viewport.w - RADAR_RADIUS - 28;
  const cy = viewport.h - RADAR_RADIUS - 28;

  ctx.fillStyle = "rgba(8,16,24,.72)";
  ctx.beginPath();
  ctx.arc(cx, cy, RADAR_RADIUS, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "rgba(120,190,240,.3)";
  ctx.lineWidth = 1;
  for (const r of [1, 0.6, 0.3]) {
    ctx.beginPath();
    ctx.arc(cx, cy, RADAR_RADIUS * r, 0, TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - RADAR_RADIUS, cy); ctx.lineTo(cx + RADAR_RADIUS, cy);
  ctx.moveTo(cx, cy - RADAR_RADIUS); ctx.lineTo(cx, cy + RADAR_RADIUS);
  ctx.stroke();

  // Sweep line
  const sweep = (world.time * 0.025) % TAU;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, RADAR_RADIUS, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = "rgba(120,255,180,.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweep) * RADAR_RADIUS, cy + Math.sin(sweep) * RADAR_RADIUS);
  ctx.stroke();
  ctx.restore();

  // Contacts. Anything beyond radar range is pinned to the rim and dimmed.
  for (const e of world.enemies) {
    let dx = ((e.x - world.player.x) / RADAR_RANGE) * RADAR_RADIUS;
    let dy = ((e.y - world.player.y) / RADAR_RANGE) * RADAR_RADIUS;
    const m = Math.hypot(dx, dy);
    const offScope = m > RADAR_RADIUS - 3;
    if (offScope) {
      dx = (dx / m) * (RADAR_RADIUS - 3);
      dy = (dy / m) * (RADAR_RADIUS - 3);
    }
    ctx.fillStyle = offScope ? "rgba(255,110,110,.5)" : ENEMY_TYPES[e.type].color;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, e.type === "heavy" ? 4 : 3, 0, TAU);
    ctx.fill();
  }

  for (const p of world.pickups) {
    const dx = ((p.x - world.player.x) / RADAR_RANGE) * RADAR_RADIUS;
    const dy = ((p.y - world.player.y) / RADAR_RANGE) * RADAR_RADIUS;
    if (Math.hypot(dx, dy) > RADAR_RADIUS - 3) continue;
    ctx.fillStyle = p.kind === "repair" ? "#5ddba0" : "#ffd166";
    ctx.fillRect(cx + dx - 2, cy + dy - 2, 4, 4);
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(world.player.angle);
  ctx.fillStyle = "#8fd3ff";
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBanner(ctx, world) {
  if (world.banner.time <= 0) return;
  ctx.globalAlpha = Math.min(1, world.banner.time / 40);
  ctx.textAlign = "center";
  ctx.font = `bold 34px ${MONO}`;
  ctx.fillStyle = "#f4f8fc";
  ctx.shadowColor = "rgba(90,190,255,.8)";
  ctx.shadowBlur = 22;
  ctx.fillText(world.banner.text, viewport.w / 2, viewport.h * 0.26);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawWarnings(ctx, world) {
  const p = world.player;
  if (!p.alive) return;

  const warnings = [];
  if (p.hp < 30) warnings.push("HULL CRITICAL");

  const beyondWarn = Math.abs(p.x) > ARENA_WARN_EDGE || Math.abs(p.y) > ARENA_WARN_EDGE;
  if (beyondWarn) {
    const bleeding = Math.abs(p.x) > ARENA_DAMAGE_EDGE || Math.abs(p.y) > ARENA_DAMAGE_EDGE;
    warnings.push(bleeding ? "TURN BACK — TAKING DAMAGE" : "APPROACHING ZONE EDGE");
  }

  if (!warnings.length || Math.floor(world.time / 18) % 2 !== 0) return;
  ctx.textAlign = "center";
  ctx.font = `bold 15px ${MONO}`;
  ctx.fillStyle = "#ff5c5c";
  ctx.fillText(`⚠ ${warnings.join("   ⚠ ")}`, viewport.w / 2, viewport.h - 42);
}

export function drawPauseOverlay() {
  const { ctx, w, h } = viewport;
  ctx.fillStyle = "rgba(5,10,16,.7)";
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.font = `bold 40px ${MONO}`;
  ctx.fillStyle = "#f4f8fc";
  ctx.fillText("PAUSED", w / 2, h / 2);
  ctx.font = `12px ${MONO}`;
  ctx.fillStyle = "#6f8ba6";
  ctx.fillText("PRESS P TO RESUME", w / 2, h / 2 + 30);
}
