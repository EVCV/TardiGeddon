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
3. **Domain:** `tardigeddon.com`, which the owner will buy on Cloudflare Registrar;
   free email forwarding for `support@`. Game server on Fly.io at
   `server.<domain>` (`fly certs add`), `SERVER_URL=wss://server.<domain>`.
4. Later: make the repo private when the shop opens (Cloudflare Pages
   deploys from private repos for free).
