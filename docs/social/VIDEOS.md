# Videos: a weekly routine with no editing

Status: **long videos from CPU matches: built** (§3.6, 4 Nov 2026). The
other tools in §3 are still to build; the rest is how we'll use them.

**The idea:** nobody edits video by hand. TardiGeddon already replays any
match exactly (the sim is deterministic: a replay is the recorded button
presses), and `site/capture/capture-media.mjs` already records the real game
frame by frame on a virtual clock (smooth even on a slow computer, and slow
motion for free), then `ffmpeg` encodes it. We add **recipes**: a short file
that says which replay, which moments, how to frame them, what text to show
and which music, and one command turns it into finished videos for every
platform.

Your part each week: play, tap **📹 Save clip** when something great happens,
then run one command and upload (or schedule) what it makes. About 45
minutes a week.

---

## 1. What we post

Three kinds of video, from cheapest to most effort:

### Shorts (YouTube Shorts, TikTok, Instagram Reels, Facebook Reels): 3 a week

Vertical 1080×1920, 15 to 40 seconds, captions burned in (most people watch
with the sound off), the game's own music, ending on "Play free:
tardigeddon.com/play".

| Series | What | Made from |
|---|---|---|
| **Shot of the week** | the best shot from your matches, slow-mo on the hit | a saved clip |
| **Own goal of the week** | the funniest self-inflicted disaster | a saved clip |
| **Weapon in 20 seconds** | one weapon: what it does, one great use | a scripted scene (§3.3), one per weapon: 29 episodes ready to make |
| **Tardigrade fact** | a real tardigrade fact, then the game's take on it ("they survive space… and a Concrete Tun?") | a scripted scene + a fact card |
| **Daily challenge in 30** | today's challenge run, sped up | the daily challenge replay |
| **New in the update** | each new thing, 5 seconds each | scripted scenes |

Good weekly mix: **Shot of the week** (Monday), **Weapon in 20 seconds**
(Wednesday), and one of the others (Friday).

### YouTube videos (16:9): 1 or 2 a month

| Video | Length | How |
|---|---|---|
| **How to play** | 3–4 min | scripted scenes, one per tutorial step, with captions (a voiceover optional) |
| **Weapon guides** | 5–8 min | the Weapon in 20 seconds scenes, longer, grouped (grenades, strikes, superweapons…) |
| **Match highlights** | 5–10 min | a whole saved match, sped up between shots, slow-mo on the big ones |
| **Dev diary** | 3–5 min | what changed and why: screen captures of the new things, you talking (optional) |

### Trailers: one per big update, one for launch

60 to 90 seconds, 16:9 and a 9:16 cut. Made the same way, but with a
**director recipe**: chosen maps and seeds, scripted moves (the CPU plays
them), camera moves (slow pans, zooms on the hit), slow motion, title cards
between beats ("Tiny." … "Indestructible." … "Armed."), and the music cut to
the beat. The launch trailer could be the first thing built after the tools.

If you'd ever rather have a professional finish a trailer, the same tool
exports the raw footage at full quality, so an editor (e.g. a freelancer,
for a few hundred pounds) gets perfect clips to work with.

## 2. The weekly routine (about 45 minutes)

1. **Play** a few matches as normal (against the CPU or online). When
   something great or funny happens, tap **📹 Save clip** (§3.1): it keeps the
   last 20 seconds as a replay.
2. **Monday:** `npm run videos:week`. It picks up the week's saved clips
   and makes: the Shot of the week, the next Weapon in 20 seconds, and the
   third short, each in vertical, plus a thumbnail and a suggested title,
   description and hashtags (`store/videos/<date>/`).
3. **Watch them** (2 minutes each). Don't like one? Pick another clip and
   run it again.
4. **Schedule** them for the week. Each platform has its own scheduler
   (YouTube Studio, TikTok, and Meta Business Suite for Instagram and
   Facebook together); a tool like Buffer can post to all of them from one
   place.
5. **Reply** to comments for a few minutes each day.

## 3. What to build (the tools)

In this order; each step is useful on its own.

1. **📹 Save clip** in the game: a button (and a key) that keeps the last 20
   seconds of the match as a replay, with a note of when the big moment was.
   Saved clips show on the Replays page, where they can be downloaded as a
   file. Only on your own device, like replays today (nothing is sent).
