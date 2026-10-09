# TardiGeddon — Game Plan

A turn-based artillery game that reproduces the mechanics, feel and cartoon
styling of **Worms Armageddon** (Team17, 1999), with **tardigrades** (water
bears) as the playable characters.

This document is the master plan: what we are building, the rules of the
game, the technical architecture, and the order we build it in.

---

## 0. Decisions Log

| Topic           | Decision                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| Platform        | **Browser first**, wrapped with **Capacitor** for iOS & Android (desktop wrap later) |
| Art             | Produced by AI: Claude (SVG / code-drawn sprites, VFX, UI) + ChatGPT image generation (raster illustrations, key art) — see §6 |
| Online play     | **Required in v1**                                                       |
| Tuning          | WA *play style* is the target; all values customisable via schemes        |
| Monetisation    | **Free-to-play, cosmetic purchases only** (skins, hats, voices…). **No ads. No buyable power** — see §8 |
| Art look        | **Vector cartoon** (bold outlines, flat colour + simple shading)          |
| Accounts        | **Free account required for online play**; offline (vs AI / hot-seat) works without one |
| Voices          | Service not chosen yet — evaluation in §6.3                                |
| Business setup  | Owner researching Apple / Google / Stripe accounts (guidance on request)   |

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
4. **Play anywhere, with anyone.** Browser, phone and tablet; online,
   hot-seat and vs AI all in v1, built on one deterministic simulation.
5. **Fair free-to-play.** Purchases are cosmetic only — nobody can buy
   power, and there are no ads.

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
- **Multiplayer (local hot-seat)** — 2–10 teams on one device (pass-and-play
  on mobile), any mix of humans and CPUs.
- **Online (v1)** — private rooms via invite code/link, plus quick-play
  matchmaking for 1v1 and free-for-alls of up to 10 players. Ranked ladder post-v1.
- **Asynchronous online (stretch)** — play your turn, close the app, get a
  push notification when it's your turn again. Ideal for mobile.
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

**Visual style (decided): vector cartoon** — bright, chunky 2D shapes with bold outlines,
flat colour plus simple cel shading, matching
WA's readability at small sprite sizes — and readable on a phone screen.

- Logical map size ~**1920×696**, viewed through a scrolling,
  pinch-zoomable camera; tardi sprites ~30×30 px at 1× (authored at 4×
  for retina/mobile).
- Tardis: plump, translucent-pink/beige body, 8 stubby clawed legs,
  big expressive eyes, animated idle (blink, scratch, look around),
  hold-weapon poses, flying/tumble, drowning, victory dance.
- Terrain: textured fill + highlighted soil edge, scattered props
  (moss fronds, sand grains, pipette tips, coins at microscopic scale).
- Parallax background (3 layers) + animated water/droplet foreground.
- Explosion VFX: circular bloom, smoke puffs, debris particles, "POW"
  word art on big hits.
- UI: team-coloured name/HP labels over each tardi, wind bar, turn timer,
  round timer, weapon grid panel, chunky comic font (open-licence font,
  e.g. from Google Fonts).

### 6.1 AI art pipeline

Art is produced by AI, split by what each tool does best:

| Asset type                                   | Produced by                            | Format                         |
| -------------------------------------------- | -------------------------------------- | ------------------------------ |
| Tardi character rig & animations             | **Claude** — layered SVG parts (body, 8 legs, eyes, mouth) animated in code | SVG → rasterised to atlas at build time |
| Hats, gravestones, weapons, crates, props    | **Claude** — SVG                       | SVG → atlas                     |
| VFX (explosions, smoke, fire, water)         | **Claude** — procedural particles/shaders | Code                         |
| UI, icons, weapon panel, HUD                 | **Claude** — SVG/CSS                   | SVG                             |
| Terrain textures & parallax backgrounds      | **ChatGPT image gen** (tileable textures, painted backdrops), cleaned up/tinted in pipeline | PNG/WebP |
| Key art, store screenshots, app icon, splash | **ChatGPT image gen**                  | PNG                             |

Why this split: a **code/SVG-built tardi rig** stays perfectly consistent
across hundreds of frames and cosmetics (a hat is just another layer),
which image generators struggle with; image generators are great for
rich, one-off painted backgrounds and marketing art.

Rules for consistency:

- A **style guide** (`docs/STYLE_GUIDE.md`) with palette, outline weight,
  lighting direction, and a reference sheet; every ChatGPT prompt starts
  from a saved **master prompt** for the chosen look.
