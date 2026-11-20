# Kickstarter campaign plan

A plan for crowdfunding TardiGeddon. The game is free and stays free: backers
pay to keep the servers running and fund the next year of updates, and get
**thank-you rewards that are cosmetic only** (the same rule as the shop:
nothing that wins matches, never Slime or weapons, see CLAUDE.md).

Status: **shelved** (4 Nov 2026). We're not running a Kickstarter. This page
stays as a record, in case it's useful later; nothing here is planned or
scheduled. (Written for the 1 Dec 2026 launch, with a campaign from 19 Jan to
18 Feb 2027.)

---

## 1. The pitch

> TardiGeddon is a free turn-based artillery game starring tardigrades:
> tiny, indestructible and armed. It's out now on the web, Android and
> iPhone. No ads, nothing to buy that wins matches. Help us keep it that
> way: back the next year of servers and updates, and get exclusive looks
> for your team as a thank-you.

What sells a campaign for a free game is that **people can play it right
now**. Every page, post and video should link to the game (on the website,
not in the apps: §6).

What the money pays for (show this as a simple chart on the page):

| Spend                         | Notes                                             |
| ----------------------------- | ------------------------------------------------- |
| Running costs, 12 months      | Fly.io server, Neon database, Apple developer fee, domain, CI build minutes. Fill in the real figures |
| New content                   | New realms, weapons, music, voices (art and music commissions) |
| Kickstarter and card fees     | About 8–10% of what's raised (5% Kickstarter + about 3–5% card processing) |
| Tax                           | VAT on rewards, see §7                            |

---

## 2. When

The game's launch moved to **Tuesday 1 December 2026** (after Black Friday and
Cyber Monday, so launch news isn't buried under sales; three weeks to fix
anything before Apple's and Google's slow Christmas weeks; and on the stores
for the Christmas Day rush of new phones). Founders: accounts made by the end
of 30 November. Early bird: the first 1,000 accounts by the end of 31 December.

**The campaign: Tuesday 19 January to Thursday 18 February 2027 (30 days).**
Not in December: launch week needs all hands, the Christmas weeks are the
worst time to ask for money, and Kickstarter's review slows down over the
holidays. Mid-January to mid-February gives:

- six weeks of real players (and the Christmas new-phone wave) to ask;
- January's payday (around the 25th) inside the campaign, and pledges are
  only charged when it ends;
- time to build backer codes and make a trailer from real launch footage.

| When                 | What                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| **Now (Nov 3–13)**   | Kickstarter account, company and bank details, identity check (§10). Draft the project. Publish the **pre-launch page** ("Notify me on launch") as soon as Kickstarter allows |
| Nov 14–30            | Pre-launch link on the website, Discord and socials. Short videos weekly. Decide goal and tiers (§9) |
| **Tue 1 Dec**        | Game launch. Website banner: "Follow our Kickstarter". (Never in the apps: §6) |
| Dec 2–16             | Build backer codes, backer items and the Hall of Backers (§5). Record launch footage for the trailer |
| **By Thu 17 Dec**    | Project finished and **submitted for review** (before the holidays) |
| Jan 4–18             | Trailer, press kit, creators lined up (creator codes: §8). Countdown posts |
| **Tue 19 Jan, 2pm UK** | Launch. Email, Discord, socials, creators, website banner on day one |
| During               | An update every 3–4 days; stretch goals as they're reached; a big push in the last 48 hours |
| **Thu 18 Feb**       | Ends. Funds arrive about 2 weeks later (early March) |
| By early March       | Backer survey, then codes out, then the Hall of Backers goes live |

**If you'd rather go sooner:** run it alongside the launch, Tue 1 Dec to Tue
22 Dec (21 days, ends before Christmas). It catches launch buzz, but splits
attention in the busiest week, leaves no time to build backer codes first, and
asks for money in the dearest month of the year. Only if the pre-launch page
has lots of followers by the end of November.

The first 48 hours decide most campaigns: aim to have about a third of the
goal pledged by then. That only happens with followers lined up beforehand,
so the pre-launch page matters more than anything on the campaign page itself.

---

## 3. Goal

Set the goal to **what the next 12 months actually cost to run**, plus fees.
That makes it reachable, and a funded campaign attracts more backers than one
stuck at 40%. Everything above the goal goes to stretch goals.

