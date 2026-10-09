# Accounts and the shop

Players can create a free account, buy cosmetic items (hats, for now) and
wear them on any device. Nothing for sale changes how a team plays
(GAME_PLAN §8). Everything in the game stays free without an account.

## How it works

- **Database:** Postgres on **Neon**. The game server creates its tables on
  start-up: Better Auth's `user`, `session`, `account` and `verification`,
  plus `inventory` (who owns what) and `purchase` (every payment).
- **Sign-in:** [Better Auth](https://www.better-auth.com), running inside the
  game server (`server/accounts.ts`) at `/api/auth/*`. Email + password
  always; Google and Apple once their keys are set. The session is a cookie
  on `server.tardigeddon.com`, which the game at `tardigeddon.com` can use
  because both are the same site.
- **Paying:** the game asks the server for a **Stripe Checkout** page
  (`POST /api/shop/checkout`). The price comes from `src/shop/catalog.ts` on
  the server, never from the browser. After payment Stripe calls
  `POST /api/stripe/webhook`; the server checks Stripe's signature and only
  then adds the item to the player's `inventory`. Refunds and chargebacks
  take it back. Webhook retries are harmless.
- **Wearing:** the game shows shop hats as unlocked when `/api/me` says the
  player owns them. Online, the server reads the player's cookie when they
  connect and swaps any shop hat they don't own for the beanie, so editing
  the browser's storage can't unlock anything for other players to see.
- **Deleting an account** (Account → Delete account; app stores require it)
  removes the user and their inventory. Purchase records are kept for the
  accounts (tax) without the link to a person.
- **Off by default:** with no `DATABASE_URL` the server runs games exactly as
  before, and the game hides the Account button and every shop hat.

New shop items: add the cosmetic (e.g. a hat in `src/render/hats.ts`), then
list it in `SHOP_ITEMS` in `src/shop/catalog.ts` with a price. Never rename an
item's `id` once sold: inventories store it.

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
- Prices include VAT and are in pounds.

Still to decide or set up (owner):

- **VAT outside the UK.** Selling digital items to consumers in the EU means
  charging VAT at the buyer's country's rate from the first sale (registering
  for the EU's non-Union OSS scheme), and some other countries have similar
  rules. Options: Stripe Tax, or selling only to UK buyers at first. Ask your
  accountant.
- **Receipts:** turn on Stripe → Settings → Customer emails → Successful
  payments. The Terms promise a receipt by email.
- **Password reset** isn't built yet (it needs an email-sending service).
  Until then players who forget their password must email support.

## Setting it up

Steps 1–3 are enough to try accounts on your own computer; 4–6 put it live.

### 1. Neon database

1. In console.neon.tech, create a project (or a new database in an existing
   one) called `tardigeddon`, in a London/Europe region near the game server.
2. Copy its connection string (Dashboard → **Connect**). Use the **pooled**
   one; it looks like `postgresql://…-pooler….neon.tech/tardigeddon?sslmode=require`.
3. Keep it secret: anyone with it can read and change every player's data.
   Don't paste it into chats, issues or code.

Check: none yet; the server creates the tables the first time it starts.

### 2. Stripe (test mode first)

1. Sign up at dashboard.stripe.com and stay in **Test mode** (toggle at the
   top). Taking real payments later needs the business details for EVCV
   Limited.
2. **Developers → API keys:** copy the **Secret key** (`sk_test_…`).
3. Webhook (needs a public server, so do it after step 4):
   **Developers → Webhooks → Add endpoint**,
   URL `https://server.tardigeddon.com/api/stripe/webhook`, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `charge.refunded` and `charge.dispute.created`. Copy its **Signing secret**
   (`whsec_…`).

### 3. Try it locally

```sh
export DATABASE_URL='postgresql://…'          # from step 1 (or a local Postgres)
export BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
export STRIPE_SECRET_KEY='sk_test_…'           # optional: without it the shop shows "Soon"
npm run server                                  # prints "Accounts enabled"
npm run dev                                     # then open http://localhost:5173
```

Check: the menu shows **👤 Sign in / Shop**; you can create an account and see
the shop. To test a payment locally, install the Stripe CLI and run
`stripe listen --forward-to localhost:8787/api/stripe/webhook`; it prints the
`whsec_…` to export as `STRIPE_WEBHOOK_SECRET` (restart the server). Pay with
card `4242 4242 4242 4242`, any future date, any CVC.

### 4. Secrets on the live server (Fly.io)

From the repo folder (see DEPLOY.md step 6):

```sh
fly secrets set \
  DATABASE_URL='postgresql://…' \
  BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  BETTER_AUTH_URL='https://server.tardigeddon.com' \
  GAME_URL='https://tardigeddon.com/play/' \
  STRIPE_SECRET_KEY='sk_test_…' \
  STRIPE_WEBHOOK_SECRET='whsec_…'
```

Setting secrets restarts the server (rooms in progress end).
`BETTER_AUTH_SECRET` signs everyone's sessions: generate it once and keep it.
Changing it signs everyone out.

Check: `https://server.tardigeddon.com/api/me` shows
`{"user":null,"owned":[],"shop":true,…}`, and `fly logs` shows
"Accounts enabled".

### 5. Google and Apple sign-in (optional)

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

### 6. Real payments

When the legal pages are updated and test purchases work end to end:
activate the Stripe account, then repeat step 2 in **live mode** (new
`sk_live_…` key and a new live webhook with its own `whsec_…`) and set both
with `fly secrets set`.

## Phone apps (later)

Apple and Google require their own in-app purchases for digital items in
store apps; the plan is RevenueCat (GAME_PLAN §8.3). Its webhook will grant
into the same `inventory` table, so items bought anywhere work everywhere.

## Tests

`tests/accounts.test.ts` runs sign-up, checkout, signed webhooks, retries,
refunds and account deletion against a real Postgres when
`TEST_DATABASE_URL` points at an empty throwaway database; otherwise those
tests are skipped.
