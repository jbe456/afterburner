/**
 * Crates dropped by dead enemies: hull repair, weapon ammo, and charges for
 * whatever the system bay is carrying.
 */

import { dist2 } from "../core/math.js";
import { sfx } from "../core/audio.js";
import { PICKUPS } from "../config.js";
import { burst } from "./effects.js";
import { showBanner } from "../world.js";

/** One colour per kind, shared with the renderer so the two cannot drift. */
export const PICKUP_COLOUR = {
  repair: "#5ddba0",
  ammo: "#ffd166",
  shield: "#4ea8ff",
};

/** The mark each kind carries, so a square says what it is without a legend. */
export const PICKUP_GLYPH = { repair: "+", ammo: "M", shield: "S" };

/**
 * Called on every kill; most kills drop nothing.
 *
 * The three kinds share one roll rather than rolling separately, so adding
 * the blue square did not make the field busier. It comes out of the ammo
 * half and leaves repair exactly as common as it always was.
 */
export function maybeDropPickup(world, x, y) {
  if (Math.random() >= PICKUPS.dropChance) return;
  world.pickups.push({
    x, y,
    kind: pickKind(world),
    life: PICKUPS.life,
    bob: 0,
  });
}

function pickKind(world) {
  if (Math.random() < PICKUPS.repairShare) return "repair";
  // No device fitted, no blue squares: a drop you could never spend is not
  // feedback, it is litter. A full rack still drops, because that *is*
  // feedback — the same way the ammo crate banners FULL rather than vanishing.
  if (!world.player.system) return "ammo";
  return Math.random() < PICKUPS.shieldShare ? "shield" : "ammo";
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
    } else if (p.kind === "shield") {
      const gained = Math.min(
        player.system.resupply, player.system.carried - player.charges,
      );
      player.charges += gained;
      showBanner(world, gained
        ? `+${gained} ${player.system.short}` : `${player.system.short} FULL`, 60);
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

    burst(world, p.x, p.y, 14, PICKUP_COLOUR[p.kind], 4, 4, 26);
    sfx.pickup();
    pickups.splice(i, 1);
  }
}