As a starting point (replace with real figures): if running costs are about
£150 a month, that's £1,800 a year, plus 10% fees, so **a goal of about
£2,000–£3,000**.

---

## 4. Rewards

All digital, all cosmetic, delivered in the game. Exclusive to backers (they
never go on sale in the shop). Each tier includes everything below it.

**Every backer is an early bird:** each backer code also gives the Early
bird pack (`grantEarlyBird`), even after the first 1,000 or 31 December. It
costs nothing, makes the cheapest tier feel worth it, and fits "the people
who were here first".

| Tier                 | Pledge | Limit | Reward                                                         |
| -------------------- | ------ | ----- | -------------------------------------------------------------- |
| Thank you            | £3     | –     | Your name in the Hall of Backers (website and in-game credits) |
| Backer               | £6     | –     | + a **Backer badge** next to your name in online lobbies       |
| Water Bear Pack      | £12    | –     | + Backer hat, gravestone and team emblem                       |
| (Early: first 48 h)  | £10    | 300   | The Water Bear Pack at a lower price                           |
| Moss Patron          | £25    | –     | + an exclusive world (arena), a music track and a victory dance |
| Realm Shaper         | £60    | –     | + a vote on which stretch goal comes first, and a credit in the patch notes |
| Hat Designer         | £150   | 25    | + design a hat with us: it goes in the shop with your name on it, and you get it free |
| Legend               | £400   | 5     | + your tardigrade (name and look) joins the game as a CPU team's captain, and a gravestone designed with you |

**Don't offer:**
- **Coins.** Kickstarter bans money-like rewards, and coins bought with real
  money are a prepaid instrument in Japan (the `coin_lot` rules, Terms 5.5.4).
  Give the items themselves instead.
- **Slime, weapons or anything that affects play.** That's the core promise of
  the game.
- **Beta or TestFlight access.** Apple forbids TestFlight as a crowdfunding
  reward (App Review Guideline 2.2).
- **Physical rewards** for this first campaign, such as stickers or a plush
  tardigrade. They bring shipping, customs, VAT on goods and manufacturing
  risk. A plush is a good idea for a second campaign once there's a bigger
  audience.

**Stretch goals** are free for everyone, never locked to backers. Funding
the game for all players is the message. Candidates (from GAME_PLAN §9,
Post-v1):

1. A new realm (map style) and its music.
2. More languages.
3. Gamepad support.
4. Character voices (voice packs, see GAME_PLAN §6.3).
5. Ranked ladder and seasons.
6. Desktop (Steam) build.
7. Clans.

---

## 5. What to build before launch

1. **Backer codes.** A `backer_code` table: code, tier, redeemed by and when.
   An admin page (next to Creators on the Sales page) imports the Kickstarter
   backer-survey export and makes one code per backer. Codes are entered on
   the **website** Account page only (§6), and the items are granted
   server-side like the founder pack (`grantPack`). Rate-limit like
   `/api/invite`.
2. **The backer items** in `shop/catalog.ts` as promo items, hidden until
   owned (like the early bird and founder items), plus the Backer badge (like
   the founder badge).
3. **A Hall of Backers** page on the website (prerendered, names only, opt-in
   in the survey), and the same list in the game's credits.
4. **A Kickstarter banner on the website and the web game only.** The apps
   never link to it (§6). `src/native.ts` already knows which platform we're
   on.
5. **Terms and Privacy updates.** Terms: what backers get, when and how
   codes work, that rewards are cosmetic and tied to an account, and that
   Kickstarter's terms cover pledges and refunds. Privacy: what the backer
   survey shares with us (name, email) and what we keep. Keep the Google Play
   Data safety answers in step.

---

## 6. App store rules (important)

- **Apple:** apps "may not use their own mechanisms to unlock content … such
  as license keys" (Guideline 3.1.1), so **no code entry in the iOS app.**
  Items bought elsewhere can show in the app only if "those items are also
  available as in-app purchases" (3.1.3(b)). Backer-exclusive items never are,
  so showing them in the iOS app is a review risk. Decide (§9): hide backer
  items in the iOS app (they show on the web and Android), or accept the
  risk.
