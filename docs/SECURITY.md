# Security

How TardiGeddon protects players and their data, what was checked, and what
the owner needs to keep doing. Last full review: 10 October 2026.

## What's protected, and how

**Player data** (Neon Postgres: accounts, purchases, wallets, stats)
- Every database query uses parameters, never text pasted into SQL, so
  nothing a player types can change a query (`server/store.ts`,
  `server/accounts.ts`).
- Passwords are hashed by Better Auth; sessions store no IP address or browser
  details; expired sessions are deleted hourly.
- The sign-in cookie can't be read by page scripts (HttpOnly), only travels
  over HTTPS (Secure, `__Secure-` name) and isn't sent from other sites
  (SameSite=Lax).
- Signing in to the Android app in a browser tab (Apple) hands the sign-in
  back through a link any app could claim, so the one-time token in it only
  works together with a verifier that never leaves the app (PKCE-style), is
  used up on the first try, and lasts 2 minutes; Better Auth's own
  one-time-token routes are closed (`/api/app/*`, docs/ACCOUNTS.md).
- The iOS app can't use that cookie (WebKit drops it: its pages are
  `capacitor://`), so it signs in with a **token** instead (Better Auth's
  bearer plugin, `src/account/token.ts`), kept in the iOS Keychain. The server
  hands the token only to `capacitor://` origins (`signsInWithToken` in
  `server/accounts.ts`); everywhere else it's stripped from the reply, so
  website scripts still can never read a sign-in. Only tokens signed with
  the server's secret count. Online play can't send the token, so the app
  swaps it for a ticket (`POST /api/ws-ticket`): random, one use, 30 seconds,
  never logged.
- Shop and stats requests are only accepted from the game's own pages, as
  JSON (`fromGame` in `server/accounts.ts`), so another website can't spend a
  player's coins.
- Logs never contain emails, passwords, tokens or IP addresses.
- Password reset links work once, for an hour, and sign the account out
  everywhere. "Forgot password?" gives the same answer whether or not an
  account exists, and is limited to 3 requests a minute per address.
  Player names are escaped in emails, and the server only sends over an
  encrypted connection.
- Deleting an account deletes its data; purchase records are kept for the
  accounts without the link to the person.

**Money and the economy**
- Prices come from `src/shop/catalog.ts` on the server, never from the
  browser. Coins are only credited after Stripe's signed webhook; refunds and
  disputes take back exactly what the payment gave.
- Android app purchases: the app only passes on Google's purchase token. The
  server asks Google itself (`server/googlePlay.ts`) and grants only completed
  purchases of a coin pack, tagged with a hash of *this* account, once per
  token; then consumes it. Google refunds are checked hourly and take the coins
  back. The endpoint is rate-limited per player (each check calls Google).
- iOS app purchases: the app only passes on the purchase as Apple signed it.
  The server checks the signature up to Apple Root CA - G3
  (`server/apple/AppleRootCA-G3.cer`, the same file as apple.com publishes: a
  test pins its fingerprint and the iOS build compares it), with certificate
  revocation checks, using Apple's own library (`server/appStore.ts`). It
  grants only coin packs (consumables) for our bundle id, not refunded, tagged
  with a UUID made from a hash of *this* account, once per transaction. The
  app finishes a purchase with Apple only after that. Refund notifications
  are accepted only when Apple signed them, for our app. Sandbox purchases
  (TestFlight) grant coins free, so the TestFlight build is for invited
  testers only: never a public TestFlight link.
- Unlocks are all-or-nothing database transactions (no double spending).
- Slime: online-rate Slime only when two or more different accounts played
  each other; anything else pays the CPU rate under its 200-a-day cap; one
  payout per account per match; nothing for anyone away for more than a
  quarter of the match (rejoining just for the end doesn't count).

**The game server** (Fly.io)
- Every message from a player is size-limited (16 KB), rate-limited (120 a
  second) and rebuilt field by field from what's allowed (`cleanFrame`,
  `cleanScheme`, `cleanTeam` in `server/room.ts`).
