# Online play

Online matches are **lockstep**: the game server runs the same deterministic
simulation as the browser (`src/sim`) at 50 Hz and streams the input frame it
used for every tick. Each browser replays those frames, so everyone sees the
same match while only a few bytes per tick go over the network.

- **Server:** `server/main.ts` (WebSocket + health check), `server/room.ts`
  (lobby, match, input relay) and `server/matchmaker.ts` (quick play: up to
  4 players, starting with 2+ after 6 s, or a CPU on request). Run locally with `npm run server` (port 8787).
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

Accounts and the shop are served by the same server when it has a database
(docs/ACCOUNTS.md). Not yet: running more than
one server machine (rooms live in memory, so keep a single instance).

## Putting it online

The game server runs on **Fly.io** at `server.tardigeddon.com`; the web game
is on Cloudflare Pages and connects to it via `VITE_SERVER_URL`. The full
setup is in `docs/DEPLOY.md` (step 6). To ship server changes, run
`fly deploy` from the repo folder.

Any Node host with WebSockets works the same way (Render, Railway, a VPS):
run `npm ci && npm run server` with `PORT` set, and point `VITE_SERVER_URL` at it.
