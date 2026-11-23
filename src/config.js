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
  scout: {
    id: "scout",
    name: "SCOUT HULL",
    short: "SCOUT",
    maxHp: 50,
  },
  vanguard: {
    id: "vanguard",
    name: "VANGUARD HULL",
    short: "VANGUARD",
    maxHp: 75,
  },
  sentinel: {
    id: "sentinel",
    name: "SENTINEL HULL",
    short: "SENTINEL",
    maxHp: 100,
  },
  ironclad: {
    id: "ironclad",
    name: "IRONCLAD HULL",
    short: "IRONCLAD",
    maxHp: 150,
  },
  bastion: {
    id: "bastion",
    name: "BASTION HULL",
    short: "BASTION",
    maxHp: 225,
  },
  juggernaut: {
    id: "juggernaut",
    name: "JUGGERNAUT HULL",
    short: "JUGGERNAUT",
    maxHp: 325,
  },
  dreadnought: {
    id: "dreadnought",
    name: "DREADNOUGHT HULL",
    short: "DREADNOUGHT",
    maxHp: 450,
  },
  titan: {
    id: "titan",
    name: "TITAN HULL",
    short: "TITAN",
    maxHp: 600,
  },
  leviathan: {
    id: "leviathan",
    name: "LEVIATHAN HULL",
    short: "LEVIATHAN",
    maxHp: 800,
  },
  aegis: {
    id: "aegis",
    name: "AEGIS PRIME HULL",
    short: "AEGIS",
    maxHp: 1000,
  },
};

