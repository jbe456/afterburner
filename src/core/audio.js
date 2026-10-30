/**
 * All sound is synthesised at runtime with WebAudio — there are no asset
 * files. Each effect is a short oscillator sweep, a burst of filtered noise,
 * or both.
 *
 * Browsers refuse to start an AudioContext until the user interacts with the
 * page, so `initAudio` is called from the first click rather than on load.
 */

import { rand } from "./math.js";

let ctx = null;
let master = null;
let noiseBuffer = null;

export function initAudio() {
  if (ctx) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return; // no audio support; the game still plays fine

  ctx = new AudioCtor();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);

  // One second of white noise, reused by every explosion and impact.
  const length = ctx.sampleRate * 1.2;
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
}

/** Resume after a tab switch, which suspends the context. */
export function resumeAudio() {
  if (ctx && ctx.state === "suspended") ctx.resume();
}

/** A pitched blip, optionally sweeping to `slideTo` over its lifetime. */
function tone(freq, duration, type, volume, slideTo) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

/** A noise burst shaped by a lowpass sweep — the basis of every impact. */
function noise(duration, volume, cutoff, slideCutoff) {
  if (!ctx || !noiseBuffer) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  src.buffer = noiseBuffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, ctx.currentTime);
  if (slideCutoff) filter.frequency.exponentialRampToValueAtTime(slideCutoff, ctx.currentTime + duration);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start();
  src.stop(ctx.currentTime + duration);
}

export const sfx = {
  gun: () => {
    tone(rand(620, 760), 0.06, "square", 0.08, 180);
    noise(0.05, 0.1, 3000);
  },
  enemyGun: () => tone(rand(300, 360), 0.05, "square", 0.03, 120),
  boom: (big) => {
    noise(big ? 0.75 : 0.4, big ? 0.6 : 0.3, big ? 1400 : 900, 60);
    tone(big ? 70 : 110, big ? 0.6 : 0.3, "sine", big ? 0.4 : 0.2, 30);
  },
  missile: () => {
    tone(180, 0.5, "sawtooth", 0.12, 900);
    noise(0.5, 0.12, 700, 2500);
  },
  hit: () => noise(0.1, 0.25, 2200, 400),
  lock: () => tone(1250, 0.05, "square", 0.05),
  pickup: () => {
    tone(620, 0.09, "sine", 0.14);
    setTimeout(() => tone(930, 0.13, "sine", 0.14), 70);
  },
  wave: () => {
    tone(330, 0.2, "sine", 0.12);
    setTimeout(() => tone(495, 0.35, "sine", 0.12), 150);
  },
};
