/** Crates dropped by dead enemies: hull repair and missile resupply. */

import { dist2 } from "../core/math.js";
import { sfx } from "../core/audio.js";
import { PICKUPS } from "../config.js";
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
      player.hp = Math.min(player.armour.maxHp, player.hp + PICKUPS.repairAmount);
      showBanner(world, `+${PICKUPS.repairAmount} HULL`, 60);
    } else {
      // Each weapon type says how much a crate gives it back.
      const gainedMissiles = Math.min(
        player.missile.resupply, player.missile.carried - player.missiles,
      );
      player.missiles += gainedMissiles;

      const gainedBombs = Math.min(
        player.bomb.resupply, player.bomb.carried - player.bombs,
      );
      player.bombs += gainedBombs;

      const parts = [];
      if (gainedMissiles) parts.push(`+${gainedMissiles} ${player.missile.short}`);
      if (gainedBombs) parts.push(`+${gainedBombs} ${player.bomb.short}`);
      showBanner(world, parts.join(" · ") || "AMMO FULL", 60);
    }

    burst(world, p.x, p.y, 14, p.kind === "repair" ? "#5ddba0" : "#ffd166", 4, 4, 26);
    sfx.pickup();
    pickups.splice(i, 1);
  }
}
