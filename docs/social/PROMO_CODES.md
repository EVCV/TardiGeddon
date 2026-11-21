# Getting the promo code (and the game) seen

The current code is in `src/shop/catalog.ts` (`PROMOS`) and on
tardigeddon.com/promo-codes. Right now: **WATERBEAR** → Water Bear Ears
(Shop → 🎀 Gifts). A code is a reason for people to click, a reason for
sites to write about us, and a reason to come back when the next one goes up.

Same rules as every social post (README.md): never name other games, money
only buys looks, British spelling, say plainly that you're the developer.

---

## 1. Reddit (ready to post)

Posts: `store/social/reddit/promo/` (01–08), each with where, when, which
picture and what to check first. Pictures: `store/social/reddit/promo-*.png`
(`npx tsx scripts/social-images.ts reddit/promo-square.png reddit/promo-wide.png reddit/promo-phone.png`;
they read the code from the game, so re-run them when it changes).

| # | Where | When | Picture |
|---|---|---|---|
| 01 | r/TardiGeddon | Thu 3 Dec | promo-square |
| 02 | r/WebGames | Wed 2 Dec | link post, no picture |
| 03 | r/playmygame | Fri 4 Dec | promo-wide |
| 06 | r/IndieGaming | Mon 7 Dec | the teaser video |
| 07 | r/indiegames | Thu 10 Dec | promo-wide |
| 08 | r/browsergames | Mon 14 Dec | promo-wide |
| 04 | r/AndroidGaming | once the Play app is live | promo-phone |
| 05 | r/iosgaming | once the App Store app is live | promo-phone |

**Before the first one:**

1. **Read each sub's rules and sidebar** on the day (we couldn't check them
   when writing these). Look for: self-promotion days or a weekly thread,
   title tags like `[Browser]` or `[DEV]`, required flair, and a minimum
   account age or karma. If a sub only allows it in a weekly thread, post
   the text there as a comment.
2. **Warm up the account.** Big subs quietly remove posts from new or
   low-karma accounts. Spend a week before 2 Dec leaving genuine, helpful
   comments in those subs (not about TardiGeddon).
3. **One sub every two or three days**, never several on the same day, never
   the same words twice. Reddit flags the same link posted around quickly.
4. **Stay for two hours after posting** and reply to every comment. That's
   what keeps a post alive.
5. If a post vanishes with no comments, it was probably caught by a filter:
   message that sub's moderators once, politely, and ask. Don't repost.

Leave r/tardigrades out of the code posts: only post there with something
genuinely about tardigrades (the science page idea in docs/SEO.md).

## 2. TouchArcade forums (iPhone and iPad)

Only once the App Store app is live.

1. Make a forum account at forums.toucharcade.com (company email, 2FA if offered).
2. **Upcoming iOS Games** board: post a thread a week before the iOS launch
   (title: "TardiGeddon: turn-based tardigrade artillery, free, coming to
   iPhone and iPad"). Body: the r/iosgaming text (05) with the screenshots
   from `store/` and the trailer link.
3. On launch day, post in **Released iOS Games** (or ask a mod to move the
   thread there) with the App Store link and the code.
4. Reply in the thread with every update. Forum threads live for years.

## 3. IndieDB

1. Sign in at indiedb.com and **Add game**: name, summary (use the Play Store
   short description), platforms (Web, Android, iOS), genre Artillery,
   theme Comedy, players Single/Multiplayer, release date 1 Dec 2026.
2. Add 6–10 screenshots (`store/` phone and tablet shots, or
   `site/public/media/shot-*.webp` converted to PNG) and the trailer.
3. **Add article → News**: "Free hat code for launch: WATERBEAR", the
   r/TardiGeddon text (01) plus the square picture.
4. Post a news article for each update after that (the News post's words).

## 4. itch.io

Optional, but itch's feeds and search bring browser players.

1. **Create new project**, Kind of project **HTML**, but upload nothing: put
   a big "▶ Play free at tardigeddon.com/play" link at the top of the
   description instead (the game stays on our site, so accounts, online play
   and updates keep working).
2. Cover image: `store/social/itch-cover.png` (already made).
3. Pricing: **No payments**. Tags: artillery, turn-based, multiplayer,
   local-multiplayer, cute, funny.
4. **Devlog** post: the code, how to use it, the square picture.

## 5. A wiki with a Codes page (Fandom)

Players search "TardiGeddon codes". Code sites copy from wikis. A page we
control ranks for that search.

1. At fandom.com, **Start a wiki**: name "TardiGeddon Wiki", language English,
   topic Games. Use the company account.
2. Make these pages first: **Codes** (current code, how to redeem, past codes
   with "Expired"), **Weapons** (from tardigeddon.com/weapons), **How to play**.
3. Link the Codes page from the wiki's main page.
4. Update it the same day a code changes, and link it from the website's
   `/promo-codes` page if it grows (ask before adding outside links there).

## 6. Our own Discord

Add a **#codes** channel (read-only for players, Announcement type so other
servers can follow it). Post the code and the square picture there. Every
new code goes there first.

## 7. Emails to sites

Send each one personally, from support@ or developer@tardigeddon.com, with
**promo-square.png** attached. Wait a week before one polite follow-up, then
leave it.

| Site | Covers | How to reach them |
|---|---|---|
| Pocket Gamer | mobile | the "contact / tips" address on their site |
| Pocket Tactics | mobile and strategy | site contact page |
| Gamezebo | mobile and casual | site contact page |
| Droid Gamers | Android | site contact page |
| Alpha Beta Gamer | free and indie, browser | site contact page |
| Jay Is Games | browser games | site's "submit a game" link |
| Free Game Planet | free games | site contact page |

Look up each address on the site itself on the day you send (they change).
The big "codes" sites (Pro Game Guides, Beebom, Game8, Dexerto) write about
games people already search for; they rarely answer pitches, so leave them
until players exist.

**Template** (change the first line for each site):

> Subject: Free hat code for TardiGeddon, a turn-based tardigrade artillery game
>
> Hi [name], I saw your [recent piece / list] on [site] and thought this
> might suit it.
>
> TardiGeddon is a free turn-based artillery game starring tardigrades: walk,
> aim, mind the wind and fire across a landscape that breaks apart. It plays
> in the browser (tardigeddon.com/play) and is coming to Android, iPhone and
> iPad. No ads, and nothing pay-to-win.
>
> Code for your readers: **WATERBEAR** (Shop → Gifts) unlocks the Water Bear
> Ears, a hat you can't get any other way. Details: tardigeddon.com/promo-codes
>
> Press kit with screenshots and the trailer: tardigeddon.com/press
>
> Thanks for reading,
> [your name], EVCV Studios

## 8. YouTubers and streamers

A creator's own code works better than a shared one: their viewers type it,
and the creator gets a reason to mention us.

1. Find 10 small channels (1k–50k subscribers) that play party, artillery
   or cosy indie games, and have posted in the last month.
2. Email (template above, but offer a **private online room for them and
   their friends** and, if they'd like, **their own code** for the Water
   Bear Ears).
3. Making a creator code: add another entry to `PROMOS` in
   `src/shop/catalog.ts` (e.g. `{ code: 'CHANNELNAME', items: ['hat:waterbear'] }`)
   in a pull request. `/promo-codes` keeps showing the main one.

## 9. When the code changes

1. Change `PROMOS` (and give the old one an `until` date) in a pull request,
   with a News post (`src/news/news.ts`).
2. Re-run the pictures (§1), post in #codes, r/TardiGeddon and the wiki.
3. Email only the sites that wrote about the last one.
