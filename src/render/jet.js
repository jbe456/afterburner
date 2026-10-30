/**
 * The jet silhouette, drawn as vector paths rather than a sprite sheet so it
 * stays crisp at any DPR and can be recoloured per faction.
 *
 * The shape is authored nose-first along +X; callers rotate it into place.
 */

import { TAU } from "../core/math.js";

/**
 * @param {number} boost 0..1 exhaust flame length
 * @param {number} time  world tick, used only for flame flicker
 */
export function drawJet(ctx, x, y, angle, scale, bodyColor, accentColor, flash, boost, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  if (boost > 0) drawExhaust(ctx, boost, time);

  const body = flash ? "#ffffff" : bodyColor;

  // Swept main wings
  ctx.fillStyle = accentColor;
  wing(ctx, -1);
  wing(ctx, 1);
  // Tailplanes
  tailplane(ctx, -1);
  tailplane(ctx, 1);

  // Fuselage
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(23, 0);
  ctx.lineTo(9, -4.5);
  ctx.lineTo(-14, -5);
  ctx.lineTo(-18, -3.8);
  ctx.lineTo(-18, 3.8);
  ctx.lineTo(-14, 5);
  ctx.lineTo(9, 4.5);
  ctx.closePath();
  ctx.fill();

  // Spine highlight and canopy
  ctx.fillStyle = "rgba(255,255,255,.22)";
  ctx.fillRect(-12, -1.6, 28, 1.6);
  ctx.fillStyle = flash ? "#fff" : "rgba(150,220,255,.9)";
  ctx.beginPath();
  ctx.ellipse(7, 0, 5.5, 3.2, 0, 0, TAU);
  ctx.fill();

  ctx.restore();
}

/** Flat dark copy of the airframe, offset to suggest altitude over terrain. */
export function drawJetShadow(ctx, x, y, angle, scale) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.translate(26, 34);
  drawJet(ctx, x, y, angle, scale, "#000", "#000", false, 0, 0);
  ctx.restore();
}

function wing(ctx, side) {
  ctx.beginPath();
  ctx.moveTo(4, 3 * side);
  ctx.lineTo(-9, 21 * side);
  ctx.lineTo(-15, 21 * side);
  ctx.lineTo(-9, 3 * side);
  ctx.closePath();
  ctx.fill();
}

function tailplane(ctx, side) {
  ctx.beginPath();
  ctx.moveTo(-13, 2.5 * side);
  ctx.lineTo(-20, 10 * side);
  ctx.lineTo(-23, 10 * side);
  ctx.lineTo(-19, 2.5 * side);
  ctx.closePath();
  ctx.fill();
}

function drawExhaust(ctx, boost, time) {
  const length = 16 + boost * 26 + Math.sin(time * 0.9) * 4;
  const flame = ctx.createLinearGradient(-18, 0, -18 - length, 0);
  flame.addColorStop(0, "rgba(180,230,255,.95)");
  flame.addColorStop(0.4, "rgba(90,170,255,.55)");
  flame.addColorStop(1, "rgba(60,120,255,0)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-17, -4.5);
  ctx.lineTo(-18 - length, 0);
  ctx.lineTo(-17, 4.5);
  ctx.closePath();
  ctx.fill();
}
