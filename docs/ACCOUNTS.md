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

Check: `/api/me` now shows `{"user":null,"owned":[],"shop":true,"providers":[]}`
and `fly logs` says "Accounts enabled". On https://tardigeddon.com/play/ the
menu shows **👤 Sign in / Shop**.

### 5. Test it end to end (sandbox)

1. Create an account in the game, open the shop, buy a hat. On Stripe's page
   pay with card `4242 4242 4242 4242`, any future date, any CVC.
2. Back in the game the hat shows **Owned ✓** within a few seconds, and it
   can be picked in the ✎ team editor.
3. Play an online match: the other player sees your hat.
4. In Stripe (sandbox) → **Payments**, refund the payment: within a few
   seconds the hat is gone from your account.
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
4. Remove the hats granted by sandbox payments. In the Neon console, **SQL
   Editor**, run:

   ```sql
   DELETE FROM inventory i USING purchase p
     WHERE p.id LIKE 'cs_test_%' AND i.user_id = p.user_id AND i.item = p.item AND i.source = 'purchase';
   DELETE FROM purchase WHERE id LIKE 'cs_test_%';
   ```

   (With a live key the server also ignores any further sandbox events.)
5. Buy one hat yourself with a real card, check it arrives along with the
   receipt email, then refund it in Stripe.

Done: the shop is live.

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
