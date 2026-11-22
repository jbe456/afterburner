/**
 * Airframe silhouettes, drawn as vector paths rather than sprites so they stay
 * crisp at any DPR and can be recoloured per faction.
 *
 * Every hull is authored nose-first along +X, centred on its own origin, and
 * roughly within a 48-unit span so one scale factor means the same thing
 * across shapes. Callers rotate and scale them into place.
 *
 * The roster escalates visually as well as numerically: `jet` is an ordinary
 * fighter, `claw` reaches forward like a pincer, `wraith` is a bat-winged
 * delta, and `leviathan` is a segmented slab with a row of dorsal spines. The
 * bigger shapes also carry a lit eye, so a dangerous contact reads as
 * dangerous before you have parsed its size.
 */

import { TAU } from "../core/math.js";

/** Hex to rgba, for building exhaust gradients out of a hull's own colours. */
function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** An engine plume trailing backwards from a nozzle. */
function exhaust(ctx, ink, x, y, halfWidth) {
  if (ink.boost <= 0) return;
  const length = (13 + ink.boost * 24 + Math.sin(ink.time * 0.9) * 3) * ink.plumeScale;
  const plume = ctx.createLinearGradient(x, y, x - length, y);
  plume.addColorStop(0, tint(ink.flare, 0.95));
  plume.addColorStop(0.4, tint(ink.body, 0.5));
  plume.addColorStop(1, tint(ink.body, 0));
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.moveTo(x, y - halfWidth);
  ctx.lineTo(x - length, y);
  ctx.lineTo(x, y + halfWidth);
  ctx.closePath();
  ctx.fill();
}

/** Fill a polygon given as a flat list of x,y pairs, mirrored over X if asked. */
function poly(ctx, points, mirror = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1] * mirror);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1] * mirror);
  ctx.closePath();
  ctx.fill();
}

/** Draw a shape and its mirror image in one call. */
function pair(ctx, points) {
  poly(ctx, points, 1);
  poly(ctx, points, -1);
}

/** The glowing eye the heavier hulls carry. */
function eye(ctx, ink, x, radius) {
  const pulse = 0.62 + Math.sin(ink.time * 0.18) * 0.2;
  ctx.fillStyle = ink.flash ? "#fff" : tint(ink.flare, pulse);
  ctx.beginPath();
  ctx.ellipse(x, 0, radius * 1.5, radius, 0, 0, TAU);
  ctx.fill();
}

