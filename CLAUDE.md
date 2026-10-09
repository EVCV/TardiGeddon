# TardiGeddon — notes for contributors (human and AI)

Turn-based artillery game (Worms Armageddon mechanics) starring tardigrades.
Design and roadmap: `docs/GAME_PLAN.md`. Art rules: `docs/STYLE_GUIDE.md`.

## Commands

- `npm run dev` — dev server (add `?autostart=cpu` or `?autostart=hotseat` to skip the menu, `&players=N` for 2–10 teams, `?touch` to force touch controls)
- `npm run server` — online game server on :8787 (`npm run dev` on localhost connects to it; see `docs/ONLINE.md`)
- `npm run site:dev` / `site:build` — the public website (React + GSAP + Lenis + React Bits; see `docs/WEBSITE.md`)
- `npm run build:all` — site + game (at `/play/`) into `dist-site/`, as deployed to Cloudflare Pages (`docs/DEPLOY.md`)
- `npm test` — unit + soak tests (Vitest)
- `npm run typecheck`, `npm run build`
- `npm run e2e` — Playwright smoke tests (desktop + phone). In sandboxes with a
  preinstalled Chromium set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

## Architecture

- `src/sim/` — deterministic simulation. **Hard rules** (enforced by `tests/purity.test.ts`):
  no DOM/Pixi, no `Math.random`/clocks, no transcendental `Math.*` (use `math/trig.ts`
  integer angles), no `**`. Only IEEE-exact ops (+ − × ÷, sqrt, floor/round/abs/min/max).
  All state lives in `WorldState` (cloneable via `structuredClone`, hashable via `hashWorld`).
  The sim is driven only by `InputFrame`s, one per tick at 50 Hz. This is what makes
  replays, the CPU's look-ahead and online lockstep play possible.
- `src/render/` — PixiJS view of the state; reads state, never writes it. Interpolates between ticks.
- `src/ui/` — DOM menus/HUD/touch controls. `src/input/` — keyboard/touch → `InputFrame`.
- `server/` + `src/net/` — online play: the server runs the sim and streams lockstep input frames; clients replay them.
- `src/ai/` — CPU player; simulates candidate shots, then presses buttons like a human.
  Runs on one machine only (host), so it may use non-deterministic code.
- Weapons are data in `src/sim/weapons.ts`.

## Conventions

- Any gameplay change needs a sim test; keep `tests/soak.test.ts` green (it catches soft-locks).
- Never copy Worms Armageddon assets or signature names (see plan §1).
- Purchases are cosmetic only — never sell gameplay power.
