/**
 * Every number that decides how the game *feels* lives here, so balance can be
 * tuned without reading a line of simulation code.
 */

/** The simulation runs on a fixed step, independent of display refresh rate. */
export const TICK_MS = 1000 / 60;

/**
 * Converts the simulation's speed unit into km/h for the HUD.
 *
 * Speeds are stored as world units per tick. Treating one world unit as one
 * metre: units/tick x 60 ticks/s = m/s, x 3.6 = km/h. That puts the jets
 * between roughly 475 km/h at a crawl and 2200 km/h flat out, which is about
 * right for the aircraft they are pretending to be.
 */
export const KMH_PER_SPEED_UNIT = (1000 / TICK_MS) * 3.6;

/**
 * World distance covered by the radar's outer ring. The AMRAAM's acquisition
 * range is this same number, so "if it is on the radar, it can be shot" is a
 * guarantee rather than a coincidence.
 */
export const RADAR_RANGE = 2600;

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
    color: "#3f7fd4", accent: "#8fd3ff",
    maxHp: 100,
    maxSpeed: 8.5,
  },

  bastion: {
    id: "bastion",
    name: "BASTION",
    role: "Armoured",
    color: "#6b7f9e", accent: "#b9cce4",
    maxHp: 150,
    maxSpeed: 7.0,
  },

  sabre: {
    id: "sabre",
    name: "SABRE",
    role: "Fast",
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
  // Handling, identical on every airframe. Weapons live in CANNONS /
  // MISSILES / BOMBS above, because they are chosen separately now.
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

// --- cannons ----------------------------------------------------------------
/**
 * Three guns, each best at something the others are worst at: Vulcan wins a
 * one-on-one, Avenger wins a lineup, Firebelt wins against a pack.
 *
 * `pierce` is how many aircraft one round can pass through. `burn` ignites
 * what it hits, dealing damage over time that keeps running after you have
 * broken off — which is why Firebelt's direct damage is so low.
 */
export const CANNONS = {
  vulcan: {
    id: "vulcan",
    name: "VULCAN RAPID-FIRE",
    short: "VULCAN",
    kind: "bullet",
    barrels: 2,
    damage: 9,
    cooldown: 5,
    spread: 0.012,
    bulletSpeed: 15,
    bulletLife: 60,
    pierce: 1,
    burn: null,
    tracer: "#aef5ff",
    tracerWidth: 3.2,
  },

  avenger: {
    id: "avenger",
    name: "AVENGER PIERCING",
    short: "AVENGER",
    kind: "bullet",
    barrels: 1,
    damage: 48,
    cooldown: 18,
    spread: 0.002,
    bulletSpeed: 26,
    bulletLife: 70,
    pierce: 3,
    burn: null,
    tracer: "#ffe08a",
    tracerWidth: 4.4,
  },

  firebelt: {
    id: "firebelt",
    name: "FIREBELT FLAMETHROWER",
    short: "FIREBELT",
    /** Not a gun: it sprays a cone that sets light to everything inside it. */
    kind: "flame",
    /**
     * The flame does no damage of its own — it only ignites. Everything this
     * weapon kills, the fire kills.
     */
    damage: 0,
    cooldown: 1,
    /** How far the cone reaches, and its half-angle in radians. */
    range: 260,
    coneHalfAngle: 0.30,
    pierce: 1,
    /** Damage per second while alight, and how long it burns after leaving the flame. */
    burn: { dps: 100, duration: 48 },
  },
};

/**
 * Sustained damage per second on one target, counting any fire the weapon
 * leaves behind. The Firebelt's whole output is that fire, so splitting the
 * two apart would only make it look weaker than it is.
 */
export const cannonDps = (c) => {
  const direct = ((c.kind === "flame" ? c.damage : c.barrels * c.damage) * (1000 / TICK_MS)) / c.cooldown;
  return direct + (c.burn ? c.burn.dps : 0);
};

/** Ticks of damage that keep landing after the weapon stops touching a target. */
export const cannonLingering = (c) => (c.burn ? c.burn.duration : 0);

/** How far the weapon can actually hurt something, in world units. */
export const cannonReach = (c) =>
  c.kind === "flame" ? c.range : c.bulletSpeed * c.bulletLife;

// --- missiles ---------------------------------------------------------------
/**
 * The axis here is guidance against quantity: a pod of unguided rockets you
 * aim yourself, a dependable IR missile, or three radar shots that delete
 * whatever they touch but will not leave the rail without a solid lock.
 */
export const MISSILES = {
  hydra: {
    id: "hydra",
    name: "HYDRA ROCKET POD",
    short: "HYDRA",
    carried: 18,
    resupply: 6,
    perShot: 2,
    cooldown: 14,
    damage: 28,
    splashDamage: 12,
    splashRadius: 70,
    /** 0 means it flies dead straight. */
    turnRate: 0,
    /** Unguided: it acquires nothing and goes where it was pointed. */
    acquireRange: 0,
    acquireCone: 0,
    launchSpeed: 6,
    accel: 0.4,
    maxSpeed: 16,
    life: 150,
    hitRadius: 12,
  },

  sidewinder: {
    id: "sidewinder",
    name: "SIDEWINDER HEAT-SEEKER",
    short: "AIM-9",
    carried: 6,
    resupply: 3,
    perShot: 1,
    cooldown: 42,
    damage: 70,
    splashDamage: 30,
    splashRadius: 110,
    turnRate: 0.085,
    /** Seeks forward only, and not far — point it roughly at something. */
    acquireRange: 900,
    acquireCone: 0.9,
    launchSpeed: 5,
    accel: 0.26,
    maxSpeed: 13,
    life: 230,
    hitRadius: 16,
  },

  amraam: {
    id: "amraam",
    name: "AMRAAM ALL-ASPECT",
    short: "AMRAAM",
    carried: 3,
    resupply: 1,
    perShot: 1,
    cooldown: 55,
    damage: 150,
    splashDamage: 70,
    splashRadius: 190,
    turnRate: 0.15,
    /**
     * All-aspect: acquires anything on the radar regardless of bearing, so it
     * can be fired over your shoulder at something chasing you.
     */
    acquireRange: RADAR_RANGE,
    acquireCone: Math.PI,
    launchSpeed: 5,
    accel: 0.3,
    maxSpeed: 15,
    life: 300,
    hitRadius: 18,
  },
};

/** Shared by every missile regardless of type. */
export const MISSILE = {
  /** Ticks before the warhead arms, so it can't detonate on the launch rail. */
  armingDelay: 10,
};

// --- bombs ------------------------------------------------------------------
/**
 * Dropped in place rather than fired: it sits still, then levels everything
 * inside its blast radius — enemy jets and your own alike.
 *
 * Radius trades against how many you carry. Every one of them stays lethal
 * inside its radius, so the choice is how much ground you erase and how often,
 * never whether you survive standing in it. Each fuse is long enough to clear
 * its own blast if you leave immediately; the B61 is deliberately tight about
 * it if you dawdle at minimum throttle.
 */
export const BOMBS = {
  dynamite: {
    id: "dynamite",
    name: "DYNAMITE",
    short: "DYNAMITE",
    carried: 6,
    resupply: 2,
    blastRadius: 200,
    fuse: 120,
    dropCooldown: 25,
  },

  mk82: {
    id: "mk82",
    name: "MK 82 HEAVY BOMB",
    short: "MK 82",
    carried: 3,
    resupply: 1,
    blastRadius: 500,
    fuse: 300,
    dropCooldown: 45,
  },

  b61: {
    id: "b61",
    name: "B61 NUCLEAR",
    short: "B61",
    carried: 1,
    resupply: 1,
    blastRadius: 1000,
    fuse: 480,
    dropCooldown: 90,
  },
};

/** Shared by every bomb regardless of type. */
export const BOMB = {
  /** Lethal to any airframe, friend or foe — there is no partial damage. */
  damage: 999,
  /** Ticks between fuse beeps early on; it accelerates as detonation nears. */
  slowBeepInterval: 60,
  fastBeepInterval: 10,
};

// --- loadout ----------------------------------------------------------------
export const CANNON_IDS = Object.keys(CANNONS);
export const MISSILE_IDS = Object.keys(MISSILES);
export const BOMB_IDS = Object.keys(BOMBS);

/** What a pilot flies with before they touch anything in the hangar. */
export const DEFAULT_LOADOUT = {
  plane: "viper",
  cannon: "vulcan",
  missile: "sidewinder",
  bomb: "mk82",
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
  /** Crates top up by the amount each weapon type defines as its `resupply`. */
  life: 700,
  pickupRadius: 42,
};
