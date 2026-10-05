# TardiGeddon — Game Plan

A turn-based artillery game that reproduces the mechanics, feel and cartoon
styling of **Worms Armageddon** (Team17, 1999), with **tardigrades** (water
bears) as the playable characters.

This document is the master plan: what we are building, the rules of the
game, the technical architecture, and the order we build it in.

---

## 1. Vision

> "Worms Armageddon, but with tardigrades." Same tight turn-based chaos,
> destructible landscapes, absurd weapons and comedic voices — rebuilt from
> scratch with original art, audio and code.

**Pillars**

1. **Faithful mechanics.** Turn timer, wind, weapon physics, ninja rope,
   fall damage and retreat time should feel like WA to a veteran player.
2. **Destructible pixel terrain.** Every explosion carves the map.
3. **Cartoon personality.** Squeaky voice banks, chunky hand-drawn sprites,
   silly weapon names, gravestones, bobbing water at the bottom of the map.
4. **Couch first, online second.** Hot-seat multiplayer and AI from day one;
   online play built on a deterministic simulation.

### Legal / IP guardrails (important)

Game mechanics can't be copyrighted, but assets, names and trademarks can.
To stay safe:

- **No WA assets.** Every sprite, sound, voice line, font, music track and
  map is made from scratch (or uses properly licensed assets).
- **No trademarked or signature names.** "Worms", "Super Sheep", "Concrete
  Donkey", "Holy Hand Grenade" (also Monty Python), "Banana Bomb" and similar
  get tardigrade-themed replacements (see §4).
- **Inspired-by styling, not traced.** Similar *style* (bright cartoon
  sprites, parallax backdrops, comic UI) is fine; copying specific art,
  layouts or the logo is not.
- Marketing says "inspired by classic artillery games", not "Worms clone".

---

## 2. The Tardigrade Twist

Tardigrades are microscopic, eight-legged and famously near-indestructible.
We use that for flavour, not to change the core rules.

| WA element           | TardiGeddon equivalent                                         |
| -------------------- | -------------------------------------------------------------- |
| Worm                 | Tardigrade ("Tardi"), waddles on 8 stubby legs                 |
| Team of 4–8 worms    | Squad of 4–8 tardis with names, hat/fort/voice customisation   |
| Gravestone on death  | Shed cuticle / tiny "tun" husk marker                          |
| Water at map bottom  | Rising droplet / puddle (still instant death — they float off) |
| Landscapes           | Micro-world themes: moss, lichen, pond-bottom, petri dish, lab bench, Antarctic ice, outer space |
| Health crates        | Moss-snack crates                                              |
| Kamikaze             | "Cryptobiotic Burst" (curl into a tun and explode)             |

Optional mode (post-MVP): **Tun Mode** — once per game a tardi can enter
cryptobiosis, becoming immune to damage for one round but unable to move.

---

## 3. Core Rules & Mechanics

### 3.1 Match flow

1. Teams placed on the map (random or manual "place tardis" phase).
2. Teams take turns; within a team, tardis rotate (or "select tardi" utility).
3. Each turn: **turn timer** (default 45 s) → fire one weapon → **retreat
   time** (default 3 s, 5 s after utilities) → turn ends.
4. Turn also ends on taking damage, falling in water, or timer expiry.
5. **End-of-turn resolution:** explosions settle, damage numbers pop, dead
   tardis explode/drop markers, crates may drop.
6. **Sudden death** after the round timer (default 15 min): all tardis go
   to 1 HP and/or water rises each turn.
7. Last team with living tardis wins the round; first to N round wins.

### 3.2 Movement (match WA feel)

- Walk left/right; slow, terrain-hugging; small step-up on slopes.
- **Jump** (Enter): short forward hop. **Backflip** (Enter ×2): high
  backward jump.
- Fall damage above a height threshold (configurable); falling ends turn.
- Slide on steep slopes / after being knocked back.
- Knockback from explosions launches tardis as physics projectiles until
  they come to rest.

### 3.3 Damage & health

- Default 100 HP per tardi (scheme-configurable).
- Explosion damage = falloff from center over radius; knockback scales same.
- Poison (from skunk-equivalent) does 5 HP/turn.
- Damage taken is shown as floating numbers and applied at end of turn.
- Death: tardi pops, leaves a marker; optional "death explosion".

