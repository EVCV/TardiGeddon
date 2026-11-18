# r/TardiGeddon: what to post (and how it differs from the other socials)

The sub is live and has its welcome post. Setup (icon, rules, flairs,
AutoModerator) is in [REDDIT.md](REDDIT.md). This file is the posting
plan: **three posts a week**, written for Reddit, not copied from the
Sociamonials queue.

## Why Reddit needs its own posts

The scheduled socials (`scripts/social/posts.ts`) are 92 one-picture cards:
a weapon, a tip, a tardigrade fact, a map, a question, all under 280
characters and ending "▶ Play free". That works on Instagram and X. On Reddit
it reads as an advert and gets ignored or downvoted. People who join a game's
subreddit already know the game; they come for:

| The other socials | r/TardiGeddon |
|---|---|
| One-line teaser + picture card | A few paragraphs with a point, written like a person |
| "Play free" link in every post | Link only when it's useful (a patch, a leaderboard) |
| Broadcast: the same words everywhere | Conversation: every post asks something we actually want answered |
| What the game *is* | How it's *made*, *why* it works the way it does, what's *next* |
| Polished | Honest: bugs we fixed, things we got wrong, decisions we're unsure about |

**Don't** cross-post the Sociamonials cards here, and don't reuse their
wording. A fact or tip can come up here too, but as the start of a
discussion, not as the card.

## The weekly rhythm

