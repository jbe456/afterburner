/** Small geometry helpers shared by the whole simulation. */

export const TAU = Math.PI * 2;

export const rand = (a, b) => a + Math.random() * (b - a);

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Squared distance — avoids a sqrt in the collision hot path. */
export const dist2 = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Shortest signed angle from `b` to `a`, in (-PI, PI].
 * This is what lets a jet turn the *short* way round toward a heading.
 */
export const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
};

/** Steer `from` toward `to`, moving at most `rate` radians. */
export const steer = (from, to, rate) => from + clamp(angDiff(to, from), -rate, rate);
