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

/** Remembers the last airframe flown, so the hangar opens on your favourite. */
export const loadPlane = () => read(PLANE_KEY);
export const savePlane = (id) => write(PLANE_KEY, id);
