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

1. **Workers & Pages → Create → Pages → Connect to Git**, then pick the
   `EVCV/TardiGeddon` repository. Allow Cloudflare's GitHub app access to it
   if asked.
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
3. In the repo folder: `fly apps create tardigeddon-server`. If that name is
   taken, pick another and put it as `app` in `fly.toml`. Then run `fly deploy`.
4. Check `https://tardigeddon-server.fly.dev` shows "TardiGeddon server ok".
5. `fly certs add server.tardigeddon.com`. It prints the DNS records to add.
6. In Cloudflare **DNS → Records**, add them, usually a `CNAME` named
   `server` pointing to `tardigeddon-server.fly.dev`. Set the proxy status
   to **DNS only** (grey cloud) so Fly can issue the certificate.
7. `fly certs show server.tardigeddon.com` until it says the certificate is
   issued.

Check: https://server.tardigeddon.com shows "TardiGeddon server ok", and
**Play online → Quick play** on https://tardigeddon.com/play/ connects.

## 7. Final touches

- Legal pages: set the launch date (`grep -n "Launch date" site/legal/*.md`)
  and confirm the hosts note in `legal-notice.md` and `privacy-policy.md`.
- The old GitHub Pages deploy (`.github/workflows/deploy.yml`) can be
  switched off once the new site is live.
