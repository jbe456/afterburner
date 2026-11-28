/**
 * Lava: the only terrain this game has ever had.
 *
 * Everything else in the world is an aircraft, a projectile or a cosmetic.
 * A lava ribbon is none of those — it is a thing that occupies space, and it
 * occupies space in two different ways depending on how old it is:
 *
 *   molten  (age < hardenTicks)  sets alight whatever touches it, exactly as
 *                                a flame or an incendiary field does, and
 *                                blocks nothing at all
 *   cooled  (age >= hardenTicks) burns nobody, stops everything that flies,
 *                                absorbs what is shot at it, and stays until
 *                                something destroys it
 *
 * The inversion is the mechanic: for three seconds you have made something
 * that cannot be answered, and after that you have made something that can
 * be answered but will not leave on its own.
 *
 * A ribbon is stored as a chain of capsules — a spine segment plus a radius —
 * one per tick of held trigger, running from where the tail was last tick to
 * where it is now. One per tick rather than one per fixed distance is what
 * keeps the chain contiguous at any airspeed without the count exploding at
 * the burner, and point-versus-segment is the cheapest test that still lets a
 * wall be a wall rather than a row of beads.
 *
 * Nothing here takes sides. Molten ribbon burns the pilot who laid it on the
 * same terms as anyone else, and cooled ribbon stops them just as dead.
 *
 * ## Why there is a grid in here and nowhere else
 *
 * Every other pool in this game is small enough to scan: a few dozen enemies,
 * a hundred bullets. Lava is unbounded by design — it never expires — so a
 * long run accumulates thousands of segments, and the per-tick questions
 * ("what is this jet touching?", "did that round hit rock?") are asked by
 * every aircraft and every projectile. A uniform grid over the arena turns
 * each of those from a scan of the whole world into a look at four cells.
 */

import { rand, clamp, TAU } from "../core/math.js";
import { LAVA, ARENA_HALF, PLAYER } from "../config.js";

/** Cells per axis, with the origin in the middle. */
const GRID_SPAN = Math.ceil((ARENA_HALF * 2.2) / LAVA.cellSize);
const GRID_ORIGIN = Math.ceil(GRID_SPAN / 2);

const cellIndex = (v) => Math.floor(v / LAVA.cellSize) + GRID_ORIGIN;
const cellKey = (cx, cy) => cx * (GRID_SPAN * 2) + cy;

/** Fresh, empty terrain. Called once per run, from createWorld. */
export function createLavaField() {
  return { segments: [], grid: new Map(), dead: 0 };
}

/**
 * Put one ribbon segment into the world and index it.
 *
 * The AABB is computed at the segment's *full* width rather than its current
 * one, so swelling never invalidates the index and a segment is inserted
 * exactly once in its life.
 */
export function addLavaSegment(world, seg) {
  const field = world.lava;
  seg.cells = [];

  const pad = seg.full;
  const x0 = cellIndex(Math.min(seg.ax, seg.bx) - pad);
  const x1 = cellIndex(Math.max(seg.ax, seg.bx) + pad);
  const y0 = cellIndex(Math.min(seg.ay, seg.by) - pad);
  const y1 = cellIndex(Math.max(seg.ay, seg.by) + pad);

  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const key = cellKey(cx, cy);
      let bucket = field.grid.get(key);
      if (!bucket) field.grid.set(key, (bucket = []));
      bucket.push(seg);
      seg.cells.push(key);
    }
  }

  field.segments.push(seg);
}

/** Take a destroyed segment back out of every cell it was filed under. */
function unindex(world, seg) {
  for (const key of seg.cells) {
    const bucket = world.lava.grid.get(key);
    if (!bucket) continue;
    const at = bucket.indexOf(seg);
    if (at >= 0) bucket.splice(at, 1);
    if (bucket.length === 0) world.lava.grid.delete(key);
  }
}

/**
 * Counts sweeps, not ticks.
 *
 * A segment wide enough to span several cells is filed under each of them, so
 * one sweep would otherwise visit it once per cell — and a visitor that deals
 * damage would charge it twice. Stamping with the tick instead would be worse
 * than useless: a dozen separate sweeps run within one tick (every aircraft,
 * every round), and all but the first would find everything already stamped.
 */
