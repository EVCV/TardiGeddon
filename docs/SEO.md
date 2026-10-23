# Search and getting found

How the site helps search engines and social apps, the one-off setup only the
owner can do, and a plan for earning links the way Google wants: by being
worth linking to, never by buying or swapping them.

## What the site does (built in)

- **A real HTML page per address.** `npm run site:build` renders every page
  into its own file (`site/prerender.mjs`; see `docs/WEBSITE.md`), so search
  engines and link previews (WhatsApp, Discord, X, Facebook, Reddit) see
  the whole page without running JavaScript.
- **Its own title and description per page** (`PAGES` in `site/src/seo.ts`).
  Titles about 60 characters, descriptions about 150, saying what's on the
  page in the words people search with ("free online artillery game", "no
  download", "promo codes", "how to play").
- **Share pictures** (`og-*.jpg`, 1200×630) per page, drawn from the game's
  own art by `site/capture/share-images.ts`.
- **Structured data** (schema.org JSON-LD, in each page's HTML):
  `Organization` (EVCV Limited), `WebSite`, `VideoGame` (genre, platforms,
  players, price 0, languages, weapons, a trailer) on Home and Press,
  `BreadcrumbList` on inner pages, and `FAQPage` on Help & support (built
  from the questions on the page, so it always matches them). Rule: schema
  only describes what the page itself shows. Google treats anything else as
  spam, so don't add keywords or claims to it that aren't in the copy.
- **`sitemap.xml` and `robots.txt`**, written at build time. Legal pages are
  `noindex` and left out of the sitemap; the 404 page is `noindex` and
  returns a real 404.
- **A promo code page** (`/promo-codes`) with a free, code-only hat (Terms
  5.9). Coupon and code sites list games' codes and link to the source;
  keeping a working code there gives them a reason to.
- **A press kit** (`/press`): fact sheet, descriptions to quote, logo,
  screenshots and clips. Journalists, YouTubers and game directories need
  this before they'll write about a game.

Keep "Worms" (and other games' names) out of the copy and the schema: we
describe the genre ("turn-based artillery") instead. See the plan, §1.

## One-off setup (owner)

1. **Google Search Console** (search.google.com/search-console): add a
   *Domain* property for `tardigeddon.com`. It gives a TXT record: add it in
   Cloudflare (DNS → Records → Add, type TXT, name `@`). Then Sitemaps →
   submit `https://tardigeddon.com/sitemap.xml`. Use URL Inspection →
   "Request indexing" on the home page and `/promo-codes` once they're live.
2. **Bing Webmaster Tools** (bing.com/webmasters): "Import from Google
   Search Console" copies the setup. Bing also feeds DuckDuckGo, Yahoo and
   ChatGPT search.
3. **Cloudflare**: turn on *Crawler Hints* (Caching → Configuration), which
   tells Bing and Yandex about changes straight away (IndexNow).
4. Check the share previews: paste the home page and `/promo-codes` into
   the Facebook Sharing Debugger (developers.facebook.com/tools/debug) and
   opengraph.xyz.
5. Check the structured data: Google's Rich Results Test
   (search.google.com/test/rich-results) on `/` and `/support`.
6. When the game has social accounts (YouTube, TikTok, X, Bluesky,
   Discord; see `docs/social/`), add them to `sameAs` on the Organization in `site/src/seo.ts`,
   and link them from the footer.
7. When the Android app is live: add the Google Play listing to `sameAs`,
   `gamePlatform: 'Android'` to the VideoGame, and link it from every page.

## Earning links (what Google rewards)

Links count when a real person chose to link because the thing is good or
newsworthy. Each item below is something people do link to. Do a few a
week; it compounds.

### Free-game portals and directories (do first)

Listing the game is normal practice, and each listing is a real page about
the game with a link back. Use the press kit's descriptions and media.

- **itch.io**: a page for the game (HTML5 "play in browser" using
  `/play/`, or a link out), tagged artillery, turn-based, multiplayer,
  local multiplayer, browser. itch.io pages rank well in their own right.
- **Newgrounds** and **Game Jolt**: both take browser games and have active
  communities that review and share.
- **IndieDB**: a game page plus news posts for each big update.
- **CrazyGames**, **Poki**, **GameDistribution**: the big browser-game
  portals review submissions (Poki is selective). Read their terms first:
  some want exclusive builds or ads, which may not suit us.
- **AlternativeTo** and **Slant**: add TardiGeddon as a free alternative to
  similar games. Describe it truthfully; don't use other games' artwork.
- **Coupon and code sites** (gaming code roundups): email them the
  `/promo-codes` page when a new code goes up.

### Communities (be a person, not an advert)

Post where the rules allow self-promotion, reply to comments, and come back
with updates rather than reposting the same thing.

- Reddit: r/WebGames, r/playmygame, r/IndieGaming, r/indiegames,
  r/AndroidGaming (once the app is live), r/tardigrades (they'll love the
  mascot). Read each subreddit's self-promotion rules first.
- Hacker News "Show HN": a short honest post about building a deterministic
  lockstep artillery game for the browser (the sim, replays, the CPU that
  simulates shots). Technical write-ups get links from developers.
- Product Hunt: a launch day, ideally when the Android app goes live.
- Discord servers for indie and browser games; TIGSource forums.

### Press and creators

- Email games sites that cover free and browser games: Jay Is Games, Alpha
  Beta Gamer, Free Game Planet, IndieGamesPlus, plus the free-game roundups
  at Rock Paper Shotgun and PC Gamer. Short, personal email: one line on
  what it is, the link, the press kit, two screenshots attached.
- YouTubers and streamers who play party and artillery games: offer a
  private online room for them and friends. A video's description link is a
  real link, and the video itself brings players.
- Local press (Warwickshire, Birmingham) and UK indie roundups like an
  independent studio angle.

### Things worth linking to (from the site itself)

- **The tardigrade angle**: a page about real tardigrades (what they are,
  why they're so tough, with sources), written well, gets links from
  schools, science blogs and curious people searching "tardigrade facts".
  Easy to do, and it's ours: nobody else has a tardigrade game.
- **Dev write-ups**: how the deterministic simulation and replays work, how
  the CPU picks shots. Developers link to good technical posts.
- **Daily challenge leaderboards** and new promo codes give people a reason
  to come back and share.

### Never

- Buy links, pay for "guest posts", join link exchanges or private blog
  networks, or spam comments and forums. Google's spam policies treat all of
  these as link schemes, and a penalty is far harder to undo than to avoid.
- Copy another game's assets or name it in our copy to borrow its traffic.

## What to expect

New sites take months to rank. Search Console shows searches within a few
weeks; the first traffic usually comes from the portals, Reddit and creators,
not from Google. Tens of thousands of visitors a month is a realistic aim,
but it comes from a steady stream of listings, posts, updates and codes over
months, not from one change to the site.
