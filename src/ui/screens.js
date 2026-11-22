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
  ENEMY_TYPES, ENEMY_TYPE_IDS, enemyDps, resolveWeapons,
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

    return statBar(label, width, format(value));
  }).join("");
}

/** One labelled bar: what it measures, how full it is, and what it reads. */
const statBar = (label, width, text) => `
  <div class="stat">
    <i>${label}</i>
    <div class="track"><div class="fill" style="width:${width.toFixed(1)}%"></div></div>
    <u>${text}</u>
  </div>`;

const BARS = {
  armour: barsFor("armour", ARMOUR_IDS, ARMOUR),
  engine: barsFor("engine", ENGINE_IDS, ENGINES),
  missile: barsFor("missile", MISSILE_IDS, MISSILES),
  bomb: barsFor("bomb", BOMB_IDS, BOMBS),
};

/**
 * The same bars for a forward weapon, one per property. These measure how
 * far up its own ladder each property has been taken rather than comparing
 * weapons with each other — a full bar means maxed, on every one of them.
 */
function weaponPropBars(track) {
  return Object.entries(WEAPONS[track].props).map(([prop, spec]) => {
    const top = spec.tiers.length - 1;
    const rung = Math.min(chosen[`${track}.${prop}`] ?? 0, top);
    return statBar(spec.label, 18 + (top ? rung / top : 1) * 82,
      spec.format(spec.tiers[rung]));
  }).join("");
}

/** One segment per rung, filled up to where a ladder currently stands. */
const tierPips = (rung, total) => `
  <div class="tier">${Array.from({ length: total },
    (_, i) => `<span class="${i <= rung ? "on" : ""}"></span>`).join("")}</div>`;

/** The tables and their orders, by slot, so a slot name is enough to read one. */
const TABLES = { armour: ARMOUR, engine: ENGINES, missile: MISSILES, bomb: BOMBS };
const IDS = {
  armour: ARMOUR_IDS, engine: ENGINE_IDS, missile: MISSILE_IDS, bomb: BOMB_IDS,
};

/**
 * Hull and engine are climbed; missiles and bombs are picked between. The
 * difference decides what a bay shows and what its bench offers, so it is
 * asked for by name rather than re-derived in five places.
 */
const isLadder = (slot) => slot === "armour" || slot === "engine";

/** Every slot the hangar knows how to store. */
const ALL_SLOTS = Object.keys(DEFAULT_LOADOUT);

/** The current selection, seeded from storage and repaired against config. */
const chosen = { ...DEFAULT_LOADOUT, ...validated(loadLoadout(ALL_SLOTS)) };

/**
 * The five bays of the overview, in fitting order. `action` says what the
 * bench under an open one offers, which differs: two of them are ladders,
 * two are choices, and the weapon is both.
 */
const BAYS = [
  { slot: "armour", label: "HULL", action: "Upgrade" },
  { slot: "engine", label: "ENGINE", action: "Upgrade" },
  { slot: "weapon", label: "WEAPON", action: "Switch" },
  { slot: "missile", label: "MISSILE", action: "Change" },
  { slot: "bomb", label: "BOMB", action: "Change" },
];

/** Which bay's bench is open, or null for the overview on its own. */
let openBay = null;

/** Kept so a reset can redraw the hangar without main.js handing them over again. */
let menuHandlers = null;
let menuKeyHandler = null;

/**
 * Drops anything saved that no longer makes sense: a fitting that has been
 * removed from config, or a rung beyond the end of a ladder that has been
 * shortened since.
 */
