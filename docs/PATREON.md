# Patreon plan

Status: **plan, not started** (4 Nov 2026). Decisions are in §8.

A Patreon is a way for fans to support TardiGeddon every month. The game stays
free, and **patrons get nothing inside the game**: every perk lives on the
website, Discord or in downloads. That keeps us inside Apple's and Google's
rules and our own Terms (5.1.2 and 5.13: the launch Supporter packs are the
only things bought with money directly). Facts about Patreon below are from
memory: check them on patreon.com as you set up.

---

## 1. Rules we keep

- **Nothing in the game for patrons only**: no looks, badges, coins, Slime,
  weapons or codes.
- **Never linked from inside the apps** (iOS or Android): Apple and Google
  forbid pointing players to other ways of paying. Link it from the website,
  Discord, YouTube and socials only. The web game (tardigeddon.com/play) may
  link to the website's Support page.
- **No TestFlight or Play test access as a reward** (Apple forbids TestFlight
  as a paid reward). Previews are private links to the web game instead.
- **Only promise what we'll keep doing.** Every perk should reuse work that
  happens anyway: News posts become dev diaries, art for updates becomes
  wallpapers.

## 2. Tiers

| Tier | £/month | Perks |
|---|---|---|
| **Moss Fan** | £2 | Name on tardigeddon.com/patrons; Patron role and channel in Discord; a thank-you in each update's credits |
| **Water Bear** | £5 | + monthly dev diary (what's being built, sketches, GIFs); votes on what comes next; wallpapers and Discord emoji each season |
| **Tun Club** | £10 | + early web previews of new features (a private link); a monthly voice Q&A or "play with the dev" online session; soundtrack downloads |
| **Legend** | £25, 10 places | + once a year, a hat designed with you (it goes in the shop for everyone, credited to you), or your name on a CPU team |

Start with these four and don't add more until the page has 20 patrons.
Each tier includes everything below it.

## 3. What patrons get, and how often

| Perk | How often | Where it comes from |
|---|---|---|
| Patrons page and credits | always | a list we update (§5) |
| Dev diary | monthly | the month's work, before it goes in News |
| Votes | monthly | Patreon polls: next world, weapon, hat theme |
| Wallpapers and emoji | each season | `scripts/social-images.ts` art, re-cut |
| Web preview | when there's something to show | a preview deploy of the game (Cloudflare Pages preview link) |
| Voice Q&A / play session | monthly | Discord stage or voice channel; an online room |
| Soundtrack | when a new track lands | the game's music recorded once to MP3 |
| Legend hat | yearly | designed with the patron, added to `SHOP_ITEMS` |

## 4. Setting it up (about an hour)

1. **Sign up** at patreon.com as a creator with `developer@tardigeddon.com`,
   page name **TardiGeddon**, URL **patreon.com/tardigeddon**. Turn on
   two-step sign-in.
2. **Who's paid:** set up payouts to **EVCV Limited's** bank account. Patreon
   asks for a US tax form: as a UK company that's the **W-8BEN-E** (the same
   answers as the one you've just done: Corporation, UK, the company UTR,
   treaty Article 12(1) at 0%).
3. **VAT:** check Patreon's help pages for how it handles VAT on UK and EU
   members' payments (I believe Patreon collects it for creators, but
   confirm before launch, and tell your accountant either way).
4. **Membership type:** monthly, charged "up front" when someone joins
   (Patreon's default for new creators).
5. **Page:** the text in §6; banner and avatar from `store/social/` (use
   `youtube-banner.png` and `youtube-avatar.png` until there's a Patreon one).
6. **Tiers:** the four in §2, with the perk text from §6.
7. **Discord:** connect Patreon to the TardiGeddon Discord (Patreon's own
   Discord integration). Patrons then get the **Patron** role automatically;
   create the role and a `#patrons` channel only that role can see.
8. **Age:** Patreon has its own age rules for members; our page needs no
   extra checks because nothing is sold to children inside the game.

## 5. The website side (to build when we start)

- **tardigeddon.com/patrons**: names grouped by tier, from a file
  (`site/src/patrons.ts`) you update by hand each month. Only names patrons
  agree to show: Patreon lets members hide their name, and the page should
  offer "Anonymous" otherwise.
- **"Support us on Patreon"** link in the website footer, on the News page
  and on the Support page. **Not** in the apps.
- **Privacy Policy:** add that we show patrons' chosen names on the Patrons
  page, and that Patreon handles payments as its own controller.

## 6. Page text (ready to paste)

**Headline:** Help keep TardiGeddon free, fair and growing

**About:**
> TardiGeddon is a free turn-based artillery game starring tardigrades: tiny,
> indestructible and armed. Play it in your browser, on Android, iPhone and
> iPad, with no adverts and nothing to buy that wins matches.
>
> It's made by a tiny studio in the UK. Your support pays for the servers and
> the next worlds, weapons and music, and keeps it free for everyone.
>
> Patrons never get an advantage in the game: every perk is outside it.
> You get your name on our Patrons page, a say in what we build next, a look
> behind the scenes, and a seat at our monthly play sessions.

**Tier blurbs:**
- **Moss Fan (£2):** Your name on our Patrons page and in the credits of every
  update, and the Patron role in our Discord.
- **Water Bear (£5):** Everything above, plus a monthly dev diary, votes on
  what we build next, and wallpapers and Discord emoji each season.
- **Tun Club (£10):** Everything above, plus early previews of new features in
  your browser, and our monthly voice chat and play-with-the-dev session.
- **Legend (£25, 10 places):** Everything above, plus once a year we design a
  hat with you: it goes in the shop for every player, with your name on it.

## 7. When

Not before the launch (1 December): launch week needs all the time there is.
A good moment is **January**, with the first dev diary written in advance and
the Patrons page ready. Announce it in a News post, on Discord and on socials.

## 8. Decisions for the owner

1. Tiers and prices (§2), and whether to have the Legend tier at all.
2. Start date (January suggested).
3. Whether the "name on a CPU team" perk is in (a grey area with Apple; the
   hat-for-everyone perk is safer).
