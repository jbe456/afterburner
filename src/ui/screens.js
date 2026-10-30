/**
 * The DOM overlays: the hangar (title + airframe selection) and the
 * game-over card. Everything else in the game is canvas; these are HTML
 * because they are text, bars and buttons, which the browser already does well.
 *
 * The stat bars are normalised from the real numbers in config.js rather than
 * hand-authored, so they cannot drift out of sync with how the planes fly.
 */

import { PLANES, PLANE_IDS, DEFAULT_PLANE, planeDps } from "../config.js";
import { loadBest, saveBest, loadPlane, savePlane } from "../core/storage.js";

const overlay = () => document.getElementById("overlay");
const panel = () => document.getElementById("panel");

const CONTROLS = [
  ["Mouse / A · D", "Steer"],
  ["W / Shift", "Afterburner"],
  ["S", "Throttle back (turns tighter)"],
  ["Click / Space", "Cannon"],
  ["Right click / F", "Missile (needs lock)"],
  ["P", "Pause"],
];

/** Axes shown on each card. Higher is better on all of them. */
const AXES = [
  ["HULL", (p) => p.maxHp],
  ["SPEED", (p) => p.maxSpeed],
  ["AGILITY", (p) => p.turnRate],
  ["GUNS", (p) => planeDps(p)],
  ["MISSILES", (p) => p.maxMissiles],
];

/** Min/max of each axis across the roster, for normalising the bars. */
const RANGES = AXES.map(([, read]) => {
  const values = PLANE_IDS.map((id) => read(PLANES[id]));
  return [Math.min(...values), Math.max(...values)];
});

const SELECT_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];

let selectedId = PLANES[loadPlane()] ? loadPlane() : DEFAULT_PLANE;
let menuKeyHandler = null;

export const getSelectedPlane = () => selectedId;

// --- hangar -----------------------------------------------------------------

export function showMenu(onStart) {
  panel().className = "panel wide";
  panel().innerHTML = `
    <h1>AFTERBURNER</h1>
    <div class="sub">Select your airframe</div>
    <div class="hangar">${PLANE_IDS.map(planeCard).join("")}</div>
    <div class="keys">
      ${CONTROLS.map(([k, d]) => `<b>${k}</b><span>${d}</span>`).join("")}
    </div>
    <button class="btn" id="start">Launch</button>
    <div class="hint">No airframe wins everywhere — pick the tradeoff you like</div>`;

  for (const card of panel().querySelectorAll(".plane")) {
    card.addEventListener("click", () => selectPlane(card.dataset.id));
    // Double-click a card to pick it and go.
    card.addEventListener("dblclick", onStart);
  }

  menuKeyHandler = (e) => {
    const i = SELECT_KEYS.indexOf(e.code);
    if (i >= 0 && i < PLANE_IDS.length) selectPlane(PLANE_IDS[i]);
  };
  addEventListener("keydown", menuKeyHandler);

  show(onStart);
}

function planeCard(id, index) {
  const plane = PLANES[id];
  const selected = id === selectedId ? " selected" : "";
  const bars = AXES.map(([label, read], axis) => `
    <div class="stat">
      <i>${label}</i>
      <div class="track"><div class="fill" style="width:${barWidth(axis, read(plane))}%"></div></div>
    </div>`).join("");

  return `
    <div class="plane${selected}" data-id="${id}" style="--livery:${plane.color}">
      <div class="plane-top">
        <span class="plane-name">${plane.name}</span>
        <span class="plane-key">${index + 1}</span>
      </div>
      <div class="plane-role">${plane.role}</div>
      ${silhouette(plane)}
      <div class="stats-grid">${bars}</div>
      <div class="plane-blurb">${plane.blurb}</div>
    </div>`;
}

/** Normalise to 18–100% so the weakest stat is still a visible sliver. */
function barWidth(axis, value) {
  const [lo, hi] = RANGES[axis];
  const t = hi === lo ? 1 : (value - lo) / (hi - lo);
  return (18 + t * 82).toFixed(1);
}

/**
 * The same polygons the canvas renderer uses, so the card art is the actual
 * airframe at its actual relative size — nose up.
 */
function silhouette(plane) {
  const wing = (s) => `<polygon points="4,${3 * s} -9,${21 * s} -15,${21 * s} -9,${3 * s}"/>`;
  const tail = (s) => `<polygon points="-13,${2.5 * s} -20,${10 * s} -23,${10 * s} -19,${2.5 * s}"/>`;
  return `
    <svg class="plane-art" viewBox="-32 -32 64 64" aria-hidden="true">
      <g transform="rotate(-90) scale(${plane.scale})">
        <g fill="${plane.accent}">${wing(-1)}${wing(1)}${tail(-1)}${tail(1)}</g>
        <polygon fill="${plane.color}"
          points="23,0 9,-4.5 -14,-5 -18,-3.8 -18,3.8 -14,5 9,4.5"/>
      </g>
    </svg>`;
}

function selectPlane(id) {
  if (!PLANES[id]) return;
  selectedId = id;
  savePlane(id);
  for (const card of panel().querySelectorAll(".plane")) {
    card.classList.toggle("selected", card.dataset.id === id);
  }
}

// --- game over --------------------------------------------------------------

export function showGameOver(world, onFlyAgain, onChangePlane) {
  const best = Math.max(loadBest(), world.score);
  saveBest(best);

  panel().className = "panel dead";
  panel().innerHTML = `
    <h1>SHOT DOWN</h1>
    <div class="sub">${world.player.stats.name} · ejection successful</div>
    <div class="stats">
      SCORE <span>${world.score}</span><br>
      KILLS <span>${world.kills}</span> &nbsp;·&nbsp; WAVE <span>${world.wave}</span><br>
      BEST <span>${best}</span>
    </div>
    <button class="btn" id="start">Fly Again</button>
    <button class="btn ghost" id="hangar">Change Plane</button>
    <div class="hint">ENTER to fly the ${world.player.stats.name} again</div>`;

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