function validated(saved) {
  const out = {};

  for (const [slot, table] of Object.entries(TABLES)) {
    if (saved[slot] && table[saved[slot]]) out[slot] = saved[slot];
  }

  if (WEAPONS[saved.weapon]) out.weapon = saved.weapon;

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

    <div class="hangar">
      <div class="readout">
        <!-- Only the figures are redrawn when something changes. Launch is a
             sibling rather than inside them, so it keeps its click handler. -->
        <div class="readout-body" id="figures">${readoutBody()}</div>
        <button class="btn" id="start">Launch</button>
      </div>

      <div class="bays" id="bays">${BAYS.map(bayCard).join("")}</div>
      <div id="bench">${benchMarkup()}</div>
    </div>

    <div class="footnote">
      <span>A longer bar is more of that thing</span>
      <button class="linkish" id="reset">Reset fittings</button>
    </div>`;

  // Delegated, because every click in here redraws the element that was
  // clicked. It hangs off .hangar rather than the panel: the panel outlives
  // every render, so listeners added to it accumulate, and one click would
  // fire once per visit to the hangar — stepping several tiers at a time.
  // This element is rebuilt with the markup above, so its listener dies with it.
  panel().querySelector(".hangar").addEventListener("click", onHangarClick);

  document.getElementById("intel").onclick = onShowIntel;
  document.getElementById("help").onclick = onShowHelp;
  document.getElementById("reset").onclick = resetLoadout;

  attachMenuKeys();
  show(onStart);
}

function onHangarClick(e) {
  if (e.target.closest("[data-close]")) { closeBench(); return; }

  const bay = e.target.closest("[data-bay]");
  if (bay) {
    // Clicking the open bay again closes it, so the overview is one click away.
    openBay = openBay === bay.dataset.bay ? null : bay.dataset.bay;
    refresh();
    return;
  }

  const upgradeButton = e.target.closest("[data-upgrade]");
  if (upgradeButton) { upgrade(upgradeButton.dataset.upgrade); return; }

  const pick = e.target.closest("[data-weapon]");
  if (pick) { select("weapon", pick.dataset.weapon); return; }

  // Choice cards carry the id they fit; property cards carry a rung instead
  // and are changed by their own buttons.
  const opt = e.target.closest(".opt[data-id]");
  if (opt) select(opt.dataset.slot, opt.dataset.id);
}

/** Redraw everything a change can touch: the figures, the bays, the bench. */
function refresh() {
  const parts = {
    figures: readoutBody(),
    bays: BAYS.map(bayCard).join(""),
    bench: benchMarkup(),
  };

  for (const [id, html] of Object.entries(parts)) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
}

/**
 * The instrument strip: what this fit adds up to, in the same figures the
 * HUD shows in the air. Every one is read from config through the same
 * resolver the simulation uses, so the readout cannot promise something the
 * aircraft will not do.
 */
function readoutBody() {
  const weapons = resolveWeapons(chosen);
  const gun = weapons.cannon;
  const nose = weapons.flame ?? weapons.laser;

  // Every weapon states one number, so a fit can be compared across the three
  // of them: damage to a hull per second. The guns multiply out from the
  // cadence the simulation actually fires at rather than the rung's nominal
  // rate, which a cooldown of whole ticks cannot always hit exactly; what
  // they are made of stays on the CANNON bay, a ladder to a bar.
  const dps = gun ? gun.slots * gun.damage * (TPS / gun.cooldown) : nose.damage;

  const figures = [
    ["HULL", ARMOUR[chosen.armour].maxHp, "points"],
    ["TOP SPEED", Math.round(ENGINES[chosen.engine].maxSpeed * KMH_PER_SPEED_UNIT), "km/h"],
    ["FIREPOWER", Math.round(dps), "dps"],
    ["REACH", gun ? gun.reach : nose.range, "metres"],
  ];

  return `
    ${silhouette()}
    <div class="figures">
      ${figures.map(([label, value, caption]) => `
        <div class="figure">
          <i>${label}</i>
          <b>${value}</b>
          <em>${caption}</em>
        </div>`).join("")}
    </div>`;
}

// --- bays -------------------------------------------------------------------

/**
 * One bay in the overview: what is fitted there, and how it measures up as
 * bars. Clicking opens the bench below it with the ways to change it.
 */
function bayCard({ slot, label, action }) {
  const open = openBay === slot;
  // A ladder with nothing left to buy says so rather than offering again.
  const invite = atTop(slot) ? "Maxed" : action;

  return `
    <button class="bay${open ? " open" : ""}" data-bay="${slot}" aria-expanded="${open}">
      <div class="bay-label">${label}</div>
      <b>${fittedName(slot)}</b>
      <div class="bay-art">${bayArt(slot)}</div>
      ${bayPips(slot)}
      <div class="stats-grid">${bayBars(slot)}</div>
      <span class="bay-more">${open ? "Close &times;" : `${invite} &rsaquo;`}</span>
    </button>`;
}

/** True once a ladder has no rung left to step to. A choice has no top. */
const atTop = (slot) =>
  isLadder(slot) && IDS[slot].indexOf(chosen[slot]) === IDS[slot].length - 1;

const fittedName = (slot) =>
  (slot === "weapon" ? WEAPONS[chosen.weapon].label : TABLES[slot][chosen[slot]].name);

function bayArt(slot) {
  if (!isLadder(slot)) return weaponArt(slot === "weapon" ? chosen.weapon : chosen[slot]);
  return ladderArt(slot, IDS[slot].indexOf(chosen[slot]), IDS[slot].length);
}

/** A ladder shows how far up it stands. A choice has no rungs to show. */
function bayPips(slot) {
  if (!isLadder(slot)) return "";
  return tierPips(IDS[slot].indexOf(chosen[slot]), IDS[slot].length);
}

function bayBars(slot) {
  if (slot === "weapon") return weaponPropBars(chosen.weapon);
  return BARS[slot](TABLES[slot][chosen[slot]]);
}

// --- the bench under the open bay -------------------------------------------

/**
 * Where a fitting is actually changed. A ladder gets its one card and an
 * upgrade button, a choice gets a card per alternative, and the weapon gets
 * its switch plus a card for every property of whichever is carried.
 */
function benchMarkup() {
  if (!openBay) return "";
  const bay = BAYS.find((b) => b.slot === openBay);

  return `
    <div class="bench">
      <div class="bench-head">
        <b>${bay.label}</b>
        <i>${benchHint(openBay)}</i>
        <button class="linkish" data-close>Done &times;</button>
      </div>
      ${benchBody(openBay)}
    </div>`;
}

function benchHint(slot) {
  if (slot === "weapon") return "one at a time — the others keep their rungs";
  if (isLadder(slot)) return `${IDS[slot].length} rungs, and only one way up`;
  return `${IDS[slot].length} to choose from`;
}

function benchBody(slot) {
  if (slot === "weapon") return weaponColumn();
  if (isLadder(slot)) return `<div class="options single">${upgradeCard(slot)}</div>`;
  return `<div class="options">${choiceCards(slot)}</div>`;
}

function closeBench() {
  if (!openBay) return;
  openBay = null;
  refresh();
}

/**
 * Escape closes an open bench. The hangar is the first screen, so there is
 * nothing further back for it to mean here.
 */
function attachMenuKeys() {
  detachMenuKeys();
  menuKeyHandler = (e) => { if (e.code === "Escape") closeBench(); };
  addEventListener("keydown", menuKeyHandler);
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

// --- enemy roster -----------------------------------------------------------

/** What a type actually brings to the fight, in plain words. */
function armament(type) {
  const parts = [];
  // A carrier carries none of the three forward weapons: its armament is the
  // battery, and its real weapon is everything it puts in the air.
  if (type.sam) parts.push(`SAM · ${type.sam.salvo} per salvo`);
  else if (type.flame) parts.push("flame");
  else if (type.laser) parts.push("beam");
  else parts.push(`${type.barrels ?? 1} gun${(type.barrels ?? 1) > 1 ? "s" : ""}`);
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
    // Aircraft share one scale, so the roster reads as a size comparison as
    // well as a list. A carrier is several times longer than the longest of
    // them and would either burst its card or shrink every jet to a speck, so
    // it is fitted to its own box instead and its card says so.
    const fit = type.carrier
      ? (canvas.clientHeight * 0.86) / (96 * type.scale)
      : (canvas.clientHeight * 0.42) / 48;
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
      ${type.carrier ? `<div class="foe-swarm">launches · repairs · not to scale</div>` : ""}
      <div class="foe-stats">
        <span>${type.hp}</span> hull<br>
        <span>${Math.round(enemyDps(type))}</span> dps · <span>${type.range}</span> m<br>
        ${armament(type)}<br>
        <span>${type.score}</span> pts
      </div>
    </div>`;
}

