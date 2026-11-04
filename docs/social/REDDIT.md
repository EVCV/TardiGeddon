# Reddit: r/TardiGeddon

Shared names, bios and rules are in [README.md](README.md); pictures are in
`store/social/`. The subreddit exists (set up to keep the name) but is empty.
This is everything to make it a real home, in order. Reddit's screens move
about: the steps name what to look for, not exact clicks.

Reddit is 13+, like accounts. Like Discord, link it from the website and
other socials, **never from inside the game** (README: Kids).

---

## 1. Lock it down first

1. **Who owns it:** make sure the top moderator is a Reddit account signed up
   with `developer@tardigeddon.com` (a company address), with **two-step
   sign-in** on, and backup codes kept somewhere other than that inbox. If you
   made it with a personal account, add the company account as a moderator
   with full permissions, then move it to the top of the list.
2. **Type:** keep it **Restricted** (anyone can see and comment, only approved
   users post) until §2 and §3 are done, then switch to **Public**.
3. **Mature (18+):** **off**. **Content tag:** Gaming → Video games.

## 2. Look

- **Community icon:** `store/social/reddit-icon.png`
- **Banner:** `store/social/reddit-banner.png` (phones crop the sides)
- **Theme colours:** primary `#ffd84a` (the game's yellow), highlight `#e04848`.
- **Display name / title:** TardiGeddon
- **Description** (500 characters at most):
  > The official community for TardiGeddon, a free turn-based artillery game starring tardigrades. Share your best shots, ask questions, suggest weapons and report bugs. Play free in your browser: tardigeddon.com/play. Also on Android, iPhone and iPad.
- **Sidebar links (Community widgets → Button or Link widget):**
  ▶ Play: tardigeddon.com/play · 📰 News: tardigeddon.com/news ·
  💬 Discord: tardigeddon.com/discord · 🎓 How to play: tardigeddon.com/how-to-play

## 3. Rules (Mod tools → Rules; copy as is)

1. **Be kind.** No insults, harassment or hate. Plenty of players are young.
2. **Keep it about TardiGeddon.** Other games are fine for comparison, not for promotion.
3. **No cheating, exploits or account selling.** Report exploits privately to support@tardigeddon.com.
4. **Bugs:** say what happened, on which device, and how to make it happen again. Use the Bug flair.
5. **No personal information.** Don't share your own or anyone else's email, address or real name.
6. **No spam or self-promotion,** apart from your own TardiGeddon clips and art.
7. **Credit other people's art and clips.**

Removal reasons (Mod tools → Removal reasons): one per rule, short and polite,
e.g. "Removed: please keep posts about TardiGeddon (rule 2)."

## 4. Post flairs (Mod tools → Post flair; required on every post)

| Flair | Colour | For |
|---|---|---|
| 📰 News | yellow | updates from us (mods only) |
| 💥 Clip | red | best shots, funny moments |
| 🎨 Fan art | pink | drawings, edits |
| 💡 Suggestion | green | ideas for weapons, worlds, modes |
| 🐛 Bug | grey | problems (see rule 4) |
| ❓ Question | blue | how do I…? |
| 🏆 Daily challenge | orange | scores and runs |

## 5. AutoModerator (Mod tools → Automations → AutoModerator; paste as is)

```yaml
# New accounts (under 2 days) can't post links: stops most spam bots.
type: submission
author:
    account_age: "< 2 days"
domain+body (regex): ['https?://']
action: filter
action_reason: "New account posting a link"
---
# Scam phrases (the same as the Discord filter).
type: any
title+body (includes): ["free nitro", "nitro gift", "steam gift", "steamcommunity.gift", "discord.gift", "airdrop", "onlyfans"]
action: remove
action_reason: "Scam phrase"
---
# Bug reports get a reminder of what helps.
type: submission
flair_text: "🐛 Bug"
comment: |
    Thanks for the report! If you haven't already, tell us **which device** (and browser or app), **what happened**, and **how to make it happen again**. You can also email support@tardigeddon.com.
comment_stickied: true
```

## 6. First posts (in this order, once it's Public)

1. **Welcome (pinned, News flair):**
   > **Welcome to r/TardiGeddon!** 🐻💥
   >
   > TardiGeddon is a free turn-based artillery game starring tardigrades. Walk, aim, mind the wind and fire: last tardi standing wins. Play now in your browser at tardigeddon.com/play, or on Android, iPhone and iPad.
   >
   > Post your best shots and funniest own goals, fan art, ideas and bug reports here. Our Discord (tardigeddon.com/discord) is the place to find people to play online with.
   >
   > The rules are short: be kind, keep it about TardiGeddon, no cheating. Have fun! — the TardiGeddon team
2. **"What should we add next?" (pinned, Suggestion flair):** ask for ideas
   for the next world and weapon, then reply to the best ones.
3. **The trailer or teaser** (`store/social/shorts/teaser.mp4`, Clip flair).

## 7. Keeping it alive (about 15 minutes, twice a week)

- **Every update:** post the News post (title + 3 best changes + link), News flair.
- **Weekly:** one clip from the game (the Shorts work here too), and a
  "Daily challenge" scores thread on Mondays (Reddit can schedule it:
  Mod tools → Scheduled posts).
- **Reply to every question and bug** in the first months, even with "we're
  on it". Reddit rewards communities where the developers answer.
- Once a few regulars appear, invite one or two as moderators (with 2FA).

## 8. Getting people there (be careful: Reddit dislikes adverts)

Reddit expects people to take part, not just advertise. Share the game where
it's welcome, with the 9:1 spirit (mostly genuine comments, a little of our own):

| Where | What fits |
|---|---|
| r/WebGames | the game itself, once ("Free turn-based artillery game with tardigrades, plays in the browser") |
| r/playmygame | the game, asking for feedback |
| r/IndieGaming, r/indiegames | a good clip, not a link-only post |
| r/gamedev, r/IndieDev | "Screenshot Saturday" threads; how something was made (the CPU racer, the cartoon weather) |
| r/tardigrades | only something genuinely tardigrade-y, e.g. the science in the game; read their rules first |
| r/browsergames, r/turnbasedstrategy | the game, if their rules allow it |

**Read each subreddit's rules first** (many allow self-promotion only on set
days), post from the company account with "I'm the developer" said plainly,
never ask for upvotes, and never use other accounts to boost posts. Never
mention Worms (README: Rules).

## 9. After it's live

Add it to `SOCIAL` in `site/src/social.ts` (the website footer's Follow links
and `sameAs`), and update the status in [README.md](README.md).
