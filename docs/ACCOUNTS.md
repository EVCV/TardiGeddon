# Accounts and the shop

Players can create a free account, earn **Slime** by playing, buy **coins**,
and unlock hats, skins and season weapons that follow them to any device.
Money only buys coins, and coins only buy looks; weapons are unlocked with
Slime, which can't be bought (GAME_PLAN §8). Everything in the game stays
free without an account.

## How it works

- **Database:** Postgres on **Neon**. The game server creates its tables on
  start-up: Better Auth's `user`, `session`, `account` and `verification`,
  plus `inventory` (who owns what), `wallet` (coins and Slime),
  `player_stats`, `stripe_customer` and `purchase` (every payment).
- **Sign-in:** [Better Auth](https://www.better-auth.com), running inside the
  game server (`server/accounts.ts`) at `/api/auth/*`. Email + password
  always; Google and Apple once their keys are set. The session is a cookie
  on `server.tardigeddon.com`, which the game at `tardigeddon.com` can use
  because both are the same site.
- **Buying coins:** the game asks the server for a **Stripe Checkout** page
  for a coin pack (`POST /api/shop/checkout`; packs and prices are in
  `src/shop/catalog.ts`, never taken from the browser). After payment Stripe
  calls `POST /api/stripe/webhook`; the server checks Stripe's signature and
  only then credits the coins, bonus included, and records how many it gave.
  Refunds and chargebacks take back exactly that many (the balance can go
  below zero). Webhook retries are harmless.
- **Coin packs** (£1.99 to £99.99): bigger packs include bonus coins (+10% to
  +30%), so coins cost from about 1p down to 0.77p each (Terms 5.1.2). Packs
  of £20 or more also need the buyer to confirm they're 18+ or a parent or
  carer agreed; the server refuses without it and records the time in the
  Stripe session's metadata. Never rename a pack's `id`.
- **Earning Slime:** online matches pay Slime from the server's own count
  (20 for playing, +30 for a win, +5 per pop up to 8); games against the CPU
  are reported by the game and pay less (10, +15, +2 per pop), at most 200 a
  day (`server/store.ts`).
- **Unlocking:** `POST /api/shop/unlock` spends coins or Slime and adds the
  item to the `inventory`, all or nothing.
- **Season weapons** (`locked: true` in `src/sim/weapons.ts`) are off unless
  the match rules list them in `Scheme.unlocked`. The game sets that from
  the player's unlocks for local matches; online, the server sets it from
  the host's unlocks (a client can't add its own), and quick play never
  has them. Every team in the match gets them.
- **Wearing:** the game shows shop hats and skins as unlocked when `/api/me`
  says the player owns them. Online, the server reads the player's cookie
  when they connect and swaps any hat or skin they don't own for the
  default, so editing the browser's storage can't unlock anything for other
  players to see.
- **Deleting an account** (Account page → Delete account; app stores require it)
  removes the user and their inventory. Purchase records are kept for the
  accounts (tax) without the link to a person.
- **Off by default:** with no `DATABASE_URL` the server runs games exactly as
  before, and the menu shows only the Lobby (no Stats, Shop or Account
  pages, and no shop hats).

New shop items: add the cosmetic (a hat in `src/render/hats.ts`, a skin in
`src/render/skins.ts`, or a `locked` weapon in `src/sim/weapons.ts` with a
sim test), then list it in `SHOP_ITEMS` in `src/shop/catalog.ts` with a price
in `coins` (looks only) or `slime`. Weapons must be priced in Slime only
(`tests/season.test.ts` checks). Never rename an item's `id` once sold:
inventories store it.

## Before switching it on for real players

