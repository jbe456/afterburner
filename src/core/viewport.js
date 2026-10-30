/**
 * Owns the canvas and keeps it matched to the window at the device pixel
 * ratio. Everything else reads `viewport.w` / `viewport.h` in CSS pixels and
 * can ignore DPR entirely, because the context is pre-scaled.
 */

export const viewport = {
  canvas: null,
  ctx: null,
  w: 0,
  h: 0,
  dpr: 1,
};

export function initViewport(canvas) {
  viewport.canvas = canvas;
  viewport.ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
  return viewport;
}

function resize() {
  const { canvas, ctx } = viewport;
  viewport.dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewport.w = window.innerWidth;
  viewport.h = window.innerHeight;
  canvas.width = viewport.w * viewport.dpr;
  canvas.height = viewport.h * viewport.dpr;
  // One scale for the whole app: draw in CSS pixels, render at device pixels.
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
}
