# Afterburner

A browser dogfighting game. You fly a jet in a top-down arena and shoot down
waves of enemy fighters while they try to shoot you down.

No dependencies, no framework, no asset files — rendering is Canvas 2D, sound
is synthesised with WebAudio at runtime.

## Running it

```bash
bun run dev      # or: npm run dev   — both work, no install needed
```

Then open <http://localhost:8765>.

The dev server (`scripts/serve.js`) is ~50 lines of `node:http` and exists only
because ES modules can't be loaded over `file://`. It runs on Node and Bun alike.

```bash
bun run build    # bundles everything into dist/index.html
npm test         # checks no airframe dominates another
```

The build inlines the JS and CSS into a single self-contained HTML file you can
open straight from disk or drop on any static host. It needs Bun (for its
bundler); development does not.

## Airframes

You pick a jet in the hangar before each run. There are four, and the roster is
built around one rule: **no airframe is better than another at everything.**

| | Role | Strong | Weak |
| --- | --- | --- | --- |
| **Viper** | Interceptor | Nothing to apologise for | Best at nothing |
| **Wraith** | Knife-fighter | Turn rate, tiny hitbox, acceleration | Hull, guns, missiles |
| **Bastion** | Gunship | Hull, damage, missile load | Turn rate, speed, big target |
| **Sabre** | Energy fighter | Top speed, rate of fire, range | Turn rate, hull |

`npm test` enforces that rule. It compares every plane against every other
across nine axes and fails if any one is never-worse than another, which would
collapse the choice into a single correct answer. Run it after touching
`PLANES` in `src/config.js`.

The stat bars in the hangar are normalised from those same numbers rather than
hand-authored, so the UI cannot drift out of sync with how the planes fly.

## Controls

| Input | Action |
| --- | --- |
| Mouse, or `A` / `D` | Steer |
| `W` / `Shift` | Afterburner |
| `S` | Throttle back |
| Left click / `Space` | Cannon |
| Right click / `F` | Fire missile (needs a lock) |
| `P` | Pause |

Turn rate scales *inversely* with airspeed, so slowing down turns tighter.
That one rule is what makes throttle management, rather than reflexes, decide
a turning fight.

## Layout

```
index.html              Canvas + overlay shell; loads src/main.js as a module
src/
├── main.js             Entry point: screen state machine and the frame loop
├── simulate.js         One tick of the game, in order — the simulation's contents page
├── world.js            The single mutable state object every system reads
├── waves.js            Wave pacing and spawn queue
├── config.js           Every balance number, incl. the PLANES roster, in one place
├── core/               Engine-level plumbing, no game rules
│   ├── math.js         Angles, clamping, distance
│   ├── viewport.js     Canvas sizing and device-pixel-ratio scaling
│   ├── input.js        Raw keyboard and mouse state
│   ├── audio.js        Runtime-synthesised sound effects
│   └── storage.js      Best-score persistence
├── entities/           Game rules; each exports plain functions taking `world`
│   ├── player.js       Flight model, weapons handling, missile lock
│   ├── enemy.js        Spawning, AI state machine, damage resolution
│   ├── weapons.js      Firing: trigger pull to projectile
│   ├── projectiles.js  Flight and impact of bullets and missiles
│   ├── pickups.js      Repair and ammo crates
│   └── effects.js      Particles, shockwaves, screen shake (cosmetic only)
├── render/             Drawing only; never mutates game state
│   ├── scene.js        The world pass, and the camera
│   ├── jet.js          The jet silhouette, drawn as vector paths
│   └── hud.js          Instruments, radar, warnings
├── ui/screens.js       Hangar (plane picker) and game-over DOM overlays
└── styles.css          Styling for those overlays (the game itself is all canvas)
scripts/
├── serve.js            Dev server
├── build.js            Single-file bundler
└── check-balance.js    Asserts no airframe dominates another
```

## How a frame works

```
requestAnimationFrame
        │
        ├─ simulate(world) × N     fixed 60 Hz steps, N depends on elapsed time
        │     player → enemies → projectiles → pickups → effects → waves
        │
        ├─ drawScene(world)        world-space pass, behind the HUD
        └─ drawHud(world)          screen-space instruments
```

The simulation runs on a **fixed timestep** while rendering runs once per
animation frame. A slow machine drops frames rather than running the game in
slow motion, and the physics behave identically on a 60 Hz and a 144 Hz display.

## Conventions worth knowing

- **One state object.** Everything mutable lives on `world` (see `world.js`),
  and systems are plain functions taking it as their first argument. There is
  no inheritance and no hidden global, so "what can change?" has one answer and
  the update order is explicit in `simulate.js`.
- **Rendering never mutates.** Anything under `render/` reads `world` and draws.
  If you find yourself changing state there, it belongs in `entities/`.
- **Balance lives in `config.js`.** Tuning how the game feels should not require
  reading simulation code.
- **No timers in gameplay.** Delays are tick countdowns on `world`, not
  `setTimeout`, so they pause with the game and stay deterministic.
- **Per-plane stats live on `player.stats`**, not in module-level constants,
  so the flight model reads the same whichever airframe you chose.
- **Angles are radians**, `0` points along +X, and `steer()` in `core/math.js`
  is how anything rotates toward a heading the short way round.