### 3.4 Environment

- **Wind:** random per turn, shown as a bar; affects lightweight projectiles
  (bazooka, mortar, cluster, airstrikes) but not grenades/bullets.
- **Water:** bottom of map, instant death. Rises in sudden death.
- **Map borders:** walled or open (fall off the sides = death).
- **Mines:** placed randomly at start; 3–5 s fuse when triggered, some duds.
- **Oil drums:** explode into burning fire particles when damaged.
- **Crates:** weapon, health and utility crates parachute in between turns.

### 3.5 Aiming & firing

- Aim angle with up/down; crosshair at fixed distance.
- **Charge power** by holding fire (power bar) for thrown/launched weapons.
- Fuse timer (1–5 s, keys 1–5) and bounce (+/-) for grenades.
- Targeted weapons (airstrike, teleport, homing) use a mouse click target.
- Shot-type weapons (shotgun, handgun, uzi) fire instantly in a line.

---

## 4. Weapons & Utilities

Physics behaviour mirrors the WA counterpart; names and visuals are ours.
Tiered by build phase (**P1** = MVP, **P2** = full set, **P3** = superweapons).

### 4.1 Projectiles & explosives

| Phase | TardiGeddon name        | WA-equivalent behaviour                                    |
| ----- | ----------------------- | ---------------------------------------------------------- |
| P1    | Spore Bazooka           | Bazooka — wind-affected rocket, explodes on impact         |
| P1    | Pebble Grenade          | Grenade — timed fuse, bounces, ignores wind                |
| P1    | Algae Cluster           | Cluster bomb — timed, splits into bomblets                 |
| P2    | Homing Spore            | Homing missile                                             |
| P2    | Mortar Pod              | Mortar — impact + cluster fragments                        |
| P2    | Pollen Pigeon           | Homing pigeon                                              |
| P2    | Bacteria Bomb           | Banana bomb — big bouncing cluster                         |
| P2    | Rotifer Roller          | Super Sheep — controllable walking bomb (flies on 2nd press) |
| P2    | Nematode Strike         | Earthquake / bunker buster drill-down explosive            |
| P2    | Microplastic Mine       | Mine — placeable                                           |
| P2    | Sticky Dynamite         | Dynamite — dropped, long fuse, big blast                   |
| P2    | Cyanobloom Cloud        | Skunk — releases poison gas                                |
| P2    | Brine Drum              | Oil drum (placeable)                                       |
| P2    | Ice Shard Petrol Bomb   | Petrol bomb — fire spread                                  |
| P3    | Holy Water Droplet      | Holy hand grenade — huge timed blast                       |
| P3    | Concrete Tun            | Concrete donkey — repeated drop-through slam               |
| P3    | Microscope Slide Slam   | Armageddon / meteor shower — map-wide strikes              |
| P3    | Petri Dish Nuke         | Indian nuclear test — raise water + poison all             |
| P3    | Mad Microbes            | Mad cows — walking explosive herd                          |

### 4.2 Guns & melee

| Phase | Name                 | WA-equivalent                          |
| ----- | -------------------- | -------------------------------------- |
| P1    | Claw Shotgun         | Shotgun — two shots per turn           |
| P2    | Stylet Pistol        | Handgun                                |
| P2    | Cilia Uzi            | Uzi / minigun                          |
| P1    | Fire Punch           | Fire punch — uppercut launch           |
| P2    | Leg Kick             | Prod / dragon ball                     |
| P2    | Battle Water-Axe     | Battle axe — halve HP                  |
| P2    | Baseball Bat         | Baseball bat                           |
| P3    | Cryptobiotic Burst   | Kamikaze                               |

### 4.3 Airstrikes (target by click)

| Phase | Name                   | WA-equivalent       |
| ----- | ---------------------- | ------------------- |
| P2    | Raindrop Strike        | Air strike          |
| P2    | Acid Rain              | Napalm strike       |
| P2    | Mite Mail Strike       | Mail strike         |
| P3    | Mold Spore Strike      | Mole squadron       |

### 4.4 Utilities (movement & tools)

