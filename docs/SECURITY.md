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
- Everything players type is shown with `textContent`, never as HTML.

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
   ever leaks: Stripe → roll the key; Neon → reset the database password;
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
- **Phone apps:** their origins (e.g. `capacitor://localhost`) will need
  adding to `TRUSTED_ORIGINS`, and they'll sign in with a token kept in the
  phone's secure storage instead of a cookie.

## Testing the security headers

Cloudflare applies `site/public/_headers`; the dev server doesn't. To check
the built site with them on: `npm run build:all`, then serve `dist-site/`
with those headers (any static server that can add headers) and open `/`,
`/legal/terms-of-service` and `/play/?autostart=cpu` with the browser console
open: there must be no "Content Security Policy" errors.
