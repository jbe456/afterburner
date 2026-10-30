/**
 * The DOM overlay: title screen and game-over card. Everything else in the
 * game is canvas; these are HTML because they are text and a button, and the
 * browser already does those well.
 */

import { loadBest, saveBest } from "../core/storage.js";

const overlay = () => document.getElementById("overlay");
const panel = () => document.getElementById("panel");

const CONTROLS = [
  ["Mouse / A · D", "Steer the jet"],
  ["W / Shift", "Afterburner"],
  ["S", "Throttle back (turns tighter)"],
  ["Left Click / Space", "Cannon"],
  ["Right Click / F", "Fire missile (needs lock)"],
  ["P", "Pause"],
];

export function showMenu(onStart) {
  panel().className = "panel";
  panel().innerHTML = `
    <h1>AFTERBURNER</h1>
    <div class="sub">Air Combat Maneuvering</div>
    <div class="keys">
      ${CONTROLS.map(([k, d]) => `<b>${k}</b><span>${d}</span>`).join("")}
    </div>
    <button class="btn" id="start">Launch</button>
    <div class="hint">Survive the waves · collect + and M crates · don't leave the zone</div>`;
  show(onStart);
}

export function showGameOver(world, onStart) {
  const best = Math.max(loadBest(), world.score);
  saveBest(best);

  panel().className = "panel dead";
  panel().innerHTML = `
    <h1>SHOT DOWN</h1>
    <div class="sub">Ejection successful</div>
    <div class="stats">
      SCORE <span>${world.score}</span><br>
      KILLS <span>${world.kills}</span> &nbsp;·&nbsp; WAVE <span>${world.wave}</span><br>
      BEST <span>${best}</span>
    </div>
    <button class="btn" id="start">Fly Again</button>
    <div class="hint">or press ENTER</div>`;
  show(onStart);
}

export function hideOverlay() {
  overlay().classList.add("hidden");
}

function show(onStart) {
  overlay().classList.remove("hidden");
  document.getElementById("start").onclick = onStart;
}
