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
npm test         # roster invariants + weapon, bomb and carrier behaviour
```

The build inlines the JS and CSS into a single self-contained HTML file you can
open straight from disk or drop on any static host. It needs Bun (for its
bundler); development does not.

### Starting partway through

```
http://localhost:8765/?wave=18
```

`?wave=n` opens a run on wave *n* instead of the first, which is the only
practical way to reach the late roster — the Supercarrier is twenty cleared
waves away otherwise. It is a URL parameter rather than a control in the
hangar so the game carries no interface for it, it survives a reload, and
`dist/index.html` honours it straight off the filesystem.

Runs started this way are marked as practice: the game-over screen says so,
and the score can read the persisted best but never set it. Loadout is
whatever the hangar has fitted, and fittings are free, so pair it with a
weapon built for what you are testing.

## Your aircraft

There is one airframe. Hull and engine are single fittings you **upgrade**
rung by rung; the forward weapon is a **switch** between three systems, each
with property ladders of its own; missile and bomb are **choices** between
three or four alternatives.

### The hangar

The hangar opens on an overview rather than on every control at once: a
readout strip of what this fit adds up to — hull, top speed, firepower,
reach — and under it five **bays**, one per fitting, each showing what is
installed there and its figures as bars.

Clicking a bay opens its **bench** underneath, which is where a fitting
actually changes: a ladder gets its card and an upgrade button, a choice gets
a card per alternative, and the weapon gets its switch plus a card for every
property of whichever is carried. Clicking the bay again, or pressing Escape,
closes it. Everything above redraws on every change, so the consequence of a
pick is visible at the moment it is made — upgrade the engine and the top
speed in the readout moves with it.

Every figure in the readout goes through `resolveWeapons` — the same function
the simulation uses — rather than being computed for display, so the overview
cannot promise something the aircraft will not do.

### Hull and engine

Both are ladders defined in `ARMOUR` and `ENGINES` in `src/config.js`, in
order from weakest to strongest. Add or remove a rung and the hangar follows:
the tier gauge, the card artwork and the upgrade button are all derived from
a rung's position rather than written per rung.

The engine sets top speed and nothing else — cruise, stall, turn rate and
acceleration are shared — so it is purely how fast you can run.

Turn rate falls as speed rises, which means a powerful enough engine would
drive it to zero and then through it, reversing the controls. `PLAYER.minAgilityFactor`
floors it, and `npm test` fails any engine that cannot turn 180 degrees in
six seconds at full throttle — so a new top-end rung cannot quietly make the
aircraft unflyable.

**These two are ladders, not choices**, and the hangar presents them that
way: a tier gauge on the bay, and a bench with one card and a button that
steps it up. Both start on their bottom rung, and **Reset fittings** at the
foot of the hangar puts the whole loadout — ladders and weapons alike — back
to stock, since upgrading only goes one way. Heavier armour is strictly better than light and a stronger engine
strictly better than a weak one, because nothing is traded against them yet.

`npm test` checks that the order holds rather than pretending there is a
tradeoff to protect. Give them a cost — mass against turn rate, or a budget
shared across the rows — and the no-dominance check that guards the weapons
applies to them too.

## Loadout

Missiles and bombs are real choices: the same no-dominance rule applies
inside each category, so no missile or bomb is better than its siblings at
everything.

### Forward weapons

Three of them, and you fly with exactly one. The weapon row is a switch:
fitting a weapon unfits the other two, and only the fitted weapon's property
cards are shown. Each weapon remembers the rungs you bought for it, so
switching away and back returns you to the gun you built rather than a stock
one.

| | | |
| --- | --- | --- |
| **Cannon** | bullets, from the wings | type (regular / pierces 3), slots (2–4), damage (4–10), reach (250–1500 m), rate (2–5/s) |
| **Flame** | a 48° cone from the nose | damage (20–240/s), reach (120–450 m) |
| **Laser** | a beam from the nose | damage (15–170/s), reach (600–2400 m) |

Maxed, the three come out at **200**, **240** and **170 dps**, and that is the
point of the numbers above rather than any one of them. The cannon's three
ladders *multiply* — `slots × damage × rate` — so its ceiling is the product
of its top rungs, and each rung has to be modest for the product not to be
absurd. The hangar's FIREPOWER readout states that product, in dps, for
whichever weapon is fitted, so the three can be compared at a glance.

The trade is reach against damage. The flame hits hardest and sweeps 48°
across, but 450 m means fighting inside everything the enemy has; the laser
reaches 2400 m — as far as radar sees — and pays for it in rate of damage;
the cannon sits between them on both, and is the only one that can pierce.

Each property is its own ladder of five rungs with its own card and upgrade
button, defined in `WEAPONS` in `src/config.js` — add a property and the
hangar grows a card for it. Cannon slots are barrels, laid out across the
wings, and reach is a real distance: a round expires exactly at it.
Piercing rounds carry on through what they kill, and fly as heavy amber slugs
instead of the thin cyan of a regular belt, so the belt you are firing reads
off the tracers rather than the HUD.

Neither nose weapon damages on contact. Both *ignite*, and the fire does the
killing, so a laser sweeping across a formation lights up everything it
crosses. Where the two overlap, the fiercer fire wins rather than whichever
landed last.

You start on the cannon at its weakest: two wing guns, regular rounds.

| Missile | | |
| --- | --- | --- |
| **Hydra rocket pod** | 30 carried, 28 dmg | Unguided, 2 per pull — you do the aiming |
| **Sidewinder heat-seeker** | 6 carried, 70 dmg | Seeks a forward arc to 900 m |
| **AMRAAM all-aspect** | 3 carried, 150 dmg | Fire in any direction; finds anything on the radar |

| Bomb | | |
| --- | --- | --- |
| **Dynamite** | 10 carried, 200 m, 90 dmg, 1.0s | Usable while someone is on you |
| **Proximity mine** | 5 carried, 260 m, 260 dmg, no fuse | Waits where you left it until something touches it |
| **Mk 82 heavy bomb** | 3 carried, 500 m, 220 dmg, 5.0s | The middle ground |
| **B61 nuclear** | 1 carried, 1000 m, 650 dmg, 8.0s | Erases almost anything |

Damage scales with the size of the blast and is flat inside the radius, so the
circle drawn on the ground means exactly what it looks like. Nothing is immune,
including you — but nothing is guaranteed dead either. An armoured hull walks
away from its own dynamite; a light one does not.

The **proximity mine** is the odd one. It has no fuse at all: it sits where you
dropped it indefinitely, and goes off when any aircraft comes within 46 m of
it — yours or theirs, it does not look. It draws a bright ring at that trigger
distance as well as its blast circle, greyed out until it arms 40 ticks after
the drop, which is what stops it killing you on release. Laying a line of them
across a wave's approach is the point; forgetting where you put one is the
cost.

The missiles differ in how far and how wide their seekers look. Hydra has no
seeker at all. The Sidewinder searches a forward arc out to 900 m. The AMRAAM
is all-aspect out to `RADAR_RANGE`, the same constant the radar display uses —
so "if it is on your radar, the missile will find it" is enforced rather than
merely claimed, including for something sitting on your six.

`check-weapons.js` pins the mechanics that are invisible when they break —
pierce depth, ignition and its damage-over-time, salvo size, and the lock
requirement. `check-bomb.js` proves each bomb kills friend and foe at its own
radius on its own fuse, and that each is escapable at cruise speed.

Every card in the hangar is a name, a drawing
and a set of bars. Each bar states its own value and unit inline, and is
normalised against the other options in its own category. Nothing is
hand-authored, so a card cannot advertise something the simulation does not
do. The prose descriptions that used to sit on each card live here in the
README instead.

Because the turn-rate penalty is measured against a shared reference speed
rather than any particular top speed, going fast costs turn: flat out on a
ramjet is the worst-turning you will ever be, and throttling back is how you
get it back.

## Enemies

Thirty types, escalating on their own rather than on a schedule. Each
declares the earliest wave it can appear in and how often it is drawn once
unlocked; the heaviest also cap how many can show up at once. Twenty-six of
them are aircraft; the other four are **carriers**, which are ships and are
described on their own below.

| | Hull | Gun dps | Armament | From wave |
| --- | --- | --- | --- | --- |
| **Scout** | 16 | 7 | gun | 1 |
| **Fighter** | 30 | 12 | gun | 1 |
| **Midge** | 8 | 3 | gun · **swarms of 7** | 2 |
| **Shrike** | 55 | 54 | 2 guns | 3 |
| **Cinder** | 70 | 40 | **flame**, 180 m | 5 |
| **Glint** | 95 | 35 | **beam**, 900 m | 7 |
| **Culverin** | 240 | 126 | 3 guns | 8 |
| **Pyre** | 210 | 85 | **flame**, 260 m | 10 |
| **Prism** | 250 | 70 | **beam**, 1500 m | 11 |
| **Fusillade** | 300 | 240 | 4 guns | 12 |
| **Censer** | 430 | 120 | **flame**, 340 m | 15 |
| **Cyclops** | 540 | 110 | **beam**, 2200 m | 16 |
| **Bombarde** | 560 | 200 | 4 guns | 17 |
| **Moucheron** | 2 | 1 | gun · **swarms of 30** | 6 |
| **Raider** | 24 | 12 | gun | 2 |
| **Ace** | 45 | 18 | gun | 3 |
| **Interceptor** | 55 | 20 | gun | 4 |
| **Heavy** | 90 | 25 | gun | 4 |
| **Lancer** | 70 | 7 | gun + **missiles** | 5 |
| **Gunship** | 140 | 69 | twin guns | 6 |
| **Sower** | 110 | 9 | gun + **proximity mines** | 7 |
| **Marauder** | 260 | 87 | twin heavy guns · max 2 | 8 |
| **Reaper** | 150 | 22 | gun + **missiles** | 9 |
| **Dreadnought** | 420 | 112 | three barrels, 1200 m · max 1 | 11 |
| **Basilisk** | 340 | 66 | twin guns + **missile pairs** · max 2 | 12 |
| **Leviathan** | 700 | 132 | three barrels + **missiles** + **mines** · max 1 | 15 |
| **Escort Carrier** | 1,800 | 23 | **SAM**, 1000 m · launches · max 1 | 5 |
| **Fleet Carrier** | 3,000 | 36 | **SAM**, 1100 m · launches · max 1 | 10 |
| **Battle Carrier** | 4,200 | 50 | **SAM**, 1200 m · launches · max 1 | 15 |
| **Supercarrier** | 6,000 | 72 | **SAM**, 1300 m · launches · max 1 | 20 |

Gun dps assumes every round connects, which against a moving target it does
not — but the bottom of that table will still erase you if you fly straight at
it.

Two types swarm. The **Midge** is individually trivial — one burst kills one —
but a single slot in the wave puts seven in the air at once, arriving together
from one bearing as a cloud rather than filtering in one at a time. The
**Moucheron** takes that further: 2 hull, 1 damage, thirty of them, and the
fastest and tightest-turning thing flying. Nothing that small is easy to lead.
The Midge is capped at two draws and the Moucheron at one, so fourteen and
thirty are the ceilings.

A worst case of 43 aircraft on screen measured 1 ms a frame against a 16.7 ms
budget, so the swarms cost far less than they look like they should.

**Every aircraft carries exactly one forward weapon** — guns, a flame, or a
beam, never a combination. The carriers are the stated exception: they are
ships, they carry none of the three, and their armament is a SAM battery. A flame or beam carrier has no guns at all, so it has to
get its nose on you to do anything: the Cinder has to be within 180 m, and
the Censer's 120/s is the fiercest fire in the game but only out to 340 m.
The beam carriers trade that reach back, up to the Cyclops at 1700 m.

Their fire works the way yours does: it sets you alight rather than damaging
on contact, the HUD says **ON FIRE** with the rate, and the fire keeps burning
after you break away. Enemy beams are drawn red against your violet, and none
of it touches their own side.

Enemy figures stay under what you can reach — the fiercest enemy fire is
120/s against your ceiling of 240/s, and the longest enemy beam 1700 m against
2400 m. `npm test` holds that gap, so a new specialist cannot quietly
out-range a fully upgraded player.

Enemy missiles home on you and will not stop on their own side.

The **Sower** lays proximity mines — the same weapon you can carry, waiting to
be touched by whatever reaches them first. The **Leviathan** drops timed bombs
instead, carpeting ground it is about to leave. Both are indiscriminate, so a
Sower will gut its own escort, and leading a wave across its own minefield is
a real tactic.

Bombs hit hard enough to clear a late wave in one drop — a B61 kills every
type in the game outright except the Leviathan, which staggers out of it with
50 hull. That is what keeps the heavy end from becoming a damage race the guns
cannot win, without making the boss a formality.

Each type wears one of eight silhouettes from `render/hulls.js`, and the
roster gets visibly nastier as it goes: an ordinary swept-wing `jet`, the
needle-nosed `dart`, the twin-boom `brick`, the pod-hung `gunship`, the
forward-swept `claw` that reaches past its own nose, the bat-winged `wraith`,
the spined slab of the `leviathan`, and the flat-topped `carrier` with its
angled deck and its island. The heavier hulls carry a lit eye, so a dangerous
contact reads as dangerous before you have parsed its size.

**Know your enemy**, beside **How to fly** under the title, lists them all with
their hulls, guns, reach, armament and bounty, in the order you meet them, each
drawn with the renderer's own code so the silhouettes cannot drift from the
ones in the air. The aircraft all share one scale there, so the list doubles as
a size comparison; a carrier is several times longer than the longest of them
and is fitted to its own card instead, which says so.

### Carriers

Four of them, and they are not aircraft. A carrier ignores you completely: it
enters off the edge of the arena, crosses on the heading it arrived on, turns
away from the wall, and does two things the whole time it is alive. It launches
aircraft, and it takes damaged ones back aboard and repairs them.

It launches **without limit** — there is no magazine to empty and no timer that
sends it away. The wave it belongs to ends when the sky is clear, and the sky
cannot be clear while the ship is in it, so the hull is the objective rather
than a prize. What it launches is whatever the wave composer could legally draw
by then, carriers excepted: swarms and the capped heavyweights included, since
those caps govern what a *wave* contains rather than what a ship carries.

| | Hull | Launches | SAM | From wave | Bounty |
| --- | --- | --- | --- | --- | --- |
| **Escort Carrier** | 1,800 | every 5.0 s | 2 × 35 / 3.0 s, 1000 m | 5 | 3,000 |
| **Fleet Carrier** | 3,000 | every 3.5 s | 2 × 45 / 2.5 s, 1100 m | 10 | 7,000 |
| **Battle Carrier** | 4,200 | every 2.5 s | 2 × 55 / 2.2 s, 1200 m | 15 | 12,000 |
| **Supercarrier** | 6,000 | every 1.8 s | 2 × 65 / 1.8 s, 1300 m | 20 | 20,000 |

Each tier is capped at one per wave, and `GROUP_CAPS` holds the whole family to
**two at once**, so a late wave cannot field one of every tier.

#### The deck

Everything a carrier does goes through a deck of **three slots**, and takeoffs,
landing approaches and repairs all compete for them. That is the whole balance
of the thing: a full deck cannot launch, so keeping a carrier's aircraft hurt
is itself an attack on its ability to put more of them up.

An aircraft under **40%** of its hull, within 2200 m of a living carrier, is
claimed by it and flies itself home. It parks on the after deck, moving with
the ship, and four seconds later relaunches at **full health** — repeatably,
with no cooldown and no suppression while the carrier is under fire.

A parked aircraft is not safe. It stays in `world.enemies`: it does not fly, it
does not shoot, it is a legal target, and it still counts for wave clearance.
Strafing a full deck is the counterplay to the repair mechanic, and **sinking
the ship kills everything on it** — which is the payoff for going through
20,000 points of hull rather than picking off what comes out of it.

Launches leave bow-first on a catapult run, during which the aircraft neither
steers nor fires. A swarm draw is not thirty simultaneous catapult shots: it
fills a queue that streams off the deck at the same stagger `startWave` uses,
with a short takeoff run, so three are rolling at once rather than thirty and
the whole swarm clears in about a second and a half.

#### The battery

A carrier carries no forward weapon. Its armament is a surface-to-air battery
with no firing cone at all — a ship has no nose to point, so the only thing
that decides whether it shoots is whether you came inside the envelope. The
envelope is drawn on the ground the way a bomb's blast radius is, and brightens
when you cross it, so "if you get too close" is something you can see rather
than something you learn.

SAMs cannot be shot down and ignore your ordnance. `npm test` holds every
envelope inside both a fully upgraded beam's 2400 m reach and the radar's
2600 m, and every warhead under your best missile's 150, so standing off and
whittling stays a legitimate — if slow — answer to any carrier.

#### What this costs you

Upgrades are free, and the cannon spans 16 dps stock to 200 dps maxed, so
these hulls are not a difficulty curve so much as a **loadout check**. A stock
cannon needs nearly two unbroken minutes on the wave-5 Escort Carrier while it
puts an aircraft up every five seconds; a maxed one needs nine. The
Supercarrier is thirty seconds of perfect fire from a maxed cannon, thirty-five
from the beam, twenty-five from the flame — and the flame has to spend them
inside a 1300 m SAM envelope, at 450 m. None of those are achievable
uninterrupted, so a real kill runs two to three times longer.

Left alone, a carrier fills the sky. A headless run that kept an invincible
player circling two late carriers for a minute apiece peaked at **309 aircraft
airborne** at 1 ms a frame against a 16.7 ms budget — survivable by the
renderer, which is not the same as survivable by you. The lever on that is
`launchInterval` in `config.js`, not the bounty.

`check-carrier.js` pins the rules that are invisible when they break: that a
deck never oversubscribes, that nothing is left stuck in a deck state (waves
advance only when the sky empties, so an aircraft that never finishes its
takeoff run is a run that never ends), that a parked aircraft can be killed and
frees its slot, that sinking a ship takes its deck with it and leaves no wreck
holding a reference, that a carrier can never launch another carrier, that the
battery fires inside its envelope and holds fire outside it, and that a carrier
holds its heading with the player square off the beam.

`check-waves.js` samples the composer across forty waves and fails if any wave
comes out empty — invisible in code, but it would soft-lock the game, since
waves advance when the sky is cleared — as well as if anything appears before
its time, a per-type or group cap is exceeded, a type is unreachable, the waves
stop escalating, or a type names a hull that does not exist (which would
silently fall back to the plain fighter shape).

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
| `Esc` | Back a step — out of a reading screen, or pause then abandon a run |

**How to fly** carries this table and the three rules the keys cannot tell you
on their own.

Turn rate scales *inversely* with airspeed, so slowing down turns tighter.
That one rule is what makes throttle management, rather than reflexes, decide
a turning fight — and it does not depend on which engine you fitted.

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
│   ├── carrier.js      Carriers: transit, launching, the deck, the SAM battery
│   ├── bombs.js        Dropped bombs: fuse, blast, indiscriminate kills
│   ├── pickups.js      Repair and ammo crates
│   └── effects.js      Particles, shockwaves, screen shake (cosmetic only)
├── render/             Drawing only; never mutates game state
│   ├── scene.js        The world pass, and the camera
│   ├── hulls.js        Seven airframe silhouettes, drawn as vector paths
│   └── hud.js          Instruments, radar, warnings
├── ui/screens.js       Hangar (five loadout rows) and game-over overlays
└── styles.css          Styling for those overlays (the game itself is all canvas)
scripts/
├── serve.js            Dev server
├── build.js            Single-file bundler
├── check-balance.js    Asserts nothing dominates in any category
├── check-weapons.js    Asserts pierce, ignition, salvos and lock behave
├── check-bomb.js       Asserts each bomb's fuse and its friendly fire
├── check-waves.js      Asserts every wave is populated, capped and escalating
└── check-carrier.js    Asserts decks, launching, repair and sinking behave
```

## How a frame works

```
requestAnimationFrame
        │
        ├─ simulate(world) × N     fixed 60 Hz steps, N depends on elapsed time
        │     player → carriers → enemies → projectiles → bombs → pickups → effects → waves
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
- **Chosen fittings hang off the player** as `armour`, `engine`, `cannon`,
  `missile` and `bomb` specs, so the simulation reads whatever was picked and
  knows nothing about the hangar.
- **Angles are radians**, `0` points along +X, and `steer()` in `core/math.js`
  is how anything rotates toward a heading the short way round.
- **Carriers are flagged, not subclassed.** `entities/carrier.js` and
  `entities/enemy.js` talk to each other through two plain fields on the
  entity — `carrier` marks a ship, `onDeck` marks an aircraft that belongs to
  one — and `updateEnemy` simply returns early on either. Neither file imports
  the other, so there is no cycle and no inheritance; a carrier is an ordinary
  member of `world.enemies` that a different pass happens to drive.