let sweep = 0;

/**
 * Visit every segment that could possibly reach within `pad` of a point,
 * exactly once each.
 *
 * Deliberately a callback rather than a returned array: this runs for every
 * aircraft and every round in the air, and allocating a list per call would
 * cost more than the test it exists to avoid.
 */
function nearby(world, x, y, pad, visit) {
  const grid = world.lava.grid;
  if (grid.size === 0) return;
  sweep++;

  const x0 = cellIndex(x - pad);
  const x1 = cellIndex(x + pad);
  const y0 = cellIndex(y - pad);
  const y1 = cellIndex(y + pad);

  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const bucket = grid.get(cellKey(cx, cy));
      if (!bucket) continue;
      // Backwards: a visitor may destroy what it is looking at.
      for (let i = bucket.length - 1; i >= 0; i--) {
        const seg = bucket[i];
        if (seg.mark === sweep || seg.destroyed) continue;
        seg.mark = sweep;
        visit(seg);
      }
    }
  }
}

/** Closest point on a capsule's spine to (px, py), and the distance to it. */
function spineClosest(seg, px, py) {
  const dx = seg.bx - seg.ax;
  const dy = seg.by - seg.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0
    ? clamp(((px - seg.ax) * dx + (py - seg.ay) * dy) / len2, 0, 1)
    : 0;
  const qx = seg.ax + dx * t;
  const qy = seg.ay + dy * t;
  return { qx, qy, d: Math.hypot(px - qx, py - qy) };
}

/** How deep a circle of `radius` at (x, y) is inside this segment; <= 0 is clear. */
const overlap = (seg, x, y, radius) =>
  seg.r + radius - spineClosest(seg, x, y).d;

// --- the tick ---------------------------------------------------------------

/**
 * Swell and cool. Setting things alight is not done here.
 *
 * Who catches fire is asked from the aircraft's side — `hottestLavaTouching`
 * below — for two reasons. There are a handful of aircraft and there may be
 * thousands of segments, so that is the cheap direction to ask in; and it
 * keeps this module free of any import from `enemy.js` or `player.js`, which
 * both need to ask *it* about collisions. Each side lighting its own fire is
 * the rule those two files already follow for the flame and the beam.
 */
export function updateLava(world) {
  const field = world.lava;

  for (const seg of field.segments) {
    seg.age++;

    if (!seg.solid) {
      // Swell: an arming delay drawn rather than counted. A newborn ribbon is
      // too narrow to reach the tail that laid it; by the time it is full
      // width the jet has flown on.
      seg.r = seg.age >= LAVA.swellTicks
        ? seg.full
        : LAVA.birthRadius + (seg.full - LAVA.birthRadius) * (seg.age / LAVA.swellTicks);

      if (seg.age >= LAVA.hardenTicks) {
        seg.solid = true;
        seg.r = seg.full;
      }
    }
  }

  embers(world);

  if (field.dead > 0) {
    field.segments = field.segments.filter((s) => !s.destroyed);
    field.dead = 0;
  }
}

/**
 * The burn rate of the fiercest molten ribbon a body is touching, or 0.
 *
 * The fiercest rather than the first: two overlapping ribbons laid at
 * different rungs are one fire, and both `ignite` and `ignitePlayer` already
 * resolve which of two fires wins. Takes no side and knows about neither —
 * whoever asks gets the same answer, which is what keeps the weapon honest.
 */
export function hottestLavaTouching(world, x, y, radius) {
  let dps = 0;
  nearby(world, x, y, radius + LAVA.maxReach, (seg) => {
    if (seg.solid || seg.dps <= dps) return;
    if (overlap(seg, x, y, radius) > 0) dps = seg.dps;
  });
  return dps;
}