The legal pages were updated for accounts and the shop (v1.1 of the Privacy
Policy, Cookies & Storage, Children's Privacy, Terms §3 and §5). They are
marked "under legal review" on the site; have them checked before launch.
Their promises are also code rules, so keep them true:

- Sessions store no IP address or browser details (`databaseHooks` in
  `server/accounts.ts`); expired sessions are deleted hourly.
- Sign-up asks players to confirm they are 13+ and accept the Terms.
- Checkout needs the player's consent to immediate supply (losing the 14-day
  cancellation right); the server refuses without it and records the time in
  the Stripe session's metadata.
- Packs of £20 or more need the 18+ / parent's agreement tick (Terms 5.1.1).
- Each pack shows its coins (bonus included), price and price per coin; item
  prices show their £ value as a range (Terms 5.1.2). No countdowns.
- Prices include VAT and are in pounds.

Still to decide or set up (owner):

- **VAT outside the UK.** Selling digital items to consumers in the EU means
  charging VAT at the buyer's country's rate from the first sale (registering
  for the EU's non-Union OSS scheme), and some other countries have similar
  rules. Options: Stripe Tax, or selling only to UK buyers at first. Ask your
  accountant.
- **Stripe Managed Payments** (Stripe as merchant of record, handling VAT
  worldwide) is off by default. To use it, check in Stripe that it accepts
  in-game currency (coin packs) and which tax code applies, then set
  `STRIPE_MANAGED_PAYMENTS=on` and `STRIPE_TAX_CODE=txcd_…`. Update the
  Terms (Stripe becomes the seller) before switching it on.
- **Receipts:** turn on Stripe → Settings → Customer emails → Successful
  payments. The Terms promise a receipt by email.
- **Password reset** isn't built yet (it needs an email-sending service).
  Until then players who forget their password must email support.

## Going live: step by step

Do these in order. Each step ends with a check. Keep every key and secret in
your password manager; never paste them into chats, issues or code.

### 1. Merge and deploy the server

1. Merge the pull request into `main`. Cloudflare rebuilds the website and
   game (a few minutes): the updated legal pages go live, and the game is
   ready for accounts but hides them until the server has a database.
2. Deploy the game server from `main` (see DEPLOY.md step 6):
   `git pull && fly deploy --ha=false`.

Check: https://server.tardigeddon.com/api/me shows `{"accounts":false}`, and
online play still works.

### 2. Visit statistics

Cloudflare Pages project → **Metrics → Web Analytics → Enable** (DEPLOY.md 6a).

### 3. Stripe account details (do these in the sandbox and again in live mode)

Settings are per mode, so set them in both:

- **Settings → Business → Public details:** name **TardiGeddon**, website
  https://tardigeddon.com, support email support@tardigeddon.com, statement
  descriptor **TARDIGEDDON**.
- **Settings → Branding:** icon `docs/brand/tardigeddon-icon-512.png`, logo
  `docs/brand/tardigeddon-logo.png`, brand colour `#e04848`, accent `#ffd84a`.
- **Settings → Customer emails:** turn on **Successful payments** and
  **Refunds** (the Terms promise a receipt). Stripe doesn't email receipts in
  the sandbox, so you'll only see them in live mode.
- **Settings → Billing → Customer portal:** click **Activate** (or save the
  default settings once). This is the "Manage purchases & receipts" page:
  allow **invoice history** and updating **customer information**; nothing
  else is needed (there are no subscriptions). Until it's saved, the button
  says Stripe refused.
- Each purchase gets an **invoice** (the downloadable receipt in that
  portal). Stripe may charge a small fee per invoice for one-off payments;
  check your pricing. To skip them, set `STRIPE_INVOICES=off`.
- **Developers → API keys:** copy the **Secret key** (`sk_test_…` in the
  sandbox, `sk_live_…` in live mode).
- **Developers → Webhooks → Add destination:** events from your account,
  **snapshot** payloads, events `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `charge.refunded` and
  `charge.dispute.created`, endpoint URL
  `https://server.tardigeddon.com/api/stripe/webhook`. Copy its **Signing
  secret** (`whsec_…`).

### 4. Switch accounts on, with sandbox payments

```sh
fly secrets set \
  DATABASE_URL='postgresql://…-pooler….neon.tech/neondb?sslmode=require' \
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  BETTER_AUTH_URL='https://server.tardigeddon.com' \
  GAME_URL='https://tardigeddon.com/play/' \
  STRIPE_SECRET_KEY='sk_test_…' \
  STRIPE_WEBHOOK_SECRET='whsec_…'
```

This restarts the server (matches in progress end), so pick a quiet moment.
`BETTER_AUTH_SECRET` signs everyone's sign-ins: let the command generate it
once, then never change it (changing it signs everyone out). If the server
can't reach the database it keeps running games without accounts and says why
in `fly logs`.

Check: `/api/me` now shows `"user":null` and `"shop":true`, and `fly logs`
says "Accounts enabled". On https://tardigeddon.com/play/ the menu's top bar
shows the **Lobby / Stats / Shop / Account** tabs and a **Sign in** button.

### 5. Test it end to end (sandbox)

1. Create an account (top bar → **Sign in** → Create account), then
   **Shop** → **Get coins**, and buy a pack.
   On Stripe's page pay with card `4242 4242 4242 4242`, any future date,
   any CVC.
2. Back in the game the coins appear in your wallet within a few seconds.
   Pick a hat or skin and press **Unlock** on the preview stage: it shows
   **Owned ✓**, **Wear on …** puts it on your team, and it can be picked in
   the ✎ team editor.
3. Play an online match: the other player sees your hat and skin, and you
   earn Slime. Play a game against the CPU: a "+… Slime" banner appears.
4. In Stripe (sandbox) → **Payments**, refund the payment: within a few
   seconds the pack's coins are taken back from your wallet.
5. **Developers → Webhooks** → your endpoint shows the deliveries as
   succeeded.
6. Try Account → Delete account.

Keep this window short: while sandbox keys are live, anyone could "buy" with
the test card.

### 6. Real payments

1. Activate the Stripe account (business details for EVCV Limited, bank
   account for payouts) and do step 3 again in **live mode**.
2. Decide how to handle VAT outside the UK (see "Still to decide" above).
   To let Stripe Tax work it out, set it up in Stripe (Settings → Tax), then
   add `STRIPE_AUTOMATIC_TAX=on` to the command below. Prices stay
   VAT-inclusive either way.
3. Switch the server to live keys:
   `fly secrets set STRIPE_SECRET_KEY='sk_live_…' STRIPE_WEBHOOK_SECRET='whsec_…'`
   (the live webhook's own secret).
4. Remove the coins from sandbox payments, and what was unlocked with them
   (Slime and Slime unlocks stay: they were earned by playing). In the Neon
   console, **SQL Editor**, run:

   ```sql
   DELETE FROM inventory WHERE source = 'coins';
   DELETE FROM inventory i USING purchase p
     WHERE p.id LIKE 'cs_test_%' AND i.user_id = p.user_id AND i.item = p.item AND i.source = 'purchase';
   UPDATE wallet SET coins = 0;
   DELETE FROM purchase WHERE id LIKE 'cs_test_%';
   ```

   Run this only at the switch to live, before anyone buys real coins.
   (With a live key the server also ignores any further sandbox events.)
5. Buy the smallest coin pack yourself with a real card, check the coins and
   the receipt email arrive, then refund it in Stripe.

Done: the shop is live.

### 7. Password reset and email confirmation (email over SMTP)

Without this, "Forgot password?" is hidden and nobody can recover a
forgotten password. Any email service with SMTP works, and changing service
later is only a change of secrets (`server/mail.ts`):

- **Your own hosting's mail server.** The game server on Fly.io connects out
  to it like any email program. Make a mailbox such as `noreply@tardigeddon.com`.
- **Emailit, Resend, Postmark, Amazon SES, ...** Make SMTP credentials with
  sending access only.

1. **DNS in Cloudflare** (the domain's DNS lives there even though the mail
   server is elsewhere). Add exactly what your email service gives you:
   - **SPF**: a TXT record on `tardigeddon.com`. There can only be one SPF
     record per name: if one exists, add the new `include:` to it rather than
     adding a second record.
   - **DKIM**: a TXT (or CNAME) record, e.g. `default._domainkey`.
   - **DMARC**, if there isn't one yet: TXT on `_dmarc` with
     `v=DMARC1; p=none; rua=mailto:postmaster@tardigeddon.com`; tighten it to
     `p=quarantine` once mail is arriving fine.
   - Mail records must be **DNS only** (grey cloud), never proxied.
   Without SPF and DKIM, Gmail and Outlook will put the emails in spam or
   refuse them.
2. **Secrets** (in PowerShell, never in chat or in the code):

   ```
   fly secrets set SMTP_HOST=mail.example.com SMTP_PORT=587 SMTP_USER=noreply@tardigeddon.com SMTP_PASS=...
   ```

   Port 587 (STARTTLS) or 465 (TLS). The server refuses to send without
   encryption. Optional: `MAIL_FROM="TardiGeddon <noreply@tardigeddon.com>"`
   (the default); it must be an address the service lets you send from.
3. **Test:** sign out, "Forgot password?", your email. The email should arrive
   within a minute, and not in spam. Click the link, choose a new password,
   sign in with it. If nothing arrives: `fly logs` shows `mail: ... not sent:`
   with the reason (wrong password, port blocked, sender not allowed, ...).
   Check the email's headers say `spf=pass` and `dkim=pass`.

How it works: links in the emails go to the game
(`https://tardigeddon.com/play/?reset=...` or `?verify=...`), which finishes the
job. A reset link works once, for an hour, and signs the account out on every
device; a confirmation link works for 24 hours. The server answers "Forgot
password?" the same way whether or not the email has an account, sends in
the background (so the timing doesn't tell either), allows 3 such requests a
minute per IP address, and never logs addresses. Email confirmation is
encouraged on the Account page but not required to play or buy.

### Optional: Google and Apple sign-in

- **Google:** console.cloud.google.com → APIs & Services → Credentials →
  Create OAuth client ID (Web application). Authorised redirect URI:
  `https://server.tardigeddon.com/api/auth/callback/google`. Then
  `fly secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=…`.
- **Apple:** needs the Apple Developer account. Create a Services ID with
  Sign in with Apple, return URL
  `https://server.tardigeddon.com/api/auth/callback/apple`, and a key to make
  the client secret (Better Auth's Apple docs explain the steps). Then
  `fly secrets set APPLE_CLIENT_ID=… APPLE_CLIENT_SECRET=…`. The Apple
  client secret expires after at most 6 months, so diarise renewing it.

Check: the sign-in screen shows "Continue with Google / Apple".

### Trying it on your own computer

```sh
export DATABASE_URL='postgresql://…'          # Neon, or a local Postgres
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export STRIPE_SECRET_KEY='sk_test_…'           # optional: without it the shop shows "Soon"
npm run server                                  # prints "Accounts enabled"
npm run dev                                     # then open http://localhost:5173
```

For payments, install the Stripe CLI and run
`stripe listen --forward-to localhost:8787/api/stripe/webhook`; export the
`whsec_…` it prints as `STRIPE_WEBHOOK_SECRET` and restart the server.

## Phone apps (later)

Apple and Google require their own in-app purchases for digital items in
store apps; the plan is RevenueCat (GAME_PLAN §8.3). Its webhook will grant
into the same `inventory` table, so items bought anywhere work everywhere.

## Tests

`tests/accounts.test.ts` runs sign-up, checkout, signed webhooks, retries,
refunds and account deletion against a real Postgres when
`TEST_DATABASE_URL` points at an empty throwaway database; otherwise those
tests are skipped.
