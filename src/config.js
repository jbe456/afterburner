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

// --- the aircraft ------------------------------------------------------------
/**
 * There is one airframe. What differs is what you bolt to it, and two of those
 * fittings decide how it flies rather than how it shoots.
 *
 * Armour sets how much damage the hull absorbs. Engine sets top speed, and
 * nothing else for now — cruise, stall, turn rate and acceleration are shared,
 * so the engine is purely how fast you can run.
 *
 * Note that neither ladder has a cost attached yet: heavier armour is strictly
 * better than light, and a stronger engine strictly better than a weak one.
 * They are a ladder, not a choice, until something is traded against them.
 */
export const ARMOUR = {
  light: {
    id: "light",
    name: "LIGHT HULL",
    short: "LIGHT",
    maxHp: 70,
  },
  standard: {
    id: "standard",
    name: "STANDARD HULL",
    short: "STANDARD",
    maxHp: 100,
  },
  heavy: {
    id: "heavy",
    name: "ARMOURED HULL",
    short: "ARMOURED",
    maxHp: 150,
  },
};

export const ENGINES = {
  turbofan: {
    id: "turbofan",
    name: "TURBOFAN",
    short: "TURBOFAN",
    maxSpeed: 7.0,
  },
  turbojet: {
    id: "turbojet",
    name: "TURBOJET",
    short: "TURBOJET",
    maxSpeed: 8.5,
  },
  ramjet: {
    id: "ramjet",
    name: "RAMJET",
    short: "RAMJET",
    maxSpeed: 10.2,
  },
};

export const ARMOUR_IDS = Object.keys(ARMOUR);
export const ENGINE_IDS = Object.keys(ENGINES);

/**
 * The airframe itself: everything the fittings do not decide.
 */
