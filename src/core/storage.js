/**
 * Small persisted preferences. Every call is wrapped because localStorage
 * throws outright in private-browsing modes rather than failing softly.
 */

const BEST_KEY = "afterburner.best";
const PLANE_KEY = "afterburner.plane";

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* nothing we can do, and nothing worth breaking the game over */
  }
}

export const loadBest = () => Number(read(BEST_KEY)) || 0;
export const saveBest = (score) => write(BEST_KEY, String(score));

/**
 * Remembers the last loadout flown, so the hangar opens on your favourite.
 * Stored as four separate keys rather than one blob, so a single unreadable
 * value cannot take the rest with it.
 */
const SLOT_KEYS = {
  plane: PLANE_KEY,
  cannon: "afterburner.cannon",
  missile: "afterburner.missile",
  bomb: "afterburner.bomb",
};

export function loadLoadout() {
  const out = {};
  for (const [slot, key] of Object.entries(SLOT_KEYS)) {
    const value = read(key);
    if (value) out[slot] = value;
  }
  return out;
}

export const saveLoadoutSlot = (slot, id) => write(SLOT_KEYS[slot], id);
