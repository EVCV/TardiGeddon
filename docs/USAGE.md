# Anonymous play statistics

How the game is used, counted without ever knowing who: how often it's
opened and on what, how long it stays on screen, which menu pages are
opened, which kinds of match are played, how they end and how long they
last, how players do against each CPU level, and which weapons get fired.
The owner sees them on the **Sales** page, under the money.

| Part | Where |
|---|---|
| Every event and every value it may carry | `src/usage/catalog.ts` |
| The game's side (counting, sending, the off switch) | `src/usage/usage.ts` |
| Where it counts | `src/main.ts` (opened, time on screen), `src/ui/hub.ts` and the pickers (pages), `src/match.ts` (matches, shots) |
| The server's side (checking, daily totals, deleting) | `server/usage.ts`, `POST /api/usage` in `server/accounts.ts` |
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
   from a modified game. Weapon ids are checked with `isWeaponId`.
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
   Track (the switch then shows as off and can't be turned on).
6. **Kept 25 months**, then deleted (`server/usage.ts`, daily).
7. **Limits.** At most 60 entries per report, each count capped (4 hours
   of seconds, 500 shots, 50 of anything else), and 20,000 entries a
   minute from everyone together, so a flood can't fill the database.

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

## Store answers

- **Google Play Data safety:** App activity → App interactions:
  collected, not shared, not ephemeral, optional, purpose Analytics
  (`docs/GOOGLE_PLAY.md` §4).
- **App Store privacy labels:** Usage Data → Product Interaction: not
  linked to the user, not tracking, purpose Analytics. The same in
  `ios/App/App/PrivacyInfo.xcprivacy` (`docs/IOS.md`).

## Adding something to count

Add the event, or the new value, to `USAGE_EVENTS`: never a free-text
detail, an ID or a timestamp. Count it with `usage('event', { … })`. Show
it in `src/ui/usageReport.ts`. If it's a new *kind* of information, add it
to the Privacy Policy's list (§2.4.3) and check the store answers still
fit. The server must be deployed before (or with) a game that sends a new
event: until then the server drops it.

## What it can't tell you

How many different people play, or whether they come back (it never
knows who anyone is). Use **Play Console** (Statistics: installs, active
users, retention) and **App Store Connect** (App Analytics) for those, and
Cloudflare Web Analytics for website visits.
