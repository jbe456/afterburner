/**
 * The DOM overlays: the hangar (airframe + loadout selection) and the
 * game-over card. Everything else in the game is canvas; these are HTML
 * because they are text, bars and buttons, which the browser already does well.
 *
 * Every figure shown here is read from config.js rather than written by hand,
 * so the hangar cannot advertise something the simulation does not do.
 */

import {
  PLANES, PLANE_IDS, CANNONS, CANNON_IDS, MISSILES, MISSILE_IDS,
  BOMBS, BOMB_IDS, DEFAULT_LOADOUT, PLAYER, KMH_PER_SPEED_UNIT,
  cannonDps, cannonReach,
} from "../config.js";
import { loadBest, saveBest, loadLoadout, saveLoadoutSlot } from "../core/storage.js";

const overlay = () => document.getElementById("overlay");
const panel = () => document.getElementById("panel");

const CONTROLS = [
  ["Mouse / A · D", "Steer"],
  ["W / Shift", "Afterburner"],
  ["S", "Throttle back (turns tighter)"],
  ["Click / Space", "Cannon"],
  ["Right click / F", "Missile"],
  ["B", "Drop bomb"],
  ["P", "Pause"],
];

/**
 * What each card compares, as bars. Every axis is a quantity read straight
 * from config.js and normalised against the other options in its own
 * category, so a card can never advertise something the simulation does not
 * do. More is more on all of them.
 */
const AXES = {
  plane: [
    ["HULL", (p) => p.maxHp],
    ["SPEED", (p) => p.maxSpeed],
  ],
  cannon: [
    ["DAMAGE", cannonDps],
    ["REACH", cannonReach],
    ["PIERCE", (c) => c.pierce],
    ["BURN", (c) => (c.burn ? c.burn.dps : 0)],
  ],
  missile: [
    ["AMMO", (m) => m.carried],
    ["DAMAGE", (m) => m.damage],
    ["BLAST", (m) => m.splashRadius],
    ["SEEKER", (m) => m.acquireRange],
  ],
  bomb: [
    ["AMMO", (b) => b.carried],
    ["BLAST", (b) => b.blastRadius],
    ["FUSE", (b) => b.fuse],
  ],
};

/**
 * Builds a bar renderer for one category, normalising each axis across that
 * category's options. The weakest value still shows an 18% sliver so a card
 * never looks broken.
 */
function barsFor(slot, ids, table) {
  const axes = AXES[slot];
  const ranges = axes.map(([, read]) => {
    const values = ids.map((id) => read(table[id]));
    return [Math.min(...values), Math.max(...values)];
  });

  return (spec) => axes.map(([label, read], i) => {
    const [lo, hi] = ranges[i];
    const t = hi === lo ? 1 : (read(spec) - lo) / (hi - lo);
    return `
      <div class="stat">
        <i>${label}</i>
        <div class="track"><div class="fill" style="width:${(18 + t * 82).toFixed(1)}%"></div></div>
      </div>`;
  }).join("");
}

const BARS = {
  plane: barsFor("plane", PLANE_IDS, PLANES),
  cannon: barsFor("cannon", CANNON_IDS, CANNONS),
  missile: barsFor("missile", MISSILE_IDS, MISSILES),
  bomb: barsFor("bomb", BOMB_IDS, BOMBS),
};

const SELECT_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];

/** The current selection, seeded from storage and repaired against config. */
const chosen = { ...DEFAULT_LOADOUT, ...validated(loadLoadout()) };
let menuKeyHandler = null;

/** Drops any saved id that no longer names a real plane or weapon. */
function validated(saved) {
  const tables = { plane: PLANES, cannon: CANNONS, missile: MISSILES, bomb: BOMBS };
  const out = {};
  for (const [slot, table] of Object.entries(tables)) {
    if (saved[slot] && table[saved[slot]]) out[slot] = saved[slot];
  }
  return out;
}

export const getLoadout = () => ({ ...chosen });

// --- hangar -----------------------------------------------------------------

export function showMenu(onStart) {
  panel().className = "panel wide";
  panel().innerHTML = `
    <h1>AFTERBURNER</h1>
    <div class="sub">Select your airframe</div>
    <div class="hangar">${PLANE_IDS.map(planeCard).join("")}</div>

    <div class="loadout">
      ${weaponRow("cannon", "CANNON", CANNON_IDS, CANNONS)}
      ${weaponRow("missile", "MISSILE", MISSILE_IDS, MISSILES)}
      ${weaponRow("bomb", "BOMB", BOMB_IDS, BOMBS)}
    </div>

    <div class="keys">
      ${CONTROLS.map(([k, d]) => `<b>${k}</b><span>${d}</span>`).join("")}
    </div>
    <button class="btn" id="start">Launch</button>
    <div class="hint">Any airframe can carry any loadout · a longer bar is more of that thing</div>`;

  for (const card of panel().querySelectorAll(".plane")) {
    card.addEventListener("click", () => select("plane", card.dataset.id));
    card.addEventListener("dblclick", onStart);
  }
  for (const opt of panel().querySelectorAll(".opt")) {
    opt.addEventListener("click", () => select(opt.dataset.slot, opt.dataset.id));
  }

  menuKeyHandler = (e) => {
    const i = SELECT_KEYS.indexOf(e.code);
    if (i >= 0 && i < PLANE_IDS.length) select("plane", PLANE_IDS[i]);
  };
  addEventListener("keydown", menuKeyHandler);

  show(onStart);
}

