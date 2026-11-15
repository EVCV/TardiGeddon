# Roadmap, votes and ideas

A public **Roadmap** (what's being worked on now, what's next, what's further
off), a **vote** on each item for players with an account, and a private
**suggestion box**. Every vote and every idea passes **Cloudflare Turnstile**
first, so scripts can't stuff the ballot or flood the box.

| Where | What |
|---|---|
| The game: **📰 News → Roadmap** | The player's language. Signed in: vote (one per item, on or off) and **Suggest an idea**. Signed out: sees the votes and is asked to sign in |
| tardigeddon.com/roadmap | English, read-only: Now / Next / Later, each item's vote count, "Recently shipped", and a button to vote in the game. Still shows if the game server can't be reached (just no counts) |
| 📈 **Sales** page (owner only), "💡 Ideas from players" | The ideas, newest first, by status; set a status and a note |

| Part | File |
|---|---|
| The roadmap is the news posts (a `stage` and `ships`, below) | `src/news/news.ts`, `src/news/roadmap.ts` |
| What counts as an idea (categories, 10 to 500 characters, cleaning) | `src/news/suggest.ts` |
| Server: tables, votes, ideas, limits, the owner's list | `server/roadmap.ts`, routes in `server/accounts.ts` |
| Server: the Turnstile check | `server/turnstile.ts` |
| Game: the Roadmap view, and the Turnstile widget | `src/ui/roadmap.ts`, `src/ui/turnstile.ts` |
| Website page | `site/src/pages/Roadmap.tsx` |
| Owner's list of ideas | `src/ui/sales.ts` (`ideasCard`) |
| Tests | `tests/roadmap.test.ts`, `tests/turnstile.test.ts`, `tests/accounts.test.ts` (Postgres), `e2e/news.spec.ts` |

## The roadmap is the News

A **"coming"** post (`kind: 'coming'`) is a roadmap item. Give it a `stage`:

```ts
{ id: '2027-01-weekly-tournaments', date: '2027-01-15', kind: 'coming', stage: 'next', text: { … } }
```

- `stage: 'now'` (being built), `'next'` (after that) or `'later'` (ideas for one
  day). No stage counts as `'next'`.
- The roadmap shows **no dates** on items: players read a date as a promise.
  (`date` still orders an item within its column, soonest first.)
- Players vote on **every** "coming" post, so don't make one for something that
  isn't up for voting (like a date change). The post's first paragraph is
  shown with it.
- When the update that delivers it goes out, give **that update** the item's id:

  ```ts
  { id: '2027-02-02-tournaments', date: '2027-02-02', kind: 'update', ships: '2027-01-weekly-tournaments', text: { … } }
  ```

  The item then moves out of its column into **Recently shipped**, with the
  update's date, and out of "Coming soon". Nothing to delete by hand.
  `tests/roadmap.test.ts` fails if a `ships` doesn't match a "coming" post.
- **Every pull request that changes something players notice adds or updates
  its News post** (`CLAUDE.md`), and `ships` the roadmap item it delivers.

The roadmap and the votes follow `docs/NEWS.md`: posts reach the website and the
apps at the next website deploy (`/news.json`).

> **Deploy the game server after adding a roadmap item.** The server only
> accepts votes for items it knew about when it was built (`comingIds(NEWS)` in
> `server/accounts.ts`), so a new item shows at once on the website and in the
> game but says "That idea isn't open for voting" until `fly deploy`.

## Votes

- `GET /api/roadmap/votes` (public): the total per item, and, if signed in,
  the player's own votes (`mine`). Totals are cached for a few seconds on the
  server and 30 s in browsers; a player's own votes are never cached.
- `POST /api/roadmap/vote` `{ itemId, on, platform, turnstileToken }`: signed in,
  Turnstile, and `itemId` must be a real "coming" post. One vote per account per
  item (voting twice does nothing; `on: false` takes it back). 20 a minute per
  account, 60 a minute per address.
- Table `roadmap_vote(user_id, item_id, created_at)`, deleted with the account.

## Ideas

- `POST /api/suggestions` `{ category, text, platform, turnstileToken }`: signed
  in **with a confirmed email**, Turnstile, a category from `weapon`, `map`,
  `mode`, `looks`, `other`, and 10 to 500 characters of text. Control and
  invisible characters are stripped. **5 a day** per account (any 24 hours),
  **10 an hour** per address; the same idea (ignoring spacing and capitals)
  from the same account within 30 days is refused.
- Table `suggestion(id, user_id, category, text, created_at, status, admin_note)`,
  status `new`, `planned`, `declined` or `done`. Deleted with the account, and
  anything older than **24 months** is deleted by the hourly clean-up.
- **Only you can read them**: `GET /api/admin/suggestions?status=` and
  `POST /api/admin/suggestions/:id` `{ status, admin_note }` answer the owner
  (`ADMIN_EMAILS`, confirmed email) and "not found" to everyone else, as the
  Sales page does. The page shows the player's name, never their email, and
  nothing here is sent to the anonymous play statistics (`docs/USAGE.md`).
