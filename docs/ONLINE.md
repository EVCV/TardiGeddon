# Online play

Online matches are **lockstep**: the game server runs the same deterministic
simulation as the browser (`src/sim`) at 50 Hz and streams the input frame it
used for every tick. Each browser replays those frames, so everyone sees the
same match while only a few bytes per tick go over the network.

- **Server:** `server/main.ts` (WebSocket + health check) and `server/room.ts`
  (lobby, match, input relay). Run locally with `npm run server` (port 8787).
- **Client:** `src/net/` (protocol, lockstep replay, snapshots) and
  `src/ui/online.ts` (create/join a room, lobby). `npm run dev` on
  `localhost` connects to `ws://localhost:8787` automatically.
- **Rules the server enforces:** only the player whose turn it is can send
  input; names and game styles are cleaned and clamped; a dropped player's
  turns are played by the CPU until they rejoin (their slot is kept, and they
  get a full snapshot); every 2 s the server sends a state hash, and a client
  that disagrees asks for a snapshot.
- **Tests:** `tests/room.test.ts` (rooms, sync, rejoin, desync recovery) and
  `e2e/online.spec.ts` (two browsers play a match).

Not yet: accounts (Supabase), quick-play matchmaking, and running more than
one server machine (rooms live in memory, so keep a single instance).

## Putting it online (owner steps)

The web game is on GitHub Pages; the game server needs a host that keeps a
process running and supports WebSockets. The repo is set up for
**Fly.io** (a small machine is a few dollars a month):

1. Create a Fly.io account and install `flyctl`.
2. In the repo folder: `fly apps create <name>` (e.g. `tardigeddon-server`),
   set that name as `app` in `fly.toml`, then `fly deploy`.
3. Check `https://<name>.fly.dev` shows "TardiGeddon server ok".
4. In GitHub: Settings → Secrets and variables → Actions → **Variables** →
   add `SERVER_URL` = `wss://<name>.fly.dev`.
5. Re-run the "Deploy to GitHub Pages" workflow. "Play online" now works on
   the published site; share a room code or invite link to play.

Any Node host with WebSockets works the same way (Render, Railway, a VPS):
run `npm ci && npm run server` with `PORT` set, and point `SERVER_URL` at it.
