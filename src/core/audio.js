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

/**
 * The flamethrower has to be one continuous sound, not a series of events.
 *
 * The obvious implementation — retrigger a short burst every few ticks —
 * is wrong twice over: it churns audio nodes, and re-running an attack/decay
 * envelope fifteen times a second produces a 15 Hz amplitude pulse, which the
 * ear reads as gunfire rather than fire. What follows instead is a pair of
 * permanently running noise loops behind one gain, held *steady* while the
 * trigger is down.
 *
 *   body: noise -> lowpass 260 Hz          the low roar of burning fuel
 *   jet:  noise -> highpass -> lowpass     the hiss of fuel leaving the nozzle
 *
 * The two loops run at different playback rates so they never line up, which
 * keeps the texture from sounding periodic.
 */
let flameChain = null;

/** Level the roar holds at while the trigger is down. */
const FLAME_LEVEL = 0.17;
/** Silence this long after the last call means the trigger was released. */
const FLAME_RELEASE_DELAY = 0.2;

function ensureFlameChain() {
  if (flameChain || !ctx || !noiseBuffer) return;

  const gate = ctx.createGain();
  gate.gain.value = 0;
  gate.connect(master);

  const layer = (playbackRate, level, build) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    src.playbackRate.value = playbackRate;
    const gain = ctx.createGain();
    gain.gain.value = level;
    const tail = build(src);
    tail.connect(gain);
    gain.connect(gate);
    src.start();
    return tail;
  };

  layer(1, 1.5, (src) => {
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 260;
    src.connect(lowpass);
    return lowpass;
  });

  const jetLowpass = layer(0.77, 0.55, (src) => {
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 340;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1100;
    src.connect(highpass);
    highpass.connect(lowpass);
    return lowpass;
  });

  flameChain = { gate, jetLowpass, nextWander: 0 };
}

/**
 * Hold the flame open. Each call parks the gain at a constant level and
 * queues a release just far enough ahead that the next call wipes it — so
 * holding the trigger is silence-free and letting go fades out on its own,
 * with no "flame off" call needed anywhere.
 */
function roar() {
  ensureFlameChain();
  if (!flameChain) return;

  const now = ctx.currentTime;
  const gain = flameChain.gate.gain;

  // Hold at the current value before re-scheduling, so cancelling mid-ramp
  // cannot snap the level and click.
  if (gain.cancelAndHoldAtTime) {
    gain.cancelAndHoldAtTime(now);
  } else {
    const current = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(current, now);
  }

  // Approach a constant rather than running an envelope: no pulse.
  gain.setTargetAtTime(FLAME_LEVEL, now, 0.05);
  gain.setTargetAtTime(0, now + FLAME_RELEASE_DELAY, 0.09);

  // Let the jet's timbre wander slowly, so it breathes rather than crackles.
  if (now >= flameChain.nextWander) {
    flameChain.jetLowpass.frequency.setTargetAtTime(rand(820, 1450), now, 0.3);
    flameChain.nextWander = now + rand(0.3, 0.6);
  }
}

export const sfx = {
  gun: () => {
    tone(rand(620, 760), 0.06, "square", 0.08, 180);
    noise(0.05, 0.1, 3000);
  },
  enemyGun: () => tone(rand(300, 360), 0.05, "square", 0.03, 120),
  /** Flamethrower: a sustained roar, held open for as long as it is called. */
  flame: roar,
  /** Incoming fire and beams: sparse and quiet, since many may be firing. */
  enemyFlame: () => noise(0.18, 0.045, rand(360, 540), 220),
  enemyLaser: () => tone(rand(620, 700), 0.1, "sawtooth", 0.025, 420),
  /** Laser: a thin electric hum, deliberately nothing like the flame. */
  laser: () => {
    tone(rand(1180, 1320), 0.14, "sawtooth", 0.035, 760);
    tone(rand(480, 540), 0.12, "square", 0.02);
  },
  boom: (big) => {
    noise(big ? 0.75 : 0.4, big ? 0.6 : 0.3, big ? 1400 : 900, 60);
    tone(big ? 70 : 110, big ? 0.6 : 0.3, "sine", big ? 0.4 : 0.2, 30);
  },
  missile: () => {
    tone(180, 0.5, "sawtooth", 0.12, 900);
    noise(0.5, 0.12, 700, 2500);
  },
  /** Incoming: lower and dirtier than your own, so you can tell them apart. */
  enemyMissile: () => {
    tone(110, 0.55, "sawtooth", 0.09, 420);
    noise(0.55, 0.1, 480, 1500);
  },
  hit: () => noise(0.1, 0.25, 2200, 400),
  lock: () => tone(1250, 0.05, "square", 0.05),
  bombArm: () => {
    tone(140, 0.18, "square", 0.1, 70);
    noise(0.2, 0.12, 900);
  },
  /** Fuse beep; `urgency` 0..1 raises the pitch as detonation nears. */
  bombTick: (urgency) => tone(880 + urgency * 700, 0.05, "square", 0.05 + urgency * 0.05),
  /** Deeper and longer than a normal explosion — this one is supposed to scare you. */
  nuke: () => {
    noise(1.8, 0.75, 2200, 40);
    tone(48, 1.6, "sine", 0.5, 18);
    tone(120, 0.9, "sawtooth", 0.25, 30);
  },
  pickup: () => {
    tone(620, 0.09, "sine", 0.14);
    setTimeout(() => tone(930, 0.13, "sine", 0.14), 70);
  },
  wave: () => {
    tone(330, 0.2, "sine", 0.12);
    setTimeout(() => tone(495, 0.35, "sine", 0.12), 150);
  },
};
