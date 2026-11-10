/**
 * Small persisted preferences. Every call is wrapped because localStorage
 * throws outright in private-browsing modes rather than failing softly.
 */

const BEST_KEY = "afterburner.best";

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
/**
 * Named fittings are stored as ids; weapon properties as rung numbers under
 * "track.property" keys. Both go in the same namespace, one key per slot, so
 * one unreadable value cannot take the rest with it.
 */
const key = (slot) => `afterburner.${slot}`;

export function loadLoadout(slots) {
  const out = {};
  for (const slot of slots) {
    const value = read(key(slot));
    if (value === null) continue;
    // A rung index round-trips as a string; a fitting id does not.
    out[slot] = /^\d+$/.test(value) ? Number(value) : value;
  }
  return out;
}

export const saveLoadoutSlot = (slot, id) => write(key(slot), String(id));
