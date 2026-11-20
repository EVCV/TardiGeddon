# "I'm building a game with AI": coding videos from real commits

Status: **built** (16 Nov 2026). One command turns a commit into a finished
video of the change being made, ready for you to narrate.

**The idea:** the series is honest. TardiGeddon is written by Claude Code
while you direct it, and the videos say so. The footage is the real change:
`scripts/videos/code.mjs` takes a commit from this repo, opens the files it
changed in a VS Code-like editor with the Claude chat beside it, and replays
the diff at a speed people can read: the old lines turn red and fold away,
the new ones are typed in by a cursor labelled **Claude**. The status bar
says "Replay of commit … · Claude's real edits, slowed down to watch", and the
end card says "Code written by Claude (AI) · directed by me". Nothing
pretends a person typed it. You narrate over it in your cloned voice.

## 1. Make one

```bash
npm run videos:code -- --commit e23ef3a --bug "on phones, tapping the map did nothing" --prompt "On my phone I can't scroll the map or place an air drop. Find out why."
```

What it writes to `store/videos/code/` (not committed):

| File | What |
|---|---|
| `code-<hash>.mp4` | 1920×1080, 30 fps, about 60–100 s: YouTube / Facebook |
| `code-<hash>-short.mp4` | 1080×1920, about 45 s, zoomed in on the typing: Shorts / Reels / TikTok |
| `code-<hash>-thumb.jpg` | the YouTube thumbnail: a moment of fresh green code with two big lines of text |
| `code-<hash>.txt` | title, description (with chapters), tags, the AI disclosure, and a **narration script with timestamps** for both cuts |

Check what it will show first with `--plan` (it prints each file and scene
with its time and films nothing), or watch it live with `--preview` (plays in
a visible browser in real time).

The options (all optional except the commit):

| Option | What it does |
|---|---|
| `--commit <sha>` or `--from A --to B` | the change: one commit, or everything between two (give `--title` for a range) |
| `--prompt "…"` / `--prompt-file f.txt` | what you asked Claude, shown as your chat message. Without it the chat shows the bug or the commit subject, labelled "(the bug report)" / "(the task, from the commit message)" so it never looks like a quote |
| `--bug "…"` | one line on what was wrong: the title card, the Short's hook and the description |
| `--test tests/x.test.ts` | runs `npm test -- <file>` **now, on this checkout** and plays its real output in the terminal panel. Run it when the checkout matches the commit (or the test hasn't changed since) |
| `--test-output f.txt --test-cmd "npm test -- x"` | shows output you saved earlier instead (ANSI colours kept). `npx vitest run x --color > f.txt` saves it |
| `--only a,b` / `--skip a,b` | show only / never the files whose path contains these |
| `--speed 1.5` | type and edit faster (or slower below 1) |
| `--max-seconds 100` / `--short-seconds 45` | the length each cut aims for |
| `--title "…"`, `--ep 4`, `--me "Richard"` | the title card's title, an episode number, the name on your chat messages (default "Me") |
| `--thumb "LINE ONE\|LINE TWO"` | the thumbnail's two lines (default: from the commit subject; better to choose them) |
| `--voice narration.mp3` | puts your recorded narration under the long video |
| `--name`, `--out`, `--no-short`, `--no-long`, `--keep-frames` | file names and which cuts to make |

## 2. How it chooses what to show

A commit can touch hundreds of lines; a video can't take forever.

- **Skipped files:** lockfiles, translations (`src/i18n/locales/`), images,
  fonts, built files and anything in `store/`. They're still counted in the
  chat ("…and 200 more files").
- **Scenes:** each change in a file is a block (`git diff -U0`); blocks close
  together are one scene. Scenes are scored: game and server code first,
  then tests, scripts and CSS, docs and News last; a line that's changed
  (old → new) beats one only added; a new file counts well because it's
  typed in part and fast-forwarded. A file's second scene counts a bit less,
  so one big file doesn't take the whole video.
- **Fitting the time:** the best scenes are taken until the cut is full
  (100 s long, 45 s Short). Changes not filmed are still made, off screen, so
  the file is always right.
- **Typing:** a changed line is edited in place (the old part is selected,
  deleted, and the new part typed); new lines are typed with an uneven rhythm
  at about 34 characters a second. After about 8 lines of one run (4 in the
  Short), the rest is pasted quickly under a "⏩ 32 more lines (fast-forward)"
  label. Each scene types at most 16 lines (7 in the Short).
- **Order:** game code, then scripts, CSS, tests and docs; within those, the
  most interesting file first. Then the test run, Claude's closing message,
  and the end card.

## 3. Narrating it

Open `code-<hash>.txt`. The narration script lists each moment with its
start time, what's on screen, and a **Say:** line taken from the commit
message (Claude wrote those, so they explain why). Say it in your own words,
as you: "I asked Claude…", "it found…", "what I liked here…". Aim for one
sentence per scene; the typing leaves room between them.

Captions: VIDEOS.md asks for them on everything; YouTube makes them from your narration (check the words), or burn them in with your editor.

Then either record it and add `--voice narration.mp3` (it renders again, the
same frames), or drop the video and your clone's audio into any editor (or
Montaj). The video has no sound of its own.

