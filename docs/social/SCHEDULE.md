# Scheduled posts: weeks of content in Sociamonials

Status: **batch 1 ready** (4 Nov 2026): 12 weeks of posts, plus dated ones
for the Founder pack, launch day, Christmas, New Year and the Supporter packs.

**The idea:** the posts are made here, not typed by hand. Each post's words
live in `scripts/social/posts.ts`, and one command draws a picture card for
each in the game's style and writes a CSV in Sociamonials' bulk-upload format.
Sociamonials then puts them in its **queue**: each category has weekly time
slots, and the queue fills each slot with the next post of that category. A
scheduled Claude task adds a new month of posts on the 20th of each month
(§5), so the queue never runs dry.

Your part: set up the queue once (§2), import each batch (§3), and spend a
few minutes a day replying to comments.

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
Pinterest likes, and pins keep bringing visitors for months). Make a board
called **TardiGeddon** on Pinterest first.

- **LinkedIn:** leave it out of the queue. It's for company news (the launch,
  a milestone), which you can post by hand.
- **Facebook groups:** Facebook no longer lets any tool post into groups, so
  share to groups by hand (and only where the group's rules allow it).

### Categories

In the queue schedule's **Category** list, delete the examples you don't
need and **create these seven, spelt exactly like this** (the CSV uses the
names):

`Weapons` · `Tips` · `Tardigrade facts` · `Worlds and modes` · `Community` · `Play` · `Videos`

### Weekly queue slots (UK time)

One slot a day, plus the video slot. Times are a good start for a UK and
European audience; Sociamonials' "Best times for clicks" can tune them later.

| Day | Time | Category | Networks |
|---|---|---|---|
| Mon | 12:00 | Weapons | all except YouTube |
| Tue | 17:30 | Tips | all except YouTube |
| Wed | 12:00 | Tardigrade facts | all except YouTube |
| Wed | 18:30 | Videos | all, **with** YouTube |
| Thu | 17:30 | Weapons | all except YouTube |
| Fri | 17:30 | Worlds and modes | all except YouTube |
| Sat | 10:00 | Community | all except YouTube and Pinterest (questions don't work as pins) |
| Sun | 11:00 | Play | all except YouTube |

YouTube only takes videos, so it's only in the Videos slot.

## 3. Import a batch

1. **Merge the pull request first and wait for the website to deploy.**
   The CSV points at pictures on `tardigeddon.com/social/posts/`, and
   Sociamonials fetches them from there when you import. Check one opens,
   e.g. tardigeddon.com/social/posts/weapon-bazooka.jpg.
2. **Sociamonials → Bulk Upload (CSV)** → choose `store/social/queue/batch-1.csv`
   (download it from GitHub: open the file, then the download button).
3. Posts with no date go into the queue under their category, in order;
   the 7 dated ones are scheduled at their own times.
4. **Check a few in the calendar,** especially one of each kind (picture,
   video, dated) on each network, before leaving it to run.

If the import ever complains about line breaks inside posts, run the command
in §4 with `--one-line` and import that file instead.

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

## 5. The monthly top-up (scheduled)

A scheduled Claude task runs on the **20th of each month**. It writes the
next batch (about four weeks: 8 weapon posts, 4 each of the others, and 2 to
4 videos if there are new clips), using what's new in the game and in
`src/news/news.ts`, adds dated posts for the month ahead (events, updates),
draws it, and opens a pull request. You then read `batch-<n>.html`, merge,
and import the CSV (§3). The queue stays about 12 weeks ahead.

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
