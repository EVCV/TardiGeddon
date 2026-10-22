# TardiGeddon website

The public website (home page, how to play, news, privacy policy, terms) lives
in `site/`. It is a small **React** app, separate from the game: the game itself
(`src/`) stays plain TypeScript + PixiJS and is served at `/play/`.

## Stack

- **React 19 + Vite** (`site/vite.config.ts`).
- **GSAP** (free, all plugins included) for animation, with `@gsap/react`'s
  `useGSAP` hook for automatic clean-up. Use `gsap.matchMedia()` with
  `(prefers-reduced-motion: no-preference)` for anything that moves.
- **Lenis** smooth scrolling, wired to GSAP's ticker and `ScrollTrigger` in
  `site/src/motion/SmoothScroll.tsx`. It is skipped when the visitor has
  "reduce motion" turned on.
- **React Bits** (github.com/DavidHDev/react-bits): copy individual components
  from its `src/ts-default/...` folder into `site/src/reactbits/`, keeping the
  attribution header (see `SplitText.tsx`). Licence: MIT + Commons Clause, so
  we may use the components on our commercial site, but never resell or
  redistribute them as components. Prefer the GSAP-based ones (no extra
  dependencies); check any extra packages a component needs before adding it.
  React Bits components animate unconditionally: when `prefersReducedMotion()`
  is true, render a static element instead (see the title in `App.tsx`).

Rules of thumb: keep pages fast on phones (animate `transform`/`opacity` only,
lazy-load heavy effects), keep text readable without JavaScript where
possible, and match the game's look (`docs/STYLE_GUIDE.md`: Luckiest Guy +
Nunito, thick ink outlines, sky/paper/accent colours).

## Owner's rules for the site

- **Domain:** `tardigeddon.com` (not bought yet; the owner will buy it on
  Cloudflare). Use it for canonical URLs, Open Graph tags and the legal pages;
  the game server will be `server.tardigeddon.com`.
- **Real game media only.** Every image, clip and animation on the site must
  come from the actual game: screenshots, screen recordings (short muted
  looping video/WebP, with a poster frame), or the game's own art (the
  mascot SVG, hats, weapons, team colours from `src/render/` and `src/ui/`).
  **No stock photos, no AI-generated pictures, no placeholder art.**
- Capture media from the running game with Playwright (the repo's
  `*.tmp.mjs` screenshot scripts show how: `?autostart=cpu`, `?touch`,
  `window.__tardi` to set up a scene). Commit the chosen files under
  `site/public/media/`, optimised (WebP/AVIF images, H.264/WebM clips), and
  re-capture them when the game's look changes.
- Good shots to show: a big explosion, the Concrete Tun mid-slam, a rope
  swing in Rope Race, speech-bubble banter, the victory dance with confetti,
  the online lobby and quick-play screen, the phone layout with touch
  controls.

## Legal pages: use the owner's templates

The privacy policy, terms and any other legal pages must be based on the
owner's own templates, kept on their PC at
`C:\Users\rchow\OneDrive\Desktop\UpliftMi Agency Files\site-builder-library\legal-templates`.
The owner shared the pack, and the finished drafts live in `site/legal/`
(see `site/legal/README.md` for placeholders, owner decisions and which
templates were used). If you need a template that isn't used yet, ask the
owner to share it again. Don't commit the raw templates to this public repo
(they're the agency's material); only the finished pages, which are public
on the site anyway.

## How the site is built

- `site/src/App.tsx` picks the page from the path (`site/src/router.tsx` is a
  tiny History-API router). Pages live in `site/src/pages/`: Home, How to play
  (`/how-to-play`), Weapons (`/weapons`), Leaderboards, Help & support
  (`/support`), Easter eggs and the legal pages. The header menu (`NAV` in
  `site/src/components/Layout.tsx`) lists the main ones; on phones it is a
  slide-out panel behind the ☰ button.
- Every 20–40 s a tardi swings across the screen on a silk rope
  (`site/src/components/RopeSwinger.tsx`, mounted in `Layout`): one small
  element moved with GSAP transforms, no taps, started only after the page
  has loaded, and off for reduced motion.
