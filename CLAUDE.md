# TardiGeddon — notes for contributors (human and AI)

Turn-based artillery game (Worms Armageddon mechanics) starring tardigrades.
Design and roadmap: `docs/GAME_PLAN.md`. Art rules: `docs/STYLE_GUIDE.md`.
The iOS app plan: `docs/IOS.md`.

## Commands

- `npm run dev` — dev server (add `?autostart=cpu`, `?autostart=hotseat`, `?autostart=tutorial` or `?autostart=practice` (`&endless` for endless targets) to skip the menu, `&players=N` for 2–10 teams, `&style=armoured` (a game style), `&map=sky` (a map style), `&seed=N`, `?touch` to force touch controls)
- `npm run server` — online game server on :8787 (`npm run dev` on localhost connects to it; see `docs/ONLINE.md`)
- `npm run site:dev` / `site:build` — the public website (React + GSAP + Lenis + React Bits; see `docs/WEBSITE.md`; every page is prerendered to HTML, search setup in `docs/SEO.md`)
- `npm run build:all` — site + game (at `/play/`) into `dist-site/`, as deployed to Cloudflare Pages (`docs/DEPLOY.md`)
- `npm run app:build` — the Android and iOS apps (Capacitor, `android/`, `ios/`; `npm run app:ios` opens Xcode on a Mac); see `docs/APPS.md`, `docs/IOS.md`, and `docs/GOOGLE_PLAY.md` for the store (signed builds, listing, forms; images via `scripts/store-images.mjs`). Keep the Data safety answers and `site/legal/` in step with what the code stores
- Social accounts (Discord, YouTube, …): `docs/social/`; their pictures and Shorts teaser via `npx tsx scripts/social-images.ts` → `store/social/`
- `npm test` — unit + soak tests (Vitest). Set `TEST_DATABASE_URL` (an empty throwaway Postgres) to also run the accounts/shop tests
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
- Loading: `src/main.ts` boots the menu only; `src/match.ts` (a match: Pixi, renderer, HUD, CPU) is its own
  download, fetched right after the first screen shows. Keep the menu's imports free of the sim and Pixi
  (plain constants live in `sim/rosters.ts`, `ai/skills.ts`, `ui/learn.ts`, `challenge/meta.ts`).
  Offline play: `scripts/offline.ts` writes `sw.js` at build time (not in the phone apps).
- Translations (`src/i18n/`): every player-visible text goes through `t('English text', { vars })` (data names: `t(x.name)`, collected via `i18n/dataKeys.ts`; server text: `tk()`), never built from fragments. Languages: es, pt-BR, de, fr, ja in `i18n/locales/`; `tests/i18n.test.ts` fails until each has every text, so after adding or changing English run `npm run i18n -- missing <lang>` and translate (`?lang=de` to try one; `e2e/phone-menu.spec.ts` checks each fits a phone).
- `src/ui/` — DOM menus/HUD/touch controls. The menu is one hub (`ui/hub.ts`) of pages, not pop-ups: Lobby, Stats, Shop, Account, Settings. `ui/tutorial.ts` is the guided practice match. On phones (landscape, ≤500px tall) the hub is a tap-through game menu instead (home screen + Match setup in the lobby, every page full screen with Back): see the "Phones" blocks at the end of `style.css`, and keep every page fitting the screen (`e2e/phone-menu.spec.ts`). `src/input/` — keyboard/mouse/touch → `InputFrame`; keys and mouse buttons come from the player's bindings (`input/controls.ts`, saved on the account when signed in, else for the visit).
- `server/` + `src/net/` — online play: the server runs the sim and streams lockstep input frames; clients replay them.
- Security: `docs/SECURITY.md` (what is protected and how; the CSP in `site/public/_headers`). Online input is untrusted: validate ids with `isWeaponId`, never `WEAPONS[id]` alone.
- `server/accounts.ts` + `src/account/` + `src/shop/` — optional accounts (Better Auth on Neon Postgres) and the
  Stripe shop; off unless the server has `DATABASE_URL`. The server alone grants items. See `docs/ACCOUNTS.md`.
- `src/native.ts` — what differs in the phone apps (back button, no Stripe in-app). Coins in the Android app: Google Play Billing (`src/shop/playBilling.ts` + `android/.../PlayBillingPlugin.java`; the server checks and grants each purchase in `server/googlePlay.ts`, never the app). See `docs/GOOGLE_PLAY.md` §7. Coins in the iOS app: Apple's in-app purchase (`src/shop/appStore.ts` + `ios/.../AppStorePlugin.swift`; the server checks Apple's signature and grants in `server/appStore.ts`); `src/shop/storeBilling.ts` fronts both stores. See `docs/IOS.md` §3.
- `src/usage/` + `server/usage.ts` — anonymous play statistics (daily totals, no IDs, no cookies; Settings → Privacy turns them off). Only values from `src/usage/catalog.ts`, never free text; keep `site/legal/` and the store answers in step. See `docs/USAGE.md`.
- `src/news/` — News (release notes, coming soon, being fixed): posts in `news.ts` in all six languages, shown in the game (`ui/news.ts`) and at tardigeddon.com/news; the website build writes `/news.json` (the game and apps fetch it, so posts need no app update) and `/news.xml` (RSS). How to post: `docs/NEWS.md`.
- `src/ai/` — CPU player; simulates candidate shots, then presses buttons like a human.
  Runs on one machine only (host), so it may use non-deterministic code.
- Weapons are data in `src/sim/weapons.ts`.

## Conventions

- Any gameplay change needs a sim test; keep `tests/soak.test.ts` green (it catches soft-locks).
- Never copy Worms Armageddon assets or signature names (see plan §1).
- Purchases are cosmetic only — never sell gameplay power. Money buys coins; coins buy looks only.
  Weapons unlock with Slime, which is earned by playing and must never be buyable or convertible from coins.

## Business facts (settled — don't ask the owner again)

- **Who sells:** in the browser, **Stripe Managed Payments is on in production**: Stripe is the
  merchant of record and handles VAT (`STRIPE_MANAGED_PAYMENTS=on`; Terms 5.1.3, Privacy 4.0.4).
  In the Android app, Google Play is the seller; an iOS app will use Apple's payments.
- **Company:** EVCV Limited (England and Wales, 13570383), 28 Oak Tree Lane, Cookhill, Alcester, B49 5LH.
  The Google Play developer account is an **organisation** account ("EVCV Studios"), so Google's
  12-tester closed test doesn't apply.
- **Email:** support@tardigeddon.com forwards to the owner, so owner alerts go there (e.g. the Japan
  coins alert; `ADMIN_EMAILS` is only who can open the Sales page).
- **Countries:** everywhere except Vietnam (online games need a licence there). The EU is all or
  nothing (geo-blocking rules). Brazil needs the in-app age check (`src/shop/ageSignals.ts`); Japan
  needs the unspent-coin record (`coin_lot`, `src/shop/japan.ts`). See `docs/GOOGLE_PLAY.md`.
- **iOS app:** iPhone and iPad; built on GitHub Actions macOS runners with fastlane `match` (no Mac);
  coins only through Apple in-app purchase in the app (no US link-out for now).
- **Sign-in:** email, Apple and Google on every platform (website, iOS, Android). Email confirmation
  works in production. The owner has an iPhone and an iPad for TestFlight. See `docs/IOS.md`.
- **Coins are never refunded just because a player stops playing.** The only exceptions are the law's:
  faulty items, and in Japan, unspent bought coins if we stop selling coins there (Terms 5.5.4).
