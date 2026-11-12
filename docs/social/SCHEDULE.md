# Scheduled posts: weeks of content in Sociamonials

Status: **batch 1 scheduled** (4 Nov 2026). 92 posts are booked in
Sociamonials, from Thu 5 Nov 2026 to Wed 27 Jan 2027, on Facebook, Instagram,
X, Bluesky, Threads, TikTok (photo posts) and Pinterest (each pin on its own
board; questions aren't pinned). The teaser video goes to YouTube Shorts too.
The three weaker clip videos were dropped; new vertical weapon shorts are to
come (VIDEOS.md). The list, with each post's Sociamonials id, is
`store/social/queue/batch-1-scheduled.csv`.
**Don't import `batch-1.csv`**: that would post everything twice.

**The idea:** the posts are made here, not typed by hand. Each post's words
live in `scripts/social/posts.ts`, and one command draws a picture card for
each in the game's style (and writes a CSV in Sociamonials' bulk-upload
format, kept as a fallback). Claude then books each post at its own date and
time through the Sociamonials connector (§3). A scheduled Claude task does
the same for a new month of posts on the 20th of each month (§5).

Your part: nothing to import. Glance at the Sociamonials calendar now and
then, cancel anything you don't like, and spend a few minutes a day replying
to comments.

---

## 1. What's in a batch

