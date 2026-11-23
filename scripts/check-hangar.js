/**
 * Asserts the hangar can draw every fit it will ever be asked to draw.
 *
 * The bays are generated rather than written out — a bomb system's cards come
 * from its ladders, and a locked FUSE rung's label comes from the engine that
 * unlocks it — so a missing drawing, a ladder with no formatter or an id that
 * exists in config but nowhere else is invisible in code and obvious the first
 * time somebody opens that bench. This walks the whole product: six bomb
 * systems x ten engines x three rung sets, plus the other four bays.
 *
 * It renders to strings against a stubbed DOM rather than a real browser, so
 * what it proves is that the markup generates and says what it should — not
 * that it looks right.
 *
 *   npm test
 *
 * No test framework, no dependencies: it exits non-zero on failure.
 */

// --- just enough browser for ui/screens.js to render -----------------------
const noop = () => {};
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };

const stubElement = () => ({
  className: "", innerHTML: "", style: {}, dataset: {}, clientWidth: 100,
  addEventListener: noop, getContext: () => null, set onclick(_) {},
  querySelector: () => stubElement(), querySelectorAll: () => [],
});

globalThis.document = {
  getElementById: () => stubElement(),
  querySelector: () => stubElement(),
  querySelectorAll: () => [],
  createElement: () => stubElement(),
  body: stubElement(),
};
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;

const { __test_renderHangar, __test_setLoadout } = await import("../src/ui/screens.js");
const { BOMBS, BOMB_IDS, ENGINE_IDS, ENGINES, maxFuseRung } =
  await import("../src/config.js");

let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) failures++;
  console.log(`  ${condition ? "pass" : "FAIL"}  ${name}${condition ? "" : `  ${detail}`}`);
}

/** Put a bomb system on the bench at a given rung, on a given engine. */
function renderBomb(bombId, engine, rung) {
  const loadout = { bomb: bombId, engine };
  for (const [prop, ladder] of Object.entries(BOMBS[bombId].props)) {
    loadout[`${bombId}.${prop}`] = Math.min(rung, ladder.tiers.length - 1);
  }
  __test_setLoadout(loadout);
  return __test_renderHangar("bomb");
}

// --- every bomb bench, on every engine, at three rung sets ----------------
console.log("\nEVERY BOMB BENCH RENDERS");
{
  let renders = 0;
  const problems = [];

  for (const bombId of BOMB_IDS) {
    for (const engine of ENGINE_IDS) {
      for (const rung of [0, 2, 4]) {
        let html;
        try {
          html = renderBomb(bombId, engine, rung);
        } catch (err) {
          problems.push(`${bombId} / ${engine} / rung ${rung}: ${err.message}`);
          continue;
        }
        renders++;

        // The fitted system has to name itself, and every one of its ladders
        // has to have produced a card.
        if (!html.includes(BOMBS[bombId].name)) {
          problems.push(`${bombId} is missing from its own bench`);
        }
        for (const ladder of Object.values(BOMBS[bombId].props)) {
          if (!html.includes(`<b>${ladder.label}</b>`)) {
            problems.push(`${bombId} has no ${ladder.label} card`);
          }
        }
        // All six are always on the switch, whichever is carried.
        const picks = (html.match(/data-pick="/g) || []).length;
        if (picks !== BOMB_IDS.length) {
          problems.push(`${bombId} bench offers ${picks} systems, not ${BOMB_IDS.length}`);
        }
      }
    }
  }

  check(`${renders} renders across every system, engine and rung`,
    problems.length === 0, `\n    ${problems.slice(0, 5).join("\n    ")}`);
}

// --- the fuse gate has to be visible, not just enforced -------------------
/**
 * A gated rung is shown rather than hidden, so a bay never silently changes
 * shape when something in another bay is upgraded. That means a locked pip and
 * a button naming the engine to go and buy.
 */
console.log("\nTHE FUSE GATE IS LEGIBLE IN THE HANGAR");
{
  const gated = BOMB_IDS.filter((id) => BOMBS[id].props.fuse);
  const stock = ENGINE_IDS[0];
  const top = ENGINE_IDS[ENGINE_IDS.length - 1];

  for (const bombId of gated) {
    const onStock = renderBomb(bombId, stock, 0);
    const onTop = renderBomb(bombId, top, 0);
    const rungs = BOMBS[bombId].props.fuse.tiers.length;
    const lockedOnStock = rungs - 1 - maxFuseRung(stock);

    check(`${BOMBS[bombId].short}: ${lockedOnStock} rungs drawn locked on a ${ENGINES[stock].short}`,
      (onStock.match(/class="locked"/g) || []).length === lockedOnStock);
    check(`${BOMBS[bombId].short}: the lock says which engine opens it`,
      /Needs [A-Z]+/.test(onStock), "no engine named on the gated button");
    check(`${BOMBS[bombId].short}: nothing is locked on a ${ENGINES[top].short}`,
      !onTop.includes('class="locked"'));
    check(`${BOMBS[bombId].short}: FUSE says which way up is`,
      onTop.includes("shorter is better"), "a descending ladder reads as a shrinking bar");
  }
}

// --- the other four bays still draw ---------------------------------------
console.log("\nTHE OTHER BAYS ARE UNCHANGED");
for (const slot of ["armour", "engine", "weapon", "missile"]) {
  let ok = false;
  let detail = "";
  try {
    __test_setLoadout({});
    ok = __test_renderHangar(slot).length > 100;
  } catch (err) {
    detail = err.message;
  }
  check(`the ${slot} bay renders`, ok, detail);
}

if (failures) {
  console.error(`\nFAIL — ${failures} hangar check(s) failed`);
  process.exit(1);
}
console.log("\nPASS — every bay renders, and the fuse gate is visible where it bites");
