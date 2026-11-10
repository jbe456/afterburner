/**
 * The DOM overlays: the hangar (airframe + loadout selection) and the
 * game-over card. Everything else in the game is canvas; these are HTML
 * because they are text, bars and buttons, which the browser already does well.
 *
 * Every figure shown here is read from config.js rather than written by hand,
 * so the hangar cannot advertise something the simulation does not do.
 */

import {
  ARMOUR, ARMOUR_IDS, ENGINES, ENGINE_IDS, WEAPONS, WEAPON_IDS, MISSILES, MISSILE_IDS,
  BOMBS, BOMB_IDS, DEFAULT_LOADOUT, PLAYER, KMH_PER_SPEED_UNIT, TICK_MS,
  ENEMY_TYPES, ENEMY_TYPE_IDS, enemyDps,
} from "../config.js";
import { drawHull } from "../render/hulls.js";
import { loadBest, saveBest, loadLoadout, saveLoadoutSlot } from "../core/storage.js";

const overlay = () => document.getElementById("overlay");
const panel = () => document.getElementById("panel");

const CONTROLS = [
  ["Mouse / A · D", "Steer"],
  ["W / Shift", "Afterburner"],
  ["S", "Throttle back (turns tighter)"],
  ["Click / Space", "Cannon"],
  ["Right click / F", "Missile"],
  ["B", "Drop bomb"],
  ["P", "Pause"],
];

const TPS = 1000 / TICK_MS;