export const PLAYER = {
  // Livery. There is only one aircraft, so it only needs one.
  color: "#3f7fd4",
  accent: "#8fd3ff",

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

/**
 * Shots per second. A flamethrower has no discrete shots — it is simply on or
 * off — so its rate is unbounded rather than merely large.
 */
export const cannonRate = (c) =>
  c.kind === "flame" ? Infinity : (1000 / TICK_MS) / c.cooldown;

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
    carried: 30,
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
 * Radius trades against how many you carry, and damage scales with the size
 * of the blast: a stick of dynamite wounds, a B61 erases almost anything. Most
 * run on a fuse; the proximity mine instead waits to be touched.
 * Damage is flat inside the radius and nothing outside it, so the drawn circle
 * means exactly what it looks like.
 *
 * Nothing is immune, including you — a bomb makes no distinction — but nothing
 * is guaranteed dead either, which is what gives the Leviathan the standing of
 * a boss rather than a bigger target. Each fuse is long enough to clear its own
 * blast if you leave immediately.
 */
export const BOMBS = {
  dynamite: {
    id: "dynamite",
    name: "DYNAMITE",
    short: "DYNAMITE",
    carried: 10,
    resupply: 2,
    blastRadius: 200,
    damage: 90,
    fuse: 60,
    dropCooldown: 25,
  },

  mine: {
    id: "mine",
    name: "PROXIMITY MINE",
    short: "MINE",
    carried: 5,
    resupply: 2,
    blastRadius: 260,
    damage: 260,
    /**
     * Never times out. It sits where you left it until something flies into
     * it — yours or theirs, it does not look. `fuse: Infinity` keeps it in
     * the same shape as every other bomb while meaning "waits forever".
     */
    fuse: Infinity,
    trigger: "contact",
    /** How close an aircraft has to come, on top of its own radius. */
    triggerRadius: 46,
    /** Ticks before it is live, so you are not killed by your own drop. */
    armTime: 40,
    dropCooldown: 35,
  },

  mk82: {
    id: "mk82",
    name: "MK 82 HEAVY BOMB",
    short: "MK 82",
    carried: 3,
    resupply: 1,
    blastRadius: 500,
    damage: 220,
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
    damage: 650,
    fuse: 480,
    dropCooldown: 90,
  },
};

/** Shared by every bomb regardless of type. */
export const BOMB = {
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
  armour: "standard",
  engine: "turbojet",
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
 * Each type is a complete profile: how it flies, how it looks, what it shoots
 * and when it starts turning up.
 *
 *   shape       which silhouette from render/hulls.js it wears
 *   fromWave    earliest wave it can be drawn in
 *   weight      how often it is drawn once unlocked
 *   maxPerWave  cap for the ones that would otherwise arrive in packs
 *   barrels     rounds per burst
 *   missile     if present, it launches homing missiles at the player
 *   bomb        if present, it leaves bombs behind it
 *
 * Enemy bombs are the same indiscriminate weapon the player carries: they do
 * not check sides, so a Sower will happily gut its own escort. Luring a wave
 * across a minefield is a legitimate tactic.
 */
export const ENEMY_TYPES = {
  scout: {
    name: "Scout", shape: "jet",
    hp: 16, speed: 6.2, turn: 0.058, radius: 12,
    color: "#cf9a7a", accent: "#f0d3bd",
    range: 600, fireCd: 44, spread: 0.13, damage: 5, score: 60, scale: 0.8,
    fromWave: 1, weight: 3,
  },

  fighter: {
    name: "Fighter", shape: "jet",
    hp: 30, speed: 4.0, turn: 0.034, radius: 15,
    color: "#d9534f", accent: "#ff9a8b",
    range: 720, fireCd: 34, spread: 0.10, damage: 7, score: 100, scale: 1,
    fromWave: 1, weight: 5,
  },

  midge: {
    name: "Midge", shape: "midge",
    hp: 8, speed: 7.4, turn: 0.075, radius: 8,
    color: "#b5c94a", accent: "#e9ff9e",
    range: 420, fireCd: 55, spread: 0.20, damage: 3, score: 30, scale: 0.9,
    /**
     * Released in clouds rather than ones and twos: a single draw puts this
     * many in the air at once, arriving together and from the same bearing.
     * Individually trivial — one burst kills one — but seven of them circling
     * is a real problem, because nothing this small can be led easily.
     */
    swarm: 7,
    trail: 9,
    fromWave: 2, weight: 2, maxPerWave: 2,
  },

  moucheron: {
    name: "Moucheron", shape: "midge",
    hp: 2, speed: 8.0, turn: 0.088, radius: 6,
    color: "#9fb84a", accent: "#dcf59a",
    range: 300, fireCd: 70, spread: 0.26, damage: 1, score: 10, scale: 0.6,
    /**
     * Thirty at once. Nothing in the game is individually less dangerous — a
     * single round kills one and one of theirs barely scratches you — but
     * thirty of them fill the sky, and they are the fastest and tightest
     * turning things flying. Capped at one draw: sixty would be a slideshow,
     * not a fight.
     */
    swarm: 30,
    /** Short contrails: thirty full-length ones is a lot of line for nothing. */
    trail: 5,
    fromWave: 6, weight: 1, maxPerWave: 1,
  },

  raider: {
    name: "Raider", shape: "jet",
    hp: 24, speed: 5.4, turn: 0.048, radius: 14,
    color: "#d96a3d", accent: "#ffbb8a",
    range: 660, fireCd: 30, spread: 0.12, damage: 6, score: 120, scale: 0.92,
    fromWave: 2, weight: 4,
  },

  ace: {
    name: "Ace", shape: "jet",
    hp: 45, speed: 5.6, turn: 0.050, radius: 15,
    color: "#e8a33d", accent: "#ffe08a",
    range: 780, fireCd: 26, spread: 0.055, damage: 8, score: 300, scale: 1,
    fromWave: 3, weight: 3,
  },

  interceptor: {
    name: "Interceptor", shape: "dart",
    hp: 55, speed: 5.0, turn: 0.040, radius: 16,
    color: "#e0609a", accent: "#ffb3d4",
    range: 1050, fireCd: 30, spread: 0.045, damage: 10, bulletSpeed: 15,
    score: 350, scale: 1.05,
    fromWave: 4, weight: 3,
  },

  heavy: {
    name: "Heavy", shape: "brick",
    hp: 90, speed: 2.9, turn: 0.019, radius: 22,
    color: "#8b6ad6", accent: "#c0a9ff",
    range: 860, fireCd: 22, spread: 0.14, damage: 9, score: 250, scale: 1.2,
    fromWave: 4, weight: 2,
  },

  lancer: {
    name: "Lancer", shape: "dart",
    hp: 70, speed: 4.4, turn: 0.030, radius: 17,
    color: "#c05fd6", accent: "#edb0ff",
    range: 760, fireCd: 48, spread: 0.09, damage: 6,
    score: 450, scale: 1.1,
    // A stand-off platform: weak guns, but it throws missiles from range.
    missile: { cooldown: 170, range: 1700, cone: 0.5, damage: 26, turnRate: 0.055,
               speed: 5, accel: 0.22, maxSpeed: 11, life: 260, hitRadius: 16, salvo: 1 },
    fromWave: 5, weight: 2,
  },

  gunship: {
    name: "Gunship", shape: "gunship",
    hp: 140, speed: 2.6, turn: 0.017, radius: 25,
    color: "#6f4fd6", accent: "#b9a6ff",
    range: 900, fireCd: 14, spread: 0.17, damage: 8, barrels: 2,
    score: 500, scale: 1.25,
    fromWave: 6, weight: 2,
  },

  sower: {
    name: "Sower", shape: "brick",
    hp: 110, speed: 3.6, turn: 0.026, radius: 21,
    color: "#5f8f4f", accent: "#bfe8a8",
    range: 700, fireCd: 40, spread: 0.15, damage: 6,
    score: 420, scale: 1.15,
    /**
     * Seeds proximity mines along its track — the same weapon the player can
     * carry, and just as indifferent to whose side you are on. The long fuse
     * is a self-clearing timeout, not a countdown: they go off on contact
     * long before it expires, or quietly clear themselves if nothing finds
     * them.
     */
    bomb: {
      cooldown: 150, blastRadius: 300, damage: 130,
      fuse: 1800, trigger: "contact", triggerRadius: 44, armTime: 40,
    },
    fromWave: 7, weight: 2,
  },

  marauder: {
    name: "Marauder", shape: "claw",
    hp: 260, speed: 3.4, turn: 0.024, radius: 30,
    color: "#9b2c2c", accent: "#ff7a6b",
    range: 1000, fireCd: 18, spread: 0.08, damage: 13, barrels: 2, bulletSpeed: 13,
    score: 900, scale: 1.5,
    fromWave: 8, weight: 1, maxPerWave: 2,
  },

  reaper: {
    name: "Reaper", shape: "claw",
    hp: 150, speed: 5.2, turn: 0.044, radius: 22,
    color: "#b03a6e", accent: "#ff9ec4",
    range: 820, fireCd: 24, spread: 0.07, damage: 9,
    score: 700, scale: 1.2,
    // Fast, and it shoots back with missiles while it runs you down.
    missile: { cooldown: 200, range: 1300, cone: 0.35, damage: 30, turnRate: 0.075,
               speed: 6, accel: 0.26, maxSpeed: 13, life: 220, hitRadius: 16, salvo: 1 },
    fromWave: 9, weight: 2,
  },

  basilisk: {
    name: "Basilisk", shape: "wraith",
    hp: 340, speed: 3.0, turn: 0.020, radius: 32,
    color: "#3d2a6e", accent: "#9b7aff",
    range: 1100, fireCd: 20, spread: 0.09, damage: 11, barrels: 2, bulletSpeed: 14,
    score: 1200, scale: 1.5,
    missile: { cooldown: 190, range: 1600, cone: 0.45, damage: 34, turnRate: 0.07,
               speed: 5, accel: 0.24, maxSpeed: 12, life: 270, hitRadius: 18, salvo: 2 },
    fromWave: 12, weight: 1, maxPerWave: 2,
  },

  dreadnought: {
    name: "Dreadnought", shape: "wraith",
    hp: 420, speed: 2.4, turn: 0.014, radius: 38,
    color: "#5a1f6e", accent: "#e39bff",
    range: 1200, fireCd: 16, spread: 0.11, damage: 10, barrels: 3, bulletSpeed: 14,
    score: 1800, scale: 1.75,
    fromWave: 11, weight: 1, maxPerWave: 1,
  },

  leviathan: {
    name: "Leviathan", shape: "leviathan",
    hp: 700, speed: 2.2, turn: 0.012, radius: 48,
    color: "#2a1038", accent: "#ff5ea8",
    range: 1350, fireCd: 15, spread: 0.10, damage: 11, barrels: 3, bulletSpeed: 15,
    score: 4000, scale: 1.9,
    // Everything at once: guns, missiles, and mines in its wake.
    missile: { cooldown: 150, range: 1800, cone: 0.6, damage: 38, turnRate: 0.08,
               speed: 5, accel: 0.26, maxSpeed: 13, life: 300, hitRadius: 20, salvo: 2 },
    /** Timed bombs rather than mines: it carpets ground it is about to leave. */
    bomb: { cooldown: 220, blastRadius: 420, damage: 180, fuse: 300 },
    fromWave: 15, weight: 1, maxPerWave: 1,
  },
};

export const ENEMY_TYPE_IDS = Object.keys(ENEMY_TYPES);

/** Peak gun damage per second a type can put out, if every round connects. */
export const enemyDps = (t) => ((t.barrels ?? 1) * t.damage * (1000 / TICK_MS)) / t.fireCd;

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
  maxCount: 13,
  /** Ticks between one wave clearing and the next spawning. */
  interval: 150,
  /** Ticks between individual spawns inside a wave. */
  spawnStagger: 16,
  /** Much tighter, so a swarm arrives as one cloud rather than a queue. */
  swarmStagger: 3,
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
