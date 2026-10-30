/** Best score persistence. Wrapped because localStorage throws in private mode. */

const KEY = "afterburner.best";

export function loadBest() {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(score) {
  try {
    localStorage.setItem(KEY, String(score));
  } catch {
    /* nothing we can do, and nothing worth breaking the game over */
  }
}