// --- upgrade cards ----------------------------------------------------------

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

/**
 * Hull and engine are one fitting apiece, not a choice between several: the
 * card shows what is bolted on and a button that steps it up a rung, so the
 * ladder reads as a ladder.
 */
function upgradeCard(slot) {
  const ids = IDS[slot];
  const table = TABLES[slot];
  const tier = ids.indexOf(chosen[slot]);
  const spec = table[ids[tier]];
  const next = ids[tier + 1] ? table[ids[tier + 1]] : null;
  const [, read, format] = AXES[slot][0];

  // The current figure is already on the bar above, so the button only needs
  // to say what it buys.
  const button = next
    ? `<button class="upgrade" data-upgrade="${slot}">
         Upgrade to <i>${format(read(next))}</i>
       </button>`
    : `<button class="upgrade" disabled>Fully upgraded</button>`;

  return `
    <div class="opt selected" data-slot="${slot}">
      <b>${spec.name}</b>
      ${tierPips(tier, ids.length)}
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
  openBay = null;
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

  const ids = IDS[slot];
  const next = ids[ids.indexOf(chosen[slot]) + 1];
  if (next) select(slot, next);
}

// --- forward weapon tracks --------------------------------------------------

/**
 * One forward weapon at a time: a switch to pick which, and the properties of
 * whichever is picked. The others keep their rungs while they are put away,
 * so coming back to one finds it where you left it.
 */
function weaponColumn() {
  const picks = WEAPON_IDS.map((id) => `
    <button class="pick${id === chosen.weapon ? " selected" : ""}" data-weapon="${id}">
      ${WEAPONS[id].label}<i>${WEAPONS[id].blurb}</i>
    </button>`).join("");

  const cards = Object.keys(WEAPONS[chosen.weapon].props)
    .map((prop) => propCard(chosen.weapon, prop))
    .join("");

  return `
    <div class="weapon-column">
      <div class="weapon-pick">${picks}</div>
      <div class="options">${cards}</div>
    </div>`;
}

function propCard(track, prop) {
  const spec = WEAPONS[track].props[prop];
  const key = `${track}.${prop}`;
  const rung = chosen[key] ?? 0;
  const top = spec.tiers.length - 1;

  const button = rung < top
    ? `<button class="upgrade" data-upgrade="${key}">
         Upgrade <i>${spec.format(spec.tiers[rung + 1])}</i>
       </button>`
    : `<button class="upgrade" disabled>Maxed</button>`;

  return `
    <div class="opt prop selected" data-slot="${key}">
      <b>${spec.label}</b>
      ${tierPips(rung, spec.tiers.length)}
      <div class="prop-value">${spec.format(spec.tiers[rung])}</div>
      ${button}
    </div>`;
}

// --- choice cards -----------------------------------------------------------

/** Missiles and bombs are picked, not climbed: one card per alternative. */
function choiceCards(slot) {
  return IDS[slot].map((id) => {
    const spec = TABLES[slot][id];
    return `
      <div class="opt${id === chosen[slot] ? " selected" : ""}" data-slot="${slot}" data-id="${id}">
        <b>${spec.name}</b>
        ${weaponArt(id)}
        <div class="stats-grid">${BARS[slot](spec)}</div>
      </div>`;
  }).join("");
}

/**
 * A small drawing of each weapon, so the row reads at a glance before you
 * get to the numbers. Muzzle or nose points right, matching the plane art's
 * convention of facing the direction of travel.
 *
 * `main` is the body, `dim` the secondary detail.
 */
const WEAPON_ART = {
  // --- the three forward weapons: breech left, business end right ---
  cannon: `
    <rect class="dim" x="-18" y="-7" width="10" height="14" rx="2"/>
    <rect class="main" x="-9" y="-5.6" width="23" height="2.6"/>
    <rect class="main" x="-9" y="-1.3" width="27" height="2.6"/>
    <rect class="main" x="-9" y="3" width="23" height="2.6"/>`,

  flame: `
    <rect class="dim" x="-19" y="-5" width="11" height="10" rx="3"/>
    <path class="main" d="M -8,-3.4 L 3,-7 L 7,-2.6 L 14,-4 L 12,0 L 14,4
                          L 7,2.6 L 3,7 L -8,3.4 Z"/>`,

  // An emitter and the beam itself, which is the whole weapon.
  laser: `
    <rect class="dim" x="-19" y="-7.5" width="10" height="15" rx="2"/>
    <polygon class="main" points="-9,-5.6 -1,-3 -1,3 -9,5.6"/>
    <rect class="main" x="-1" y="-1.5" width="21" height="3"/>
    <path class="arc" d="M 4,-6.5 L 13,-6.5 M 4,6.5 L 13,6.5"/>`,

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
  refresh();
}

// --- game over --------------------------------------------------------------

export function showGameOver(world, onFlyAgain, onChangePlane) {
  // A run that skipped the early waves is not comparable to one that flew
  // them, so it can read the best but never set it.
  const best = world.practice ? loadBest() : Math.max(loadBest(), world.score);
  if (!world.practice) saveBest(best);

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
    ${world.practice ? `<div class="hint">practice run — not recorded</div>` : ""}
    <div class="loadout-recap">
      ${WEAPONS[p.weapon].label} · ${p.missile.short} · ${p.bomb.short}
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