/** A thin scatter of embers off whatever is still molten, and nothing else. */
function embers(world) {
  const segments = world.lava.segments;
  if (segments.length === 0 || world.time % 2 !== 0) return;

  // A fixed sample rather than a pass over the pool: the number of embers in
  // the air should not grow with how much terrain the arena has accumulated.
  for (let i = 0; i < 3; i++) {
    const seg = segments[(Math.random() * segments.length) | 0];
    if (seg.solid || seg.destroyed) continue;
    const t = Math.random();
    world.particles.push({
      x: seg.ax + (seg.bx - seg.ax) * t + rand(-seg.r, seg.r),
      y: seg.ay + (seg.by - seg.ay) * t + rand(-seg.r, seg.r),
      vx: rand(-0.3, 0.3), vy: rand(-1.1, -0.4),
      life: 30, maxLife: 30,
      color: Math.random() < 0.5 ? "#ff8a3a" : "#ffd166",
      size: rand(2, 5),
    });
  }
}

// --- being stopped by it ----------------------------------------------------

/**
 * Push a body out of any cooled rock it has ended the tick inside, and report
 * whether this is the tick it arrived.
 *
 * Position only: speed and heading are left alone, so a jet that hits a wall
 * scrapes along it under its own power rather than being bounced somewhere it
 * did not choose. The flight model owns the heading; this owns the position.
 *
 * `body.rockGrind` counts how long it has been in contact, which is what
 * tells an enemy it is wedged and should start shooting.
 */
export function resolveRockContact(world, body, radius) {
  let touching = false;

  // Twice: freeing a body from one segment can push it into its neighbour,
  // and a chain is almost always two deep at a crossing angle.
  for (let pass = 0; pass < 2; pass++) {
    let moved = false;
    nearby(world, body.x, body.y, radius + LAVA.maxReach + 6, (seg) => {
      if (!seg.solid) return;
      const { qx, qy, d } = spineClosest(seg, body.x, body.y);
      const depth = seg.r + radius - d;
      if (depth <= 0) return;

      touching = true;
      moved = true;
      // Straight out along the contact normal. A body exactly on the spine
      // has no normal to use, so it leaves along its own heading instead.
      const nx = d > 0.001 ? (body.x - qx) / d : Math.cos(body.angle ?? 0);
      const ny = d > 0.001 ? (body.y - qy) / d : Math.sin(body.angle ?? 0);
      body.x += nx * depth;
      body.y += ny * depth;
    });
    if (!moved) break;
  }

  const arrived = touching && !(body.rockGrind > 0);
  body.rockGrind = touching ? (body.rockGrind ?? 0) + 1 : 0;
  return arrived;
}

/** True if a body is currently wedged rather than merely brushing past. */
export const isWedged = (body) => (body.rockGrind ?? 0) >= LAVA.grindBeforeShooting;

// --- destroying it ----------------------------------------------------------

/**
 * Kill a segment and unfile it. Rock vanishing is the only way terrain ever
 * leaves this world, so it happens in exactly one place.
 */
function destroy(world, seg) {
  seg.destroyed = true;
  world.lava.dead++;
  unindex(world, seg);

  for (let i = 0; i < 4; i++) {
    world.particles.push({
      x: seg.ax + rand(-seg.r, seg.r), y: seg.ay + rand(-seg.r, seg.r),
      vx: rand(-2.2, 2.2), vy: rand(-2.6, -0.4),
      life: rand(20, 40), maxLife: 40, color: "#6b5a52", size: rand(3, 6),
    });
  }
}

/**
 * A round arriving at a point: spend `amount` on the rock it struck, nearest
 * first, carrying any overkill into whatever is immediately behind it.
 *
 * Nearest-first-with-carry rather than damaging everything in reach, because
 * segments overlap heavily — a slow, fat ribbon stacks a dozen of them within
 * a few metres, and hitting all of them with the full figure would make a
 * thick wall *easier* to breach than a thin one. Spending the damage along
 * the wall instead means what it costs to open a hole is the wall's HP across
 * that hole, which is the thing the ROCK HP ladder claims to sell.
 *
 * @returns true if the round found rock and should be spent.
 */