| Day | Slot (UK) | What | Flair |
|---|---|---|---|
| **Mon** | 15:00 | **Recurring thread** (rotates, see below), scheduled in Mod tools → Scheduled posts | 🏆 Daily challenge / 💥 Clip / 💡 Suggestion |
| **Wed** | 15:00 | **Dev log**: how something works, why we chose it, what broke | 📰 News |
| **Fri** | 17:00 | **Talking point**: a design question, a poll, a "settle this" for the weekend | 💡 Suggestion / ❓ Question |
| Any day | when it ships | **Patch notes** (counts as that week's Wed post if it lands near it) | 📰 News |

15:00 UK is mid-morning on the US east coast and still evening in Europe; it's
a starting point, so check what gets replies after a month and move it.

**Recurring Monday threads** (rotate them, one a week):

1. **Daily challenge scoreboard**: "Post your Target Smash and Rope Race
   scores for this week. Screenshot or it didn't happen." Mods pin it.
2. **Clip of the week**: "Drop your best shot, worst own goal or luckiest
   bounce from the last 7 days. Replays → save the clip." Next week's thread
   names last week's winner (and, if you like, gives them a promo-code hat).
3. **Suggestion box**: "One idea per comment, upvote the ones you want. We
   read every one and move the best to the Roadmap." Link the in-game Roadmap
   voting at tardigeddon.com/roadmap.

**Every post:** the right flair; posted from the company account; reply to
every top-level comment in the first two hours (Reddit shows active threads to
more people); never ask for upvotes. Same rules as everywhere (README.md):
never name other games, money only buys looks, British spelling.

---

## Weeks 1–6: ready to post

**The finished posts are in `store/social/reddit/`**, one file each, numbered
in posting order (01 to 19). Each file says when to post it and which flair
to use, then gives the title, then the body after `---`. In Reddit's post
editor, switch to **Markdown** mode and paste the body. Posts 15, 17 and 18
have `[brackets]` to fill in from earlier threads or the statistics first.
The outlines below are the plan they were written from.

The sub is live and already has its welcome post. The posts start on
**Fri 20 Nov** with the "What should we add next?" thread. Text in the
quotes is ready to paste; change "we" to "I" throughout if you'd rather post
as yourself (Reddit warms to a named developer).

### Week 1 (20–27 Nov): the first week

**Fri 20 Nov · 💡 Suggestion · "What should we add next?"** (pin it under the welcome post)

> **What should we add next? Worlds, weapons, hats, modes: tell us**
>
> We open to everyone on 1 December, and the list of things we want to
> add is longer than the list of things we've finished. So before we pick:
>
> - **A new world.** Volcano? Ice? Inside a moss forest at microscope scale?
> - **A weapon.** Something tardigrade-y would be ideal. (Yes, the Concrete
>   Tun is a dried-out tardigrade. We know.)
> - **A mode.** We have Rope Race and the daily challenge. What else?
>
> One idea per comment so people can upvote. The ones that get the most
> support go on the Roadmap (tardigeddon.com/roadmap), where you can vote
> for them in the game too.

**Wed 25 Nov · 📰 News · dev log**

> **Why we moved launch to 1 December, and what we did with the extra weeks**
>
> We'd planned to launch earlier. We didn't, because a handful of things
> weren't good enough and we'd rather fix them than ship them:
>
> - **The CPU felt like a robot.** It aimed instantly and fired. Now it looks
>   around, picks a weapon, then aims, the way a person would. Normal is a
>   closer fight too: no more wild misses.
> - **Tardigrades could get wedged** between two bits of land and hang in the
>   air, which stopped the whole game. Fixed (and our tests now play whole
>   computer-vs-computer matches on every map style to catch this kind of thing).
> - **The camera jumped** from thing to thing. It glides now, and follows a
>   cluster bomb's bits as one instead of hopping between them.
> - **Rope Race courses** sometimes couldn't be finished. Now every course is
>   one you can finish, with a different mix of easy and hard parts each time.
>
> What's the thing that bugs you most right now? We have a week.

**Fri 27 Nov · ❓ Question · talking point**

> **Founder pack: last few days. What did you call your team?**
>
> Quick reminder: make a free account by 30 November and you keep the Founder
> pack for good (a hat, a grave, a victory dance, a golden world and its own
> music). No payment, nothing to buy. Account page at tardigeddon.com/play.
>
> But mostly, team names. We've seen "The Moss Bosses" and "Tun Squad". What's
> yours, and what's the story behind it?

### Week 2 (30 Nov): launch week

**Mon 30 Nov · 🏆 Daily challenge · scoreboard thread #1** (template above)

**Tue 1 Dec · 📰 News · launch post** (extra post this week; pin it in place
of the suggestion thread)

> **TardiGeddon is out. Thank you, and here's where everything is**
>
> As of today TardiGeddon is open to everyone: in the browser at
> tardigeddon.com/play, and on Android, iPhone and iPad.
>
> A few things worth knowing on day one:
>
> - **It's free and it stays fair.** No ads. Money only buys looks; weapons
>   unlock with Slime, which you earn by playing and can't buy.
> - **The first 1,000 players** get the Early bird pack.
> - **Found a bug?** Post it here with the 🐛 Bug flair: device, what
>   happened, how to make it happen again. We'll be in the comments all day.
> - **Want people to play with?** Quick play online, or make a room and send
>   friends its 5-letter code. The Discord (tardigeddon.com/discord) is the
>   best place to find a game.
>
> To everyone who played the early versions and told us what was broken:
> thank you. Go and blow something up.

**Thu 3 Dec · 📰 News · AMA** (replaces the Wednesday dev log this week;
announce it in the launch post's comments)

> **We just launched TardiGeddon. Ask us anything (today, 15:00–18:00 UK)**
>
> How it's made, why it plays the way it does, what's coming, why
> tardigrades. Ask away and we'll answer everything we can.

**Sat 5 Dec · 💥 Clip · talking point**

> **First weekend: show us your best (or worst) moment**
>
> You've had the game for four days. Post the shot you're proudest of, or the
> own goal you'll never live down. Replays keeps every match, and the results
> screen can play the winning shot again.

### Week 3 (7 Dec)

**Mon 7 Dec · 💥 Clip · Clip of the week #1** (template above)

**Wed 9 Dec · 📰 News · dev log**

> **How the CPU decides where to shoot**
>
> A few people asked how the computer players work, so here's the honest
> version.
>
> The CPU doesn't cheat by reading your mind, but it does cheat a little by
> reading the future. On its turn it takes a copy of the match and *tries*
> lots of shots on it (different weapons, angles, powers, fuses), playing each
> one forward to see what happens: who gets hurt, who falls in the water,
> whether it hits itself. Then it picks a good one and presses the same
> buttons you would to fire it.
>
> It can do that because the game is completely predictable: the same buttons
> pressed at the same moments always give exactly the same match, down to the
> last bounce. (That's also what makes replays and online play work. More on
> that another week.)
>
> The difficulty levels change how well it reads the wind, how much its aim
> and power wobble, and which weapons it knows about. Super easy even aims a
> little to one side on purpose, so you get near misses. Expert reads the wind
> perfectly and doesn't wobble at all.
>
> Has the CPU ever done something that looked too clever, or too stupid?
> Clips welcome.

**Fri 11 Dec · 💡 Suggestion · poll** (use Reddit's poll post type)

> **Balance check: which superweapon is too strong?**
>
> Concrete Tun, Holy Water Droplet or Microscope Slide Slam. Vote, then tell
> us in the comments *why*: the best arguments decide what we look at first.
> (Options: Concrete Tun / Holy Water Droplet / Microscope Slide Slam / They're
> all fine / They're all too weak)

### Week 4 (14 Dec)

**Mon 14 Dec · 💡 Suggestion · Suggestion box #1** (template above)

**Wed 16 Dec · 📰 News · dev log**

> **Every match is 50 button-presses a second (and that's why replays are tiny)**
>
> A TardiGeddon match isn't saved as a video. It's saved as a list of what
> each player pressed, 50 times a second. To watch a replay, the game plays
> the match again from the start with the same presses, and gets exactly the
> same result.
>
> That only works if the game never does anything unpredictable, which
> turned out to be a fun constraint:
>
> - **No real randomness.** Wind, mines that might be duds, crate drops: all
>   come from a seeded sequence that's the same every time the match is played.
> - **No maths that can differ between computers.** Sines and cosines can
>   give slightly different answers on different phones, and slightly
>   different is enough to send a grenade the other way after a few bounces.
>   So the game uses its own whole-number angles and tables instead.
> - **Weather is just for looks.** Rain and snow never move your shots,
>   because then two people's screens could disagree. (The very rare tornado
>   is the exception, and it's the same for everyone.)
>
> Online play uses the same trick: the server sends everyone the same presses
> and every device works out the same match.
>
> Questions welcome: this is the bit we're most proud of.

**Fri 18 Dec · ❓ Question · talking point**

> **Hot-seat house rules?**
>
> Up to 10 teams can take turns on one device. Over Christmas a lot of you will
> be passing a phone round the sofa. What are your house rules? Ropes only?
> No superweapons? Loser picks the next map? Best ones go in a post on
> Christmas Eve.

### Week 5 (21 Dec): Christmas week, keep it light

**Mon 21 Dec · 🏆 Daily challenge · scoreboard thread #2**

**Thu 24 Dec · 📰 News · round-up** (in place of Wednesday)

> **The best hot-seat house rules you sent us (and a Merry Christmas)**
>
> Collect the best five from last Friday's thread, credit each by username,
> and wish everyone a happy Christmas. No link needed.

**Sat 26 Dec · 💥 Clip · talking point**

> **Boxing Day: who did you beat over Christmas?**
>
> Siblings, parents, grandparents: who did you introduce to TardiGeddon, and
> who won?

### Week 6 (28 Dec): first month

**Mon 28 Dec · 💥 Clip · Clip of the week #2**

**Wed 30 Dec · 📰 News · dev log**

> **One month in: what you played, what broke, what's next**
>
> Use the real numbers from the anonymous play statistics (matches played,
> most-used weapon, most-picked map style, how many beat Expert: daily totals
> only, docs/USAGE.md). Then: the three biggest fixes since launch, and the
> top three Roadmap items with "now / next / later". End by asking what
> should jump the queue.

**Fri 1 Jan · ❓ Question · talking point**

> **New year: what's your TardiGeddon resolution?**
>
> Beat Expert? Finish a Rope Race without touching a mine? Win a game with
> nothing but the Fire Punch?

---

## The idea bank (after week 6)

Dev logs (Wednesdays), each written the same way: what it is, how it works,
what went wrong on the way, a question at the end:

- **Making videos from replays**: the match videos and Shorts are filmed by
  the game itself from saved replays; how it finds the good moments and
  keeps the camera steady.
- **Why money only buys hats**: Slime, coins, and why we'll never sell power.
  Expect pushback in the comments; answer it straight.
- **Drawing a tardigrade**: the style guide, how the characters and hats are
  made (the art is made with AI tools and checked by people; say so plainly if
  asked, as our AI Policy does).
- **Rope Race courses**: making a random course that can always be finished.
- **The tardigrade science**: which bits of the game are real biology (the
  tun, surviving space, Dsup) and which we made up. Link real papers.
- **Six languages**: what was hard to translate (jokes, weapon names).
- **Accessibility**: what's in Settings and what players asked for.
- **Behind a fix**: pick a real bug from the 🐛 flair, explain the cause and
  the fix, and thank the person who reported it.

Talking points (Fridays): "Is the wind too strong?", "Which weapon should
never have been added?", "Rate the hats", "The map you hate most and why",
"Design a weapon in one sentence", "Weapon tier list" (share a blank tier
picture), "Strangest way you've won".

Every update: a 📰 News post with the title, the three changes players will
notice most, *why* we made them, and the link to the full notes at
tardigeddon.com/news.

Seasonal: Valentine's (send a tardi a hat), the end of the launch giveaway
(31 Jan, results), the end of the Supporter packs (31 Jan: thank people,
don't push).

## Keep track

After each post, note in a line below the date, the title and how many
comments it got. After a month, do more of what got talked about.

| Date | Title | Comments | Notes |
|---|---|---|---|
| | | | |