function planeCard(id, index) {
  const plane = PLANES[id];
  return `
    <div class="plane${id === chosen.plane ? " selected" : ""}" data-id="${id}"
         style="--livery:${plane.color}">
      <div class="plane-top">
        <span class="plane-name">${plane.name}</span>
        <span class="plane-key">${index + 1}</span>
      </div>
      <div class="plane-role">${plane.role}</div>
      ${silhouette(plane)}
      <div class="stats-grid">${BARS.plane(plane)}</div>
      <div class="plane-figures">${plane.maxHp} hull · ${kmh(plane.maxSpeed)} km/h</div>
    </div>`;
}

const kmh = (unitsPerTick) => Math.round(unitsPerTick * KMH_PER_SPEED_UNIT);

// --- weapon rows ------------------------------------------------------------

function weaponRow(slot, label, ids, table) {
  const options = ids.map((id) => {
    const spec = table[id];
    return `
      <div class="opt${id === chosen[slot] ? " selected" : ""}" data-slot="${slot}" data-id="${id}">
        <b>${spec.name}</b>
        <div class="stats-grid">${BARS[slot](spec)}</div>
      </div>`;
  }).join("");

  return `
    <div class="loadout-row">
      <div class="loadout-label">${label}</div>
      <div class="options">${options}</div>
    </div>`;
}

/**
 * The same polygons the canvas renderer uses, so the card art is the actual
 * airframe — nose up. Every plane shares one hitbox, so one scale.
 */
function silhouette(plane) {
  const wing = (s) => `<polygon points="4,${3 * s} -9,${21 * s} -15,${21 * s} -9,${3 * s}"/>`;
  const tail = (s) => `<polygon points="-13,${2.5 * s} -20,${10 * s} -23,${10 * s} -19,${2.5 * s}"/>`;
  return `
    <svg class="plane-art" viewBox="-32 -32 64 64" aria-hidden="true">
      <g transform="rotate(-90) scale(${PLAYER.scale})">
        <g fill="${plane.accent}">${wing(-1)}${wing(1)}${tail(-1)}${tail(1)}</g>
        <polygon fill="${plane.color}"
          points="23,0 9,-4.5 -14,-5 -18,-3.8 -18,3.8 -14,5 9,4.5"/>
      </g>
    </svg>`;
}

function select(slot, id) {
  chosen[slot] = id;
  saveLoadoutSlot(slot, id);
  const selector = slot === "plane" ? ".plane" : `.opt[data-slot="${slot}"]`;
  for (const el of panel().querySelectorAll(selector)) {
    el.classList.toggle("selected", el.dataset.id === id);
  }
}

// --- game over --------------------------------------------------------------

export function showGameOver(world, onFlyAgain, onChangePlane) {
  const best = Math.max(loadBest(), world.score);
  saveBest(best);

  const p = world.player;
  panel().className = "panel dead";
  panel().innerHTML = `
    <h1>SHOT DOWN</h1>
    <div class="sub">${p.stats.name} · ejection successful</div>
    <div class="stats">
      SCORE <span>${world.score}</span><br>
      KILLS <span>${world.kills}</span> &nbsp;·&nbsp; WAVE <span>${world.wave}</span><br>
      BEST <span>${best}</span>
    </div>
    <div class="loadout-recap">
      ${p.cannon.short} · ${p.missile.short} · ${p.bomb.short}
    </div>
    <button class="btn" id="start">Fly Again</button>
    <button class="btn ghost" id="hangar">Change Loadout</button>
    <div class="hint">ENTER to fly the same again</div>`;

  document.getElementById("hangar").onclick = onChangePlane;
  show(onFlyAgain);
}

// --- shared -----------------------------------------------------------------

export function hideOverlay() {
  overlay().classList.add("hidden");
  if (menuKeyHandler) {
    removeEventListener("keydown", menuKeyHandler);
    menuKeyHandler = null;
  }
}

function show(onStart) {
  overlay().classList.remove("hidden");
  document.getElementById("start").onclick = onStart;
}
