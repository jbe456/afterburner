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
import { showMenu, showGameOver, hideOverlay } from "./ui/screens.js";

/** @type {"menu"|"playing"|"dead"} */
let screen = "menu";
let paused = false;
let world = createWorld();

const canvas = document.getElementById("c");
initViewport(canvas);
initInput(canvas, {
  onPause: () => { if (screen === "playing") paused = !paused; },
  onConfirm: () => { if (screen !== "playing") startRun(); },
  onGesture: initAudio,
});

function startRun() {
  initAudio();
  resumeAudio();
  world = createWorld();
  screen = "playing";
  paused = false;
  hideOverlay();
  startWave(world);
}

function endRun() {
  screen = "dead";
  showGameOver(world, startRun);
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

  if (screen === "menu") {
    const { ctx, w, h } = viewport;
    ctx.fillStyle = "#0b1016";
    ctx.fillRect(0, 0, w, h);
  } else {
    drawScene(world);
    drawHud(world);
    if (paused) drawPauseOverlay();
  }
}

showMenu(startRun);
requestAnimationFrame(frame);
