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
On the Silk Rope: ←/→ swing, ↑/↓ climb, Enter or Space to let go.

**Touch:** on-screen pads, drag from your tardi to aim, tap the map to target,
drag elsewhere to look, pinch to zoom.

### Online play locally

Run `npm run server` alongside `npm run dev`, then choose **Play online** in two
browser windows (or on a phone on the same Wi-Fi). See `docs/ONLINE.md` for how
online works and how to put the server on the internet.

## Tests

```sh
npm test          # simulation unit, determinism and CPU soak tests
npm run e2e       # browser smoke tests (desktop + phone) and a two-player online match
```

## Playable link

The website and game are live at https://tardigeddon.com (game at
`/play/`). Cloudflare Pages rebuilds them on every push to `main`; the online
server runs on Fly.io. See `docs/DEPLOY.md`.
