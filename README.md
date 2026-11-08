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
npm test         # roster invariants + weapon and bomb behaviour
```

The build inlines the JS and CSS into a single self-contained HTML file you can
open straight from disk or drop on any static host. It needs Bun (for its
bundler); development does not.

## Airframes

You pick a jet in the hangar before each run. There are three, and an
airframe differs from the others in **exactly two numbers**: hull and top
speed. Weapons, turn rate, acceleration, hitbox, cruise and stall speed are
all identical, and live in `PLAYER` in `src/config.js`.

| | Role | Hull | Top speed |
| --- | --- | --- | --- |
| **Viper** | Balanced | 100 | 1836 km/h |
| **Bastion** | Armoured | 150 | 1512 km/h |
| **Sabre** | Fast | 70 | 2203 km/h |

Speeds are stored as world units per tick (8.5, 7.0, 10.2) and shown in km/h,
treating one world unit as one metre — see `KMH_PER_SPEED_UNIT` in
`src/config.js`.

So the roster is a straight line through one tradeoff: hull for speed. No
plane is better than another at both.

`npm test` enforces that. It compares every plane against every other and
fails if one is never-worse, then fires each jet's gun and missiles and
samples its turn rate and hitbox, failing if anything other than hull and top
speed differs.

## Loadout

Separately from the airframe you pick a cannon, a missile and a bomb. Every
plane can carry any combination, and the same no-dominance rule applies inside
each category.

| Cannon | | |
| --- | --- | --- |
| **Vulcan rapid-fire** | 216 dps, 12 shots/s | Highest sustained damage on one target |
| **Avenger piercing** | 160 dps, 3.3 shots/s | Pierces 3 aircraft; dead time if you miss |
| **Firebelt flamethrower** | 100 dps, 260 m cone | No rounds to miss with, but very short reach. The flame does no damage itself — it only ignites, and the fire does all the killing |

| Missile | | |
| --- | --- | --- |
| **Hydra rocket pod** | 18 carried, 28 dmg | Unguided, 2 per pull — you do the aiming |
| **Sidewinder heat-seeker** | 6 carried, 70 dmg | Seeks a forward arc to 900 m |
| **AMRAAM all-aspect** | 3 carried, 150 dmg | Fire in any direction; finds anything on the radar |

| Bomb | | |
| --- | --- | --- |
| **Dynamite** | 6 carried, 200 m, 2.0s | Usable while someone is on you |
| **Mk 82 heavy bomb** | 3 carried, 500 m, 5.0s | The middle ground |
| **B61 nuclear** | 1 carried, 1000 m, 8.0s | Erases the sky |

Firebelt sprays a cone rather than firing rounds: nothing to miss with and it
catches everything inside it, but you have to be almost on top of the target.
The flame deals no damage of its own — it sets light to what it touches, and
the fire does all the killing, burning for 0.8 s after you break off. At 100
dps that is 80 damage from a single touch: enough to kill a fighter or an ace
outright, not quite enough for a heavy, which needs a second pass. Avenger's
pierce only pays when enemies line up.

The cards fold that fire into the one DAMAGE figure rather than splitting it
out, because for the Firebelt it *is* the damage. Its RATE reads as infinite,
since a flamethrower has no discrete shots — it is simply on or off. Pierce
is not a bar; the Avenger's name carries it.

The missiles differ in how far and how wide their seekers look. Hydra has no
seeker at all. The Sidewinder searches a forward arc out to 900 m. The AMRAAM
is all-aspect out to `RADAR_RANGE`, the same constant the radar display uses —
so "if it is on your radar, the missile will find it" is enforced rather than
merely claimed, including for something sitting on your six.

`check-weapons.js` pins the mechanics that are invisible when they break —
pierce depth, ignition and its damage-over-time, salvo size, and the lock
requirement. `check-bomb.js` proves each bomb kills friend and foe at its own
radius on its own fuse, and that each is escapable at cruise speed.

Every card in the hangar — airframe and weapon alike — is a name, a drawing
and a set of bars. Each bar states its own value and unit inline, and is
normalised against the other options in its own category. Nothing is
hand-authored, so a card cannot advertise something the simulation does not
do. The prose descriptions that used to sit on each card live here in the
README instead.

Because the turn-rate penalty is measured against a shared reference speed
rather than each plane's own maximum, two jets at the same airspeed corner
identically — and going fast costs turn. The Sabre at full throttle is the
worst-turning thing in the sky.

## Controls

| Input | Action |
| --- | --- |
| Mouse, or `A` / `D` | Steer |
| `W` / `Shift` | Afterburner |
| `S` | Throttle back |
| Left click / `Space` | Cannon |
| Right click / `F` | Fire missile (needs a lock) |
| `B` | Drop bomb |
| `P` | Pause |

Turn rate scales *inversely* with airspeed, so slowing down turns tighter.
That one rule is what makes throttle management, rather than reflexes, decide
a turning fight — and it is identical on every airframe.

### The bomb

`B` leaves a bomb where you are. It does not move, it cannot be shot down, and
five seconds later it kills **every aircraft within 500 units — including
yours**. The blast radius is drawn on the ground and on the radar while the
fuse burns, and the HUD warns you while you are standing in it.

Five seconds buys well over a thousand units of separation if you leave
immediately, so escaping is easy. Dropping one mid-turn, or to shake something
already on your tail, is how it takes you with it. That tension is the weapon.

Which bomb you carry is chosen in the hangar (see **Loadout** above); crates
resupply whatever you picked.

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
│   ├── bombs.js        Dropped bombs: fuse, blast, indiscriminate kills
│   ├── pickups.js      Repair and ammo crates
│   └── effects.js      Particles, shockwaves, screen shake (cosmetic only)
├── render/             Drawing only; never mutates game state
│   ├── scene.js        The world pass, and the camera
│   ├── jet.js          The jet silhouette, drawn as vector paths
│   └── hud.js          Instruments, radar, warnings
├── ui/screens.js       Hangar (plane + loadout pickers) and game-over overlays
└── styles.css          Styling for those overlays (the game itself is all canvas)
scripts/
├── serve.js            Dev server
├── build.js            Single-file bundler
├── check-balance.js    Asserts nothing dominates in any category
├── check-weapons.js    Asserts pierce, ignition, salvos and lock behave
└── check-bomb.js       Asserts each bomb's fuse and its friendly fire
```

## How a frame works

```
requestAnimationFrame
        │
        ├─ simulate(world) × N     fixed 60 Hz steps, N depends on elapsed time
        │     player → enemies → projectiles → bombs → pickups → effects → waves
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