- All generated assets stored in `assets/` with their prompt alongside
  (`*.prompt.txt`) so they can be regenerated or varied.
- Cosmetics (sold in the shop) are designed as attachable SVG layers
  to the base rig so new items are cheap to make.

> ⚠️ **Ownership note:** in some jurisdictions (e.g. the US) purely
> AI-generated images may not be copyrightable, so others could reuse
> them. Mitigation: meaningful human editing/arrangement of key assets
> (logo, mascot, app icon), register the **TardiGeddon** name/logo as a
> trademark, and check OpenAI's terms for commercial use (currently
> allowed).

### 6.2 Audio

- **Voice banks** (8+ in v1, more sold as cosmetics): "Fire!", "Coward!",
  "Oof", "Bye-bye", "Revenge!", "Incoming!", "Watch this"… Produced with
  an AI voice / TTS service that licenses commercial use, pitched up and
  processed to sound squeaky and tiny.
- SFX per weapon, splash, crate drop, mine tick, fuse hiss — from CC0
  libraries (e.g. freesound CC0, Kenney) or synthesised (jsfxr-style).
- Music: jaunty menu theme + ambient loop per landscape theme
  (AI music service with a commercial licence, or commissioned).
- Delivered as audio sprites: OGG/WebM + AAC/M4A for iOS Safari.

### 6.3 Voice service evaluation (to do)

Needed: ~30 short lines × 8+ voice banks at launch, more sold later as
cosmetics. Shortlist to evaluate (check current pricing & terms first):

| Option                                   | Notes                                                    |
| ---------------------------------------- | -------------------------------------------------------- |
| ElevenLabs                               | High quality, voice design from text prompt; paid plans grant commercial use |
| OpenAI text-to-speech                    | Simple API, set voices; pitch-shift for squeakiness      |
| Open-source TTS (e.g. Piper, Coqui XTTS) | Free, runs locally; quality varies; check each model's licence |
| Human voice actors (e.g. Fiverr / Voices.com) | Most character; one-off cost per bank; buy-out licence |

Evaluation: generate the same 10 lines in each, pitch-shift + process
them the same way, pick by character/fun, licence terms and cost per bank.
Whatever is chosen, keep the licence/terms copy in `assets/audio/LICENSES.md`.

---

## 7. Technical Architecture

### 7.1 Stack

| Concern        | Choice                                          | Why                                              |
| -------------- | ----------------------------------------------- | ------------------------------------------------ |
| Language       | **TypeScript** (client + server)                | Type safety; shares sim code with the server     |
| Build          | **Vite**                                        | Fast dev server, simple bundling                 |
| Rendering      | **PixiJS** (WebGL, Canvas fallback)             | Fast 2D sprites/particles on mobile GPUs         |
| Physics        | **Custom**, fixed-step, pixel-mask collision    | WA physics are not rigid-body                    |
| Audio          | Howler.js                                       | Handles iOS audio unlock quirks                  |
| UI / menus     | HTML/CSS overlay (Preact or plain TS)           | Easy responsive menus, shop, settings            |
| Mobile wrap    | **Capacitor** (iOS + Android)                   | Same web build; native plugins for IAP, push, haptics |
| Web install    | **PWA** (manifest + service worker)             | Installable from browser, offline vs-AI play     |
| Backend        | **Neon** Postgres + **Better Auth** in the game server | Accounts, profiles, inventory, purchases, stats (docs/ACCOUNTS.md) |
| Realtime       | **Node + WebSocket game server** (e.g. on Fly.io) | Room/match relay, matchmaking, turn validation |
| Purchases      | **RevenueCat** (wraps Apple/Google IAP) + **Stripe** on web | One entitlement system across all stores |
| Analytics/crash| PostHog (or similar) + Sentry                   | Funnel, retention, crash reports                 |
| Testing        | Vitest + Playwright                             | Unit-test sim; smoke-test the browser build      |
| Desktop (later)| Tauri wrap                                      | Steam / itch                                     |

### 7.2 Deterministic simulation (key decision)

Separate **simulation** from **presentation**:

