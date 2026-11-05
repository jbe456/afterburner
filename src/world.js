/**
 * The world is the single mutable object every system reads and writes.
 * Nothing else holds game state, so "what can change?" has exactly one answer.
 *
 * Systems are plain functions taking `world` — there is no inheritance and no
 * hidden global, which keeps the update order explicit in simulate.js.
 */

import { rand } from "./core/math.js";
import { ARENA_HALF } from "./config.js";
import { createPlayer } from "./entities/player.js";

export function createWorld(planeId) {
  return {
    player: createPlayer(planeId),

    // Entity pools
    enemies: [],
    bullets: [],
    missiles: [],
    bombs: [],
    pickups: [],
    particles: [],
    rings: [],
    clouds: createClouds(),

    // Run state
    score: 0,
    wave: 0,
    kills: 0,
    /** Ticks until the next wave; -1 means "wave already queued". */
    waveTimer: 0,
    /** Enemies waiting to enter, so a wave trickles in instead of popping. */
    spawnQueue: [],
    /** Ticks since the run began; drives all cosmetic animation. */
    time: 0,
    /** Counts down from the player's death to the game-over screen. */
    deathTimer: -1,

    // Presentation state
    shake: 0,
    hitFlash: 0,
    /** 0..1 white-out from a bomb detonation. */
    blastFlash: 0,
    /** True while the player sits inside a live bomb's radius; drives the HUD warning. */
    playerInBlast: false,
    camX: 0,
    camY: 0,
    banner: { text: "", time: 0 },
  };
}

export function showBanner(world, text, ticks) {
  world.banner.text = text;
  world.banner.time = ticks;
}

/**
 * Two parallax layers of cloud: a distant one that drifts slowly under the
 * jet, and a near one drawn over the top for a sense of altitude.
 */
function createClouds() {
  const clouds = [];
  for (let i = 0; i < 90; i++) {
    const blobs = [];
    const blobCount = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < blobCount; j++) {
      blobs.push({ x: rand(-70, 70), y: rand(-26, 26), r: rand(34, 78) });
    }
    const far = i < 55;
    clouds.push({
      x: rand(-ARENA_HALF * 1.2, ARENA_HALF * 1.2),
      y: rand(-ARENA_HALF * 1.2, ARENA_HALF * 1.2),
      layer: far ? 0 : 1,
      alpha: far ? rand(0.05, 0.12) : rand(0.08, 0.16),
      blobs,
    });
  }
  return clouds;
}