- The site's logo is the game's: "Tardi" in red, "Geddon" in yellow (the
  header pill is the game's blue).
- The Android app isn't public yet: the site says "coming soon" (Home's
  Android band, the footer, Help & support). On launch day, swap those for a
  Google Play link.
- Game facts (weapons with their "how it's used" tags and descriptions, game
  styles, map styles, CPU levels, default keys, languages, team colours, hats,
  the mascot) are imported straight from the game's own code
  (`src/sim/weapons.ts`, `src/ui/weaponUse.ts`, `src/sim/schemes.ts`,
  `src/sim/terrain/generate.ts`, `src/ai/skills.ts`, `src/input/controls.ts`,
  `src/i18n/i18n.ts`, `src/render/palette.ts`, `src/render/hats.ts`,
  `src/ui/mascot.ts`), so the site can't drift out of date. How to play
  follows the game's Guide (`src/ui/guide.ts`); keep the two in step. Help &
  support answers questions about money and accounts in line with the legal
  pages, and links to them for the details.
- Legal pages: `/legal/<file name>` renders `site/legal/<file name>.md`
  (loaded on demand with `marked`). `[Placeholders]` are highlighted and the
  page shows a "Draft" note until the owner fills them in. Footer order and
  labels: `site/src/legal.ts`.
- Legal pages are **noindex** (kept out of search results, links still
  followed): an `X-Robots-Tag: noindex, follow` header for `/legal/*` in
  `site/public/_headers` (Cloudflare Pages), plus a robots meta tag the app
  adds on those pages. Don't block them in `robots.txt` (crawlers must fetch a
  page to see its noindex) and leave them out of any sitemap.
- Clips play only while on screen; with reduced motion they don't play by
  themselves (poster + controls instead). GSAP animations run inside
  `gsap.matchMedia('(prefers-reduced-motion: no-preference)')`.

## Capturing media

`site/capture/capture-media.mjs` records every screenshot and clip in
`site/public/media/` from the real game:

```sh
npm run build && npx vite preview --port 4173   # the game
npm run server                                   # for the online screenshots
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium node site/capture/capture-media.mjs [scene ...]
```

Scenes: `tun`, `victory`, `rope`, `menus` (the lobby, the emblem builder,
online screens), `realms` (four map styles in different weather),
`challenge` (Target Smash), `aim` (aiming, and the weapon panel with its
tags), `phone` (all if none given). Each scene opens the game in a fixed
free world (`open(..., arena)`), so the seasonal worlds don't turn up in the
site's pictures. Clips are recorded frame by frame on a virtual clock
(`site/capture/virtual-clock.js`), so they're smooth however slow the
headless browser is. Scenes stage things through `window.__tardi` (giving
the player a superweapon, huddling the enemies so the shot is worth
watching); everything on screen is the game itself. The Rope Race clip is
played by `site/capture/rope-bot.js`. Courses are random, so the script
tries a few and keeps the best run. Check the result before committing:
the clip ranges (`from`/`to` in each scene) may need a nudge.

## Commands

- `npm run site:dev`: dev server on :5174
- `npm run site:build`: builds into `dist-site/`
- `npm run site:preview`: preview the build on :4174
- `npm run build:all`: the whole deploy (site + game at `/play/`) into `dist-site/`; see `docs/DEPLOY.md`

## Plan (agreed with the owner)

1. **Pages:** Home (mascot, pitch, screenshots/clips, big "Play now"), How to
   play (controls, weapons, game styles), News, Privacy policy and Terms
   (needed for the app stores; must describe what the game really does:
   local storage for settings, the online server, no ads), Contact/support.
2. **Hosting:** Cloudflare Pages (free, unlimited bandwidth, allows
   commercial use and private repos). The site at `/` and the game at `/play/`
   from one deploy: build the game with `base: '/play/'`, copy `dist/` into
   `dist-site/play/`, and keep old links (`?room=CODE`) working by redirecting
   them to `/play/`.
3. **Domain:** `tardigeddon.com`, which the owner will buy on Cloudflare Registrar;
   free email forwarding for `support@`. Game server on Fly.io at
   `server.<domain>` (`fly certs add`), `SERVER_URL=wss://server.<domain>`.
4. Later: make the repo private when the shop opens (Cloudflare Pages
   deploys from private repos for free).