| Phase | Name                 | WA-equivalent                                    |
| ----- | -------------------- | ------------------------------------------------ |
| P1    | Silk Rope            | **Ninja rope** — swing, re-fire mid-air, use weapons while hanging |
| P1    | Leaf Parachute       | Parachute                                        |
| P1    | Teleport             | Teleport                                         |
| P1    | Twig Girder          | Girder — place beam                              |
| P2    | Bubble Jetpack       | Jet pack — fuel-limited                          |
| P2    | Spider Bungee        | Bungee                                           |
| P2    | Mandible Torch       | Blowtorch — tunnel horizontally                  |
| P2    | Drill Stylet         | Pneumatic drill — tunnel down                    |
| P2    | Low Gravity          | Low gravity                                      |
| P2    | Fast Walk            | Fast walk                                        |
| P2    | Skip Go / Surrender  | Same                                             |
| P2    | Select Tardi         | Select worm                                      |
| P3    | Freeze               | Freeze (team immune for a round)                 |
| P3    | Scales of Justice    | Scales of justice — equalise team HP             |

The **ninja rope** is the most important "feel" item; it gets its own
dedicated tuning milestone.

---

## 5. Game Modes & Schemes

- **Quick Match** — vs AI or hot-seat, random map, default scheme.
- **Multiplayer (local hot-seat)** — 2–6 teams on one machine.
- **Online** — lockstep peer/host-relay (Phase 4).
- **Training / Missions** — single-player challenges (target practice,
  rope races, survive-the-AI scenarios).
- **Schemes** (like WA `.wsc`): a JSON file controlling turn time, round
  time, HP, retreat time, fall damage, mine settings, crate rates, sudden
  death type, and per-weapon **ammo / power / delay** (rounds before
  available). Presets: *Intermediate*, *Pro*, *Elite*, *Rope Race*,
  *Shopper*, *Artillery (no movement)*, *BnG (bazookas & grenades)*.
- **Team editor:** team name, 8 tardi names, voice bank, gravestone,
  flag, fort. Team stats persisted locally.

---

## 6. Art & Audio Direction

**Visual style:** bright, chunky, hand-drawn 2D cartoon, matching WA's
readability at small sprite sizes.

- Logical resolution ~**1920×696 map** viewed through a scrolling,
  zoomable camera; tardi sprites ~30×30 px.
- Tardis: plump, translucent-pink/beige body, 8 stubby clawed legs,
  big expressive eyes, animated idle (blink, scratch, look around),
  hold-weapon poses, flying/tumble, drowning, victory dance.
- Terrain: textured fill + highlighted soil edge, scattered props
  (moss fronds, sand grains, pipette tips, coins at microscopic scale).
- Parallax background (3 layers) + animated water/droplet foreground.
- Explosion VFX: circular bloom, smoke puffs, debris particles, "POW"
  word art on big hits.
- UI: team-coloured name/HP labels over each tardi, wind bar, turn timer,
  round timer, weapon grid panel (right-click), chunky comic font.

**Audio**

- Voice banks per team (8+ banks): "Fire!", "Coward!", "Oof", "Bye-bye",
  "Revenge!", "Incoming!", "Watch this", etc. — recorded fresh, squeaky.
- SFX per weapon, splash, crate drop, mine tick, fuse hiss.
- Music: jaunty menu theme + ambient per landscape theme.

Asset pipeline: Aseprite → spritesheets (PNG + JSON atlas); audio as
OGG + MP3 fallback.

---

## 7. Technical Architecture

### 7.1 Stack (recommended)

| Concern     | Choice                                         | Why                                              |
| ----------- | ---------------------------------------------- | ------------------------------------------------ |
| Language    | **TypeScript**                                 | Type safety, single language client + server     |
| Build       | **Vite**                                       | Fast dev server, simple bundling                 |
| Rendering   | **PixiJS** (WebGL, Canvas fallback)            | Fast 2D sprites/particles; no forced physics     |
| Physics     | **Custom**, fixed-step, pixel-mask collision   | WA physics are not rigid-body; Box2D-style would feel wrong |
| Audio       | Howler.js                                      | Cross-browser audio sprites                      |
| Testing     | Vitest + Playwright                            | Unit-test sim; smoke-test the browser build      |
| Online      | Node + WebSocket relay (Phase 4)               | Lockstep input relay, no authoritative physics on server |
| Desktop     | Tauri or Electron wrap (later)                 | Steam/itch distribution                          |