**AI disclosure (every upload):** the voice is an AI clone, so tick
YouTube's "altered or synthetic content" and the AI label on TikTok and
Facebook ([VIDEOS.md](VIDEOS.md) §4, Rules). The description the script writes says
so too.

**Keep private things out:** the script drops `Claude-Session:` links and
`Co-Authored-By:` lines from commit messages, but read the chat text, file
names and test output before you post. Don't film commits about money, sign-in
or security (see §4).

## 4. The first ten episodes

Picked from `git log` for a clear story: something players saw go wrong, why
it happened, and a fix you can see. Short ones make good Shorts on their own.

| # | Commit | The story | Command extras |
|---|---|---|---|
| 1 | `3bb6ee2` | **The camera that wouldn't sit still.** It jumped up to 128 px in one frame whenever its target changed; now it moves on a damped spring, at most 37 px a frame. New file `cameraMotion.ts` plus its test | `--bug "the camera whipped across the map whenever a shot landed" --test tests/cameraMotion.test.ts --thumb "THE CAMERA\|WOULDN'T STOP"` |
| 2 | `e23ef3a` | **Phones couldn't tap the map.** Two things shared the class name `touch`, so a "don't take taps" rule also hit the whole page. A one-word rename, and a phone test that drags and taps | `--bug "on phones, tapping or dragging the map did nothing" --thumb "ONE WORD\|BROKE PHONES"` |
| 3 | `67899a7` | **The tardigrade stuck in mid-air.** Wedged between two lumps of land with nothing under it, it was "falling" forever and the turn could never end. A search of 3000 random wedges finds none stuck now | `--only src/sim/world.ts,tests/wedged.test.ts --test tests/wedged.test.ts --bug "a tardigrade hung in the air forever and froze the game"` |
| 4 | `fc8841a` | **Stray triangles across the sky.** Some graphics cards drew the background hills as broken shapes; now they're painted once into pictures | `--bug "on some PCs, random triangles shot across the sky"` |
| 5 | `6d583fa` | **Cluster bombs threw the camera around** (the prequel to #1): the filming camera aims at everything in the air and only moves near the edge | `--bug "cluster weapons sent the camera all over the map"` |
| 6 | `2abf4de` | **Tests that starved each other.** Browsers opened by tests kept their matches running, so on a 2-core machine the later tests fell behind and timed out | `--bug "the tests passed on my PC and failed on the build server"` |
| 7 | `77586d7` | **The flaky test.** The CPU standing in for a player who'd left sometimes won the match before they came back. Now the absent team has no ammo | `--test tests/room.test.ts --bug "a test that failed one time in five"` |
| 8 | `dbce701` | **The view kept jumping back** while you picked a spot for a strike or teleport; now it stays where you looked | `--bug "aiming an air strike, the camera snapped back to your tardigrade"` |
| 9 | `b9e1e54` | **Three playtest bugs:** your own poison cloud hurt your team with friendly fire off, practice respawned you over the hole you'd just fallen in, and the health bars read 250% | `--test tests/feedback.test.ts --bug "friendly fire off… and my own poison still got me"` |
| 10 | `18d1954` | **A one-line fix** (a Short on its own): the tutorial's practice dummy hopping about ticked off *your* "jump" step | `--no-long --bug "the tutorial said I'd jumped. I hadn't."` |

Next in line: `628716f` (the lobby didn't fit with the season's sky), `1dc8fda`
(own goals didn't show the pop). Leave out commits about payments, accounts
and security (e.g. `4b69549`): they explain how something could be attacked.

## 5. How it works

- `scripts/videos/code.mjs` reads the commit with `git` (`diff -U0 -M`, and
  each file before and after), highlights both versions with **Shiki** in VS
  Code's Dark+ colours, chooses the scenes, and lays the whole video out in
  time as a list of steps (open a file, scroll, delete rows, edit a line,
  type a line, paste, run the terminal, chat messages, title cards).
- `scripts/videos/code/page.js` + `page.css` is the editor page: it plays
  those steps back. Every frame is drawn from the clock (no CSS animations),
  long lines wrap, the view follows the cursor, and the caret blinks when
  idle. Fonts are bundled (JetBrains Mono for code, Nunito and Luckiest Guy
  from the game), so it looks the same on Windows and Linux.
- Filming is the same as the gameplay videos (`scripts/videos/render.mjs`, in its own PR): Playwright with the virtual clock
  (`site/capture/virtual-clock.js`), a CDP screenshot per frame at 30 fps
  (laid out at 1280×720 drawn 1.5×; the Short at 540×960 drawn 2×), and
  ffmpeg with libx264 (CRF 18). Needs ffmpeg on the PATH; set
  `PW_CHROMIUM_PATH` for a preinstalled Chromium. A 100 s video takes a few
  minutes.
