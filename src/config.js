/**
 * Every number that decides how the game *feels* lives here, so balance can be
 * tuned without reading a line of simulation code.
 */

/** The simulation runs on a fixed step, independent of display refresh rate. */
export const TICK_MS = 1000 / 60;

// --- arena ------------------------------------------------------------------
export const ARENA_SIZE = 7000; // square, centred on (0, 0)
export const ARENA_HALF = ARENA_SIZE / 2;
/** Past this distance from centre the hull bleeds. */
export const ARENA_DAMAGE_EDGE = ARENA_HALF - 120;
/** Past this distance the HUD starts warning — deliberately much earlier. */
export const ARENA_WARN_EDGE = ARENA_HALF - 1000;
export const EDGE_DAMAGE_PER_TICK = 0.16; // ~9.6 hp/sec

// --- playable airframes -----------------------------------------------------
/**
 * The four jets the player can choose from.
 *
 * These are deliberately balanced so that no airframe beats another on every
 * axis — each one wins some comparisons and loses others. The axes are hull,
 * top speed, agility (turn rate), firepower (sustained DPS), missile load and
 * hitbox size. Before changing a number, check the plane still *loses* to each
 * of the others at something.
 *
 * Note that agility interacts with speed: see player.js, where turn rate is
 * scaled by how slowly you are flying. A low `minSpeed` is therefore an
 * agility stat in disguise.
 */
export const PLANES = {
  viper: {
    id: "viper",
    name: "VIPER",
    role: "Interceptor",
    blurb: "No weaknesses, no records. Forgiving to fly.",
    color: "#3f7fd4", accent: "#8fd3ff", scale: 1.05,
    maxHp: 100, radius: 16,
    minSpeed: 2.2, cruiseSpeed: 4.6, maxSpeed: 8.5,
    turnRate: 0.052, accel: 0.085, brake: 0.14,
    gunCooldown: 5, gunDamage: 9, gunSpread: 0.012, bulletSpeed: 15,
    maxMissiles: 6, missileCooldown: 42,
  },

  wraith: {
    id: "wraith",
    name: "WRAITH",
    role: "Knife-fighter",
    blurb: "Turns inside anything, and a small target. Folds if they catch you.",
    color: "#35c99a", accent: "#9ff0d0", scale: 0.85,
    maxHp: 70, radius: 13,
    minSpeed: 1.8, cruiseSpeed: 4.3, maxSpeed: 7.6,
    turnRate: 0.068, accel: 0.10, brake: 0.17,
    gunCooldown: 6, gunDamage: 7, gunSpread: 0.020, bulletSpeed: 14,
    maxMissiles: 4, missileCooldown: 48,
  },

  bastion: {
    id: "bastion",
    name: "BASTION",
    role: "Gunship",
    blurb: "Hits hardest, soaks the most. A big, slow target.",
    color: "#6b7f9e", accent: "#b9cce4", scale: 1.31,
    maxHp: 150, radius: 20,
    minSpeed: 2.4, cruiseSpeed: 4.0, maxSpeed: 7.0,
    turnRate: 0.036, accel: 0.06, brake: 0.11,
    gunCooldown: 5, gunDamage: 12, gunSpread: 0.020, bulletSpeed: 15,
    maxMissiles: 9, missileCooldown: 34,
  },

  sabre: {
    id: "sabre",
    name: "SABRE",
    role: "Energy fighter",
    blurb: "Fastest guns and airframe. Bleeds energy in a turn fight.",
    color: "#2fb0d4", accent: "#9fe4ff", scale: 0.98,
    maxHp: 85, radius: 15,
    minSpeed: 2.8, cruiseSpeed: 5.4, maxSpeed: 10.2,
    turnRate: 0.046, accel: 0.11, brake: 0.12,
    gunCooldown: 4, gunDamage: 8, gunSpread: 0.010, bulletSpeed: 18,
    maxMissiles: 5, missileCooldown: 38,
  },
};

export const PLANE_IDS = Object.keys(PLANES);
export const DEFAULT_PLANE = "viper";

/** Sustained cannon damage per tick — the player fires two barrels at once. */
export const planeDps = (plane) => (2 * plane.gunDamage) / plane.gunCooldown;

/** Properties every airframe shares. */
export const PLAYER = {
  bulletLife: 60,
  /** Ticks of spawn protection, during which the jet blinks. */
  spawnInvuln: 90,
  trailLength: 26,
};

export const MISSILE = {
  turnRate: 0.085,
  accel: 0.26,
  maxSpeed: 13,
  life: 230,
  /** Ticks before the warhead arms, so it can't detonate on the launch rail. */
  armingDelay: 10,
  directDamage: 70,
  splashDamage: 30,
  splashRadius: 110,
  hitRadius: 16,
};

/** Missile lock-on, acquired by holding a target inside a forward cone. */
export const LOCK = {
  cone: 0.44,
  range: 1500,
  /** Ticks of continuous tracking before the lock goes solid. */
  ticksToSolid: 30,
};

// --- enemies ----------------------------------------------------------------
/**
 * Each type is a complete behavioural profile. `range`/`fireCd`/`spread`
 * govern how dangerous it is; `turn`/`speed` govern how hard it is to shake.
 */
export const ENEMY_TYPES = {
  fighter: {
    hp: 30, speed: 4.0, turn: 0.034, radius: 15,
    color: "#d9534f", accent: "#ff9a8b",
    range: 720, fireCd: 34, spread: 0.10, damage: 7, score: 100, scale: 1,
  },
  heavy: {
    hp: 90, speed: 2.9, turn: 0.019, radius: 22,
    color: "#8b6ad6", accent: "#c0a9ff",
    range: 860, fireCd: 22, spread: 0.14, damage: 9, score: 250, scale: 1.35,
  },
  ace: {
    hp: 45, speed: 5.6, turn: 0.050, radius: 15,
    color: "#e8a33d", accent: "#ffe08a",
    range: 780, fireCd: 26, spread: 0.055, damage: 8, score: 300, scale: 1,
  },
};

export const ENEMY = {
  bulletSpeed: 11,
  bulletLife: 70,
  /** Enemies spawn on a ring this far from the player. */
  spawnDistance: [1500, 2300],
  /** How far ahead of the player they aim, in ticks of player travel. */
  maxLeadTicks: 32,
  /** Firing cone: they only shoot when the player is near their boresight. */
  fireCone: 0.17,
  /** Closer than this and they disengage rather than collide. */
  breakDistance: 260,
  /** Further than this and they commit to a straight-line chase. */
  chaseDistance: 1700,
};

// --- waves ------------------------------------------------------------------
export const WAVES = {
  /** Enemies in wave n = min(base + n * growth, max). */
  baseCount: 3,
  growth: 0.9,
  maxCount: 11,
  /** Ticks between one wave clearing and the next spawning. */
  interval: 150,
  /** Ticks between individual spawns inside a wave. */
  spawnStagger: 16,
  heavyFromWave: 3,
  aceFromWave: 5,
};

// --- pickups ----------------------------------------------------------------
export const PICKUPS = {
  dropChance: 0.28,
  /** Odds a drop is repair rather than ammo. */
  repairShare: 0.6,
  repairAmount: 30,
  ammoAmount: 3,
  life: 700,
  pickupRadius: 42,
};