| Category | Per week | What | Batch 1 |
|---|---|---|---|
| **Weapons** | 2 | one weapon: what it does and how to use it (the card text is the game's own description) | 24 (and 5 more in batch 2) |
| **Tips** | 1 | how to play better: wind, fuses, mines, crates, phones… | 12 |
| **Tardigrade facts** | 1 | real science about water bears, with a nod to the game | 12 |
| **Worlds and modes** | 1 | a map style, or a way to play (online, daily challenge, hot-seat…) | 12 |
| **Community** | 1 | a question to start a conversation ("Team Bazooka or Team Grenade?") | 12 |
| **Play** | 1 | a reason to play now: free and fair, hats, Quick, Chaos… | 12 |
| **Videos** | 1 | the Shorts teaser and the website's three clips (more from VIDEOS.md later) | 4 |
| *Dated* | — | fixed times: Founder pack (14 and 28 Nov), launch (1 Dec), Supporter packs (5 Dec, 24 Jan), Christmas, New Year | 7 |

Every picture post has a 1080×1350 card (fits Instagram, Facebook, Threads,
X, Bluesky, Pinterest and TikTok photo posts) and alt text. Every post fits
X's 280 characters and Bluesky's 300, so the same words go everywhere. Each
post ends with "▶ Play free: tardigeddon.com/play" and two or three hashtags
(always #TardiGeddon).

**To read them all first,** open `store/social/queue/batch-1.html` (every
card and its words). To change a post, edit `scripts/social/posts.ts` and run
the command in §4 again.

## 2. Set up Sociamonials (once)

### Networks

Connect: **Facebook Page, Instagram, Threads, X, Bluesky, TikTok, YouTube**,
and **Pinterest** (worth it: the weapon, fact and world cards are just what
Pinterest likes, and pins keep bringing visitors for months).

### Pinterest boards

**Make these on Pinterest before connecting it, spelt exactly like this**
(the CSV names each pin's board, and Sociamonials quietly drops a pin whose
board doesn't exist). Board names and descriptions are what Pinterest
searches, so they use the words people type rather than our own names.

| Board | Gets | Description (paste in) |
|---|---|---|
| `TardiGeddon Weapons` | Weapons | Every weapon in TardiGeddon, the free turn-based artillery game starring tardigrades: bazookas, grenades, strikes from the sky and superweapons like the Concrete Tun. |
| `Tardigrade Facts` | Tardigrade facts | Real facts about tardigrades (water bears, moss piglets): tiny animals that survive space, freezing and drying out. With cartoon tardigrades from TardiGeddon. |
| `Game Tips and Tricks` | Tips | Tips for TardiGeddon and turn-based artillery games: wind, fuses, aiming, mines and crates. Play free in your browser. |
| `Game Worlds and Maps` | Worlds and modes | TardiGeddon's map styles and ways to play: floating sky islands, caverns, canyons, online with friends, daily challenges and up to 10 teams on one device. |
| `Free Browser Games` | Play and Videos (and the dated posts) | TardiGeddon: a free browser game for computers, phones and tablets. No download, no ads, nothing to buy that helps you win. |
| `Tardigrade Fan Art` | nothing yet | Save players' tardigrade drawings here by hand (with their permission and credit) once the fan art comes in. |

Community questions don't go to Pinterest (leave Pinterest out of that slot).
Set each board's category to **Games** (Tardigrade Facts: **Science**).

- **LinkedIn:** leave it out. It's for company news (the launch,
  a milestone), which you can post by hand.
- **Facebook groups:** Facebook no longer lets any tool post into groups, so
  share to groups by hand (and only where the group's rules allow it).

### Categories and queue slots

Not needed: Claude books every post at its own time (§3). Only set these up
if you go back to importing CSVs by hand; then create the seven categories
`Weapons`, `Tips`, `Tardigrade facts`, `Worlds and modes`, `Community`,
`Play`, `Videos` (spelt exactly so) and give each the weekly slot in the
table in §3.

## 3. How a batch is scheduled

Claude does this through the Sociamonials connector (workspace
"TardiGeddon"):

1. Each card is copied into Sociamonials' media library (collection
   "TardiGeddon posts batch <n>"), so posts don't depend on any other link.
2. Each post is booked at its own time (UK), one slot a day:

   | Day | Time | Category |
   |---|---|---|
   | Mon | 12:00 | Weapons |
   | Tue | 17:30 | Tips |
   | Wed | 12:00 | Tardigrade facts |
   | Wed | 18:30 | Videos (every third week) |
   | Thu | 17:30 | Weapons |
   | Fri | 17:30 | Worlds and modes |
   | Sat | 10:00 | Community |
   | Sun | 11:00 | Play |

   Dated posts keep their own times. The account's weekly queue slots
   aren't used (they're Sociamonials' examples), so they don't need changing.
3. The list of what was booked, with Sociamonials' post ids, goes in
   `store/social/queue/batch-<n>-scheduled.csv`.

**To change or stop a post:** open it in Sociamonials' calendar and edit or
delete it, or ask Claude by its id (e.g. `weapon-tun`).

**Networks not connected yet** (TikTok, Threads, Pinterest): posts booked
before a network is connected don't go there. Once you connect one, ask
Claude to add the remaining posts for it.

**By hand instead (fallback):** Sociamonials → Bulk Upload (CSV) with
`store/social/queue/batch-<n>.csv`, after the site has deployed the cards.
Only for a batch Claude hasn't scheduled.

## 4. Making a batch (for whoever edits the posts)

```bash
npx tsx scripts/social-posts.ts 1
```

`1` is the batch number. It checks every post first (lengths for X and
Bluesky, that weapons, hats and pictures exist, no mention of other games),
then draws the cards into `site/public/social/posts/`, copies the Shorts
teaser to `site/public/social/teaser.mp4`, and writes
`store/social/queue/batch-<n>.csv` and `batch-<n>.html`. Add `--check` to
only check. Needs Playwright's Chromium.

The rules for the words are at the top of `scripts/social/posts.ts` and in
[README.md](README.md) (voice, never "Worms", money only buys looks, British
spelling). Never change the `id` of a post that's been imported: its
picture's web address is built from it.

### Batch 3: the Launch Giveaway series

`npx tsx scripts/social-posts.ts 3` makes 22 posts (13 Nov 2026 to 31 Jan 2027,
all dated, 19:30 UK time except the closing day at 10:00) promoting the
TardiGeddon Launch Giveaway, one angle each: kick-off, the three prize tiers,
the Founder pack tie-in, launch day, each Champion and Winner look, how to
enter, bonus entries, friends, who can enter, how winners are picked, the
closing week and the closing day. The facts are only those in
`site/legal/launch-giveaway-rules.md`; `--check` also refuses urgency or
countdown words, "share/tag/like to enter", "lottery/raffle", anything that
hints buying helps, and dates outside the giveaway.

- Category **Giveaway**: each post ends with `🏆 Enter free: tardigeddon.com/giveaway`
  (not the Play link) and carries "13+" and "Rules at the link".
- **Never pinned to Pinterest** (pins outlive the giveaway): `BOARD.Giveaway` is
  empty, so the CSV's PinterestBoard is blank, the TeamNote says "NOT for
  Pinterest" and `--check` fails if a board is ever set. When booking, leave
  Pinterest out of the networks.
- Three posts are **videos** (kick-off, Champion's Arena and Fanfare, closing
  week): 1080×1920, 20 to 30 seconds, captions burned in, game footage and prize
  pictures, silent sound track (add a platform's own sound if you like). They are
  drawn by `scripts/social/giveaway-videos.ts` into
  `site/public/social/giveaway-<id>.mp4` (needs ffmpeg), and also go to YouTube
  Shorts and TikTok.
- The cards use the prize pictures (`site/public/media/giveaway/`) or the looks
  drawn by `src/ui/cosmeticArt.ts`.
- If the prizes or dates in the Official Rules change, change the posts too.

## 5. The monthly top-up (scheduled)

A scheduled Claude task runs on the **20th of each month**. It writes the
next batch (about four weeks: 8 weapon posts, 4 each of the others, and
videos if there are new clips), using what's new in the game and in
`src/news/news.ts`, adds dated posts for the weeks ahead, draws the cards,
and opens a pull request with them. Scheduled tasks can't use the
Sociamonials connector, so the task ends by asking you to open a Claude
session with it and say **"schedule social posts batch <n>"**; Claude then
books them as in §3, after the last post already booked. The calendar stays
several weeks ahead (batch 1 runs to 27 January).

To stop or change it, ask Claude (it's a "scheduled task" on your account),
or see the scheduled tasks list on claude.ai/code.

## 6. Contests (Sociamonials' contest tools)

Contests are the quickest way to grow followers, but they're also where the
rules bite. Set each one up in Sociamonials' contest builder, which makes its
own entry page and posts; the CSV doesn't carry them.

### Three to start with

| Contest | When | How to enter | Prize |
|---|---|---|---|
| **Design a hat** | 1 Dec to 10 Jan | draw a hat for a tardigrade and upload it on the entry page | we make the winning hat and put it in the Shop for everyone, with the winner's name on it, and a looks bundle as a gift code; two runners-up get a bundle |
| **Launch week giveaway** | 1 to 14 Dec | enter on the entry page; Sociamonials' referral links give extra entries for each friend who also enters | 5 winners drawn at random, each gets a looks bundle as a gift code |
| **Shot of the month** | monthly, from January | post a clip or screenshot of your best shot and send the link on the entry page | featured on all our channels, and a bundle as a gift code |

**Prizes as gift codes:** in the game, **Shop → a look or bundle → 🎀 Give as a gift**
buys it with your account's coins and gives you a one-use code
to send the winner. That's the only kind of prize: never money, Slime or
anything that helps win (README: Rules).

### Rules for every contest

- **Free to enter, always.** Never "buy something to enter". A draw you
  have to pay for is an illegal lottery in the UK.
- **Write the terms on the entry page:** who runs it (EVCV Limited),
  who can enter, opening and closing dates and times, how winners are
  picked (judged by us for Design a hat and Shot of the month, random for the
  giveaway), the prize, no cash alternative, how and when winners are told
  (by email, within 14 days), and that we'll post the winners' first names
  or player names.
- **Who can enter:** 13 and over (the age for our accounts and the social
  networks), and anyone under 18 with a parent's or guardian's OK. Start
  with **UK residents only**: some countries (Italy and Brazil, for example)
  have their own rules for prize promotions, and a UK-only contest avoids
  them. Widen it later if you check the rules for each country.
- **Facebook and Instagram:** say "This promotion is in no way sponsored,
  endorsed or administered by, or associated with, Instagram or Facebook".
  Never ask people to share to their own timeline or tag friends to enter
  (Meta forbids it). Sociamonials' referral links are allowed, because they're
  on its own entry page. TikTok and X have similar rules.
- **Privacy:** the entry form collects names and emails, which our Privacy
  Policy doesn't cover yet. **Before the first contest, add a short
  "Contests" section** (what's collected, used only to run the contest and
  contact winners, deleted within 3 months of the end, Sociamonials as our
  processor). Don't tick "add entrants to the newsletter": news emails need
  their own opt-in (`docs/NEWSLETTER.md`).
- **Fair play:** no prizes that help win, ever.

## 7. Decisions for the owner

1. Pinterest and LinkedIn: connect Pinterest (recommended), and keep LinkedIn
   for news by hand?
2. Contests: which of the three, and when? Then I'll write the Privacy Policy
   section and each contest's terms ready to paste.
3. The monthly top-up on the 20th: keep it, or a different day?