/** Formatters, so each bar can state its own value in its own unit. */
const count = (v) => String(Math.round(v));
const metres = (v) => `${Math.round(v)} m`;
const perSecond = (v) => `${Math.round(v)} dps`;
const seconds = (v) => `${(v / TPS).toFixed(1)} s`;
/** Shots per second, or the infinity sign for a weapon that simply stays on. */
const perSecondShots = (v) => {
  if (!Number.isFinite(v)) return "\u221e";
  // Round before testing for a whole number: 60 / (1000/60) lands a hair off 12.
  const rounded = Math.round(v * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}/s`;
};
const kmh = (v) => `${Math.round(v * KMH_PER_SPEED_UNIT)} km/h`;

/**
 * What each card compares, as bars: a label, the value to read, and how to
 * print it. Every quantity comes straight from config.js and is normalised
 * against the other options in its own category, so a card can never
 * advertise something the simulation does not do. More is more on all of
 * them — though on FUSE "more" is a longer wait, not a better bomb.
 */
const AXES = {
  armour: [["HULL", (a) => a.maxHp, count]],
  engine: [["SPEED", (e) => e.maxSpeed, kmh]],
  missile: [
    ["AMMO", (m) => m.carried, count],
    ["DAMAGE", (m) => m.damage, count],
    ["SEEKER", (m) => m.acquireRange, (v) => (v ? metres(v) : "none")],
  ],
  bomb: [
    ["AMMO", (b) => b.carried, count],
    ["BLAST", (b) => b.blastRadius, metres],
    // A mine has no fuse at all — it waits, which the unbounded bar says too.
    ["FUSE", (b) => b.fuse, (v) => (Number.isFinite(v) ? seconds(v) : "on touch")],
  ],
};

/**
 * Builds a bar renderer for one category, normalising each axis across that
 * category's options. The weakest value still shows an 18% sliver so a card
 * never looks broken.
 */
function barsFor(slot, ids, table) {
  const axes = AXES[slot];

  // An axis may hold a value that is off any scale — the flamethrower has no
  // shot rate at all. Those are measured separately: the finite values are
  // normalised among themselves with headroom left above them, so one
  // unbounded option cannot flatten the rest into identical slivers.
  const scales = axes.map(([, read]) => {
    const values = ids.map((id) => read(table[id]));
    const finite = values.filter(Number.isFinite);
    return {
      lo: Math.min(...finite),
      hi: Math.max(...finite),
      unbounded: finite.length < values.length,
    };
  });

  return (spec) => axes.map(([label, read, format], i) => {
    const { lo, hi, unbounded } = scales[i];
    const value = read(spec);

    let width;
    if (!Number.isFinite(value)) {
      width = 100;
    } else {
      const t = hi === lo ? 1 : (value - lo) / (hi - lo);
      width = 18 + t * (unbounded ? 64 : 82);
    }

    return `
      <div class="stat">
        <i>${label}</i>
        <div class="track"><div class="fill" style="width:${width.toFixed(1)}%"></div></div>
        <u>${format(value)}</u>
      </div>`;
  }).join("");
}

const BARS = {
  armour: barsFor("armour", ARMOUR_IDS, ARMOUR),
  engine: barsFor("engine", ENGINE_IDS, ENGINES),
  missile: barsFor("missile", MISSILE_IDS, MISSILES),
  bomb: barsFor("bomb", BOMB_IDS, BOMBS),
};

/** Every slot the hangar knows how to store. */
const ALL_SLOTS = Object.keys(DEFAULT_LOADOUT);

/** The current selection, seeded from storage and repaired against config. */
const chosen = { ...DEFAULT_LOADOUT, ...validated(loadLoadout(ALL_SLOTS)) };

/** Kept so a reset can redraw the hangar without main.js handing them over again. */
let menuHandlers = null;
let menuKeyHandler = null;

/**
 * Drops anything saved that no longer makes sense: a fitting that has been
 * removed from config, or a rung beyond the end of a ladder that has been
 * shortened since.
 */
function validated(saved) {
  const tables = { armour: ARMOUR, engine: ENGINES, missile: MISSILES, bomb: BOMBS };
  const out = {};

  for (const [slot, table] of Object.entries(tables)) {
    if (saved[slot] && table[saved[slot]]) out[slot] = saved[slot];
  }

  for (const slot of Object.keys(saved)) {
    if (!slot.includes(".")) continue;
    const [track, prop] = slot.split(".");
    const tiers = WEAPONS[track]?.props[prop]?.tiers;
    if (!tiers) continue;
    const rung = Number(saved[slot]);
    if (Number.isInteger(rung) && rung >= 0 && rung < tiers.length) out[slot] = rung;
  }

  return out;
}

export const getLoadout = () => ({ ...chosen });

// --- hangar -----------------------------------------------------------------

export function showMenu(onStart, onShowIntel, onShowHelp) {
  menuHandlers = { onStart, onShowIntel, onShowHelp };
  panel().className = "panel wide";
  panel().innerHTML = `
    <h1>AFTERBURNER</h1>
    <div class="sub">Fit out your aircraft</div>
    <div class="nav">
      <button class="linkish" id="help">How to fly &rsaquo;</button>
      <button class="linkish" id="intel">Know your enemy &rsaquo;</button>
    </div>

    <div class="airframe">
      <!-- Only the summary is re-rendered on a pick. The Launch button is a
           sibling rather than inside it, so it keeps its click handler. -->
      <div class="airframe-summary" id="airframe">${airframeSummary()}</div>
      <button class="btn" id="start">Launch</button>
    </div>

    <div class="loadout">
      ${upgradeRow("armour", "HULL", ARMOUR_IDS, ARMOUR)}
      ${upgradeRow("engine", "ENGINE", ENGINE_IDS, ENGINES)}
      ${WEAPON_IDS.map(weaponTrackRow).join("")}
      ${weaponRow("missile", "MISSILE", MISSILE_IDS, MISSILES)}
      ${weaponRow("bomb", "BOMB", BOMB_IDS, BOMBS)}
    </div>

    <div class="footnote">
      <span>A longer bar is more of that thing</span>
      <button class="linkish" id="reset">Reset fittings</button>
    </div>`;

  for (const opt of panel().querySelectorAll(".opt")) {
    opt.addEventListener("click", () => select(opt.dataset.slot, opt.dataset.id));
  }

  // Delegated, because an upgrade re-renders the very button that was clicked.
  //
  // It hangs off .loadout rather than the panel: the panel outlives every
  // render, so listeners added to it accumulate, and one click would fire the
  // upgrade once per visit to the hangar — stepping several tiers at a time.
  // This element is rebuilt with the markup, so its listener dies with it.
  panel().querySelector(".loadout").addEventListener("click", (e) => {
    const button = e.target.closest("[data-upgrade]");
    if (button) upgrade(button.dataset.upgrade);
  });

  document.getElementById("intel").onclick = onShowIntel;
  document.getElementById("help").onclick = onShowHelp;
  document.getElementById("reset").onclick = resetLoadout;

  show(onStart);
}

/**
 * The way out of a reading screen, parked at the top where you came in.
 * It keeps the id every screen's primary button uses, so `show()` wires it.
 */
function backBar() {
  return `
    <div class="topbar">
      <button class="btn ghost" id="start">&lsaquo; Back to the hangar</button>
      <span class="topbar-hint">or press ESC</span>
    </div>`;
}

/** The controls, and the three rules that are not obvious from them. */
export function showHelp(onBack) {
  panel().className = "panel";
  panel().innerHTML = `
    ${backBar()}
    <h1>HOW TO FLY</h1>
    <div class="sub">Keys, and what they do not tell you</div>
    <div class="keys">
      ${CONTROLS.map(([k, d]) => `<b>${k}</b><span>${d}</span>`).join("")}
    </div>
    <div class="notes">
      <p><b>Throttle back to turn tighter.</b> Speed costs turn rate, so the
      quickest way through a turning fight is usually the slow one.</p>
      <p><b>Bombs and mines do not take sides.</b> Yours will kill you as
      readily as them — drop one and commit to being somewhere else.</p>
      <p><b>The combat zone has edges.</b> Fly past them and the hull bleeds.
      The HUD warns you well before it starts.</p>
    </div>`;

  show(onBack);
}

/**
 * What the current fittings add up to, shown above the rows so the
 * consequence of a choice is visible at the moment it is made — pick a bigger
 * engine and the speed here changes.
 */
function airframeSummary() {
  return `
    ${silhouette()}
    <div class="airframe-figures">
      <span>${ARMOUR[chosen.armour].maxHp}</span> hull
      <i>·</i>
      <span>${kmh(ENGINES[chosen.engine].maxSpeed)}</span> top speed
    </div>`;
}

// --- enemy roster -----------------------------------------------------------

/** What a type actually brings to the fight, in plain words. */
function armament(type) {
  const parts = [`${type.barrels ?? 1} gun${(type.barrels ?? 1) > 1 ? "s" : ""}`];
  if (type.missile) {
    parts.push(type.missile.salvo > 1 ? `${type.missile.salvo} missiles` : "missiles");
  }
  // A timed charge is a bomb; something that waits to be touched is a mine.
  if (type.bomb) parts.push(type.bomb.trigger === "contact" ? "mines" : "bombs");
  return parts.join(" · ");
}

/**
 * The threat library: every enemy in the game, in the order you will meet
 * them, drawn with the same code that draws them in the air.
 */
export function showIntel(onBack) {
  detachMenuKeys();

  const order = [...ENEMY_TYPE_IDS].sort(
    (a, b) => ENEMY_TYPES[a].fromWave - ENEMY_TYPES[b].fromWave
      || ENEMY_TYPES[a].hp - ENEMY_TYPES[b].hp,
  );

  panel().className = "panel wide";
  panel().innerHTML = `
    ${backBar()}
    <h1>KNOW YOUR ENEMY</h1>
    <div class="sub">${ENEMY_TYPE_IDS.length} types, in the order you meet them</div>
    <div class="intel">${order.map(foeCard).join("")}</div>
    <div class="hint">Mines and bombs damage whoever is standing in them, including the side that dropped them</div>`;

  // Drawn rather than inlined as SVG: this is the renderer's own code, so a
  // silhouette here can never drift from the one you meet in the air.
  for (const canvas of panel().querySelectorAll(".foe-art")) {
    const type = ENEMY_TYPES[canvas.dataset.id];
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fit the biggest hull in the box and draw everything at that same scale,
    // so the roster reads as a size comparison as well as a list.
    const fit = (canvas.clientHeight * 0.42) / 48;
    drawHull(ctx, type.shape, canvas.clientWidth / 2, canvas.clientHeight / 2,
      -Math.PI / 2, type.scale * fit, type.color, type.accent, false, 0.45, 0);
  }

  show(onBack);
}

function foeCard(id) {
  const type = ENEMY_TYPES[id];
  return `
    <div class="foe" style="--livery:${type.accent}">
      <canvas class="foe-art" data-id="${id}"></canvas>
      <div class="foe-name">${type.name}</div>
      <div class="foe-wave">wave ${type.fromWave}+${type.maxPerWave ? ` · max ${type.maxPerWave}` : ""}</div>
      ${type.swarm ? `<div class="foe-swarm">swarms of ${type.swarm}</div>` : ""}
      <div class="foe-stats">
        <span>${type.hp}</span> hull<br>
        <span>${Math.round(enemyDps(type))}</span> dps · <span>${type.range}</span> m<br>
        ${armament(type)}<br>
        <span>${type.score}</span> pts
      </div>
    </div>`;
}

// --- upgrade rows -----------------------------------------------------------

/**
 * Hull and engine are one fitting apiece, not a choice between three. The row
 * shows what is currently bolted on and a button that steps it up a tier, so
 * the ladder reads as a ladder rather than as three alternatives.
 */
function upgradeRow(slot, label, ids, table) {
  return `
    <div class="loadout-row">
      <div class="loadout-label">${label}</div>
      <div class="options single" id="row-${slot}">${upgradeCard(slot, ids, table)}</div>
    </div>`;
}

/**
 * Art for a rung of a ladder, built from where it sits rather than from its
 * id — a shield gaining plates, a nozzle gaining thrust. Generated so that
 * adding tiers never leaves one without a picture.
 */
function ladderArt(slot, tier, total) {
  const t = total > 1 ? tier / (total - 1) : 1;

  if (slot === "armour") {
    const shield = (k) =>
      `M0,${-13 * k} L${13 * k},${-7 * k} L${13 * k},${4 * k} L0,${14 * k}` +
      ` L${-13 * k},${4 * k} L${-13 * k},${-7 * k} Z`;
    const plates = [1, 0.72, 0.46, 0.22].slice(0, 1 + Math.round(t * 3));
    return `
      <svg class="weapon-art" viewBox="-22 -15 44 30" aria-hidden="true">
        ${plates.map((k, i) =>
          `<path class="${i % 2 ? "dim" : "main"}" d="${shield(k)}"/>`).join("")}
      </svg>`;
  }

  const arcs = Array.from({ length: 1 + Math.round(t * 4) }, (_, i) => {
    const x = -6 - i * 5.2;
    const r = 5 + i * 2;
    return `<path class="arc" d="M${x},${-r} Q${x - 5},0 ${x},${r}"/>`;
  }).join("");

  return `
    <svg class="weapon-art" viewBox="-34 -15 58 30" aria-hidden="true">
      <path class="main" d="M4,-8 L12,-10 L12,10 L4,8 Z"/>
      <rect class="dim" x="-2" y="-5" width="7" height="10" rx="2"/>
      ${arcs}
    </svg>`;
}

function upgradeCard(slot, ids, table) {
  const tier = ids.indexOf(chosen[slot]);
  const spec = table[ids[tier]];
  const next = ids[tier + 1] ? table[ids[tier + 1]] : null;
  const [, read, format] = AXES[slot][0];

  const pips = ids
    .map((_, i) => `<span class="${i <= tier ? "on" : ""}"></span>`)
    .join("");

  // The current figure is already on the bar above, so the button only needs
  // to say what it buys.
  const button = next
    ? `<button class="upgrade" data-upgrade="${slot}">
         Upgrade to <i>${format(read(next))}</i>
       </button>`
    : `<button class="upgrade" disabled>Fully upgraded</button>`;

  return `
    <div class="opt selected" data-slot="${slot}" data-id="${spec.id}">
      <b>${spec.name}</b>
      <div class="tier">${pips}</div>
      ${ladderArt(slot, tier, ids.length)}
      <div class="stats-grid">${BARS[slot](spec)}</div>
      ${button}
    </div>`;
}

/**
 * Put everything back to the aircraft you started with: both ladders to their
 * bottom rung and the weapons to their defaults. Upgrading only goes one way,
 * so without this the only way down would be clearing the browser's storage.
 */
function resetLoadout() {
  for (const [slot, id] of Object.entries(DEFAULT_LOADOUT)) {
    chosen[slot] = id;
    saveLoadoutSlot(slot, id);
  }
  const { onStart, onShowIntel, onShowHelp } = menuHandlers;
  showMenu(onStart, onShowIntel, onShowHelp);
}

/** Step a fitting up one rung. The top rung simply has nothing to step to. */
function upgrade(slot) {
  // Forward weapons store a rung index under a "track.property" key.
  if (slot.includes(".")) {
    const [track, prop] = slot.split(".");
    const top = WEAPONS[track].props[prop].tiers.length - 1;
    const next = Math.min((chosen[slot] ?? 0) + 1, top);
    if (next !== chosen[slot]) select(slot, next);
    return;
  }

  const ids = slot === "armour" ? ARMOUR_IDS : ENGINE_IDS;
  const next = ids[ids.indexOf(chosen[slot]) + 1];
  if (next) select(slot, next);
}

// --- forward weapon tracks --------------------------------------------------

/**
 * A forward weapon is a row of property ladders rather than a choice between
 * models: one card per property, each with its own upgrade button. The whole
 * row is generated from WEAPONS, so adding a property adds a card.
 */
function weaponTrackRow(track) {
  const spec = WEAPONS[track];
  const cards = Object.keys(spec.props)
    .map((prop) => propCard(track, prop))
    .join("");

  return `
    <div class="loadout-row">
      <div class="loadout-label">${spec.label}<i>${spec.blurb}</i></div>
      <div class="options" id="row-${track}">${cards}</div>
    </div>`;
}

/**
 * Whether a weapon is on the aircraft at all. It is a property of the whole
 * track, not of one card: a flamethrower with reach but no damage is still
 * not fitted, and its reach card should not look live.
 */
function trackFitted(track) {
  for (const [prop, spec] of Object.entries(WEAPONS[track].props)) {
    // The property carrying a zero first rung is the one that fits the weapon.
    if (spec.tiers[0] === 0) return (chosen[`${track}.${prop}`] ?? 0) > 0;
  }
  return true; // nothing to fit: the wing guns are always there
}

function propCard(track, prop) {
  const spec = WEAPONS[track].props[prop];
  const key = `${track}.${prop}`;
  const rung = chosen[key] ?? 0;
  const top = spec.tiers.length - 1;
  const fitted = trackFitted(track);
  const isFitting = spec.tiers[0] === 0 && rung === 0;

  const pips = spec.tiers
    .map((_, i) => `<span class="${i <= rung ? "on" : ""}"></span>`)
    .join("");

  const button = rung < top
    ? `<button class="upgrade" data-upgrade="${key}">
         ${isFitting ? "Fit" : "Upgrade"}
         <i>${spec.format(spec.tiers[rung + 1])}</i>
       </button>`
    : `<button class="upgrade" disabled>Maxed</button>`;

  return `
    <div class="opt prop${fitted ? " selected" : ""}" data-slot="${key}">
      <b>${spec.label}</b>
      <div class="tier">${pips}</div>
      <div class="prop-value${isFitting ? " unfitted" : ""}">${spec.format(spec.tiers[rung])}</div>
      ${button}
    </div>`;
}

// --- weapon rows ------------------------------------------------------------

function weaponRow(slot, label, ids, table) {
  const options = ids.map((id) => {
    const spec = table[id];
    return `
      <div class="opt${id === chosen[slot] ? " selected" : ""}" data-slot="${slot}" data-id="${id}">
        <b>${spec.name}</b>
        ${weaponArt(id)}
        <div class="stats-grid">${BARS[slot](spec)}</div>
      </div>`;
  }).join("");

  return `
    <div class="loadout-row">
      <div class="loadout-label">${label}</div>
      <div class="options">${options}</div>
    </div>`;
}

/**
 * A small drawing of each weapon, so the row reads at a glance before you
 * get to the numbers. Muzzle or nose points right, matching the plane art's
 * convention of facing the direction of travel.
 *
 * `main` is the body, `dim` the secondary detail.
 */
const WEAPON_ART = {
  // --- cannons: breech on the left, business end on the right ---
  vulcan: `
    <rect class="dim" x="-18" y="-7" width="10" height="14" rx="2"/>
    <rect class="main" x="-9" y="-5.6" width="23" height="2.6"/>
    <rect class="main" x="-9" y="-1.3" width="27" height="2.6"/>
    <rect class="main" x="-9" y="3" width="23" height="2.6"/>`,

  avenger: `
    <rect class="dim" x="-19" y="-8" width="11" height="16" rx="2"/>
    <rect class="main" x="-9" y="-3.2" width="23" height="6.4"/>
    <rect class="dim" x="13" y="-5.4" width="6" height="10.8" rx="1.5"/>`,

  firebelt: `
    <rect class="dim" x="-19" y="-5" width="11" height="10" rx="3"/>
    <path class="main" d="M -8,-3.4 L 3,-7 L 7,-2.6 L 14,-4 L 12,0 L 14,4
                          L 7,2.6 L 3,7 L -8,3.4 Z"/>`,

  // --- missiles: a pod of many, one slim seeker, one big radar shot ---
  hydra: `
    <rect class="dim" x="-18" y="-10" width="21" height="20" rx="3"/>
    <polygon class="main" points="3,-8.4 13,-6.6 3,-4.8"/>
    <polygon class="main" points="3,-1.8 15,0 3,1.8"/>
    <polygon class="main" points="3,4.8 13,6.6 3,8.4"/>`,

  sidewinder: `
    <polygon class="main" points="18,0 8,-3 -12,-3 -12,3 8,3"/>
    <polygon class="dim" points="-12,-3 -19,-9 -14,-3"/>
    <polygon class="dim" points="-12,3 -19,9 -14,3"/>
    <polygon class="dim" points="1,-3 -3,-9 -7,-3"/>
    <polygon class="dim" points="1,3 -3,9 -7,3"/>`,

  amraam: `
    <polygon class="main" points="19,0 7,-4.2 -11,-4.2 -11,4.2 7,4.2"/>
    <polygon class="dim" points="-11,-4.2 -19,-10 -13,-4.2"/>
    <polygon class="dim" points="-11,4.2 -19,10 -13,4.2"/>
    <polygon class="dim" points="2,-4.2 -3,-10 -8,-4.2"/>
    <polygon class="dim" points="2,4.2 -3,10 -8,4.2"/>
    <path class="arc" d="M 13,-7.5 A 8.5,8.5 0 0 1 13,7.5"/>`,

  // --- bombs: sticks, a shaped case, and the obvious ---
  mine: `
    <polygon class="dim" points="15.0,0.0 8.0,3.2 8.0,-3.2"/>
    <polygon class="dim" points="10.6,10.6 3.4,7.9 7.9,3.4"/>
    <polygon class="dim" points="0.0,15.0 -3.2,8.0 3.2,8.0"/>
    <polygon class="dim" points="-10.6,10.6 -7.9,3.4 -3.4,7.9"/>
    <polygon class="dim" points="-15.0,0.0 -8.0,-3.2 -8.0,3.2"/>
    <polygon class="dim" points="-10.6,-10.6 -3.4,-7.9 -7.9,-3.4"/>
    <polygon class="dim" points="-0.0,-15.0 3.2,-8.0 -3.2,-8.0"/>
    <polygon class="dim" points="10.6,-10.6 7.9,-3.4 3.4,-7.9"/>
    <circle class="main" cx="0" cy="0" r="8.5"/>
    <circle class="dim" cx="-2.5" cy="-2.5" r="2.6"/>`,

  dynamite: `
    <rect class="main" x="-13" y="-8" width="7.5" height="16" rx="2"/>
    <rect class="main" x="-4" y="-8" width="7.5" height="16" rx="2"/>
    <rect class="main" x="5" y="-8" width="7.5" height="16" rx="2"/>
    <rect class="dim" x="-13" y="-2.4" width="25.5" height="4.8"/>
    <path class="arc" d="M 9,-8 q 6,-5 10,-1"/>`,

  mk82: `
    <path class="main" d="M 19,0 C 14,-6.5 4,-8 -6,-7.5 L -11,-7.5 L -11,7.5
                          L -6,7.5 C 4,8 14,6.5 19,0 Z"/>
    <polygon class="dim" points="-11,-7.5 -19,-11 -19,11 -11,7.5"/>
    <rect class="dim" x="4" y="-7" width="3.5" height="14"/>`,

  b61: `
    <ellipse class="main" cx="0" cy="-7" rx="15" ry="5.5"/>
    <path class="main" d="M -4.5,-5 L 4.5,-5 L 3,7 L -3,7 Z"/>
    <ellipse class="dim" cx="0" cy="9" rx="12" ry="3.2"/>
    <ellipse class="dim" cx="0" cy="-11.5" rx="8" ry="2.6"/>`,
};

