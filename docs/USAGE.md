# Anonymous play statistics

How the game is used, counted without ever knowing who: how often it's
opened and on what, how long it stays on screen, which menu pages are
opened, which kinds of match are played, how they end and how long they
last, how players do against each CPU level, which weapons get fired, how
far players get through the tutorial, how far "Get coins" gets towards a
purchase, how long loading takes, what goes wrong (errors), and how online
quick play goes (waits, rooms, rematches). The owner sees them on the
**Sales** page, under the money.

| Part | Where |
|---|---|
| Every event and every value it may carry | `src/usage/catalog.ts` |
| The game's side (counting, sending, the off switch) | `src/usage/usage.ts` |
| Where it counts | `src/usage/usage.ts` (opened, time on screen, errors), `src/main.ts` (loading times, Stripe's return), `src/ui/hub.ts` and the pickers (pages), `src/match.ts` (matches, shots, WebGL lost, desyncs), `src/audio/mixer.ts` (sound failing), `src/ui/tutorial.ts` (steps), `src/ui/menu.ts`, `looks.ts`, `hub.ts`, `shop.ts` (Get coins) |
| What the server counts itself | `server/main.ts` with `server/matchmaker.ts` and `server/room.ts`: quick-play waits and how they end, rooms made and joined, matches and rematches |
| The server's side (checking, daily totals, deleting) | `server/usage.ts`, `POST /api/usage` in `server/accounts.ts` |
| The player's choice, also told to the server | `src/usage/consent.ts`, sent as `stats: true/false` with create/join/quick (older games, which don't send it, aren't counted) (`src/net/client.ts`) |
| The owner's view | `src/ui/usageReport.ts` (Sales page), `GET /api/admin/usage` |
| The player's switch | Settings → Privacy → "Share anonymous statistics" |
| Tests | `tests/usage.test.ts`, `e2e/usage.spec.ts` |

## The rules it keeps

These are what the Privacy Policy (§2.4.3–2.4.5, §5.1.7), the Cookie &
Storage Policy (§2.1, §5.2) and the Children's Privacy Policy (§1.0.1)
promise. Change the code and those pages together, and the store answers
below.

1. **Nothing that can tell players apart.** No account, no user or device
   ID, no session ID, no cookie, no fingerprint, no IP address kept, no
   time finer than the day. The request is sent with `credentials: 'omit'`
   (the sign-in cookie never travels with it) and no referrer, and the
   server's handler never reads the cookie or the address.
2. **Only values from a fixed list.** Each event's details come from
   `USAGE_EVENTS`; the server refuses anything else (`validUsage`), so no
   name, room code, message or other free text can ever be counted, even
   from a modified game. Weapon ids are checked with `isWeaponId`, coin
   packs come from `COIN_PACKS`. Durations are buckets (`'1-2s'`), never
   exact times. Errors are a kind and a place only: never the message,
   the stack, a file or an address (they can hold player names).
   The app, the device and the language are separate events (`app`,
   `device`, `lang`): no stored row combines them, since a rare mix (one
   iOS tablet in Japanese) could point to one person. No event may ever
   pair two of them (`tests/usage.test.ts` checks).
3. **Totals, straight away.** The server adds reports to per-day totals in
   memory and writes them once a minute to `usage_day (day, event, detail,
   count)`. There is no table of individual reports: one player's counts
   can't be picked out, and a player can't be followed from day to day.
4. **Nothing stored on the device to send them.** Counts wait in memory
   and go about once a minute and when the game is hidden or closed. Lost
   if offline. The only stored thing is the player's "off" choice
   (`tardigeddon.shareUsage`, in the Cookie & Storage Policy's table).
5. **Easy to refuse.** Settings → Privacy turns it off on that device. It's
   also off whenever the browser sends Global Privacy Control or Do Not
   Track (the switch then shows as off and can't be turned on). When it's
   off, the game tells the online server (`stats: false`), which then doesn't
   count that player's quick-play wait or rooms either (nor a match or
   rematch that player is in).
6. **Kept 25 months**, then deleted (`server/usage.ts`, daily).
7. **Limits.** At most 60 entries per report, each count capped (4 hours
   of seconds, 500 shots, 10 errors, 50 of anything else), at most 10
   errors counted per visit, and 20,000 entries a minute from everyone
   together, so a flood can't fill the database.
8. **Nothing lost on a deploy.** On SIGTERM or SIGINT the server saves the
   minute's totals before it exits (`server/main.ts`; `fly.toml` sends
   SIGTERM and allows 10 seconds). The Dockerfile starts Node directly
   (not through npx) so the signal reaches it.
9. **Without accounts, nothing.** A server with no `DATABASE_URL` keeps no
   totals: it answers `POST /api/usage` with an empty 204 (no error in the
   browser), and its own counts do nothing.

## Why it needs no consent banner

Not legal advice: have the privacy adviser who reviews `site/legal/`
confirm this before launch.

- **Not personal data once it arrives.** UK/EU GDPR apply to information
  about an identifiable person. Daily totals with no identifier aren't.
  Receiving a report does briefly involve the device's IP address (every
  internet request does); the server doesn't read or keep it, and the
  host's own logs are covered in the Privacy Policy (§4.0.2).
