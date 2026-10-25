# Discord

The plan for TardiGeddon's Discord: the account, the server, and every piece
of text to paste in. Shared names, bios and rules are in [README.md](README.md).

Work through it top to bottom. Each step says where the setting is in
Discord, because Discord moves things around; if a menu has changed, search
the setting's name in Discord's help centre.

## 1. The account (developer@tardigeddon.com)

This account will **own** the server, so look after it like a bank login.

1. **Verify the email** (Discord sends a link).
2. **Two-step sign-in:** User Settings → My Account → Enable Authenticator
   App. Use an authenticator app (Google Authenticator, 1Password, Authy), not
   SMS alone. Download the **backup codes** and keep them offline.
3. **Profile** (User Settings → Profiles):
   - Username: `tardigeddon` (Discord usernames are lower case; if taken,
     `tardigeddon.dev`).
   - Display name: `TardiGeddon Dev`
   - Avatar: `store/social/youtube-avatar.png`
   - Banner: `store/social/discord-profile-banner.png` (needs Nitro; without
     it, pick banner colour `#7fd3f7`).
   - Bio (Discord used to call it "About Me"; 190 characters at most):
     > Official TardiGeddon dev team 🐻 Free tardigrade artillery game.
     > ▶ tardigeddon.com/play
     > ✉ support@tardigeddon.com
     > We never DM first asking for passwords, codes or payments.
   - Status bubble: `Playing TardiGeddon 💥`
   - Connections → Add Connection → YouTube (the @TardiGeddon channel), so
     the profile shows it.