function weaponArt(id) {
  return `
    <svg class="weapon-art" viewBox="-22 -14 44 28" aria-hidden="true">
      ${WEAPON_ART[id] ?? ""}
    </svg>`;
}

/**
 * The same polygons the canvas renderer uses, so the hangar shows the actual
 * aircraft — nose up.
 */
function silhouette() {
  const wing = (s) => `<polygon points="4,${3 * s} -9,${21 * s} -15,${21 * s} -9,${3 * s}"/>`;
  const tail = (s) => `<polygon points="-13,${2.5 * s} -20,${10 * s} -23,${10 * s} -19,${2.5 * s}"/>`;
  return `
    <svg class="airframe-art" viewBox="-32 -32 64 64" aria-hidden="true">
      <g transform="rotate(-90) scale(${PLAYER.scale})">
        <g fill="${PLAYER.accent}">${wing(-1)}${wing(1)}${tail(-1)}${tail(1)}</g>
        <polygon fill="${PLAYER.color}"
          points="23,0 9,-4.5 -14,-5 -18,-3.8 -18,3.8 -14,5 9,4.5"/>
      </g>
    </svg>`;
}

function select(slot, id) {
  chosen[slot] = id;
  saveLoadoutSlot(slot, id);

  // Fitting a weapon changes how its whole row looks, not just one card, so
  // the row is redrawn rather than the card that was clicked.
  if (slot.includes(".")) {
    const [track] = slot.split(".");
    const row = document.getElementById(`row-${track}`);
    if (row) {
      row.innerHTML = Object.keys(WEAPONS[track].props)
        .map((prop) => propCard(track, prop))
        .join("");
    }
    return;
  }

  // Hull and engine own their whole row, and also feed the summary above.
  if (slot === "armour" || slot === "engine") {
    const ids = slot === "armour" ? ARMOUR_IDS : ENGINE_IDS;
    const table = slot === "armour" ? ARMOUR : ENGINES;
    const row = document.getElementById(`row-${slot}`);
    if (row) row.innerHTML = upgradeCard(slot, ids, table);

    const summary = document.getElementById("airframe");
    if (summary) summary.innerHTML = airframeSummary();
    return;
  }

  for (const el of panel().querySelectorAll(`.opt[data-slot="${slot}"]`)) {
    el.classList.toggle("selected", el.dataset.id === id);
  }
}

