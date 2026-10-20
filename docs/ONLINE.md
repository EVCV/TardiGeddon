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
- **Tests:** `tests/room.test.ts` (rooms, sync, rejoin, desync recovery, lag),
  `tests/lag.test.ts` and `e2e/online.spec.ts` (two browsers play a match).

## Lag

The server is ahead of each player's screen by their connection's delay. So:

- **Letting go of Fire or ▲▼ sends what the player saw** (`SeenInput` in
  `src/net/lockstep.ts`): the power on screen, which the shot uses instead
  of the server's own charge (never more than that charge), and the aim
  once they've seen it move. At full power a shot waits `FULL_HOLD_TICKS`
  (0.4 s) for the player to let go before it goes by itself.
- **Fire after the turn ran out** gets "Too late: …" back (`TOO_LATE`), not silence.
- **A struggling connection is shown.** The server sends frames every 40 ms all
  match long. No frames for 0.7 s shows "⚠️ Slow connection…". After 6 s
  the game drops that connection and reconnects (`NetClient.drop`). Its rejoin
  token may take the slot back even while the server still thinks the old
  connection is open.
- **The CPU never stalls the server.** One clock runs every room, so the CPU
  (CPU teams, and dropped players) works out its shot in 4 ms slices per tick
  while it "thinks" (`SLICE_MS` in `src/ai/cpu.ts`), never all at once.

Accounts and the shop are served by the same server when it has a database
(docs/ACCOUNTS.md). Not yet: running more than
one server machine (rooms live in memory, so keep a single instance).

## Names, reports and blocking

Names other players see are checked by `src/names.ts` (the game, to tell the
player at once, and the server in `cleanTeam` and on the account's player
name, which has the final say): letters, spaces, `-` and `'` only, no rude
words (also spaced out or with digits for letters), no contact details,
websites or social media, nothing pretending to be staff, and at most two
digits or number words across a whole team, so a phone number can't be
spread over its names. **Quick play** rooms (`Room.quick`) never show what
anyone typed: every team gets a made-up name (`presetTeamName`) and the
standard tardi names. There is no chat.

**Report** (`{ t: 'report' }`, once per player per room, 5 per 10 minutes per
connection) emails `REPORT_EMAIL` (default support@tardigeddon.com) over the
same SMTP settings as password emails, with the room, the reason, the names
each player typed (and in quick play the made-up ones shown) and their
account ids. Without SMTP it is only logged (`fly logs`, `report: ...`).
Look accounts up by id in the Neon SQL editor: `SELECT name, email FROM
"user" WHERE id = '...'`. To act, rename or delete the account there, or
ban it in Better Auth.

**Block** is kept on the player's device (`src/net/blocked.ts`). Each player
in a room has a `pid`: for accounts an HMAC of the account id (with
`BETTER_AUTH_SECRET`), stable but not reversible; for guests random per
connection. Quick play never matches players where either blocked the other
(`Matchmaker`), and in private rooms blocked players' names are hidden on the
blocker's screen only (`teamLabel`, `tardiLabel`; the shared world state is
unchanged, so lockstep is unaffected).

## Putting it online

The game server runs on **Fly.io** at `server.tardigeddon.com`; the web game
is on Cloudflare Pages and connects to it via `VITE_SERVER_URL`. The full
setup is in `docs/DEPLOY.md` (step 6). To ship server changes, run
`fly deploy` from the repo folder.

Any Node host with WebSockets works the same way (Render, Railway, a VPS):
run `npm ci && npm run server` with `PORT` set, and point `VITE_SERVER_URL` at it.