- Simulation runs at a **fixed 50 ticks/s** using a seeded PRNG and a
  **deterministic float subset**: only IEEE-754 operations that are
  correctly rounded on every engine (+ − × ÷, `sqrt`, floor/round…).
  Trig uses integer angles and a lookup table built from basic
  arithmetic; `Math.sin`, `pow`, `random` etc. are banned from `src/sim`
  (enforced by a test). Simpler than full fixed-point, same guarantee.
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
│  ├─ input/             # keyboard/mouse/touch/gamepad -> input commands
│  ├─ audio/             # sound + voice bank playback from sim events
│  ├─ ai/                # CPU player (shot search on cloned sim)
│  ├─ ui/                # menus, team editor, scheme editor, weapon panel
│  ├─ net/               # online client: rooms, input relay, resync
│  └─ main.ts
├─ assets/               # sprites, audio, maps, fonts (all original)
└─ tests/                # sim unit tests, replay determinism tests
```

### 7.6 AI opponents

- Each AI turn: enumerate candidate weapons × angles × power (× fuse),
  **simulate on a cloned world** (cheap thanks to the deterministic sim),
  score by enemy damage − self/friendly damage − risk of drowning.
- Difficulty = search breadth + random aim error.
- Later: movement before firing, rope/teleport use, crate seeking.

### 7.7 Controls

**Keyboard & mouse (WA-style defaults, rebindable)**

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

**Touch (phones & tablets — v1 requirement)**

| Action          | Gesture                                                   |
| --------------- | --------------------------------------------------------- |
| Walk            | Hold left/right pads (bottom-left)                        |
| Jump / backflip | Jump button tap / double-tap                              |
| Aim             | Drag the crosshair around the tardi (or aim slider)       |
| Fire / charge   | Hold fire button (bottom-right), release to throw         |
| Weapon panel    | Weapon button → full-screen grid                          |
| Fuse / bounce   | Small chips beside the fire button when relevant          |
| Targeted weapon | Tap the map                                               |
| Camera          | One-finger drag on empty map, pinch to zoom; auto-follow  |
| Rope            | Fire to attach, left/right to swing, up/down to climb, jump to release |

Haptics on explosions/hits via Capacitor. Gamepad support in Phase 3.

### 7.8 Mobile & browser specifics

- Single codebase; layout adapts to landscape phone, tablet and desktop.
  Game is **landscape-only** on phones.
- Performance budget: 60 fps on a ~3-year-old mid-range Android; texture
  atlases capped at 2048², terrain split into chunks, particles pooled.
- Handle app backgrounding: pause local games; online games keep the
  turn timer server-side and auto-skip on timeout.
- Safe-area insets (notches), iOS audio unlock on first tap, wake lock
  during matches.
- Store compliance: full game (not a thin web wrapper) satisfies Apple
  guideline 4.2; **all digital purchases on iOS/Android must go through
  Apple/Google IAP** (handled by RevenueCat); web uses Stripe.

### 7.9 Online multiplayer architecture (v1)

Because the game is **turn-based**, online is much simpler than a
real-time shooter: only one player acts at a time.

```
 Client A (active)            Game server (Node/WS)              Client B, C… (watching)
 ───────────────              ─────────────────────              ───────────────────────
 input commands ──────────▶  validate + timestamp + relay  ────▶  apply same inputs
 local sim (deterministic)    own sim copy (authoritative       local sim → identical
                              hash check, turn timer)            result
```

- **Input relay:** the active player's inputs (per tick) are streamed to
  the server, which relays them to everyone. All clients run the same
  deterministic sim, so everyone sees the same thing.
- **Server runs the sim too** (headless — the `src/sim` folder has no
  DOM/Pixi). It owns the turn timer, checks end-of-turn state hashes, and
  is the authority if clients desync → it sends a state snapshot to
  resync. This also stops cheating (e.g. fake damage, extra ammo).
- **Rooms & matchmaking:** private room codes / share links; quick-play
  queue (1v1, FFA up to 4); bots fill empty slots optionally.
- **Reconnect:** rejoining clients receive a snapshot + inputs since.
  Disconnected players' turns are skipped after timeout; bots can take over.
- **Spectating & replays** come for free from the input log.
- **Accounts:** a **free account is required for online play** (email,
  Apple or Google sign-in). This gives every player a persistent name,
  stats, friends and inventory across devices, and makes it possible to
  ban cheaters/abusers. Offline modes (vs AI, hot-seat) need no account.

### 7.10 Repo layout additions

```
├─ server/               # WebSocket game server (rooms, matchmaking, headless sim)
├─ mobile/               # Capacitor iOS/Android projects
└─ src/
   ├─ shop/              # catalogue (items + prices), shared with the server
   └─ account/           # login, profile, inventory (server side: server/accounts.ts)