// --- game over --------------------------------------------------------------

export function showGameOver(world, onFlyAgain, onChangePlane) {
  const best = Math.max(loadBest(), world.score);
  saveBest(best);

  const p = world.player;
  panel().className = "panel dead";
  panel().innerHTML = `
    <h1>SHOT DOWN</h1>
    <div class="sub">ejection successful</div>
    <div class="stats">
      SCORE <span>${world.score}</span><br>
      KILLS <span>${world.kills}</span> &nbsp;·&nbsp; WAVE <span>${world.wave}</span><br>
      BEST <span>${best}</span>
    </div>
    <div class="loadout-recap">
      ${p.cannon.short} · ${p.missile.short} · ${p.bomb.short}
    </div>
    <button class="btn" id="start">Fly Again</button>
    <button class="btn ghost" id="hangar">Change Loadout</button>
    <div class="hint">ENTER to fly the same again</div>`;

  document.getElementById("hangar").onclick = onChangePlane;
  show(onFlyAgain);
}

// --- shared -----------------------------------------------------------------

export function hideOverlay() {
  overlay().classList.add("hidden");
  detachMenuKeys();
}

function detachMenuKeys() {
  if (!menuKeyHandler) return;
  removeEventListener("keydown", menuKeyHandler);
  menuKeyHandler = null;
}

function show(onStart) {
  overlay().classList.remove("hidden");
  document.getElementById("start").onclick = onStart;
}
