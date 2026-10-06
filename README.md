# TardiGeddon

A turn-based artillery game in the spirit of Worms Armageddon, starring tardigrades.
Runs in the browser (desktop and phone), later wrapped for iOS and Android.

- Design & roadmap: [docs/GAME_PLAN.md](docs/GAME_PLAN.md)
- Art direction: [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md)

## Play locally

```sh
npm install
npm run dev
```

Open the printed URL. On a phone on the same Wi-Fi, use `npm run dev -- --host`
and open the network URL.

**Keyboard:** ←/→ walk · ↑/↓ aim · Enter jump (twice = backflip) · hold Space to
charge, release to fire · 1–5 grenade fuse · Tab / right-click weapons · click the
map to target · drag to look around · mouse wheel to zoom.

**Touch:** on-screen pads, tap the map to target, drag to look, pinch to zoom.

## Tests

```sh
npm test          # simulation unit, determinism and CPU soak tests
npm run e2e       # browser smoke tests (desktop + phone)
```

## Playable link

Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`
(enable once: repo Settings → Pages → Source: GitHub Actions).