Runs in a browser first: zero-install playtesting with a link.

### 7.2 Deterministic simulation (key decision)

Separate **simulation** from **presentation**:

- Simulation runs at a **fixed 50 ticks/s** using **fixed-point or
  integer math** (no `Math.sin` / floats in the sim path — use lookup
  tables) and a seeded PRNG.
- Inputs are the only thing that drives the sim → enables:
  - **Replays** (store seed + scheme + input log, like WA `.WAgame`).
  - **Lockstep online play** (send inputs only, tiny bandwidth).
  - **Reproducible bug reports and tests.**
- Renderer interpolates between ticks and is never read by the sim.

### 7.3 Terrain

- Terrain = **1-bit collision mask** (`Uint8Array`, 1 byte/pixel or
  bit-packed) + a separate colour texture for rendering.
- Explosions: carve a circle from the mask, clear pixels in the texture,
  draw a dark "burnt" rim; upload only the dirty rectangle to the GPU.
- Girders/blowtorch/drill write/clear mask pixels the same way.
- Collision for objects: sample mask along a small circle/outline;
  surface normal estimated from neighbouring solid pixels (for bounces
  and slide direction).
- **Map generation:** seeded noise (layered 1D/2D noise thresholded into
  islands/caverns), cut with theme texture, decorated with props. Also
  supports importing a PNG as a custom map (colour = land, transparent =
  air), like WA.

### 7.4 Entity model

Lightweight ECS-ish or plain classes (keep it simple):

- `Tardi` — position, velocity, hp, team, state machine
  (idle/walk/jump/fall/rope/jetpack/dead…), facing, aim.
- `Projectile` — weapon definition reference, fuse, bounce, wind factor.
- `Explosion`, `Fire`, `Gas`, `Mine`, `Drum`, `Crate`, `Rope`.
- Weapons are **data-driven** (`weapons/*.ts` definitions: damage,
  radius, wind factor, fuse, clusters, fire mode) with small behaviour
  hooks for special cases (rope, sheep, homing).

### 7.5 Proposed repo layout

```
TardiGeddon/
├─ docs/                 # this plan, design notes, scheme format
├─ src/
│  ├─ sim/               # deterministic core (no DOM, no Pixi)
│  │  ├─ math/           # fixed-point, trig tables, PRNG
│  │  ├─ terrain/        # mask, carving, generation
│  │  ├─ entities/       # tardi, projectile, mine, crate, ...
│  │  ├─ weapons/        # data-driven weapon defs + behaviours
│  │  ├─ rules/          # turn manager, scheme, sudden death, win check
│  │  └─ world.ts        # tick(inputs) -> new state + events
│  ├─ render/            # Pixi scene, camera, sprites, VFX, HUD
│  ├─ input/             # keyboard/mouse/gamepad -> input commands
│  ├─ audio/             # sound + voice bank playback from sim events
│  ├─ ai/                # CPU player (shot search on cloned sim)
│  ├─ ui/                # menus, team editor, scheme editor, weapon panel
│  ├─ net/               # lockstep client (Phase 4)
│  └─ main.ts
├─ server/               # WebSocket relay (Phase 4)
├─ assets/               # sprites, audio, maps, fonts (all original)
└─ tests/                # sim unit tests, replay determinism tests
```

### 7.6 AI opponents

- Each AI turn: enumerate candidate weapons × angles × power (× fuse),
  **simulate on a cloned world** (cheap thanks to the deterministic sim),
  score by enemy damage − self/friendly damage − risk of drowning.
- Difficulty = search breadth + random aim error.
- Later: movement before firing, rope/teleport use, crate seeking.

### 7.7 Controls (WA-style defaults, rebindable)

| Action          | Key                       |
| --------------- | ------------------------- |
| Walk            | ← →                       |
| Aim             | ↑ ↓                       |
| Jump / backflip | Enter / Enter ×2          |
| Fire / charge   | Space (hold)              |
| Weapon panel    | Right mouse / F1–F12 rows |
| Fuse time       | 1–5                       |
| Bounce          | + / −                     |
| Camera          | Mouse to edge / drag      |
| Select tardi    | Tab (if scheme allows)    |

Gamepad support in Phase 3.

---

## 8. Milestones / Roadmap

Each phase ends with something playable.