- Weapon ids are checked against the real weapon list (`isWeaponId`); the
  list has no inherited names, so tricks like `constructor` find nothing.
  (This closed a bug where one message could crash the server.)
- If a match ever hits an unexpected error, only that match closes; the rest
  keep running.
- Limits per address: 8 connections at once and 12 new rooms a minute
  (quick play counts too);
  `MAX_ROOMS` (default 150) caps the whole server; abandoned matches stop
  after 45 seconds; dead connections are dropped by a heartbeat.
- Room codes and rejoin tokens come from a cryptographic random source, so
  they can't be predicted.
- The server runs as a normal user, not root, in its container.

**The website and game** (Cloudflare Pages, `site/public/_headers`)
- Content-Security-Policy: only our own scripts (plus Cloudflare's analytics
  beacon), no inline scripts, no `eval` (Pixi runs without it via
  `pixi.js/unsafe-eval`), connections only to us and the game server.
- No other site may put ours in a frame (no clickjacking of the shop or
  account pages); HTTPS only (HSTS); no MIME sniffing.
- Everything players type is shown with `textContent`, never as HTML. So
  is the news (`/news.json`), which the game also checks before showing
  (`src/news/feed.ts`). It's the one file any site may read
  (`Access-Control-Allow-Origin: *`), because the phone apps fetch it; it
  only holds the public news posts.

Adding anything third-party (a font, a script, an embed, a new API host)?
Add its host to the Content-Security-Policy in `site/public/_headers`, or the
browser will block it. Test the built site with the headers on (see below).

## Owner checklist

Most real breaches come from stolen logins to the services, not from the
game's code. Please:

1. **Turn on two-factor sign-in** (an authenticator app, not SMS) for:
   GitHub, Cloudflare, Fly.io, Neon, Stripe, and the email account they all
   send password resets to.
2. **Backups:** in Neon → your project → Settings → check the **history
   retention** (point-in-time restore window). Keep at least 7 days. To
   restore after a disaster: Neon → Branches → create a branch from a point in
   time, then point `DATABASE_URL` at it.
3. **Secrets** live only in `fly secrets` and your password manager. If one
   ever leaks: Stripe → roll the key; Google Play service account → delete its
   key in Google Cloud and make a new one; Neon → reset the database password;
   `BETTER_AUTH_SECRET` → set a new one (signs everyone out).
4. **Stripe:** keep **Radar** on (fraud screening, on by default), and keep
   the webhook's signing secret only in `fly secrets`.
5. Keep **GitHub's Dependabot alerts** on for the repository and merge
   security updates; `npm audit` was clean at the last review.

## Still to do

- **Turn on password reset and email confirmation:** the code is in
  (`server/mail.ts`); it needs SMTP secrets and the SPF/DKIM DNS records
  (docs/ACCOUNTS.md, step 7). Until then a player who forgets their password
  loses their account. Highest priority.
- **Stripe customer records** stay at Stripe when an account is deleted.
  Decide (with your accountant) whether to delete or redact them; Stripe
  keeps payment records for its own legal reasons either way.
- **Phone apps:** the Android app runs at `https://app.tardigeddon.com` (inside the
  phone), which must be in `TRUSTED_ORIGINS`; it signs in with the same
  same-site cookie as the website. The iOS app (`capacitor://app.tardigeddon.com`)
  signs in with a token (above); that origin must be in `TRUSTED_ORIGINS` too
  (docs/IOS.md §2a).

## Testing the security headers

Cloudflare applies `site/public/_headers`; the dev server doesn't. To check
the built site with them on: `npm run build:all`, then serve `dist-site/`
with those headers (any static server that can add headers) and open `/`,
`/legal/terms-of-service` and `/play/?autostart=cpu` with the browser console
open: there must be no "Content Security Policy" errors.