export const ENGINES = {
  spark: {
    id: "spark",
    name: "SPARK DRIVE",
    short: "SPARK",
    maxSpeed: 5.0,
  },
  kestrel: {
    id: "kestrel",
    name: "KESTREL TURBOFAN",
    short: "KESTREL",
    maxSpeed: 6.5,
  },
  falcon: {
    id: "falcon",
    name: "FALCON TURBOJET",
    short: "FALCON",
    maxSpeed: 8.0,
  },
  viper: {
    id: "viper",
    name: "VIPER RAMJET",
    short: "VIPER",
    maxSpeed: 9.5,
  },
  tempest: {
    id: "tempest",
    name: "TEMPEST SCRAMJET",
    short: "TEMPEST",
    maxSpeed: 11.0,
  },
  inferno: {
    id: "inferno",
    name: "INFERNO PLASMA DRIVE",
    short: "INFERNO",
    maxSpeed: 12.5,
  },
  nova: {
    id: "nova",
    name: "NOVA FUSION DRIVE",
    short: "NOVA",
    maxSpeed: 14.0,
  },
  phantom: {
    id: "phantom",
    name: "PHANTOM ION DRIVE",
    short: "PHANTOM",
    maxSpeed: 16.0,
  },
  pulsar: {
    id: "pulsar",
    name: "PULSAR ANTIMATTER DRIVE",
    short: "PULSAR",
    maxSpeed: 18.0,
  },
  singularity: {
    id: "singularity",
    name: "SINGULARITY DRIVE",
    short: "SINGULARITY",
    maxSpeed: 20.0,
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
  /**
   * Floor under that scaling. Without it a fast enough engine drives the
   * factor to zero and then negative, which does not merely stop the turn —
   * it reverses it, so the stick works backwards. The formula crosses zero at
   * 2.7x the reference speed, which the engine ladder can now reach.
   */
  minAgilityFactor: 0.3,
  accel: 0.085,
  brake: 0.14,

  // Hitbox and the drawn size that matches it.
  radius: 16,
  scale: 1.05,

  /** Ticks of spawn protection, during which the jet blinks. */
  spawnInvuln: 90,
  trailLength: 26,
};

// --- forward weapons --------------------------------------------------------
/**
 * Evenly spaced rungs between two endpoints, rounded to something readable.
 * The endpoints are always exact; only the rungs between them are rounded.
 */
function steps(from, to, count, round = 1) {
  const out = Array.from({ length: count }, (_, i) => {
    const raw = from + ((to - from) * i) / (count - 1);
    return Math.round(raw / round) * round;
  });
  out[0] = from;
  out[count - 1] = to;
  return out;
}

/**
 * Three forward weapons. You carry exactly one — picking a different one puts
 * the other away rather than adding to it.
 *
 *   cannon  bullets from the wings, in pairs
 *   flame   a cone from the nose
 *   laser   a beam from the nose
 *
 * Each is a set of properties rather than a choice between models, and each
 * property is its own five-rung ladder generated from its endpoints. Rungs are
 * stored per weapon and kept when you switch away, so coming back to a weapon
 * restores what it was at rather than starting over.
 */
export const WEAPONS = {
  cannon: {
    label: "CANNON",
    blurb: "Bullets, from the wings",
    props: {
      type: {
        label: "TYPE",
        tiers: [1, 3],
        format: (v) => (v > 1 ? `PIERCES ${v}` : "REGULAR"),
      },
      slots: {
        label: "SLOTS",
        tiers: [2, 3, 4],
        format: (v) => `${v}`,
      },
      damage: {
        label: "DAMAGE",
        tiers: [4, 6, 8, 10],
        format: (v) => `${v}`,
      },
      reach: {
        label: "REACH",
        tiers: steps(250, 1500, 5, 50),
        format: (v) => `${v} m`,
      },
      rate: {
        label: "RATE",
        tiers: steps(2, 5, 5, 0.5),
        format: (v) => `${v}/s`,
      },
    },
  },

  flame: {
    label: "FLAME",
    blurb: "A cone from the nose",
    props: {
      damage: {
        label: "DAMAGE",
        tiers: steps(20, 240, 5, 5),
        format: (v) => `${v}/s`,
      },
      reach: {
        label: "REACH",
        tiers: steps(120, 450, 5, 10),
        format: (v) => `${v} m`,
      },
    },
  },

  laser: {
    label: "LASER",
    blurb: "A beam from the nose",
    props: {
      damage: {
        label: "DAMAGE",
        tiers: steps(15, 170, 5, 5),
        format: (v) => `${v}/s`,
      },
      reach: {
        label: "REACH",
        tiers: steps(600, 2400, 5, 50),
        format: (v) => `${v} m`,
      },
    },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

/**
 * Turn a loadout's rung indices into the concrete numbers the simulation
 * uses. Everything downstream reads this, so nothing else needs to know that
 * these came from ladders.
 */
export function resolveWeapons(loadout) {
  const value = (track, prop) => {
    const tiers = WEAPONS[track].props[prop].tiers;
    const rung = loadout[`${track}.${prop}`] ?? 0;
    return tiers[Math.min(Math.max(rung, 0), tiers.length - 1)];
  };

  // Exactly one is fitted; the others resolve to null however their ladders
  // happen to be set, so nothing downstream re-checks the selection.
  const fitted = WEAPONS[loadout.weapon] ? loadout.weapon : "cannon";

  const rate = value("cannon", "rate");
  const reach = value("cannon", "reach");

  return {
    weapon: fitted,

    cannon: fitted !== "cannon" ? null : {
      pierce: value("cannon", "type"),
      slots: value("cannon", "slots"),
      damage: value("cannon", "damage"),
      reach,
      rate,
      /** Ticks between bursts, from the shots-per-second rung. */
      cooldown: Math.max(1, Math.round((1000 / TICK_MS) / rate)),
      /** Ticks a round survives, so it dies exactly at its reach. */
      bulletLife: Math.max(1, Math.round(reach / CANNON.bulletSpeed)),
    },

    flame: fitted !== "flame" ? null
      : { damage: value("flame", "damage"), range: value("flame", "reach") },

    laser: fitted !== "laser" ? null
      : { damage: value("laser", "damage"), range: value("laser", "reach") },
  };
}

/** Shared by every forward weapon, whatever its properties are set to. */
export const CANNON = {
  bulletSpeed: 18,
  spread: 0.014,
  tracer: "#aef5ff",
  tracerWidth: 3.2,
  /** Piercing rounds are heavier and hotter, and have to read that way. */
  pierceTracer: "#ffd98a",
  pierceTracerWidth: 5.4,
  /** Half-angle of the flame cone, in radians: 48 degrees across. Wide is
      the flame's half of the bargain for having to fight at 450 m. */
  flameConeHalfAngle: 0.42,
  /** How wide a target counts as touching the laser beam. */
  laserHalfWidth: 7,
  /** Ticks a target keeps burning after leaving flame or beam. */
  burnDuration: 48,
};

// --- missiles ---------------------------------------------------------------
/**
 * One missile, built the way the forward weapons are: a set of property
 * ladders rather than a choice between models. The three that used to sit
 * here — a rocket pod, an IR seeker and a radar shot — survive as the three
 * rungs of TYPE, which is the only one of the four that is not a quantity.
 *
 * Everything else about a missile is derived from these four in
 * `resolveMissile`: how long it stays in the air, what its splash does, how
 * far its seeker can see. Nothing downstream declares a missile's numbers.
 */
export const MISSILES = {
  missile: {
    label: "MISSILE",
    blurb: "Off the rails, one at a time",
    props: {
      type: {
        label: "TYPE",
        tiers: [0, 1, 2],
        format: (v) => ["UNGUIDED", "IR SEEKER", "ALL-ASPECT"][v],
      },
      ammo: {
        label: "AMMO",
        tiers: steps(3, 30, 5),
        format: (v) => `${v}`,
      },
      damage: {
        label: "DAMAGE",
        tiers: steps(30, 150, 5, 5),
        format: (v) => `${v}`,
      },
      reach: {
        label: "REACH",
        tiers: steps(800, 2500, 5, 50),
        format: (v) => `${v} m`,
      },
    },
  },
};

export const MISSILE_PROP_KEYS = Object.keys(MISSILES.missile.props)
  .map((prop) => `missile.${prop}`);

/**
 * What each TYPE rung does. These are three unrelated quantities rather than
 * one that grows, which is why TYPE's tiers are plain indices into this and
 * not the numbers themselves — a bar cannot be drawn from a turn rate and an
 * arc at the same time.
 *
 * The figures are the retired models' guidance, unchanged: a rocket that goes
 * where it was pointed, a seeker that has to be aimed roughly at something,
 * and one that takes anything on the radar including what is behind you.
 */
export const GUIDANCE = [
  { name: "UNGUIDED", turnRate: 0, acquireRange: 0, acquireCone: 0 },
  { name: "IR SEEKER", turnRate: 0.085, acquireRange: 900, acquireCone: 0.9 },
  { name: "ALL-ASPECT", turnRate: 0.15, acquireRange: RADAR_RANGE, acquireCone: Math.PI },
];

/** Shared by every missile however its ladders are set. */
export const MISSILE = {
  /** Ticks before the warhead arms, so it can't detonate on the launch rail. */
  armingDelay: 10,
  /**
   * Ticks between launches, the same whatever is fitted. Rate of fire is
   * deliberately not a ladder: it would multiply with DAMAGE, and a ceiling
   * that is the product of two rungs is how the cannon once reached 15,000
   * dps. At the top rung this is 100 dps, half of a maxed cannon.
   */
   cooldown: 90,
  /** One airframe, so one speed ramp: units per tick. */
  launchSpeed: 5,
  accel: 0.28,
  maxSpeed: 14,
  hitRadius: 16,
  /** Missiles a crate puts back on the rails, whatever the rack holds. */
  resupply: 3,
  /** Splash is a fixed share of the warhead, over a radius that grows with it. */
  splashShare: 0.45,
  splashRadiusBase: 60,
  splashRadiusPerDamage: 0.87,
};

/**
 * Ticks of flight that cover `reach`, against the acceleration ramp above.
 * Solved rather than divided: a missile is still speeding up for its first
 * second, so reach / maxSpeed would overshoot every time.
 */
function lifeForReach(reach) {
  let speed = MISSILE.launchSpeed;
  let flown = 0;
  let ticks = 0;
  while (flown < reach) {
    speed = Math.min(speed + MISSILE.accel, MISSILE.maxSpeed);
    flown += speed;
    ticks++;
  }
  return ticks;
}

/**
 * Turn a loadout's rungs into the one concrete missile the jet carries. The
 * shape matches what the old per-model specs exposed, so the flight code and
 * the enemy missiles — which still declare their own — stay identical.
 */
export function resolveMissile(loadout) {
  const value = (prop) => {
    const { tiers } = MISSILES.missile.props[prop];
    const rung = loadout[`missile.${prop}`] ?? 0;
    return tiers[Math.min(Math.max(rung, 0), tiers.length - 1)];
  };

  const guidance = GUIDANCE[value("type")];
  const damage = value("damage");
  const reach = value("reach");

  return {
    name: guidance.name,
    short: guidance.name,
    carried: value("ammo"),
    resupply: MISSILE.resupply,
    cooldown: MISSILE.cooldown,
    damage,
    splashDamage: Math.round(damage * MISSILE.splashShare),
    splashRadius: Math.round(
      MISSILE.splashRadiusBase + damage * MISSILE.splashRadiusPerDamage),
    turnRate: guidance.turnRate,
    /**
     * A seeker cannot be allowed to see past the airframe: chasing something
     * the motor will never reach only empties the rack.
     */
    acquireRange: Math.min(guidance.acquireRange, reach),
    acquireCone: guidance.acquireCone,
    launchSpeed: MISSILE.launchSpeed,
    accel: MISSILE.accel,
    maxSpeed: MISSILE.maxSpeed,
    reach,
    life: lifeForReach(reach),
    hitRadius: MISSILE.hitRadius,
  };
}

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
export const BOMB_IDS = Object.keys(BOMBS);

/**
 * Every upgradeable property in the game, as "track.property" keys. The
 * hangar, the save file and the defaults all walk this one list, so adding a
 * property to WEAPONS above is the only edit a new rung needs.
 */
export const WEAPON_PROP_KEYS = WEAPON_IDS.flatMap(
  (id) => Object.keys(WEAPONS[id].props).map((prop) => `${id}.${prop}`),
);

/**
 * What a pilot flies with before they touch anything in the hangar: the base
 * airframe, two wing guns at their weakest, and no nose weapons at all.
 *
 * Ladders are stored as a rung index, so the saved value stays meaningful if
 * the numbers on a rung are retuned later.
 */
export const DEFAULT_LOADOUT = {
  armour: "scout",
  engine: "spark",
  bomb: "mk82",
  /** Which forward weapon is carried. Only one, ever. */
  weapon: "cannon",
  ...Object.fromEntries(WEAPON_PROP_KEYS.map((key) => [key, 0])),
  ...Object.fromEntries(MISSILE_PROP_KEYS.map((key) => [key, 0])),
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
 *   flame       if present, it carries a flame cone instead of guns
 *   laser       if present, it carries a beam instead of guns
 *   missile     if present, it launches homing missiles at the player
 *   bomb        if present, it leaves bombs behind it
 *
 * An aircraft carries exactly one forward weapon: guns, a flame, or a beam —
 * never a combination. Missiles and mines are separate ordnance and may sit
 * alongside any of them.
 *
 * Enemy flame and beam figures stay well under what the player can reach:
 * the fiercest enemy fire is 120/s against a player ceiling of 250/s, and the
 * longest enemy beam 2200 m against 4000 m.
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

  shrike: {
    name: "Shrike", shape: "dart",
    hp: 55, speed: 5.8, turn: 0.046, radius: 15,
    color: "#d98a3d", accent: "#ffd9a0",
    range: 800, fireCd: 20, spread: 0.06, damage: 9, barrels: 2, bulletSpeed: 14,
    score: 320, scale: 1,
    fromWave: 3, weight: 3,
  },

  cinder: {
    name: "Cinder", shape: "claw",
    hp: 70, speed: 5.4, turn: 0.050, radius: 15,
    color: "#e2663a", accent: "#ffb08a",
    range: 180, score: 380, scale: 0.95,
    /** No guns at all: it has to get on top of you to do anything. */
    flame: { damage: 40, range: 180 },
    fromWave: 5, weight: 3,
  },

  glint: {
    name: "Glint", shape: "dart",
    hp: 95, speed: 4.6, turn: 0.034, radius: 16,
    color: "#9b6ad6", accent: "#d9b8ff",
    range: 900, score: 520, scale: 1.05,
    laser: { damage: 35, range: 900 },
    fromWave: 7, weight: 2,
  },

  culverin: {
    name: "Culverin", shape: "gunship",
    hp: 240, speed: 2.8, turn: 0.018, radius: 26,
    color: "#5f6fa8", accent: "#aebbe8",
    range: 1000, fireCd: 20, spread: 0.10, damage: 14, barrels: 3, bulletSpeed: 15,
    score: 820, scale: 1.3,
    fromWave: 8, weight: 2,
  },

  pyre: {
    name: "Pyre", shape: "brick",
    hp: 210, speed: 3.6, turn: 0.026, radius: 23,
    color: "#c94f2a", accent: "#ffa06b",
    range: 260, score: 880, scale: 1.2,
    flame: { damage: 85, range: 260 },
    fromWave: 10, weight: 2,
  },

  prism: {
    name: "Prism", shape: "wraith",
    hp: 250, speed: 3.2, turn: 0.022, radius: 26,
    color: "#6a3fb0", accent: "#c4a0ff",
    range: 1500, score: 1050, scale: 1.3,
    laser: { damage: 70, range: 1500 },
    fromWave: 11, weight: 2, maxPerWave: 3,
  },

  fusillade: {
    name: "Fusillade", shape: "gunship",
    hp: 300, speed: 2.7, turn: 0.016, radius: 28,
    color: "#49588c", accent: "#9fb0e0",
    range: 950, fireCd: 10, spread: 0.15, damage: 10, barrels: 4, bulletSpeed: 14,
    score: 1300, scale: 1.4,
    fromWave: 12, weight: 2, maxPerWave: 3,
  },

  censer: {
    name: "Censer", shape: "claw",
    hp: 430, speed: 3.0, turn: 0.021, radius: 31,
    color: "#a83418", accent: "#ff8f5e",
    range: 340, score: 1700, scale: 1.55,
    flame: { damage: 120, range: 340 },
    fromWave: 15, weight: 1, maxPerWave: 2,
  },

  cyclops: {
    name: "Cyclops", shape: "wraith",
    hp: 540, speed: 2.6, turn: 0.015, radius: 35,
    color: "#3b1f6e", accent: "#b08aff",
    range: 1700, score: 2400, scale: 1.65,
    laser: { damage: 110, range: 1700 },
    fromWave: 16, weight: 1, maxPerWave: 2,
  },

  bombarde: {
    name: "Bombarde", shape: "leviathan",
    hp: 560, speed: 2.5, turn: 0.014, radius: 40,
    color: "#2f3a5c", accent: "#8fa4d6",
    range: 1250, fireCd: 18, spread: 0.09, damage: 15, barrels: 4, bulletSpeed: 15,
    score: 2600, scale: 1.7,
    fromWave: 17, weight: 1, maxPerWave: 1,
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

  // --- carriers -------------------------------------------------------------
  // Not aircraft. Each is a ship: it ignores you entirely, crosses the map on
  // the heading it arrived on, and keeps putting aircraft into the sky until
  // its hull is gone. See CARRIER below for the deck rules they share.

  escortCarrier: {
    name: "Escort Carrier", shape: "carrier",
    hp: 1800, speed: 1.1, turn: 0.004, radius: 95,
    color: "#3c4a52", accent: "#8fb6c9",
    range: 1000, score: 3000, scale: 3.0,
    /** No contrail: it is a ship, not something leaving vapour at altitude. */
    trail: 0,
    carrier: { launchInterval: 300 },
    sam: { cooldown: 180, range: 1000, damage: 35, turnRate: 0.075,
           speed: 5, accel: 0.24, maxSpeed: 12, life: 240, hitRadius: 18, salvo: 2 },
    group: "carrier",
    fromWave: 5, weight: 1, maxPerWave: 1,
  },

  fleetCarrier: {
    name: "Fleet Carrier", shape: "carrier",
    hp: 3000, speed: 1.0, turn: 0.0035, radius: 110,
    color: "#36424f", accent: "#9fd0e8",
    range: 1100, score: 7000, scale: 3.5,
    trail: 0,
    carrier: { launchInterval: 210 },
    sam: { cooldown: 150, range: 1100, damage: 45, turnRate: 0.080,
           speed: 5, accel: 0.25, maxSpeed: 12.5, life: 260, hitRadius: 18, salvo: 2 },
    group: "carrier",
    fromWave: 10, weight: 1, maxPerWave: 1,
  },

  battleCarrier: {
    name: "Battle Carrier", shape: "carrier",
    hp: 4200, speed: 0.9, turn: 0.003, radius: 125,
    color: "#2e3a4a", accent: "#c9a84f",
    range: 1200, score: 12000, scale: 4.0,
    trail: 0,
    carrier: { launchInterval: 150 },
    sam: { cooldown: 132, range: 1200, damage: 55, turnRate: 0.085,
           speed: 5, accel: 0.26, maxSpeed: 13, life: 280, hitRadius: 20, salvo: 2 },
    group: "carrier",
    fromWave: 15, weight: 1, maxPerWave: 1,
  },

  superCarrier: {
    name: "Supercarrier", shape: "carrier",
    hp: 6000, speed: 0.8, turn: 0.0025, radius: 140,
    color: "#242c3a", accent: "#ff7a6b",
    range: 1300, score: 20000, scale: 4.5,
    trail: 0,
    carrier: { launchInterval: 108 },
    sam: { cooldown: 108, range: 1300, damage: 65, turnRate: 0.090,
           speed: 5, accel: 0.27, maxSpeed: 13.5, life: 300, hitRadius: 20, salvo: 2 },
    group: "carrier",
    fromWave: 20, weight: 1, maxPerWave: 1,
  },
};

export const ENEMY_TYPE_IDS = Object.keys(ENEMY_TYPES);

/**
 * Peak damage per second a type can put out. For gunners that assumes every
 * round connects; for flame and beam carriers it is the rate their fire
 * burns at, which is what they actually do to you.
 */
export const enemyDps = (t) => {
  if (t.sam) return (t.sam.salvo * t.sam.damage * (1000 / TICK_MS)) / t.sam.cooldown;
  if (t.flame) return t.flame.damage;
  if (t.laser) return t.laser.damage;
  return ((t.barrels ?? 1) * t.damage * (1000 / TICK_MS)) / t.fireCd;
};

/**
 * Which weapon a type carries. Every *aircraft* carries exactly one of the
 * three forward weapons; a carrier carries none of them and answers "sam".
 */
export const enemyWeapon = (t) =>
  t.sam ? "sam" : t.flame ? "flame" : t.laser ? "laser" : "gun";

/**
 * How many of a group may appear in one wave, over and above each type's own
 * `maxPerWave`. Four carrier tiers each capped at one would still let a late
 * wave field four of them at once, which is not a fight — it is a slideshow.
 */
export const GROUP_CAPS = { carrier: 2 };

/**
 * Deck rules, shared by every carrier tier. What differs between tiers is the
 * hull, the SAM and how often the catapult fires — everything here is the
 * same ship.
 */
export const CARRIER = {
  /** Takeoffs, landing approaches and repairs all compete for these. */
  deckSlots: 3,
  /** An aircraft under this fraction of its hull looks for a deck. */
  landThreshold: 0.4,
  /** ...and only bothers if a carrier is this close. */
  landRange: 2200,
  /** Ticks parked before it relaunches at full health. */
  repairTicks: 240,
  /** Ticks of takeoff run, during which it neither steers nor shoots. */
  takeoffTicks: 90,
  /**
   * A swarm draw streams off the deck at WAVES.swarmStagger, so a full takeoff
   * run each would need thirty slots. A short one keeps three rolling at once
   * and still clears thirty aircraft in about a second and a half.
   */
  swarmTakeoffTicks: 9,
  /** Where aircraft leave from, as a fraction of the hull radius, bow-first. */
  bowOffset: 0.8,
  /** Carriers enter this far inside the arena wall rather than on the ring. */
  edgeInset: 500,
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