### Phase 0 — Foundations (≈1 week)
- Vite + TS + Pixi project, lint/format, Vitest, CI on GitHub Actions.
- Fixed-step loop, seeded PRNG, fixed-point math helpers.
- Determinism test harness (run N ticks twice → identical hash).

### Phase 1 — Vertical slice / MVP (≈4–6 weeks)
- Terrain mask + rendering + explosion carving; noise map generator.
- Tardi movement: walk, jump, backflip, fall, fall damage, knockback.
- Water death, map borders.
- Turn manager: turn timer, retreat time, team rotation, win check.
- Weapons: Spore Bazooka (with wind), Pebble Grenade, Algae Cluster,
  Claw Shotgun, Fire Punch.
- Utilities: Silk Rope (first pass), Parachute, Teleport, Girder.
- HUD: HP labels, wind bar, timers, weapon panel.
- Hot-seat for 2–4 teams. Placeholder art acceptable.
- **Exit criteria:** a full 2-team match is fun to play start to finish.

### Phase 2 — Full arsenal & content (≈6–8 weeks)
- Remaining P2 weapons & utilities; mines, oil drums, crates, poison, fire.
- Sudden death. Scheme system + presets + scheme editor UI.
- Team editor with persistence. Replays (record/playback).
- AI opponent v1. Final art for 2 landscape themes, 2 voice banks.
- Rope tuning milestone (side-by-side feel tests).

### Phase 3 — Polish & superweapons (≈4–6 weeks)
- P3 superweapons. All landscape themes. 8 voice banks. Music.
- Missions/training mode. Gamepad. Settings (audio, video, keybinds).
- Performance pass (large maps, many particles), accessibility
  (colour-blind team palettes, subtitles for voice lines).

### Phase 4 — Online multiplayer (≈4–6 weeks)
- WebSocket relay server, lobby, room codes.
- Lockstep input exchange per turn, desync detection via state hashes.
- Reconnect, spectating, chat.

### Phase 5 — Release
- Desktop wrapper (Tauri/Electron), itch.io / Steam builds.
- Map editor & PNG map import UI, scheme sharing.

---

## 9. Testing Strategy

- **Sim unit tests:** projectile trajectories, explosion damage falloff,
  terrain carving, turn transitions, scheme rules.
- **Determinism tests:** replay recorded inputs → identical final state
  hash; run in CI on every push (critical for replays & online).
- **Golden replays:** a set of recorded matches re-run after physics
  changes to flag behaviour drift.
- **Browser smoke test** (Playwright): game boots, a turn can be played.
- **Playtests** each phase; WA veterans compare feel for rope, bazooka
  arc and grenade bounce.

---

## 10. Risks & Mitigations

| Risk                                          | Mitigation                                             |
| --------------------------------------------- | ------------------------------------------------------ |
| IP / trademark complaints                     | Original assets & names only (§1); legal review before release |
| "Feel" doesn't match WA (rope especially)     | Dedicated tuning milestone; constants in scheme/config; veteran playtests |
| Float non-determinism breaks replays/online   | Fixed-point sim from day one + CI determinism tests     |
| Terrain perf on large maps                    | Bit-packed mask, dirty-rect texture uploads, chunked textures |
| Scope creep (WA has ~60 weapons)              | Strict P1/P2/P3 tiers; MVP ships with 5 weapons + 4 utilities |
| Art/audio volume                              | Placeholder-first pipeline; commission/produce per phase |

---

## 11. Open Questions

1. Platform priority: browser-only first (recommended) or desktop/Steam
   from the start? Mobile/touch support at all?
2. Art: in-house pixel art, commissioned artist, or hi-res vector style?
3. Online: is it required for v1, or can v1 ship as hot-seat + AI?
4. How strict on WA parity — exact WA constants (turn times, damage
   values) as defaults, or our own tuned values?
5. Monetisation (free / paid / donations) — affects distribution choices.

---

## 12. Immediate Next Steps

1. Confirm the stack (§7.1) and answer the open questions (§11).
2. Scaffold Phase 0: Vite + TS + Pixi, CI, deterministic loop + tests.
3. Build the terrain mask + bazooka + explosion carving prototype —
   the first "it feels like Worms" moment.
4. Start concept art for the tardi character (idle, aim, tumble).