4. **Privacy** (User Settings → Content & Social, and Data & Privacy):
   - Sensitive content filters → Mature Sexual Media *and* Graphic Media:
     DMs from friends **Blur**, DMs from others **Block**.
   - Spam filters: **Filter all spam**.
   - DM permissions (All servers): **Direct Messages off**. Players reach
     us in `#help` or at support@tardigeddon.com, never by DM; scammers DM
     server owners constantly.
   - Friend requests: **Everyone, Friend of friends and Server members all
     off**. Send requests *from* this account when needed (to your personal
     account, a moderator). Personalised messages: off.
   - Age group ("Confirm Age"): not needed. Discord treats unconfirmed
     accounts as teens, which only means stricter filters, and those are
     what we want here. Confirm it only if a setting you need is locked
     (it asks for a face scan or ID through Discord's age-check partner).
5. **A second admin.** If this account is ever lost, nobody can manage the
   server. Make your personal Discord account an Admin (step 5), with two-step
   sign-in on that too. Never transfer ownership to anyone else.

## 2. Create the server

1. In the left bar, **+** → Create My Own → For a club or community.
2. Name: `TardiGeddon`. Icon: `store/social/discord-server-icon.png`.
3. Delete the default channels; you'll make your own below.

## 3. Safety settings (before anyone joins)

Server Settings → **Safety Setup**:

- **Verification level: Medium** (account older than 5 minutes and a verified
  email). Raise to High (in the server 10 minutes) if raids happen.
- **Require 2FA for moderator actions:** on.
- **Restrict member prune to admins:** on.
- **Sensitive content filters:** filter messages from **all members**.
- **Activity Alerts:** on, Safety Notifications Channel **`#mod-log`**
  (make the channels in step 6 first, then come back). This is Discord's raid
  and DM-spam alarm: it tells you when joins or DMs jump.
- **Show Members In Channel List:** switches itself on with Community (step 4).

Discord has moved its separate "DM spam" and "raid / CAPTCHA" switches: the
alarms are Activity Alerts above, the blocking is AutoMod below, and the
DM side is covered by members' own spam filters. If your Safety Setup or
AutoMod page shows extra raid, CAPTCHA or DM-spam options, turn them on.

Server Settings → **AutoMod**:

| Rule | Setting |
|---|---|
| Block mention spam | On, 5 mentions, block + timeout 10 minutes |
| Block suspected spam content | On |
| Block commonly flagged words | All three lists on (profanity, insults and slurs, sexual content) |
| Custom: scams | Block these words, alert in `#mod-log`: `free nitro`, `nitro gift`, `steam gift`, `steamcommunity.gift`, `discord.gift`, `@everyone free`, `airdrop`, `onlyfans` (not `crypto`: it would block *cryptobiosis*, a real tardigrade word) |
| Custom: invites | Block `discord.gg/*` and `discord.com/invite/*` (add staff to the exempt roles) |
| Block words in member profiles | On, with the flagged-word lists |

## 4. Community features

Server Settings → **Enable Community**. It unlocks the rules screen,
announcement channels, forums, onboarding and Insights. When it asks:

- Rules channel: `#rules`. Updates channel (where Discord posts notices for
  admins): `#mod-log`.
- Default notifications: **only @mentions** (otherwise every message pings
  every member and they leave).
- Remove moderation permissions from @everyone: yes.

Then:

- **Server Settings → Overview:** banner `store/social/discord-server-banner.png`
  (Boost level 2) and invite background `store/social/discord-invite-splash.png`
  (Boost level 1). Without boosts, skip these.
- **Server Settings → Rules Screening** (sometimes under Onboarding → Safety
  Check): new members must accept the rules in step 7 before they can talk.
- **Server Settings → Emoji:** upload `store/social/emoji/*.png` with these
  names: `tardi`, `tardi_blue`, `tardi_green`, `tardi_gold`, `tardi_king`,
  `tardi_party`, `tardi_wizard`, `tardi_pirate`, `tardi_dev`, `tardi_ninja`.
  (Free servers get 50 emoji.)
- **Server Settings → Server Tag / Discovery:** Discovery needs the server to
  be a few weeks old with enough members; Discord will show the checklist
  once it's close. Description for it is in step 9.

## 5. Roles

Server Settings → Roles. Order matters: higher roles override lower ones.
Colours are the game's team colours.

| Role | Colour | Who | Permissions |
|---|---|---|---|
| **Dev Team** | `#ffd84a` | You (and the second admin account) | Administrator. Display separately |
| **Moderator** | `#e04848` | Trusted volunteers, later | Manage Messages, Timeout Members, Kick, Ban, View Audit Log, Manage Threads. Display separately |
| **Tester** | `#3cb34a` | People testing new builds | Sees `#testing` |
| **Content Creator** | `#a46be0` | YouTubers and streamers who make TardiGeddon videos | Can post in `#creator-videos`. Display separately |
| **Red Team** / **Blue Team** / **Green Team** / **Gold Team** | `#e04848` / `#3a7be0` / `#3cb34a` / `#e0a020` | Picked by members in onboarding, just for fun | None (colour only) |
| **Ping: News**, **Ping: Daily challenge**, **Ping: Looking for game** | none | Picked in onboarding | None; these are what announcements @mention |
| **Español**, **Português**, **Deutsch**, **Français**, **日本語** | none | Picked in onboarding | See their language channel |

Give `@everyone` only: View Channels, Send Messages, Send Messages in
Threads, Embed Links, Attach Files, Add Reactions, Use External Emoji,
Connect, Speak, Use Voice Activity, Read Message History. Turn **off**
"Mention @everyone, @here and all roles" and "Create Invite" for
@everyone (staff make invites).

## 6. Channels

Create these categories and channels (Create Channel → choose the type).
Set each channel's **topic** to the text after the dash.

**👋 START HERE**
- `#welcome` (text, read-only) — Welcome to the official TardiGeddon server! Start here.
- `#rules` (text, read-only) — The rules. Breaking them gets a timeout or a ban.
- `#announcements` (announcement, read-only) — News, updates and new promo codes from the dev team.
- `#faq` (text, read-only) — Answers to the questions everyone asks.

**🎮 COMMUNITY**
- `#general` — Chat about TardiGeddon and anything else (keep it friendly).
- `#looking-for-game` — Post your room code to find people for an online match. Slowmode 30 s.
- `#screenshots-and-clips` — Your best shots, worst misses and luckiest wins. Slowmode 10 s.
- `#fan-art` — Draw a tardi! Original art only; say if it's AI-made.
- `#daily-challenge` — Share your daily challenge scores and how you did it.
- `#tardigrade-facts` — Real water bears are amazing. Share facts (with a source).
- `#creator-videos` (Content Creator role can post, everyone can read) — Videos and streams of TardiGeddon by the community.

**🛠 FEEDBACK** (all three are **Forum** channels; set "Require tags")
- `#bug-reports` — One post per bug. Use the template in the guidelines. Tags: `Desktop`, `Phone`, `Online`, `Offline`, `Fixed`, `Can't reproduce`.
- `#suggestions` — One post per idea. Tags: `Weapon`, `Map`, `Mode`, `Cosmetic`, `UI`, `Planned`, `Done`.
- `#help` — Stuck? Ask here. Tags: `Controls`, `Account`, `Shop`, `Online`, `Solved`.

**🔊 VOICE**
- `🔊 Lobby` (voice)
- `🔊 Match 1`, `🔊 Match 2` (voice, user limit 10: the most teams in a match)

**🌍 INTERNATIONAL** (each visible only to its language role)
- `#español`, `#português`, `#deutsch`, `#français`, `#日本語`

**🔒 STAFF** (Dev Team and Moderator only)
- `#mod-chat`, `#mod-log`, `#testing` (+ Tester role)

Make `#welcome`, `#rules`, `#announcements` and `#faq` read-only:
channel → Edit → Permissions → @everyone → Send Messages ✗, Create
Threads ✗, Add Reactions ✓.

## 7. Text to paste

### `#rules` (also paste the numbered rules into Rules Screening)

> # 📜 Rules
>
> 1. **Be kind.** No harassment, hate, bullying, threats or personal attacks. Trash-talk the tardis, not the people.
> 2. **Keep it clean.** No sexual, violent, gory or shocking content, and nothing illegal. Keep names, avatars and statuses friendly too.
> 3. **No spam or ads.** No self-promotion, server invites or DM advertising. TardiGeddon videos go in #creator-videos.
> 4. **Stay safe.** Never share your real name, address, school, phone number, passwords or account codes, and never ask anyone else for theirs.
> 5. **No cheating talk.** No modified clients, exploits or tools that play for you. Found a bug that gives an unfair advantage? Email support@tardigeddon.com instead of posting it.
> 6. **The dev team will never DM you first** asking for passwords, codes or payments. Anyone who does is a scammer: report them.
> 7. **English in the main channels,** other languages in 🌍 International.
> 8. **Follow the mods** and Discord's Terms of Service and Community Guidelines. **You must be 13 or older** to use Discord.
>
> The game's own rules are in the Community Guidelines: https://tardigeddon.com/legal/community-guidelines
>
> Problem with someone? Right-click their message → Apps → Report, or message a @Moderator. Worried about your safety or someone else's? Tell a trusted adult.

### `#welcome`

> # Welcome to TardiGeddon! <:tardi:>
>
> **TardiGeddon** is a free turn-based artillery game starring tardigrades, the toughest animals on Earth. Blast the map, mind the wind, last tardi standing wins.
>
> ▶ **Play free, no download:** https://tardigeddon.com/play
> 🌐 Website: https://tardigeddon.com
> 📺 YouTube: https://www.youtube.com/@TardiGeddon
>
> **Get started**
> 📜 Read #rules
> 🎨 Pick your team colour and pings in **Channels & Roles** (top of the channel list)
> 🎮 Find a match in #looking-for-game
> 🐛 Found a bug? #bug-reports. Got an idea? #suggestions
>
> This server is for people aged 13+. The game itself has no chat and is fine for all ages.

(After uploading emoji, type `\:tardi:` in any channel to get the real code
for `<:tardi:>` and paste that in.)

### `#faq`

> # ❓ FAQ
>
> **Is it free?** Yes. The whole game is free, with no ads. Coins only buy looks (hats, skins, emblems); nothing you can buy helps you win.
>
> **How do I unlock weapons?** With Slime, which you earn by playing (sign in with a free account, 13+, to keep it). Slime can't be bought.
>
> **Do I need to download anything?** No. It plays in your browser on computers, phones and tablets: https://tardigeddon.com/play. An Android app is coming.
>
> **How do I play with friends online?** Online → create a room and share the room code (post it in #looking-for-game to find people), or use Quick play. No account needed.
>
> **Can I play on one device with friends?** Yes, up to 10 teams taking turns on one screen, or against the computer (Easy, Normal, Hard, Expert).
>
> **Why can't I chat in the game?** On purpose: the game is safe for players of every age. Chat here instead (13+).
>
> **I found a bug.** Post it in #bug-reports with the template, or email support@tardigeddon.com.
>
> **I bought coins and something went wrong.** Email support@tardigeddon.com, not Discord: never post order numbers or account details here.
>
> **Promo codes?** The current one is always at https://tardigeddon.com/promo-codes, and new ones are posted in #announcements.
>
> **Can I make videos of the game?** Please do! Our Terms let you share screenshots, videos and streams of your play. Ask a @Dev Team member for the Content Creator role and share them in #creator-videos. Press kit: https://tardigeddon.com/press

### `#bug-reports` post guidelines (forum channel → Edit → Post Guidelines)

> One bug per post. Search first; if it's already there, add a 👍 and any extra details.
>
> **Title:** what goes wrong, in a few words
> **Device and browser:** e.g. Pixel 7, Chrome / Windows 11, Firefox / Android app
> **Mode:** vs computer, one device, online, daily challenge, tutorial
> **What happened:**
> **What you expected:**
> **Steps to make it happen again:**
> **Screenshot or clip:** really helps
>
> Never post your email, password or order details here.

### `#suggestions` post guidelines

> One idea per post, and check it isn't already here (👍 it if it is).
> Tell us what you'd like and why it would make the game more fun.
> Note: we never sell anything that helps you win, so ideas for paid power-ups won't happen. Cosmetic ideas are very welcome!

### First `#announcements` post

> @everyone 🎉 **The TardiGeddon Discord is open!**
>
> This is the place to find people to play with, show off your best shots, report bugs and tell us what to make next. The dev team reads everything.
>
> ▶ Play free: https://tardigeddon.com/play
> 🎁 Free hat with the current promo code: https://tardigeddon.com/promo-codes
>
> Tell your friends: https://tardigeddon.com/discord

(This is the only time to use @everyone; afterwards mention `@Ping: News`.)

## 8. Onboarding

Server Settings → **Onboarding** (needs Community on):

- **Default channels:** `#welcome`, `#rules`, `#announcements`, `#general`,
  `#looking-for-game`, `#screenshots-and-clips`, `#help`.
- **Questions:**
  1. *Pick your team!* (single choice, required) → 🔴 Red Team, 🔵 Blue
     Team, 🟢 Green Team, 🟡 Gold Team.
  2. *What do you want to hear about?* (multiple choice) → 📰 News and
     updates (Ping: News), 📅 Daily challenge reminders (Ping: Daily
     challenge), 🎮 People looking for a game (Ping: Looking for game).
  3. *Do you speak another language?* (multiple choice, optional) →
     Español, Português, Deutsch, Français, 日本語 (each gives its role and
     channel).
- **Server Guide → Welcome message:** "Welcome to the TardiGeddon community!
  Pick a team, read the rules, and come find a match."
- **New member to-dos:** "Read the rules" → `#rules`; "Say hi" → `#general`;
  "Play a match" → link `https://tardigeddon.com/play`.
- **Resource pages:** FAQ → `#faq`; Report a bug → `#bug-reports`.

## 9. The invite link

1. Right-click `#welcome` → Invite People → Edit invite link → Expire
   after **Never**, Max uses **No limit**. Copy it.
2. It goes behind **tardigeddon.com/discord**, a redirect on our own site
   (`site/public/_redirects`), so the link we print everywhere never changes:
   to replace the invite, change that one line. The current invite is
   `https://discord.gg/qK4gxGm28Z`. It's also in the site footer and the
   Organization's `sameAs` in `site/src/seo.ts` for search engines.
3. Discovery / server description (Server Settings → Discovery, later):
   > The official community for TardiGeddon, the free turn-based artillery game starring tardigrades. Find matches, share clips, report bugs and chat with the devs.
   Tags: `gaming`, `indie games`, `browser games`, `multiplayer`, `artillery`.

A vanity link (discord.gg/tardigeddon) needs Boost level 3; the
tardigeddon.com/discord redirect does the same job for free.

**Where to share it:** the YouTube channel links and every video
description, the website footer and press kit, the other socials as they go
live. **Not** inside the game or the Android app: the game promises no chat
for children, and Discord is for ages 13+.

## 10. Bots

None to start with. Discord's own AutoMod, Onboarding, Rules Screening,
Audit Log and forum tags cover what bots used to do, and every bot is
another account with power over the server. If you want one later, add a
single well-known moderation/logging bot with only the permissions it asks
for, never Administrator.

## 11. Running it

- **Every update:** a short post in `#announcements` (what's new, a picture
  or clip, the play link), mention `@Ping: News`.
- **Daily challenge:** a daily reminder in `#daily-challenge` mentioning
  `@Ping: Daily challenge` (Discord's built-in scheduled messages can't
  repeat, so do it by hand or add a bot later).
- **Events:** Create Event → a weekly "Community match night" in
  `🔊 Lobby`, with a private room code posted at the start. Play with
  people; it's the best thing a dev can do in a small server.
- **Bug reports:** tag them `Fixed` and reply when a fix ships. People
  report more when they see it works.
- **Moderators:** when the server is busy, pick one or two helpful regulars
  aged 18+, give them the Moderator role, and write down how to handle a
  report (timeout first, ban for scams, slurs or anything involving a child's
  safety; report the last to Discord's Trust & Safety).
- **Check Insights** (Server Settings → Server Insights) monthly: where
  members come from and which channels they use.

## 12. Later: TardiGeddon inside Discord

Because the game already runs in a browser, it could become a **Discord
Activity**: a game people launch inside a voice call and play together
without leaving Discord. That needs an app in the Discord Developer Portal
(developer@tardigeddon.com can own it), the Embedded App SDK and a review by
Discord. Worth doing once the server is active; it's a developer job, so
ask Claude when you're ready.