2. **`npm run video -- <recipe>`**: renders a recipe. A recipe lists scenes:
   - a **clip** (a saved replay, from one moment to another), or a **scripted
     scene** (a map, a seed and moves for the CPU to play);
   - **framing**: vertical or horizontal, following the shot or the active
     tardigrade, zoom;
   - **speed**: sped up, normal, slow motion (around a hit);
   - **text**: captions at set moments, title and end cards in the game's
     font and colours;
   - **music**: one of the game's tracks.

   Sound: the game's music and effects are made by the browser as it plays,
   so the renderer records them into the video alongside the picture (the
   current teaser is silent; this fixes that).
3. **Ready-made recipes**: Shot of the week, Own goal, Weapon in 20 seconds
   (one per weapon, scripted so the shot always lands), Tardigrade fact,
   Daily challenge in 30, How to play, and a launch trailer.
4. **`npm run videos:week`**: runs the week's recipes on your saved clips,
   and writes the titles, descriptions and hashtags (from the house rules in
   [README.md](README.md)) next to each video.
5. **Thumbnails** from a frame of each video on the template
   (`store/social/youtube-thumb-template.png`).

Roughly a week of work for steps 1 to 3, then a day each for 4 and 5.

### 3.6 Long videos from CPU matches (built)

No playing needed: the computer plays hundreds of matches against itself
(2 to 10 teams, every map style and game style, random hats), and the best
moments are filmed in the real game.

**On your own computer (Windows), once:** install Node.js 22
(nodejs.org), Git, and ffmpeg (`winget install ffmpeg` in PowerShell, then
open a new window). Then in the TardiGeddon folder: `npm ci` and
`npx playwright install chromium`. Or just ask Claude in a session: it can
run all of this in the cloud and send you the files.

1. **Scout** (about 20 minutes for 200 matches on a 4-core computer; nothing
   is drawn):

   ```bash
   npm run videos:scout -- --matches 200 --teams 2-10
   ```

   Each turn is scored (damage, tardis popped, drowned, several at once,
   superweapons, own goals). The best 40 matches are kept as replays in
   `store/videos/scout/matches/`, with the top moments of all in
   `store/videos/scout/index.json`. Same seeds, same matches, every time
   (`--seed 201` for a fresh 200).
2. **Film** (needs the game running: `npm run build`, then
   `npx vite preview --port 4173` in another terminal; and `ffmpeg`):

   ```bash
   npm run videos:render -- best --teams 6 --minutes 8
   ```

   - `best`: the top moments of all, at most 3 per match and not too many of
     one weapon, grouped by match and building up to the best. `--teams 6`
     keeps only matches with 6 or more teams (**pure mayhem**).
   - `match --seed 4`: one match's highlights in order, ending on the winning
     shot and a "… win!" card.
   - `--music track.mp3` adds a music bed (the game's own tracks, or YouTube's
     Audio Library; never chart music). Without it the video is silent: the
     game makes its sound live, which can't be filmed frame by frame.

   - `--max-teams 3` keeps only small matches (one on one), `--name` and
     `--title` name the video, `--thumb "BEST|SHOTS"` sets the thumbnail's
     two lines, `--scout store/videos/scout-big` picks another scout's matches.

   Out comes `store/videos/<name>.mp4` (1920×1080, 30 fps), `<name>-thumb.jpg`
   (the YouTube thumbnail: the best moment, zoomed in, with big text) and
   `<name>.txt`: the title, description with **YouTube chapters** (one per
   match), tags and the upload answers. Filming runs about
   4 to 8 video frames a second, so an 8-minute video takes about an hour;
   leave it running.
3. **Watch it**, then upload to YouTube (Studio, or Sociamonials' YouTube
   profile), with the `.txt` as the description. Every match in it was played
   by the computer: the description says so.

Ideas for series: *10-team mayhem* (weekly), *one whole match* (`match`), a
*best of the month*, and per map style (`--teams 2` plus a map filter, to
add).

## 4. Rules for every video

- Never say "Worms" or use other games' footage or names (README: Rules).
- **Music:** only the game's own tracks, YouTube's Audio Library, or each
  platform's licensed sounds. No chart music.
- **Fair play:** never suggest money buys power. Shop items in videos are
  looks.
- **Kids watch:** cartoon explosions are fine; keep titles and captions
  friendly, no "rage", no bait.
- **Captions** on everything; British spelling.
- **AI:** footage is the real game. If a voiceover is ever made with an AI
  voice, YouTube and TikTok ask you to say so when uploading; your own voice
  needs nothing.
- **Made for kids? (YouTube):** answer "No" (the audience is everyone,
  teens and adults included), as in YOUTUBE.md.

## 5. Decisions for the owner

1. Go ahead with the tools (§3), starting with Save clip and the renderer?
2. Voice: captions only (simplest), your voice for dev diaries, or none?
3. A scheduler (Buffer or similar) to post everywhere at once, or each
   platform's own?
