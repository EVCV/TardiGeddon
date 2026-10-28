# Kickstarter campaign plan

A plan for crowdfunding TardiGeddon. The game is free and stays free: backers
pay to keep the servers running and fund the next year of updates, and get
**thank-you rewards that are cosmetic only** (the same rule as the shop:
nothing that wins matches, never Slime or weapons, see CLAUDE.md).

Status: **plan, not started.** Decisions still open are listed in §9.

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

The game launches on 31 Oct 2026, and the in-game early bird pack runs to the
end of the year. Don't run the Kickstarter at the same time as the free early
bird giveaway or over Christmas. **Recommended: a 30-day campaign from
early February 2027** (for example Tuesday 2 Feb to Thursday 4 Mar), when there
are three months of players and an audience to ask.

| When          | What                                                                 |
| ------------- | -------------------------------------------------------------------- |
| November      | Decide goal and rewards (§9). Build backer codes and the Hall of Backers (§5) |
| December      | Kickstarter pre-launch page live ("Notify me on launch"). Link it from the website, Discord and socials |
| January       | Trailer (60–90 s of real play), GIFs, press kit, creator outreach. Weekly Shorts/TikToks |
| Launch week   | Launch on a Tuesday, about 2pm UK (morning in the US). Email the list and Discord, and post everywhere on day one |
| During        | An update every 3–4 days. Reveal stretch goals as they're reached. A big push in the last 48 hours |
| After         | Backer survey, then codes out within 2 weeks, then the Hall of Backers goes live, then an update |

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
2. **Launch month:** February 2027 recommended (§2).
3. **Tiers and prices:** as in §4, or changed.
4. **iOS:** hide backer items in the iOS app, or show them and accept the
   App Review risk (§6).
5. **VAT:** accountant's advice (§7).
6. **Physical rewards:** none this time (recommended), or a sticker sheet.

Sources: Kickstarter's rules on rewards ([help
centre](https://help.kickstarter.com/hc/en-us/articles/115005134333-Can-Kickstarter-be-used-to-fund-anything)),
Kickstarter's fees ([fee
guide](https://updates.kickstarter.com/kickstarter-fees-a-comprehensive-guide-for-creators/)),
Kickstarter and VAT ([help
centre](https://help.kickstarter.com/hc/en-us/articles/115005139493-Are-creators-based-in-the-EU-and-UK-responsible-for-VAT)),
and Apple's [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
(2.2, 3.1.1, 3.1.3(b)).