- **Google Play:** the apps mustn't steer players to pay outside Google Play
  for digital items, so no Kickstarter banner or link in the Android app.
  Showing items redeemed on the website is fine (coins already work this way).
- **Both:** the campaign is promoted only on the website, socials, Discord and
  by creators, never inside the apps.

---

## 7. Money, tax and the company

- **Fees:** 5% to Kickstarter, plus about 3–5% card processing, taken only if
  the goal is reached. Funds arrive about 2 weeks after the campaign ends.
- **VAT: talk to the accountant before launch.** Unlike the Stripe shop
  (Managed Payments: Stripe is the seller and handles VAT), on Kickstarter
  **EVCV Limited is the seller**. A pledge that gets a reward is generally
  treated as a sale. For backers in the EU, digital rewards from a non-EU
  business are taxed from the first euro (the EU's non-Union OSS scheme). UK
  VAT depends on whether EVCV is VAT-registered. Ask whether Kickstarter's
  pledge manager can collect it, and whether low tiers count as donations.
- **Company:** the campaign runs as EVCV Limited (England and Wales,
  13570383). Kickstarter needs a UK bank account and ID for a director.
- **Delivery risk:** everything is digital and built by us, so rewards can be
  ready before the campaign ends. Say so on the page; it's a strong selling
  point.

---

## 8. Getting the word out

- **Pre-launch followers** are the number to watch. Put the "Notify me" link
  on the website hub, in Discord and in every post from December.
- **Creators:** the creator-code programme (docs/ACCOUNTS.md) is a ready-made
  way in. Approved creators already earn from their players' spend, so ask
  them to cover the launch.
- **Short videos:** a weekly Short or TikTok of a funny moment (tornado
  throws, rope races, own goals). The teaser comes from
  `scripts/social-images.ts`.
- **Players:** a website banner in the last week ("48 hours left") and a
  Discord post. Never in the apps (§6).
- **Press:** a small press kit (logo, screenshots, GIFs, a short fact sheet)
  for indie game sites and YouTubers who cover Worms-likes.

---

## 9. Decisions for the owner

1. **Goal:** the real 12-month running costs (§3).
2. **Dates:** game on Tue 1 Dec 2026, campaign Tue 19 Jan to Thu 18 Feb 2027 (§2), or the faster December option.
3. **Tiers and prices:** as in §4, or changed.
4. **iOS:** hide backer items in the iOS app, or show them and accept the
   App Review risk (§6).
5. **VAT:** accountant's advice (§7).
6. **Physical rewards:** none this time (recommended), or a sticker sheet.
7. **Creator payments:** the monthly payout file now, Stripe Connect later (§12).

Sources: Kickstarter's rules on rewards ([help
centre](https://help.kickstarter.com/hc/en-us/articles/115005134333-Can-Kickstarter-be-used-to-fund-anything)),
Kickstarter's fees ([fee
guide](https://updates.kickstarter.com/kickstarter-fees-a-comprehensive-guide-for-creators/)),
Kickstarter and VAT ([help
centre](https://help.kickstarter.com/hc/en-us/articles/115005139493-Are-creators-based-in-the-EU-and-UK-responsible-for-VAT)),
and Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
(2.2, 3.1.1, 3.1.3(b)).

---

## 10. Setting up Kickstarter (start today)

Check each step against Kickstarter's own help pages as you go: their rules
and screens change, and this list is from general knowledge, not checked
against their site today.

1. **Account:** kickstarter.com → Sign up, with the business email
   (support@tardigeddon.com forwards to you). Turn on two-step sign-in.
2. **Start a project:** category **Games → Video Games**, country **United
   Kingdom**, currency **GBP**. Name it "TardiGeddon".
3. **Who's running it:** choose a business, **EVCV Limited** (company number
   13570383, 28 Oak Tree Lane, Cookhill, Alcester, B49 5LH). Kickstarter asks
   for a director's ID and date of birth, the company's details, and a **UK
   business bank account** in the company's name (pledges are paid there).
   The identity check can take a day or two.
4. **Pre-launch page:** fill in the title, subtitle, image and category (§11),
   then publish the pre-launch page. It gets its own link with a **Notify me
   on launch** button. Put that link on the website, Discord and socials.
5. **Draft the rest** (story, rewards, FAQ, risks: §11) over November and
   December; preview links can be shared with friends for feedback.
6. **Submit for review by Thu 17 Dec.** Review usually takes a few days, but
   can take longer, especially near the holidays. Once approved, you choose
   the moment to launch.
7. **Launch on Tue 19 Jan at about 2pm UK**, length 30 days.
8. **Before launch:** the accountant's VAT answer (§7), the Terms and Privacy
   updates (§5.5), and backer codes working end to end (§5).

---

## 11. Page text (ready to paste, edit freely)

**Title:** TardiGeddon

**Subtitle** (135 characters at most):
> A free turn-based artillery game starring tardigrades. Help keep it free and growing, and get exclusive looks for your team.

**Pre-launch page blurb:**
> TardiGeddon is a turn-based artillery game where tiny, indestructible
> tardigrades fight it out with bazookas, grenades, superweapons and a silk
> rope. It's free on the web, Android, iPhone and iPad, with no ads and
> nothing to buy that wins matches. We're coming to Kickstarter to fund the
> next year of servers and updates. Tap "Notify me on launch" to hear the
> moment we go live, and grab an early-backer price in the first 48 hours.

**Story (campaign page), in this order:**

1. **The hook** (with the trailer): "Tiny. Indestructible. Armed." One
   sentence on what it is, then "and you can play it right now, free" with
   the link to tardigeddon.com/play (the website, never the app stores: §6).
2. **What it is:** turn-based artillery like the classics; tardigrades;
   weapons (a GIF each of three favourites); online play, CPU opponents,
   Rope Race, daily challenges; six languages.
3. **Why Kickstarter:** "TardiGeddon is free and will stay free. There are no
   ads and you can't buy power: the shop only sells looks. Your backing pays
   for the servers and the next year of new realms, weapons and music, so it
   can stay that way."
4. **Where the money goes:** the chart from §1.
5. **Rewards:** the tier table (§4) as a picture, with each item shown on a
   tardigrade. "Every backer also gets the Early bird pack."
6. **Stretch goals** (free for everyone): §4's list, as picture cards.
7. **Who we are:** EVCV Limited, a small UK studio; a photo; why tardigrades.
8. **Risks and challenges** (Kickstarter asks for this): "The game is already
   out and the rewards are digital and built by us, so they can be delivered
   within two weeks of the campaign ending. Stretch goals depend on the money
   raised; we'll show progress in updates."

**FAQ:**
- *Is the game free?* Yes, and it stays free. Backing is a thank-you, not a
  ticket.
- *Do rewards give an advantage?* No. Every reward is cosmetic.
- *How do I get my rewards?* After the campaign you'll get a code by email.
  Enter it on the Account page at tardigeddon.com (signed in), and the items
  appear on every device you play on.
- *Can I get coins or Slime?* No: rewards are looks only.
- *Which platforms?* Web, Android, iPhone and iPad.

**Launch-day post** (Discord, socials):
> We're live on Kickstarter! 🐻💥 TardiGeddon is free and stays free:
> back it to keep the servers running and the updates coming, and get
> backer-only looks for your team. The first 48 hours have an early-backer
> price. [link]

---

## 12. Paying creators their share

What creators earn is already worked out on the Sales page (`server/creators.ts`).
Today the owner pays it by hand. Ways to make that quicker, cheapest first:

1. **Monthly payout file (recommended to start).** A button on the Sales
   page downloads what each creator is owed as a file for **Wise Business**
   batch payments (or PayPal Payouts): upload it, approve once, and everyone
   is paid; then "Mark all paid" records it. Five minutes a month, works for
   creators in any country, and nothing new holds your money.
2. **Stripe Connect** (once there are 20 or more paid creators). Each creator
   signs up once through a Stripe link (Stripe checks their identity, bank
   and tax details), and the server pays them every month automatically.
   Costs: Stripe charges per active creator account per month and per payout.
   Two things to settle with Stripe first: whether Connect works alongside
   Managed Payments (Stripe is the seller there), and that the creators'
   share of App Store and Google Play money has to be topped up into the
   Stripe balance, because that money arrives in the bank, not at Stripe.
3. Whichever you pick: keep each creator's agreement (Terms 5.12.3), and ask
   the accountant how to record the payments (they're the creator's income;
   US creators may need a tax form).

