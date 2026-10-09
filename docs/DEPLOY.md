# Going live: tardigeddon.com

The website is served at `/` and the game at `/play/`, both from one
**Cloudflare Pages** project. The online game server runs on **Fly.io** at
`server.tardigeddon.com`. Do the steps in order; each one ends with a check.

## 1. Merge the latest pull request

Cloudflare builds from `main`, so everything must be merged first.

## 2. Buy the domain

1. Sign up or log in at dash.cloudflare.com.
2. **Domain Registration → Register Domains**, search `tardigeddon.com` and
   buy it. Cloudflare Registrar charges cost price, with no markup.

Check: `tardigeddon.com` appears under **Websites** in the dashboard.

## 3. Create the Pages project

1. **Workers & Pages → Create**, then the small **"Looking to deploy Pages?
   Get started"** link at the bottom (the default flow makes a Worker, with a
   `npx wrangler deploy` command; that is the wrong one). Choose **Import an
   existing Git repository** and pick `EVCV/TardiGeddon`. Allow Cloudflare's
   GitHub app access to it if asked.
2. Build settings:
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: `npm run build:all`
   - Build output directory: `dist-site`
3. **Environment variables** (Production):
   - `NODE_VERSION` = `22`
   - `VITE_SERVER_URL` = `wss://server.tardigeddon.com`
4. **Save and Deploy**.

Check: the `*.pages.dev` address Cloudflare gives you shows the website, and
`<that address>/play/` runs the game. Online play won't connect until step 6.

## 4. Point tardigeddon.com at the site

1. In the Pages project: **Custom domains → Set up a custom domain**, enter
   `tardigeddon.com`, and confirm. Cloudflare adds the DNS record itself.
2. Repeat for `www.tardigeddon.com`. Then add a redirect from `www` to the
   bare domain (**Rules → Redirect Rules**, "Redirect from WWW to root"
   template).

Check: https://tardigeddon.com loads the site with a padlock.

## 5. Email addresses

1. In the `tardigeddon.com` dashboard: **Email → Email Routing → Get started**.
2. Add a destination address (your Gmail) and click the link Cloudflare emails
   you.
3. Add routing rules for `support@`, `legal@` and `privacy@`, each forwarding
   to that address.

Check: an email to support@tardigeddon.com arrives in your inbox.

## 6. The game server on Fly.io

1. Sign up at fly.io and add a payment card. A small machine costs a few
   dollars a month.
2. Install `flyctl` (fly.io/docs/flyctl/install) and run `fly auth login`.
3. Clone the repo and run the commands from inside it (`fly deploy` needs
   `fly.toml`): `git clone https://github.com/EVCV/TardiGeddon.git`,
   `cd TardiGeddon`, `fly apps create tardigeddon-server`. If that name is
   taken, pick another and put it as `app` in `fly.toml`. Then run
   `fly deploy --ha=false`: rooms live in memory, so there must be exactly one
   machine, and without the flag Fly starts two.
4. Check `https://tardigeddon-server.fly.dev` shows "TardiGeddon server ok".
5. `fly certs add server.tardigeddon.com`. It prints the DNS records to add:
   an `A` and an `AAAA` record for `server` with the app's IP addresses.
6. In Cloudflare **DNS → Records**, add them exactly as printed. Set the proxy
   status to **DNS only** (grey cloud) so Fly can issue the certificate.
7. `fly certs check server.tardigeddon.com` until it says the certificate is
   issued.

Check: https://server.tardigeddon.com shows "TardiGeddon server ok", and
**Play online → Quick play** on https://tardigeddon.com/play/ connects.

## 6a. Visit statistics (Cloudflare Web Analytics)

Cookie-free, so no consent banner is needed; the legal pages (v1.2) describe
it. Merge the branch that updates them first, then:

1. In the Pages project: **Metrics → Web Analytics → Enable**. Cloudflare
   adds its small analytics script to every page it serves, the game at
   `/play/` included; nothing in the code needs changing.
2. Don't add Google Analytics or anything else that sets cookies without
   first adding a consent banner and updating the Cookie & Storage Policy.

Check: after visiting the site, **Analytics & Logs → Web Analytics** shows
the visit within a few minutes.

## 6b. Accounts and the shop

Follow **docs/ACCOUNTS.md → "Going live: step by step"**: deploy the server,
set the Neon and Stripe secrets on Fly, test with the Stripe sandbox, then
switch to live keys.

## 7. Final touches

Done at launch (9 October 2026): the legal pages' effective dates are set and
the hosts confirmed, and the old GitHub Pages deploy workflow is removed.