- Ideas are private: never copy one into a News post with a player's name.
  There's no way to reply from the game; if an idea needs an answer, the
  player's account is the only link.

## Turnstile

Cloudflare Turnstile is a free CAPTCHA alternative: the game shows a widget
(invisible unless Cloudflare needs the player to do something), which gives a
**token**; the server asks Cloudflare whether it's good
(`https://challenges.cloudflare.com/turnstile/v0/siteverify`). Tokens work once
and expire after 5 minutes, so the game asks for a fresh one for each vote or
idea and resets the widget after each try, whether it worked or not
(`src/ui/turnstile.ts`).

How it's set up (`server/turnstile.ts`):

- **Two widgets**, because the website's game and the phone apps are served
  from different hostnames: **web** (`tardigeddon.com`, `www.tardigeddon.com`)
  and **apps** (`app.tardigeddon.com`: the apps' own pages, `capacitor.config.ts`).
  The game says which it is (`platform`), and the server uses that one's secret
  and hostnames.
- The server **refuses**: no token, a token longer than 2,048 characters, a token
  Cloudflare says is bad or used, one made for a different action
  (`roadmap_vote` or `suggestion`) or served from a different hostname, and
  anything it can't check (Cloudflare unreachable, 10 seconds without an answer,
  an answer it can't read). It never lets a vote or idea through unchecked.
- **Production with no keys set turns voting and ideas off** (the game says
  "Voting isn't open right now"), instead of skipping the check.
- On a developer's computer (not production) with no keys set, Cloudflare's
  published **always-pass test keys** are used, so you can try it all locally
  with `npm run dev` and `npm run server` (with `DATABASE_URL`). Real keys work
  on `localhost` too.
- The game loads Cloudflare's script **only when a signed-in player opens the
  Roadmap**, never for signed-out players and not at all otherwise. In the
  apps, if it can't load, the game says so and points to tardigeddon.com/play.
- The Content-Security-Policy in `site/public/_headers` allows
  `https://challenges.cloudflare.com` for scripts and frames (that's all
  Turnstile needs), and `capacitor.config.ts` lets the apps' web view open it.

### What you set up (once)

1. **Cloudflare dashboard → Turnstile → Add widget**, twice:
   - **TardiGeddon web**: hostnames `tardigeddon.com` and `www.tardigeddon.com`;
     widget mode **Managed**.
   - **TardiGeddon apps**: hostname `app.tardigeddon.com`; mode **Managed**.

   Each gives a **site key** (public) and a **secret key**.
2. Give them to the game server:

   ```sh
   fly secrets set TURNSTILE_SITE_KEY=… TURNSTILE_SECRET_KEY=… \
                   TURNSTILE_APP_SITE_KEY=… TURNSTILE_APP_SECRET_KEY=…
   ```

   (The site keys reach the game through `/api/me`, signed in only; nothing is
   needed at build time, and secrets never leave the server.) A platform is
   only on when both its keys are set.
3. `fly deploy`, so the server has the roadmap tables and routes (it makes them
   itself), and check: sign in, open **📰 News → Roadmap**, vote, then take it
   back. In the Cloudflare dashboard, Turnstile → the widget → analytics shows
   the checks.
4. Check both widgets in their own place: the website (tardigeddon.com/play) and a
   phone app (Android or the iOS TestFlight build). If an app's check never
   works, the hostname Cloudflare sees for the app's pages may differ from
   `app.tardigeddon.com`: add the right one to the apps' widget in Cloudflare and
   to `TURNSTILE_APP_HOSTNAMES` on Fly (comma-separated, replaces the default).
   Until it works there, players can vote at tardigeddon.com/play.

If a secret leaks: Cloudflare dashboard → the widget → **Rotate secret**, then
`fly secrets set` the new one.

| Variable | What it is |
|---|---|
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | The website widget's keys |
| `TURNSTILE_APP_SITE_KEY`, `TURNSTILE_APP_SECRET_KEY` | The phone apps' widget's keys |
| `TURNSTILE_APP_HOSTNAMES` | Optional: hostnames the apps' widget is served from (default `app.tardigeddon.com`) |

## Reading the ideas

**📈 Sales → 💡 Ideas from players.** Filter by status (New, Planned, Declined,
Done, All), change a status, and add a note (only you see it). **New** is what
you haven't looked at. An idea you'll do: set **Planned**, and when you make it
a roadmap item, the idea can stay as it is. When you've shipped it: **Done**.

## Privacy and the stores

Kept in step (`CLAUDE.md`): Privacy Policy 2.8 (what's kept, why, how long) and
Cloudflare as a processor (2.8.4, 4.0.2A), Cookie & Storage 4.0.4, Terms 7.0.3 (the
licence to use ideas), Community Guidelines 2.4, Google Play Data safety and
App Store App Privacy ("other user content", linked to the account, app
functionality, not shared). Change what's stored, and those change too.