```

---

## 8. Monetisation — Free-to-Play with In-Game Purchases

**Principle: never sell power.** Nothing you can buy changes how strong
you are — no weapons, ammo, power-ups, extra health or stat boosts. Every
player has the same arsenal; purchases only change how you *look and
sound*. Losing to someone because they paid more is exactly what we
are avoiding. All gameplay content (weapons, modes, missions) is free.

### 8.1 What we sell

| Category              | Examples                                                          |
| --------------------- | ----------------------------------------------------------------- |
| **Cosmetics**         | Hats, skins/colours, eyes, gravestones/husks, victory dances, fire trails, team flags |
| **Voice banks**       | Pirate, Robot, Granny, Scientist, Space Cadet… (sample in shop)  |
| **Forts & map themes**| New landscape themes usable in your hosted games                   |
| **Bundles**           | Themed packs (e.g. "Deep Sea Pack": hat + voice + gravestone + theme) |
| **Season Pass**       | Free + premium tracks of cosmetic rewards earned by playing        |
| **Supporter pack**    | One-off purchase: exclusive cosmetic set + extra save slots for teams/schemes |

### 8.2 Currency & economy

- Soft currency **"Moss"** — earned by playing (wins, daily challenges,
  season pass). Buys standard cosmetics.
- Premium currency **"Crystals"** — bought with real money; also small
  amounts from the season pass. Buys premium cosmetics, bundles, pass.
- Show real-money price equivalents; no loot boxes / random paid
  rewards (avoids gambling regulation in e.g. Belgium/Netherlands and
  App Store odds-disclosure rules). Rotating **daily shop** instead.
- **No ads** of any kind.

### 8.3 Implementation

- **RevenueCat** handles Apple/Google receipts; **Stripe Checkout** on web.
  Both fire **webhooks → the game server** (`server/accounts.ts`), which grants items to
  the player's inventory. **Server is the source of truth** — the client
  never grants itself items.
- Catalogue (items, prices, bundles, shop rotation) is data in the DB,
  so new items ship without an app update.
- Restore purchases, refunds/chargebacks revoke entitlements.
- Platform fees: Apple/Google take 15–30%; Stripe ~3%.

### 8.4 Compliance checklist

- Age rating questionnaires (IARC / App Store) — cartoon violence,
  in-app purchases, user chat.
- Likely appeals to kids → COPPA (US) / GDPR-K / UK Age Appropriate Design
  Code: age gate, no targeted ads for under-13s, parental purchase controls,
  chat filtered or preset phrases only for young players.
- Privacy policy, terms of service, account deletion in-app (Apple requirement).

---

## 9. Milestones / Roadmap

Each phase ends with something playable. Online is built on the same
sim from the start, so it's a layer on top, not a rewrite.

### Phase 0 — Foundations (≈1–2 weeks)
- Vite + TS + Pixi project, lint/format, Vitest, CI on GitHub Actions.
- Fixed-step loop, seeded PRNG, fixed-point math helpers.
- Determinism test harness (run N ticks twice → identical hash).
- Style guide + first tardi rig (SVG) + one terrain theme.

### Phase 1 — Playable core (≈4–6 weeks)
- Terrain mask + rendering + explosion carving; noise map generator.
- Tardi movement: walk, jump, backflip, fall, fall damage, knockback.
- Water death, map borders. Turn manager, timers, team rotation, win check.
- Weapons: Spore Bazooka (with wind), Pebble Grenade, Algae Cluster,
  Claw Shotgun, Fire Punch. Utilities: Silk Rope, Parachute, Teleport, Girder.
- HUD; **keyboard + touch controls**; hot-seat for 2–4 teams.
- Deploy to a web URL for playtesting on desktop & phones.
- **Exit:** a full 2-team match is fun on both laptop and phone.

### Phase 2 — Online & accounts (≈4–6 weeks)
- Accounts with Better Auth on Neon (free account: email / Apple / Google), profiles, teams saved to cloud.
- WebSocket game server: rooms, invite codes, input relay, headless sim,
  hash checks, reconnect, turn timeout.
- Quick-play matchmaking. Basic AI opponent v1 (also fills bots).
- **Exit:** two people on different devices finish a match online.

### Phase 3 — Full arsenal & content (≈6–8 weeks)
- Remaining P2 weapons & utilities; mines, drums, crates, poison, fire.
- Sudden death. Schemes + presets + scheme editor. Replays.
- 4 landscape themes, 8 voice banks, music. Rope tuning milestone.
- Team editor, cosmetics system (layered hats/gravestones etc.).

### Phase 4 — Monetisation & mobile apps (≈4–6 weeks)
- Inventory, shop UI, Moss/Crystals, daily shop, season pass framework.
- RevenueCat + Stripe + webhook entitlement granting.
- Capacitor iOS/Android builds, push notifications (your turn / friend
  invites), haptics, store listings, privacy/age compliance.
- Analytics, crash reporting.
- **Exit:** closed beta on TestFlight / Play internal testing + web.

### Phase 5 — v1 Launch
- P3 superweapons, missions/training mode, settings, accessibility
  (colour-blind palettes, subtitles), performance pass on low-end phones.
- Soft launch in a few countries → tune economy & retention → global launch.

### Post-v1
- Ranked ladder & seasons, clans/friends, async (play-by-notification)
  online, map editor & PNG import, desktop (Steam) build, gamepad.

---

## 10. Testing Strategy

- **Sim unit tests:** trajectories, damage falloff, terrain carving,
  turn transitions, scheme rules.
- **Determinism tests:** replay recorded inputs → identical final state
  hash, in CI on every push — **critical for online play**. Also run the
  same replay in Node (server) and the browser and compare hashes.
- **Golden replays** re-run after physics changes to flag drift.
- **Network tests:** simulated latency/packet loss, disconnect/reconnect.
- **Browser smoke tests** (Playwright) incl. mobile viewports.
- **Purchase tests:** sandbox Apple/Google/Stripe, webhook replay,
  refund revocation.
- **Playtests** each phase on real phones and desktops.

---

## 11. Risks & Mitigations

| Risk                                          | Mitigation                                             |
| --------------------------------------------- | ------------------------------------------------------ |
| IP / trademark complaints                     | Original assets & names only (§1); legal review before release |
| AI art inconsistency / weak ownership         | SVG rig for characters, master prompts, style guide, human-edited key assets, trademark the name/logo |
| "Feel" doesn't match WA (rope especially)     | Dedicated tuning milestone; constants in schemes; veteran playtests |
| Float non-determinism → online desyncs        | Deterministic float subset enforced by tests, CI determinism tests, server snapshot resync |
| Mobile performance                            | Perf budget, chunked terrain, pooled particles, test on low-end Android early |
| App Store rejection (IAP / wrapper rules)     | Native IAP via RevenueCat, full offline-capable game, account deletion |
| Cheating online                               | Server runs authoritative sim, validates inputs & ammo |
| Server costs                                  | Turn-based relay is light; scale rooms horizontally; costs covered by IAP |
| Pay-to-win backlash                           | Cosmetics only, everywhere; all gameplay free (§8)     |
| Scope creep (WA has ~60 weapons)              | Strict P1/P2/P3 tiers; online & shop before extra weapons |

---

## 12. Open Questions

1. **Voices:** pick a service after the evaluation in §6.3.
2. **Business setup** (owner researching): Apple/Google developer
   accounts, Stripe account, company entity for payouts & privacy policy.

Resolved: art look (vector cartoon), accounts (free account for online),
monetisation (cosmetics only, no ads, no power for sale).

---

## 13. Progress

### Done (Phase 0 + first slice of Phase 1)

- Vite + TypeScript + PixiJS project, CI (typecheck, unit, soak, build,
  Playwright desktop + phone), GitHub Pages deploy workflow.
- Deterministic sim with purity test, state hashing, cloning, replay tests.
- Seeded island/cavern map generator; destructible terrain with cartoon
  moss/soil painting and scorch marks.
- Tardi movement: walk with slopes, jump, backflip, fall damage,
  knockback, drowning, falling off the map.
- Turn flow: start banner, turn timer, retreat, settling, end-of-turn
  damage, death explosions, win/draw, per-team weapon memory, wind.
- Weapons: Spore Bazooka, Pebble Grenade (fuse 1–5), Algae Cluster, Claw
  Shotgun (2 shots), Fire Punch, Raindrop Strike, Teleport, Skip Go.
- Utilities: Silk Rope (fire mid-air, swing, climb, let go; drops if its
  anchor is blown away), Leaf Parachute (steerable, no fall damage), Twig
  Girder (rotate with aim, red ghost when it won't fit).
- Input fix: taps shorter than one game tick are never lost (slow phones).
- Map objects: mines (arm when approached, 3 s fuse, 1-in-10 duds, chain
  reactions), Brine Drums (burst into a big blast plus brine blobs),
  supply crates (parachute in between turns; health +25 or a weapon).
- Sudden death after the round time (5/10/15 min, menu option): everyone
  drops to 1 HP, then the water rises every turn. Round clock in the HUD.
- Game styles (schemes): Standard, Quick, Pro, Chaos, Bazookas & Grenades,
  Artillery (no walking), plus a Customise panel; last choice remembered
  on the device. Schemes can limit the arsenal (`weapons`) and movement.
- 2–10 players per match, each slot Human or CPU (humans share the device).
  Maps grow with the number of tardis (2000×1000 for 8, up to 6000×1200
  for 40), with mines/drums/crates scaled to match; terrain is drawn in
  1024 px texture tiles so big maps work on phone GPUs. Ten team colours
  and names; compact health bars for 5+ teams.
- Team editor (✎ on each player slot): team name, colour (unique per
  team; picking a taken colour swaps), hat, and the 4 tardi names, with
  a live preview; saved per device. Hats are the first cosmetic slot:
  each is data (`src/render/hats.ts`) drawn identically in game and in
  SVG previews, so shop hats later are just new entries.
- Weapons: Mortar Pod (wind-blown shell bursting into fragments), Homing
  Spore (pick a target, it curves in after launch), Rotifer Roller
  (walking bomb that hops walls; Fire again to set it off, or 8 s fuse).
  The CPU also uses the Mortar Pod.
- Bacteria Bomb (bouncing bomb splitting into 5 heavy bomblets), Sticky
  Dynamite (dropped at your feet, 5 s fuse, big blast), Cyanobloom Cloud
  (poison gas: poisoned tardis lose 5 HP each turn, never below 1, until
  a health crate cures them).
- Fire: Hot Sap Bomb (bursts into 18 burning blobs) and Acid Rain (air
  strike of 5 acid canisters). Flames fall, settle, slowly scorch the
  ground, singe tardis standing in them (ending your turn if it's you),
  burn out after ~4 s, and are put out by water.
- Superweapons, crate-only by default (Chaos, or the "Superweapons: 1 each"
  setting, gives one of each): Holy Water Droplet (3 s fuse, 90 px blast),
  Concrete Tun (dropped on a target, smashes down through six explosions) and
  Microscope Slide Slam (glass shards rain across the whole map).
- Silk Rope wraps round corners it swings into (and unwraps on the way
  back); if a corner is blown away the rope falls back to the one before.
- Drag-to-aim: drag from your own tardi to point the crosshair (touch and
  mouse); other drags still pan the camera.
- **Online play (Phase 2, part 1):** Node WebSocket server (`server/`) runs
  the sim and streams lockstep input frames; room codes and invite links,
  lobby with CPU slots and game style, rejoin with snapshot, hash-based
  desync recovery, dropped players' turns played by the CPU. Deploy steps
  for the owner in `docs/ONLINE.md` (Fly.io + `SERVER_URL` variable).
- CPU skill levels (Easy / Normal / Hard, menu setting): the CPU picks a
  victim and aims for a spot near them, missing by more the easier it is;
  it half-reads the wind, has shaky hands and sometimes lets rip wildly.
  Normal does about half the damage per turn the old CPU did.
- Speech-bubble banter: CPU taunts and excuses, "Missed me!" on near misses,
  reactions to big hits and drownings.
- Rope Race game style: a roofed course, swing from the start sign to the
  chequered flag; fastest of 3 tries wins; a dunking just ends the try.
- Quick play: a matchmaking queue (up to 4; starts with 2+ after a few
  seconds) with a "Play a CPU instead" button while you wait.
- Aim feel: Up/Down start with fine 0.2° nudges and speed up the longer
  they're held.
- Comedy: victory dances and confetti, a sad trombone when you lose;
  tardis curl into a tun and POP when they die (with last words);
  teetering and "Whoa!" at cliff edges; synthesised squeaks, oofs,
  drowning gargles and a victory fanfare (placeholder for voice packs).
- Menu: one full-width row per team (no cut-off names) with mascot,
  Human/CPU toggle and edit button.
- CPU opponent (simulates shots, presses buttons like a player).
- Vector tardi rig, HUD (timer, wind, team health, weapon panel), touch
  controls, pinch/drag camera, synthesised placeholder SFX, death husks.
- Hot-seat and vs-CPU modes; installable PWA manifest; bundled fonts.

### Next

1. Owner: deploy the game server (docs/ONLINE.md) so online works on the site.
2. Phase 2, part 2: accounts (Neon + Better Auth) and the web shop (Stripe): built, off until the legal pages are updated (docs/ACCOUNTS.md).
3. Owner: register developer accounts (Apple, Google, Stripe) early.