export function damageRockPoint(world, x, y, reach, amount) {
  const hits = [];
  nearby(world, x, y, reach + LAVA.maxReach, (seg) => {
    if (!seg.solid) return;
    const { d } = spineClosest(seg, x, y);
    if (d <= seg.r + reach) hits.push({ seg, d });
  });
  if (hits.length === 0) return false;

  hits.sort((a, b) => a.d - b.d);
  let left = amount;
  for (const { seg } of hits) {
    if (left <= 0) break;
    const spent = Math.min(left, seg.hp);
    seg.hp -= spent;
    left -= spent;
    if (seg.hp <= 0) destroy(world, seg);
  }
  return true;
}

/**
 * A blast washing over rock: every segment inside the radius takes the figure.
 *
 * The opposite rule to `damageRockPoint`, and deliberately so — a blast is an
 * area, not an impact, and clearing your own walls with a bomb is meant to be
 * the fast way to do it.
 */
export function damageRockArea(world, x, y, radius, amount) {
  nearby(world, x, y, radius + LAVA.maxReach, (seg) => {
    if (!seg.solid) return;
    if (spineClosest(seg, x, y).d > radius + seg.r) return;
    seg.hp -= amount;
    if (seg.hp <= 0) destroy(world, seg);
  });
}

// --- asking it questions ----------------------------------------------------

/** True if any cooled rock covers this point. */
export function rockAt(world, x, y) {
  let found = false;
  nearby(world, x, y, LAVA.maxReach + 4, (seg) => {
    if (!found && seg.solid && overlap(seg, x, y, 0) > 0) found = true;
  });
  return found;
}

/** True if the player is standing in something still molten. */
export function playerInLava(world) {
  const p = world.player;
  if (!p.alive) return false;
  return hottestLavaTouching(world, p.x, p.y, PLAYER.radius) > 0;
}

/**
 * Whether cooled rock stands between two points.
 *
 * Marched rather than solved: a wall is many overlapping capsules and the
 * exact first intersection is worth nothing to any caller — every one of them
 * only wants to know whether the line is clear. The step is well under the
 * narrowest ribbon, so nothing thin enough to shoot through is missed.
 */
export function rockBlocksLine(world, x1, y1, x2, y2) {
  // Every nose weapon asks this of every target it can see, every tick, and a
  // beam's reach is 2400 m — so the march below is hundreds of lookups. Until
  // somebody has actually laid terrain there is nothing to look for.
  if (world.lava.grid.size === 0) return false;

  const span = Math.hypot(x2 - x1, y2 - y1);
  if (span < 1) return false;

  const steps = Math.min(220, Math.ceil(span / 9));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (rockAt(world, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return true;
  }
  return false;
}

/**
 * The first cooled rock on a heading, or null. Used by a ship to decide what
 * its battery should be pointed at.
 */
export function firstRockOnRay(world, x, y, angle, length) {
  if (world.lava.grid.size === 0) return null;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const steps = Math.ceil(length / 9);

  for (let i = 1; i <= steps; i++) {
    const px = x + cos * i * 9;
    const py = y + sin * i * 9;
    let hit = null;
    nearby(world, px, py, LAVA.maxReach + 4, (seg) => {
      if (!hit && seg.solid && overlap(seg, px, py, 0) > 0) hit = seg;
    });
    if (hit) return { seg: hit, x: px, y: py };
  }
  return null;
}

/**
 * Move a point clear of any rock it was placed inside.
 *
 * Terrain outlives waves, so a spawn point chosen without looking — an
 * aircraft arriving, a crate falling where something died — can land inside a
 * wall that was not there last wave. Rather than let it grind its way out in
 * full view, it is put down somewhere there is room.
 */
export function nudgeOutOfRock(world, point, radius) {
  if (!rockAt(world, point.x, point.y)) return point;

  for (let ring = 1; ring <= 8; ring++) {
    const reach = ring * (radius + LAVA.maxReach);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + ring;
      const x = clamp(point.x + Math.cos(a) * reach, -ARENA_HALF, ARENA_HALF);
      const y = clamp(point.y + Math.sin(a) * reach, -ARENA_HALF, ARENA_HALF);
      if (!rockAt(world, x, y)) {
        point.x = x;
        point.y = y;
        return point;
      }
    }
  }
  return point; // walled in on every side; nothing sensible left to do
}
