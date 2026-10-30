/**
 * Raw keyboard and mouse state. This module never touches game state — it
 * only records what is currently held, and forwards a few one-shot keys
 * (pause, confirm) to callbacks supplied by main.js.
 */

export const input = {
  keys: Object.create(null),
  mouse: { x: 0, y: 0, left: false, right: false, /** steering follows the cursor */ active: false },
};

/** True if any of the given KeyboardEvent.code values is held. */
export const isDown = (...codes) => codes.some((c) => input.keys[c]);

const STEER_KEYS = ["KeyA", "KeyD", "ArrowLeft", "ArrowRight"];
const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{onPause:Function, onConfirm:Function, onGesture:Function}} handlers
 *   onGesture fires on the first click — the hook browsers require before
 *   audio may start.
 */
export function initInput(canvas, handlers) {
  const { keys, mouse } = input;

  addEventListener("keydown", (e) => {
    if (SCROLL_KEYS.includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    // Touching a steering key hands control back from the mouse.
    if (STEER_KEYS.includes(e.code)) mouse.active = false;
    if (e.code === "KeyP") handlers.onPause();
    if (e.code === "Enter") handlers.onConfirm();
  });

  addEventListener("keyup", (e) => { keys[e.code] = false; });

  canvas.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  });

  canvas.addEventListener("mousedown", (e) => {
    handlers.onGesture();
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) { mouse.right = true; e.preventDefault(); }
  });

  addEventListener("mouseup", (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Losing focus mid-input would otherwise leave keys stuck down forever.
  addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
    mouse.left = mouse.right = false;
  });
}
