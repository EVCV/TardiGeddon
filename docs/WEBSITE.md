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

Rules of thumb: keep pages fast on phones (animate `transform`/`opacity` only,
lazy-load heavy effects), keep text readable without JavaScript where
possible, and match the game's look (`docs/STYLE_GUIDE.md`: Luckiest Guy +
Nunito, thick ink outlines, sky/paper/accent colours).

## Commands

- `npm run site:dev`: dev server on :5174
- `npm run site:build`: builds into `dist-site/`
- `npm run site:preview`: preview the build on :4174

## Plan (agreed with the owner)

1. **Pages:** Home (mascot, pitch, screenshots/clips, big "Play now"), How to
   play (controls, weapons, game styles), News, Privacy policy and Terms
   (needed for the app stores; must describe what the game really does:
   local storage for settings, the online server, no ads), Contact/support.
2. **Hosting:** Cloudflare Pages (free, unlimited bandwidth, allows
   commercial use and private repos). The site at `/` and the game at `/play/`
   from one deploy: build the game with `base: '/play/'`, copy `dist/` into
   `dist-site/play/`, and keep old links (`?room=CODE`) working by redirecting
   them to `/play/`. GitHub Pages works the same way in the meantime.
3. **Domain:** owner buys it on Cloudflare Registrar (e.g. `tardigeddon.com`);
   free email forwarding for `support@`. Game server on Fly.io at
   `server.<domain>` (`fly certs add`), `SERVER_URL=wss://server.<domain>`.
4. Later: make the repo private when the shop opens (Cloudflare Pages
   deploys from private repos for free).
