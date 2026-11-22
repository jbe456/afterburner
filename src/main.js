/**
 * Entry point: owns the screen state machine and the frame loop.
 *
 *   menu ──Launch──> playing ──shot down──> dead ──Fly Again──> playing
 *
 * The simulation runs on a fixed 60Hz step while rendering runs once per
 * animation frame. A slow machine therefore drops frames rather than running
 * the game in slow motion, and physics stays identical on every display.
 */

import { TICK_MS } from "./config.js";
import { initViewport, viewport } from "./core/viewport.js";
import { initInput } from "./core/input.js";
import { initAudio, resumeAudio } from "./core/audio.js";
import { createWorld } from "./world.js";
import { simulate } from "./simulate.js";
import { startWave } from "./waves.js";
import { drawScene } from "./render/scene.js";
import { drawHud, drawPauseOverlay } from "./render/hud.js";
import {
  showMenu, showIntel, showHelp, showGameOver, hideOverlay, getLoadout,
} from "./ui/screens.js";

/** @type {"menu"|"intel"|"help"|"playing"|"dead"} */
let screen = "menu";
let paused = false;
let world = createWorld();

const canvas = document.getElementById("c");
initViewport(canvas);
initInput(canvas, {
  onPause: () => { if (screen === "playing") paused = !paused; },
  onConfirm: () => {
    // Enter backs out of the reading screens rather than launching from them.
    if (screen === "intel" || screen === "help") returnToHangar();
    else if (screen !== "playing") startRun();
  },

  /**
   * Escape goes back a step. Mid-run it pauses first and only abandons on a
   * second press — losing a run to one stray keystroke would be a poor trade
   * for the convenience.
   */
  onBack: () => {
    if (screen === "playing") {
      if (paused) { paused = false; returnToHangar(); }
      else paused = true;
      return;
    }
    if (screen !== "menu") returnToHangar();
  },
  onGesture: initAudio,
});

/**
 * Which wave a run opens on. `?wave=18` in the address bar starts there
 * instead of at the first, which is the only practical way to reach the late
 * roster — wave 20 is otherwise twenty cleared waves away, and the things
 * worth looking at are all at the top of it.
 *
 * Deliberately a URL parameter rather than a control in the hangar: it costs
 * the game no interface, it survives a reload, and `dist/index.html` honours
 * it straight off the filesystem.
 */
function startingWave() {
  const asked = Number(new URLSearchParams(location.search).get("wave"));
  return Number.isInteger(asked) && asked > 1 ? asked : 1;
}

/** Launch with whatever the hangar currently has selected. */
function startRun() {
  initAudio();
  resumeAudio();
  world = createWorld(getLoadout());

  const from = startingWave();
  // startWave increments before it composes, so it wants the wave before.
  world.wave = from - 1;
  // Skipping the first seventeen waves is not a score. Marking the run keeps
  // it out of the persisted best rather than letting a practice run stand as
  // one you flew.
  world.practice = from > 1;

  screen = "playing";
  paused = false;
  hideOverlay();
  startWave(world);
}

function returnToHangar() {
  screen = "menu";
  showMenu(startRun, showEnemyRoster, showHowToFly);
}

/** The threat library, reachable from the hangar and backing out to it. */
function showEnemyRoster() {
  screen = "intel";
  showIntel(returnToHangar);
}

/** The controls, same deal. */
function showHowToFly() {
  screen = "help";
  showHelp(returnToHangar);
}

function endRun() {
  screen = "dead";
  showGameOver(world, startRun, returnToHangar);
}

// --- frame loop -------------------------------------------------------------
let accumulator = 0;
let lastFrame = performance.now();

function frame(now) {
  requestAnimationFrame(frame);

  let elapsed = now - lastFrame;
  lastFrame = now;
  // A backgrounded tab can hand us a huge delta; never fast-forward the game.
  if (elapsed > 250) elapsed = 250;

  if (screen === "playing" && !paused) {
    accumulator += elapsed;
    while (accumulator >= TICK_MS) {
      accumulator -= TICK_MS;
      if (simulate(world)) { endRun(); break; }
    }
  } else {
    accumulator = 0;
  }

  if (screen !== "playing" && screen !== "dead") {
    const { ctx, w, h } = viewport;
    ctx.fillStyle = "#0b1016";
    ctx.fillRect(0, 0, w, h);
  } else {
    drawScene(world);
    drawHud(world);
    if (paused) drawPauseOverlay();
  }
}

showMenu(startRun, showEnemyRoster, showHowToFly);
requestAnimationFrame(frame);