function canopy(ctx, ink, x, rx, ry) {
  ctx.fillStyle = ink.flash ? "#fff" : "rgba(150,220,255,.9)";
  ctx.beginPath();
  ctx.ellipse(x, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
}

// --- the hulls --------------------------------------------------------------

const HULLS = {
  /** The ordinary swept-wing fighter everything else is measured against. */
  jet(ctx, ink) {
    exhaust(ctx, ink, -18, 0, 4.5);
    ctx.fillStyle = ink.accent;
    pair(ctx, [4, 3, -9, 21, -15, 21, -9, 3]);
    pair(ctx, [-13, 2.5, -20, 10, -23, 10, -19, 2.5]);
    ctx.fillStyle = ink.main;
    poly(ctx, [23, 0, 9, -4.5, -14, -5, -18, -3.8, -18, 3.8, -14, 5, 9, 4.5]);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(-12, -1.6, 28, 1.6);
    canopy(ctx, ink, 7, 5.5, 3.2);
  },

  /** Barely an aircraft: a needle with two slivers for wings. */
  midge(ctx, ink) {
    exhaust(ctx, ink, -11, 0, 2.5);
    ctx.fillStyle = ink.accent;
    pair(ctx, [2, 2, -9, 14, -13, 14, -6, 2]);
    ctx.fillStyle = ink.main;
    poly(ctx, [15, 0, 5, -2.6, -10, -2.4, -11.5, 0, -10, 2.4, 5, 2.6]);
  },

  /** A needle: long, thin, canards at the nose. Built to close distance. */
  dart(ctx, ink) {
    exhaust(ctx, ink, -20, 0, 4);
    ctx.fillStyle = ink.accent;
    pair(ctx, [1, 3, -17, 20, -23, 20, -13, 3]);       // deep swept wings
    pair(ctx, [13, 2.4, 6, 11, 2, 11, 7, 2.4]);         // forward canards
    ctx.fillStyle = ink.main;
    poly(ctx, [30, 0, 13, -3.4, -16, -3.8, -20, -2.2, -20, 2.2, -16, 3.8, 13, 3.4]);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(-14, -1.2, 30, 1.2);
    canopy(ctx, ink, 11, 4.5, 2.6);
  },

  /** Twin-boom freighter-turned-warplane. Slow, square, hard to shift. */
  brick(ctx, ink) {
    exhaust(ctx, ink, -19, -16, 4);
    exhaust(ctx, ink, -19, 16, 4);
    ctx.fillStyle = ink.accent;
    ctx.fillRect(-12, -20, 7, 40);                      // wing spar
    pair(ctx, [8, 14, 13, 17, 8, 20, -19, 20, -19, 14]); // booms
    ctx.fillStyle = ink.main;
    poly(ctx, [20, 0, 9, -8, -16, -8, -19, -5, -19, 5, -16, 8, 9, 8]);
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.fillRect(-14, -2, 30, 2);
    canopy(ctx, ink, 9, 5, 3.4);
  },

  /** A weapons platform: straight wings hung with gun pods. */
  gunship(ctx, ink) {
    exhaust(ctx, ink, -21, -7, 4);
    exhaust(ctx, ink, -21, 7, 4);
    ctx.fillStyle = ink.accent;
    ctx.fillRect(-10, -26, 11, 52);                     // full-span wing
    pair(ctx, [6, 18, 10, 21, 6, 25, -14, 25, -14, 18]); // gun pods
    pair(ctx, [-16, 4, -26, 13, -30, 13, -22, 4]);      // tail feathers
    ctx.fillStyle = ink.main;
    poly(ctx, [22, 0, 11, -10, -17, -10, -21, -6, -21, 6, -17, 10, 11, 10]);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(-16, -2.4, 32, 2.4);
    eye(ctx, ink, 12, 3);
  },

  /** Forward-swept blades that reach past the nose like a pair of pincers. */
  claw(ctx, ink) {
    exhaust(ctx, ink, -20, -5, 4);
    exhaust(ctx, ink, -20, 5, 4);
    ctx.fillStyle = ink.accent;
    pair(ctx, [-9, 5, 20, 27, 13, 21, -1, 7]);          // the claws
    pair(ctx, [-13, 4, -26, 15, -30, 15, -20, 4]);      // rear stabilisers
    ctx.fillStyle = ink.main;
    poly(ctx, [26, 0, 10, -6, -16, -6.5, -20, -3.5, -20, 3.5, -16, 6.5, 10, 6]);
    ctx.fillStyle = tint(ink.accent, 0.35);
    poly(ctx, [12, 0, 2, -4, -14, -4, -14, 4, 2, 4]);   // dorsal ridge
    eye(ctx, ink, 13, 3.2);
  },

  /** A bat-winged delta with a scalloped trailing edge. Reads as a predator. */
  wraith(ctx, ink) {
    exhaust(ctx, ink, -22, -6, 5);
    exhaust(ctx, ink, -22, 6, 5);
    ctx.fillStyle = ink.accent;
    // One sweeping wing per side, notched twice along the back edge.
    pair(ctx, [26, 0, 8, 9, -10, 31, -17, 24, -8, 13, -20, 17, -22, 7, -26, 0]);
    ctx.fillStyle = ink.main;
    poly(ctx, [30, 0, 12, -7, -14, -8, -22, -5, -22, 5, -14, 8, 12, 7]);
    ctx.fillStyle = tint(ink.accent, 0.4);
    pair(ctx, [16, 0, 4, -5, -16, -5, -16, 0]);
    eye(ctx, ink, 15, 3.6);
  },

  /** A slab of a warship: three wing pairs, dorsal spines, four engines. */
  leviathan(ctx, ink) {
    for (const y of [-19, -7, 7, 19]) exhaust(ctx, ink, -30, y, 5);

    ctx.fillStyle = ink.accent;
    pair(ctx, [10, 9, -4, 34, -14, 34, -6, 9]);         // forward wings
    pair(ctx, [-6, 9, -20, 28, -28, 28, -20, 9]);       // mid wings
    pair(ctx, [-20, 8, -31, 19, -36, 19, -28, 8]);      // tail wings

    ctx.fillStyle = ink.main;
    poly(ctx, [38, 0, 20, -10, -22, -13, -30, -9, -30, 9, -22, 13, 20, 10]);

    // Dorsal spines, tallest amidships.
    ctx.fillStyle = tint(ink.accent, 0.75);
    for (const [x, h] of [[14, 5], [4, 8], [-6, 9], [-16, 7], [-25, 4]]) {
      pair(ctx, [x + 3, 0, x, -h - 9, x - 3, 0]);
    }

    ctx.fillStyle = "rgba(255,255,255,.10)";
    ctx.fillRect(-26, -3, 52, 3);
    eye(ctx, ink, 22, 4.4);
    eye(ctx, ink, 11, 2.6);
  },

  /**
   * Not an aircraft at all: a flat-topped ship, bow at +X, with a full-length
   * flight deck, an angled landing strip to port, an island to starboard and
   * SAM launchers fore and aft.
   *
   * Authored longer than anything else — roughly 96 units bow to stern against
   * the 48 the aircraft keep to — because the one thing it has to read as from
   * across the arena is *big*. It carries no exhaust: it is under way, not
   * under thrust.
   */
  carrier(ctx, ink) {
    // Hull: a long wedge, blunt at the stern.
    ctx.fillStyle = ink.main;
    poly(ctx, [48, 0, 36, -13, -40, -15, -46, -11, -46, 11, -40, 15, 36, 13]);

    // The flight deck, inset and a shade lighter than the hull.
    ctx.fillStyle = tint(ink.accent, 0.22);
    poly(ctx, [42, 0, 33, -11, -38, -12.5, -42, -9, -42, 9, -38, 12.5, 33, 11]);

    // Angled landing strip to port, running out over the quarter.
    ctx.fillStyle = tint(ink.accent, 0.3);
    poly(ctx, [26, -4, 34, -9, -40, -15.5, -40, -9.5]);

    // Deck markings: centreline for the catapult, bars across the landing run.
    ctx.fillStyle = "rgba(255,255,255,.34)";
    ctx.fillRect(4, -0.9, 36, 1.8);
    for (let i = 0; i < 5; i++) ctx.fillRect(-34 + i * 9, -12.5, 2, 4);

    // The island, starboard side, with its mast.
    ctx.fillStyle = ink.accent;
    ctx.fillRect(-10, 9, 15, 6.5);
    ctx.fillRect(-3, 11, 2.5, 5);

    // SAM launchers: a box fore and a box aft, lit like the heavy hulls' eyes.
    ctx.fillStyle = tint(ink.accent, 0.8);
    pair(ctx, [30, 6, 36, 6, 36, 10, 30, 10]);
    pair(ctx, [-34, 4, -28, 4, -28, 8, -34, 8]);
    eye(ctx, ink, 33, 2.4);
    eye(ctx, ink, -31, 2.4);
  },
};

export const HULL_NAMES = Object.keys(HULLS);

/**
 * @param {string} shape    key into the hull registry; unknown shapes fall back to `jet`
 * @param {number} boost    0..1 exhaust plume length
 * @param {number} time     world tick, for flame flicker and eye pulse
 */
export function drawHull(ctx, shape, x, y, angle, scale, body, accent, flash, boost, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  (HULLS[shape] ?? HULLS.jet)(ctx, {
    main: flash ? "#ffffff" : body,
    body,
    accent,
    flare: accent,
    flash,
    boost,
    time,
    plumeScale: 1,
  });

  ctx.restore();
}

/** Flat dark copy of a hull, offset to suggest altitude over the terrain. */
export function drawHullShadow(ctx, shape, x, y, angle, scale) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.translate(26, 34);
  drawHull(ctx, shape, x, y, angle, scale, "#000", "#000", false, 0, 0);
  ctx.restore();
}