- **Device storage and access (UK PECR reg. 6, EU ePrivacy art. 5(3)).**
  Nothing is stored on the device to count. The game reads only what it
  already uses to run (app type, screen size class, language), at the
  coarsest level. This follows the conditions regulators set for
  consent-free audience measurement: strictly statistics for the service
  itself, aggregate output only, no cross-site or cross-device linking, no
  sharing, limited retention, clear information, and a simple way to
  refuse (the CNIL's audience-measurement exemption, and the UK's
  statistics exception added to PECR by the Data (Use and Access) Act
  2025, once in force). It is stricter than Cloudflare Web Analytics, which the site
  already used consent-free.
- **Children (UK Children's Code, COPPA).** No profiling, no identifiers,
  nothing linked to a child or account, no third party, and off on request.
  The Children's Privacy page says so.

## What is counted

| Event | Details | Counted by |
|---|---|---|
| `app`, `device`, `lang` | the app (web, android, ios); phone, tablet or desktop; the language. Each on its own | game, on opening |
| `visit`, `seconds` | how long the game stayed on screen (bucket), and the seconds | game |
| `page` | a menu page opened | game |
| `match`, `result`, `playtime`, `weapon` | matches by mode and CPU level, how they end, time in them, shots per weapon | game |
| `tutorial` | each tutorial step reached (`walk` … `wind`), and `done` | game |
| `coinstap` | which Get coins button: lobby banner, picture chip, menu tile, wallet chip, World picker card, Shop tab, a Shop item or bundle short of coins | game |
| `coinspack` | the coin pack chosen (its checkout opened) | game |
| `checkout` | the store (stripe, play, appstore) and the step: start, cancel, fail, pending, done. Stripe's done/cancel are counted when Stripe sends the player back | game |
| `load` | menu (page opened to menu showing) or match (Play pressed to the match running), as a bucket, with the device class. Not counted for a tab loading in the background | game |
| `error` | kind (script error, unhandled promise, WebGL lost, sound failed, online desync) and where (menu, or the match's mode) | game, at most 10 a visit |
| `quick` | quick-play wait (bucket) and how it ended: matched, cpu, gave up, error (server full), disconnected | server |
| `room` | private or quick: created, joined (by code), started, rematch | server |

An older game (testers' builds before this split) sends `open` with the
app, device and language together. The server accepts it but splits it into
the three counts before adding it (`foldLegacy`), and on start it splits
any `open` totals already stored (`migrateUsage`), so no combined row is
ever kept. This can go after the public launch (31 Oct 2026), once no
build that sends `open` is in use.

## Store answers

- **Google Play Data safety:** App activity → App interactions, App info
  and performance → Crash logs, and App info and performance →
  Diagnostics: collected, not shared, not ephemeral, optional, purpose
  Analytics (`docs/GOOGLE_PLAY.md` §4).
- **App Store privacy labels:** Usage Data → Product Interaction, and
  Diagnostics → Crash Data, Performance Data and Other Diagnostic Data:
  not linked to the user, not tracking, purpose Analytics. The same in
  `ios/App/App/PrivacyInfo.xcprivacy` (`docs/IOS.md`).

## Adding something to count

Add the event, or the new value, to `USAGE_EVENTS`: never a free-text
detail, an ID, a timestamp or an exact duration (use a bucket). Count it with `usage('event', { … })`. Show
it in `src/ui/usageReport.ts`. If it's a new *kind* of information, add it
to the Privacy Policy's list (§2.4.3) and check the store answers still
fit. The server must be deployed before (or with) a game that sends a new
event: until then the server drops it.

## What it can't tell you

How many different people play, or whether they come back (it never
knows who anyone is). Use **Play Console** (Statistics: installs, active
users, retention) and **App Store Connect** (App Analytics) for those, and
Cloudflare Web Analytics for website visits.
