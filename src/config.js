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
 * The three jets the player can choose from.
 *
 * An airframe differs from the others in exactly two numbers: how much damage
 * it absorbs and how fast it can go. Everything else — weapons, turn rate,
 * acceleration, hitbox, cruise and stall speed — is shared, and lives in
 * PLAYER below.
 *
 * The roster is a straight line through that pair: one plane sits in the
 * middle, one trades speed for hull, one trades hull for speed. No plane is
 * better than another at both, which `npm test` enforces.
 */
export const PLANES = {
  viper: {
    id: "viper",
    name: "VIPER",
    role: "Balanced",
    blurb: "Middle of the road on both counts.",
    color: "#3f7fd4", accent: "#8fd3ff",
    maxHp: 100,
    maxSpeed: 8.5,
  },

  bastion: {
    id: "bastion",
    name: "BASTION",
    role: "Armoured",
    blurb: "Half again the hull. Slowest thing in the air.",
    color: "#6b7f9e", accent: "#b9cce4",
    maxHp: 150,
    maxSpeed: 7.0,
  },

  sabre: {
    id: "sabre",
    name: "SABRE",
    role: "Fast",
    blurb: "Fastest thing in the air. Thinnest skin.",
    color: "#2fb0d4", accent: "#9fe4ff",
    maxHp: 70,
    maxSpeed: 10.2,
  },
};

export const PLANE_IDS = Object.keys(PLANES);
export const DEFAULT_PLANE = "viper";

/**
 * Everything that is the same whichever jet you chose.
 *
 * Only hull and top speed live on the airframes themselves; every other
 * number is here, so there is one place to tune how the player's jet feels
 * and exactly one pair of numbers that distinguishes the planes.
 */
export const PLAYER = {
  // Cannon — two barrels firing together.
  gunCooldown: 5,
  gunDamage: 9,
  gunSpread: 0.012,
  bulletSpeed: 15,
  bulletLife: 60,

  // Missiles
  maxMissiles: 6,
  missileCooldown: 42,

  // Handling, identical on every airframe.
  minSpeed: 2.2,
  cruiseSpeed: 4.6,
  /** Base turn rate; player.js scales it by how slowly you are flying. */
  turnRate: 0.052,
  /**
   * Airspeed at which the turn-rate penalty is measured. Shared rather than
   * each plane's own top speed, so two jets at the same airspeed corner
   * identically — otherwise the faster airframe would quietly also be the
   * more agile one at any given speed.
   */
  agilityReferenceSpeed: 8.5,
  accel: 0.085,
  brake: 0.14,

  // Hitbox and the drawn size that matches it.
  radius: 16,
  scale: 1.05,

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

/**
 * The bomb: dropped in place rather than fired, sits still, then levels
 * everything inside its blast radius — enemy jets and your own alike.
 *
 * The fuse is long and the radius is survivable only if you leave: at cruise
 * speed five seconds buys well over 1000 units of separation, so clearing a
 * 500-unit blast is easy *if* you commit to running the moment you drop it.
 * Dropping one mid-turn, or to kill something already on your tail, is how it
 * kills you too. That tension is the whole point of the weapon.
 */
export const BOMB = {
  /** Five seconds at 60 Hz. */
  fuse: 300,
  blastRadius: 500,
  /** Lethal to any airframe, friend or foe — there is no partial damage. */
  damage: 999,
  maxCarried: 3,
  /** Ticks between drops, so the whole rack can't be emptied on one spot. */
  dropCooldown: 45,
  /** Ticks between fuse beeps early on; it accelerates as detonation nears. */
  slowBeepInterval: 60,
  fastBeepInterval: 10,
  /** Within this much of the fuse ending, the warning goes solid red. */
  panicTicks: 90,
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
  bombAmount: 1,
  life: 700,
  pickupRadius: 42,
};
