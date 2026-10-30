/** Crates dropped by dead enemies: hull repair and missile resupply. */

import { dist2 } from "../core/math.js";
import { sfx } from "../core/audio.js";
import { PICKUPS, PLAYER } from "../config.js";
import { burst } from "./effects.js";
import { showBanner } from "../world.js";

/** Called on every kill; most kills drop nothing. */
export function maybeDropPickup(world, x, y) {
  if (Math.random() >= PICKUPS.dropChance) return;
  world.pickups.push({
    x, y,
    kind: Math.random() < PICKUPS.repairShare ? "repair" : "ammo",
    life: PICKUPS.life,
    bob: 0,
  });
}

export function updatePickups(world) {
  const { player, pickups } = world;

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.bob += 0.08;

    if (--p.life <= 0) { pickups.splice(i, 1); continue; }
    if (!player.alive) continue;
    if (dist2(p, player) >= PICKUPS.pickupRadius ** 2) continue;

    if (p.kind === "repair") {
      player.hp = Math.min(PLAYER.maxHp, player.hp + PICKUPS.repairAmount);
      showBanner(world, `+${PICKUPS.repairAmount} HULL`, 60);
    } else {
      player.missiles = Math.min(PLAYER.maxMissiles, player.missiles + PICKUPS.ammoAmount);
      showBanner(world, `+${PICKUPS.ammoAmount} MISSILES`, 60);
    }

    burst(world, p.x, p.y, 14, p.kind === "repair" ? "#5ddba0" : "#ffd166", 4, 4, 26);
    sfx.pickup();
    pickups.splice(i, 1);
  }
}
