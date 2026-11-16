// Films the scout's best moments in the real game and joins them into one
// long video (16:9, for YouTube). docs/social/VIDEOS.md §3.6.
//
//   npm run build && npx vite preview --port 4173        (the game, in another terminal)
//   node scripts/videos/render.mjs best  [--minutes 8] [--per-match 3] [--teams 6]
//   node scripts/videos/render.mjs match --seed 4         (one whole match's highlights, to the winner)
//   node scripts/videos/render.mjs shorts [--count 8]     (vertical 1080×1920 Shorts / TikTok / Reels: one moment each)
//   options: --scout store/videos/scout  --out store/videos
//            --music game:boss (default: one of the game's tracks to suit the match, see sound.mjs) | track.mp3 | none
//            --max-teams 3 (only small matches)  --name duels  --zoom 1.35
//            --title "Best shots"  --thumb "BEST|SHOTS" (the thumbnail's two lines)
//
// Out: <name>.mp4 (1920×1080), <name>-thumb.jpg (the YouTube thumbnail, from the
// best moment) and <name>.txt (title, description with chapters, and tags).
//
// Each frame is drawn on a virtual clock (site/capture/virtual-clock.js), so the
// video is smooth however slow the computer is. Between moments the replay is
// fast-forwarded without filming. Captions and title cards are drawn in the page
// in the game's own fonts. Sound: the game's music, rendered to a file
// (music.ts); its sound effects are made live and can't be filmed frame by
// frame. Any other music must be licensed for this (docs/social/README.md).
// Needs ffmpeg with libx264. Set PW_CHROMIUM_PATH to use a preinstalled Chromium.

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { musicFilter, nameNumber, trackFor } from './sound.mjs';
import { EXPLAINER, hook, intro, narrate, outro, resultCaption, script, setupCaption, srt, weaponOf } from './story.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const mode = args[0] ?? 'best';
const SHORTS = mode === 'shorts';
const SCOUT = opt('scout', 'store/videos/scout');
const OUT = opt('out', 'store/videos');
const GAME = process.env.GAME_URL ?? 'http://localhost:4173/';
// Laid out as a 1280×720 screen and drawn 1.5× (1920×1080): the game's text and
// tardis come out the size a viewer expects, not tiny as on a big monitor.
// Shorts: a 540×960 phone screen drawn 2× (1080×1920).
const [W, H] = opt('size', SHORTS ? '540x960' : '1280x720').split('x').map(Number);
const SCALE = Number(opt('scale', SHORTS ? '2' : '1.5'));
/** Closer than the game's own camera: the tardis fill more of the picture. */
const ZOOM = Number(opt('zoom', '1.35'));
/** Shorts: a set zoom (a tall screen would otherwise fit the whole map's width and show tiny tardis). */
const ZOOM_ABS = Number(opt('zoom-abs', SHORTS ? '1.25' : '0'));
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const TICK = 50; // sim ticks per second
const FADE = 8; // frames
const CLOCK = readFileSync(join(here, '../../site/capture/virtual-clock.js'), 'utf8');
const TMP = process.env.CAPTURE_TMP ?? join(tmpdir(), 'tardigeddon-video');

const MAPS = { islands: 'Twin Isles', mainland: 'Mainland', archipelago: 'Archipelago', sky: 'Sky Realms', caverns: 'Caverns', canyon: 'Canyon', spires: 'Spires' };
const STYLES = { standard: 'Standard', quick: 'Quick', pro: 'Pro', chaos: 'Chaos', armoured: 'Armoured', bng: 'Bazookas and Grenades', artillery: 'Artillery' };

const load = (seed) => JSON.parse(readFileSync(join(SCOUT, 'matches', `${seed}.json`), 'utf8'));
/** The game's replay limit (src/challenge/daily.ts MAX_FRAMES: 15 minutes); a longer one won't open. */
const MAX_TICKS = TICK * 60 * 15;
const matches = () =>
  readdirSync(join(SCOUT, 'matches'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => load(f.replace('.json', '')))
    .filter((m) => m.ticks <= MAX_TICKS);

/**
 * The plan: a list of matches, each with the moments to film in order.
 * `best`: the top moments of all, a few per match and not too many of one weapon,
 * until the video is long enough. `match`: one match, its best moments in order.
 */
function plan() {
  if (mode === 'match') {
    // --seed N, or --pick N: the Nth best finished match of the scout (1 = the best).
    const m = opt('seed', '')
      ? load(opt('seed', ''))
      : matches()
          .filter((m) => m.finished && m.winner)
          .sort((a, b) => b.score - a.score)[Number(opt('pick', '1')) - 1];
    if (!m) {
      console.error('No such match: --seed N, or --pick N (1 = the best of the scout).');
      process.exit(1);
    }
    const min = Number(opt('min-score', '120'));
    // At most --per-weapon moments of one weapon (the best of each): in Chaos every team
    // has a superweapon and fires it early, which would make the video one weapon over and over.
    const perWeapon = Number(opt('per-weapon', '2'));
    const last = m.moments.at(-1);
    const count = new Map();
    let ms = [...m.moments]
      .filter((x) => x.score >= min && x !== last)
      .sort((a, b) => b.score - a.score)
      .filter((x) => {
        const n = count.get(x.weapon) ?? 0;
        count.set(x.weapon, n + 1);
        return n < perWeapon;
      })
      .slice(0, 40)
      .sort((a, b) => a.from - b.from);
    // Always end on the last shot (the winning one).
    if (last) ms.push(last);
    return { title: opt('title', `${m.teams} teams · ${MAPS[m.map] ?? m.map} · ${STYLES[m.style] ?? m.style}`), name: opt('name', `match-${m.seed}`), parts: [{ m, moments: ms, ending: true }] };
  }
  // A countdown: the top --count moments (10 by default), from #10 up to #1.
  const target = Number(opt('count', '10'));
  const perMatch = Number(opt('per-match', '3'));
  const minTeams = Number(opt('teams', '2'));
  const maxTeams = Number(opt('max-teams', '10'));
  const all = matches().filter((m) => m.teams >= minTeams && m.teams <= maxTeams);
  // --skip <video>[,<video>]: leave out the moments those countdowns used (a second Top 10 with new shots).
  const skip = new Set(
    opt('skip', '')
      .split(',')
      .filter(Boolean)
      .flatMap((v) => {
        const f = join(OUT, `${v}-moments.txt`);
        return existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean) : [];
      }),
  );
  const pool = all
    .flatMap((m) => m.moments.map((x) => ({ m, x })))
    .filter(({ m, x }) => !skip.has(`${m.seed}:${x.fire}`))
    .sort((a, b) => b.x.score - a.x.score);
  const byWeapon = new Map();
  const byMatch = new Map();
  const chosen = [];
  for (const { m, x } of pool) {
    if (chosen.length >= target) break;
    if ((byMatch.get(m.seed) ?? 0) >= perMatch) continue;
    if ((byWeapon.get(x.weapon) ?? 0) >= Number(opt('per-weapon', '3'))) continue;
    chosen.push({ m, x });
    byMatch.set(m.seed, (byMatch.get(m.seed) ?? 0) + 1);
    byWeapon.set(x.weapon, (byWeapon.get(x.weapon) ?? 0) + 1);
  }
  // Counted down: the least of them first (#10), the best last (#1).
  const groups = chosen
    .sort((a, b) => a.x.score - b.x.score)
    .map((c, i) => ({ m: c.m, moments: [c.x], n: chosen.length - i }));
  const title = opt('title', minTeams >= 6 ? 'Pure mayhem' : maxTeams <= 3 ? 'One on one' : 'Best shots');
  return { title, name: opt('name', `best-${new Date().toISOString().slice(0, 10)}`), parts: groups };
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  // Linux servers have no graphics card: draw in software there. On your own PC the graphics card is faster.
  args: [...(process.platform === 'linux' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []), '--autoplay-policy=no-user-gesture-required'],
});

const OVERLAY_CSS = `
  .replay-bar, .watching-badge, .toast { display: none !important; }
  /* "Clawdia's turn": our captions say who fires, and the banner sat under them. */
  .hud-banner { display: none !important; }
  /* Nobody can press the menu or sound buttons in a video. */
  .hud-btn:not(.hud-fuse):not(.hud-weapon) { visibility: hidden !important; }
  /* The thumbnail: only the game's picture and our text (no timer, wind or buttons). */
  body.thumbing * { visibility: hidden !important; }
  body.thumbing canvas, body.thumbing #vid-thumb, body.thumbing #vid-thumb * { visibility: visible !important; }
  #vid-thumb { position: fixed; inset: 0; display: none; z-index: 99995; pointer-events: none;
    background: linear-gradient(90deg, rgba(26, 16, 32, 0.78) 0%, rgba(26, 16, 32, 0.35) 45%, rgba(26, 16, 32, 0) 70%); }
  #vid-thumb .lines { position: absolute; left: 5vh; top: 12vh; font-family: var(--title); line-height: 1; }
  #vid-thumb .l1 { font-size: 19vh; color: #ffd84a; -webkit-text-stroke: 1.2vh #2b1b24; paint-order: stroke fill; }
  #vid-thumb .l2 { font-size: 15vh; color: #fff; -webkit-text-stroke: 1.1vh #2b1b24; paint-order: stroke fill; }
  #vid-thumb .brand { position: absolute; left: 5vh; bottom: 5vh; font: 6vh var(--title); color: #fff; -webkit-text-stroke: 0.6vh #2b1b24; paint-order: stroke fill; }
  #vid-fade { position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none; z-index: 99998; }
  #vid-card { position: fixed; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 2vh;
    background: radial-gradient(circle at 50% 40%, #3b2a4a, #1a1020); color: #fff; z-index: 99997; text-align: center; font-family: var(--title); }
  #vid-card .big { font-size: 9vh; color: #ffd84a; text-shadow: 0 0.6vh 0 #2b1b24; }
  #vid-card .small { font-size: 4.6vh; font-family: var(--title); opacity: 0.95; max-width: 70vw; line-height: 1.3; }
  #vid-cap { position: fixed; left: 50%; top: 9vh; transform: translateX(-50%); padding: 1.2vh 2.6vh; border-radius: 1.4vh;
    background: rgba(43, 27, 36, 0.82); color: #fff; font: 3.6vh var(--title); z-index: 99996; display: none; white-space: nowrap; }
  @media (orientation: portrait) {
    #vid-cap { top: 13vh; font-size: 3.2vh; white-space: normal; width: 86vw; text-align: center; line-height: 1.25; }
    #vid-tag { right: auto !important; left: 50%; transform: translateX(-50%); top: 6.5vh !important; }
    #vid-card .big { font-size: 7vh; }
    #vid-card .small { font-size: 3.2vh; }
  }
  #vid-num { position: fixed; left: 2vh; top: 8vh; display: none; z-index: 99996; font-family: var(--title); line-height: 1; text-align: left; }
  #vid-num .n { font-size: 11vh; color: #ffd84a; -webkit-text-stroke: 0.8vh #2b1b24; paint-order: stroke fill; }
  #vid-num .w { font-size: 2.6vh; color: #fff; -webkit-text-stroke: 0.35vh #2b1b24; paint-order: stroke fill; margin-top: 0.6vh; }
  #vid-left { position: fixed; right: 1.5vh; top: 6vh; padding: 0.8vh 1.6vh; border-radius: 1vh; background: rgba(43, 27, 36, 0.82);
    color: #fff; font: 3vh var(--title); z-index: 99996; display: none; }
  #vid-card .roster { display: flex; flex-wrap: wrap; justify-content: center; gap: 1vh 2.4vh; max-width: 80vw; font: 3.4vh var(--title); }
  #vid-card .roster span { padding: 0.6vh 1.4vh; border-radius: 1vh; background: rgba(255, 255, 255, 0.1); }
  #vid-cap.result { background: rgba(160, 40, 60, 0.9); }
  #vid-tag { position: fixed; right: 1.5vh; top: 1.5vh; padding: 0.8vh 1.6vh; border-radius: 1vh; background: rgba(43, 27, 36, 0.7);
    color: #ffd84a; font: 2.4vh var(--title); z-index: 99996; }
`;

/** Open the game watching one replay, with the clock frozen at its start (three tries: a busy computer can be slow to load it). */
async function openReplay(replay) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await openReplayOnce(replay);
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`  the game was slow to open the replay (${e.message.split('\n')[0]}); trying again`);
    }
  }
}

// The team colours (src/render/palette.ts TEAM_COLORS). Replays scouted before 6 Nov 2026
// saved each team's slot (0-9) as its colour, which draws every name, health number and
// turn banner near-black; colour is only looks (not in the sim's hash), so swap it here.
const TEAM_COLORS = [0xe04848, 0x3a7be0, 0x3cb34a, 0xe0a020, 0x9b59d0, 0xf07a2a, 0x23b5c8, 0xe85fa8, 0x9a6b3f, 0x7d8a99];
function withTeamColours(replay) {
  const start = JSON.parse(replay.start);
  if (!start.teams?.some((t) => t.color < TEAM_COLORS.length)) return replay;
  for (const t of start.teams) if (t.color < TEAM_COLORS.length) t.color = TEAM_COLORS[t.color];
  return { ...replay, start: JSON.stringify(start) };
}

async function openReplayOnce(replay) {
  replay = withTeamColours(replay);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  await ctx.addInitScript(`window.__replay = ${JSON.stringify(replay)};`);
  await ctx.addInitScript(`try { localStorage.setItem('tardigeddon.arena', 'classic'); } catch {}`);
  await ctx.addInitScript(CLOCK);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(new URL('?autostart=replay', GAME).href);
  try {
    await page.waitForFunction(() => window.__tardi?.world?.tick >= 1, null, { timeout: 120_000 });
  } catch (e) {
    await ctx.close();
    throw e;
  }
  await page.evaluate((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    for (const id of ['vid-fade', 'vid-card', 'vid-cap', 'vid-tag', 'vid-thumb', 'vid-num', 'vid-left']) {
      const d = document.createElement('div');
      d.id = id;
      document.body.append(d);
    }
    document.getElementById('vid-card').innerHTML = '<div class="big"></div><div class="small"></div><div class="roster"></div>';
    document.getElementById('vid-num').innerHTML = '<div class="n"></div><div class="w"></div>';
    document.getElementById('vid-tag').textContent = 'tardigeddon.com/play';
    document.getElementById('vid-thumb').innerHTML = '<div class="lines"><div class="l1"></div><div class="l2"></div></div><div class="brand">TardiGeddon</div>';
  }, OVERLAY_CSS);
  await page.evaluate(() => window.__virt.freeze());
  // The filming camera (src/render/renderer.ts steadyCamera): frames all the action, zooming out
  // from this zoom to fit it, and glides. On from the start, so it's settled before filming.
  await page.evaluate(([zoom, abs]) => {
    const r = window.__tardi.renderer;
    r.camera.steady = true;
    r.camera.steadyZoom = abs || r.defaultZoom() * zoom;
    r.camera.zoom = r.camera.steadyZoom;
  }, [ZOOM, ZOOM_ABS]);
  return { ctx, page };
}

/**
 * The screenshot session. Playwright draws the page at SCALE, but the raw
 * screenshot call only keeps that with its own device size set: without it the
 * frames come out at the layout size (1280×720, not 1920×1080).
 */
async function screenSession(ctx, page) {
  const s = await ctx.newCDPSession(page);
  await s.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
  return s;
}

let frameNo = 0;
let dir = '';
let cdp = null;

/** Film `n` frames, calling `each(i)` in the page before each one (and `at[i]()` after drawing frame i, before it's kept). */
async function film(page, n, each = '', at = {}, ms = FRAME_MS) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(([ms, src, i, n]) => {
      if (src) new Function('i', 'n', src)(i, n);
      window.__virt.step(ms);
    }, [ms, each, i, n]);
    if (at[i]) await at[i]();
    await keep();
  }
}

/** Keep the frame on screen. */
async function keep() {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
  writeFileSync(join(dir, `${String(frameNo++).padStart(6, '0')}.jpg`), Buffer.from(data, 'base64'));
}

/**
 * Get to sim tick `to` with the camera already there: fast-forward (not filmed)
 * to two seconds before, then play those two seconds (not filmed either) so the
 * camera has glided into place and the first frame filmed isn't mid-pan.
 */
async function cue(page, to) {
  await seek(page, to - 2 * TICK);
  await page.evaluate(([to, ms]) => {
    const m = window.__tardi;
    for (let guard = 0; m.world.tick < to && guard < 400; guard++) window.__virt.step(ms);
    // Framed at once: the first frame filmed is never mid-pan (a clip that starts as the turn does).
    m.renderer.camera.snap = true;
    window.__virt.step(0);
  }, [to, FRAME_MS]);
}

/**
 * Film one moment as it plays, from where the replay is now:
 * - the dead air (the retreat time, waiting for the damage to be counted) runs
 *   fast, easing up to 4× and back, never just before something happens;
 * - it carries on past `x.to` until everything has landed and anyone popped has
 *   finished popping (at most 4 s more), then holds the camera still for the fade out.
 * `opts.slow`: play at this speed throughout (slow motion), until sim tick `opts.until`.
 * `opts.caption`: frames the caption stays up. `opts.thumb`: take the thumbnail just after the hit.
 * `opts.extra`: seconds more at the end (the winners' dance).
 * `opts.on`: `[{ at: tick, run }]`, each run (once) on the first frame at or past its tick, before it's kept.
 * `opts.hold()`: true while it must carry on (a caption still being read), up to 3 s past the usual end.
 */
async function filmAction(page, x, opts = {}) {
  const events = [x.peak, x.tally].filter((t) => t >= 0);
  const begin = await page.evaluate(() => window.__tardi.world.tick);
  // Before the shot is fired: real time (the aim, the build-up).
  const calmFrom = x.fire ?? begin + 1.5 * TICK;
  const hard = opts.until ?? x.to + (opts.hold ? 7 : 4) * TICK;
  let speed = opts.slow ?? 1;
  let quietSince = -1;
  let thumbed = !opts.thumb;
  const on = [...(opts.on ?? [])].sort((a, b) => a.at - b.at);
  let held = false;
  for (let i = 0; ; i++) {
    const st = await page.evaluate(([ms, i, cap, fade]) => {
      const m = window.__tardi;
      const w = m.world;
      const r = m.renderer;
      document.getElementById('vid-fade').style.opacity = String(Math.max(0, 1 - i / fade));
      if (i === cap) document.getElementById('vid-cap').style.display = 'none';
      window.__virt.step(ms);
      const busy =
        w.projectiles.length > 0 ||
        w.tardis.some((t) => t.alive && t.airborne) ||
        w.objects.some((o) => (o.airborne && !o.chute) || o.fuse > 0) ||
        w.flames.length > 0 ||
        r.dying.size > 0;
      const why = [w.projectiles.length && 'shot', w.tardis.some((t) => t.alive && t.airborne) && 'flying', w.objects.some((o) => (o.airborne && !o.chute) || o.fuse > 0) && 'object', w.flames.length && 'flames', r.dying.size && 'popping'].filter(Boolean).join('+');
      const c = r.camera;
      return { tick: w.tick, busy, why, phase: w.turn.phase, cam: [Math.round(c.x), Math.round(c.y), Math.round(c.zoom * 100) / 100], over: w.turn.phase === 'gameover', popping: r.dying.size > 0 || w.tardis.some((t) => t.alive && t.airborne) };
    }, [FRAME_MS * speed, i, opts.caption ?? -1, FADE]);
    if (!thumbed && st.tick >= x.peak + 0.15 * TICK) {
      await thumbnail(page);
      thumbed = true;
    }
    while (on.length && st.tick >= on[0].at) await on.shift().run();
    await keep();
    if (process.env.VIDEO_DEBUG) console.log(JSON.stringify({ f: frameNo, tick: st.tick, speed: Math.round(speed * 100) / 100, phase: st.phase, why: st.why, cam: st.cam }));
    if (opts.slow) {
      if (st.tick >= hard) break;
      continue;
    }
    // Done: past the end, and nothing still flying or popping (or out of time).
    const ended = (st.tick >= x.to && !st.popping) || (st.over && !opts.extra);
    if (ended && !opts.hold?.()) break;
    // Still reading the result: keep the camera on the aftermath, not the next player's turn.
    if (ended && !held) {
      held = true;
      await page.evaluate(() => (window.__tardi.renderer.camera.manualUntil = 1e15));
    }
    if (st.tick >= hard) break;
    // The pace for the next frame.
    if (st.busy) quietSince = -1;
    else if (quietSince < 0) quietSince = st.tick;
    const soon = events.some((t) => t > st.tick && t - st.tick < 0.6 * TICK * Math.max(1, speed));
    const dull = st.tick >= calmFrom && quietSince >= 0 && st.tick - quietSince >= 0.3 * TICK && !soon && st.tick < x.to;
    speed += ((dull ? 4 : 1) - speed) * 0.3;
    if (Math.abs(speed - 1) < 0.05) speed = 1;
  }
  if (opts.extra) await film(page, Math.round(opts.extra * FPS));
  // Fade out with the camera held still (no pan towards the next turn as it fades).
  await page.evaluate(() => (window.__tardi.renderer.camera.manualUntil = 1e15));
  await film(page, FADE, FADE_OUT, {}, FRAME_MS * (opts.slow ?? 1));
  await page.evaluate(() => (window.__tardi.renderer.camera.manualUntil = 0));
}

const FADE_IN = `document.getElementById('vid-fade').style.opacity = String(Math.max(0, 1 - i / ${FADE}));`;
const FADE_OUT = `if (i >= n - ${FADE}) document.getElementById('vid-fade').style.opacity = String((i - (n - ${FADE})) / ${FADE});`;

/** A title card for `frames` frames (`roster`: team names, in their colours). */
async function card(page, big, small, frames = 75, roster = []) {
  await page.evaluate(([big, small, roster]) => {
    const c = document.getElementById('vid-card');
    c.querySelector('.big').textContent = big;
    c.querySelector('.small').textContent = small;
    const r = c.querySelector('.roster');
    r.replaceChildren(
      ...roster.map(([name, color]) => {
        const s = document.createElement('span');
        s.textContent = name;
        s.style.color = color;
        return s;
      }),
    );
    c.style.display = 'flex';
  }, [big, small, roster]);
  await film(page, frames, FADE_IN + FADE_OUT);
  await page.evaluate(() => (document.getElementById('vid-card').style.display = 'none'));
}

/** Fast-forward the replay (not filmed) to sim tick `to`. */
async function seek(page, to) {
  await page.evaluate((to) => {
    const m = window.__tardi;
    const pb = m.playback;
    for (let guard = 0; m.world.tick < to && guard < 100000; guard++) {
      const left = to - m.world.tick;
      // At most 250 ms of frame time each step: speed so that one step lands on (or just short of) the tick.
      pb.speed = Math.max(1, Math.min(60, Math.floor(left / 12.5)));
      window.__virt.step(250);
      if (pb.i >= pb.frames.length) break;
    }
    pb.speed = 1;
  }, to);
}

/** The thumbnail: this frame, darkened on the left, with two big lines of text. */
let thumbDone = false;
async function thumbnail(page) {
  const [l1, l2] = opt('thumb', '').split('|');
  const lines = l1 ? [l1, l2 ?? ''] : thumbLines();
  await page.evaluate(([a, b]) => {
    const t = document.getElementById('vid-thumb');
    t.querySelector('.l1').textContent = a;
    t.querySelector('.l2').textContent = b;
    t.style.display = 'block';
    document.body.classList.add('thumbing');
    for (const id of ['vid-cap', 'vid-tag']) document.getElementById(id).dataset.was = document.getElementById(id).style.display;
    document.getElementById('vid-cap').style.display = 'none';
    document.getElementById('vid-tag').style.display = 'none';
  }, lines);
  // Closer still for the thumbnail, then back (the filming camera paused meanwhile).
  const zoomWas = await page.evaluate(() => {
    const r = window.__tardi.renderer;
    const was = r.camera.zoom;
    r.camera.steady = false;
    r.camera.zoom = r.defaultZoom() * 1.9;
    window.__virt.step(0);
    return was;
  });
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const png = join(dir, 'thumb.png');
  writeFileSync(png, Buffer.from(data, 'base64'));
  // YouTube: 1280×720 or bigger, under 2 MB.
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-vf', 'scale=1920:1080', '-q:v', '3', join(OUT, `${p.name}-thumb.jpg`)]);
  await page.evaluate((zoom) => {
    document.getElementById('vid-thumb').style.display = 'none';
    document.body.classList.remove('thumbing');
    for (const id of ['vid-cap', 'vid-tag']) document.getElementById(id).style.display = document.getElementById(id).dataset.was ?? '';
    // Back to the video's zoom before this frame is kept.
    const r = window.__tardi.renderer;
    r.camera.zoom = zoom;
    r.camera.steady = true;
    window.__virt.step(0);
  }, zoomWas);
  thumbDone = true;
}

function thumbLines() {
  const most = Math.max(...p.parts.map((g) => g.m.teams));
  if (mode === 'match') return [`${most} TEAMS`, 'ONE MATCH'];
  if (mode === 'best') return [`TOP ${p.parts.length}`, p.title.toUpperCase()];
  if (p.title === 'Pure mayhem') return [`${most} TEAMS`, 'PURE MAYHEM'];
  return p.title.toUpperCase().split(' ').length > 1 ? [p.title.toUpperCase().split(' ').slice(0, -1).join(' '), p.title.toUpperCase().split(' ').at(-1)] : [p.title.toUpperCase(), ''];
}

/** What the narrator says, and when (seconds into the video): written out as a script and subtitles. */
const voice = [];
/** Say `text` from now (the voice reads at about 2.6 words a second). */
function say(text) {
  const start = frameNo / FPS;
  const prev = voice.at(-1);
  // Never over the line before: wait for it to finish.
  const at = prev ? Math.max(start, prev.end + 0.2) : start;
  voice.push({ start: at, end: at + speech(text), text });
}
/** Seconds to say `text` (a narrator reads about 2.8 words a second). */
const speech = (text) => Math.max(1.5, text.split(/\s+/).length / 2.8);
/** Lines already said in this video (no line twice). */
const said = new Set();

/** The caption at the top: `text` (or none), styled as a result or not. */
async function caption(page, text, result = false) {
  await page.evaluate(([text, result]) => {
    const c = document.getElementById('vid-cap');
    c.textContent = text ?? '';
    c.classList.toggle('result', result);
    c.style.display = text ? 'block' : 'none';
  }, [text, result]);
}

/** The countdown badge (#7 and where) and the teams-left counter; null hides them. */
async function badges(page, num, where, left) {
  await page.evaluate(([num, where, left]) => {
    const b = document.getElementById('vid-num');
    b.querySelector('.n').textContent = num ? `#${num}` : '';
    b.querySelector('.w').textContent = where ?? '';
    b.style.display = num ? 'block' : 'none';
    const l = document.getElementById('vid-left');
    l.textContent = left ? (left === 1 ? '1 team left' : `${left} teams left`) : '';
    l.style.display = left ? 'block' : 'none';
  }, [num ?? 0, where ?? '', left ?? 0]);
}

/**
 * One moment, told as a story: who fires what (caption and narration as it starts),
 * the shot, and what happened (when the damage is counted, or just after the hit).
 * `n`: its number in a countdown; `count`: show how many teams are left (a whole match).
 */
async function filmMoment(page, x, { last = false, thumb = false, n = 0, where = '', count = false } = {}) {
  await cue(page, x.from);
  const st = x.story;
  await badges(page, n, n ? where : '', count ? st?.teamsBefore : 0);
  await caption(page, setupCaption(x));
  const words = narrate(x, n, said);
  say(words.setup);
  const done = Math.max(x.tally ?? -1, x.peak + TICK);
  let shown = -1;
  await filmAction(page, x, {
    thumb,
    extra: last ? 4 : 0,
    // The result stays up long enough to read (2.5 s).
    hold: () => shown < 0 || frameNo - shown < 2.5 * FPS,
    on: [
      { at: (x.fire ?? x.from) + 1.2 * TICK, run: () => caption(page, null) },
      {
        at: done,
        run: async () => {
          await caption(page, resultCaption(x), true);
          if (count && st) await badges(page, 0, '', st.teamsAfter);
          say(words.result);
          shown = frameNo;
        },
      },
    ],
  });
  await caption(page, null);
  await badges(page, 0, '', 0);
}

/** The cold open: the best hit of the video in slow motion with the hook on it, before anything else. */
async function coldOpen(page, x) {
  // Closer than the rest of the video: the first second has to grab.
  const was = await page.evaluate(() => {
    const c = window.__tardi.renderer.camera;
    const was = c.steadyZoom;
    c.steadyZoom = was * 1.45;
    return was;
  });
  await cue(page, Math.max(0, x.peak - 1.1 * TICK));
  await caption(page, hook(x));
  await filmAction(page, x, { slow: 0.6, until: Math.min(x.peak + 1.3 * TICK, x.to), thumb: !thumbDone });
  await caption(page, null);
  await page.evaluate((z) => (window.__tardi.renderer.camera.steadyZoom = z), was);
}

/** Join the frames in `dir` into `<OUT>/<name>.mp4`, with music (game:<id>, a file, or none). */
function encode(name, musicOpt) {
  const out = join(OUT, `${name}.mp4`);
  let music = musicOpt;
  const length = frameNo / FPS;
  if (musicOpt.startsWith('game:')) {
    music = join(dir, 'music.wav');
    console.log(`  music: the game's "${musicOpt.slice(5)}" track`);
    // (Windows needs a shell to find npx, and a shell splits at spaces: quote.)
    const win = process.platform === 'win32';
    const args = ['tsx', join(here, 'music.ts'), musicOpt.slice(5), String(Math.ceil(length) + 2), music];
    execFileSync('npx', win ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args, { stdio: 'inherit', shell: win });
  }
  const input = ['-framerate', String(FPS), '-i', join(dir, '%06d.jpg')];
  // Game tracks lower and softer, everything at -20 LUFS (sound.mjs), a fade in and a fade out.
  const audio =
    music !== 'none' && existsSync(music)
      ? ['-stream_loop', '-1', '-i', music, '-shortest', '-af', `${musicFilter(musicOpt.startsWith('game:'))},afade=t=in:d=${SHORTS ? 0.3 : 1},afade=t=out:st=${Math.max(0, length - (SHORTS ? 1.5 : 3))}:d=${SHORTS ? 1.5 : 3}`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000']
      : ['-an'];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, ...audio, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  return out;
}

/**
 * What each kind of Short is about (--kind): which moments it picks.
 * `range` is how far the shot landed from the shooter (pixels).
 */
const KINDS = {
  hits: () => true,
  fails: (x) => x.ownGoal,
  water: (x) => x.drowned > 0,
  long: (x) => (x.story?.range ?? 0) >= 900 && (x.pops > 0 || x.drowned > 0 || x.damage >= 60),
  last: (x) => !!x.story?.alone && (x.pops > 0 || x.drowned > 0 || (x.story?.teamsOut.length ?? 0) > 0),
  wipeout: (x) => (x.story?.teamsOut.length ?? 0) > 0,
};

/** Moments already made into Shorts (--used <file>: one "seed:fire" a line), so batches don't repeat one. */
const usedFile = opt('used', '');
const usedKeys = () => new Set(usedFile && existsSync(usedFile) ? readFileSync(usedFile, 'utf8').split(/\r?\n/).filter(Boolean) : []);
/** Spoken text: no emoji. */
const spoken = (t) => t.replace(/[^\p{L}\p{N}\s.,!?'…-]/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Shorts: the best moments of a kind (--kind hits|fails|water|long|last|wipeout),
 * one per match and at most two of a weapon. Each opens on a hook, shows who
 * fires what and what happened, the hit again in slow motion, and a "Play free"
 * card: 15 to 25 seconds, with one of the game's tracks.
 */
async function shorts() {
  const count = Number(opt('count', '8'));
  const kind = opt('kind', 'hits');
  if (!KINDS[kind]) {
    console.error(`--kind: one of ${Object.keys(KINDS).join(', ')}`);
    process.exit(1);
  }
  const used = usedKeys();
  const minTeams = Number(opt('teams', '2'));
  const maxTeams = Number(opt('max-teams', '10'));
  // --music a,b,c to choose; by default a lively track for big matches, a calm one for duels.
  const tracks = opt('music', '') ? opt('music', '').split(',') : null;
  const pool = matches()
    .filter((m) => m.teams >= minTeams && m.teams <= maxTeams)
    .flatMap((m) => m.moments.map((x) => ({ m, x })))
    .filter(({ m, x }) => KINDS[kind](x) && !used.has(`${m.seed}:${x.fire}`))
    .sort((a, b) => b.x.score - a.x.score);
  const picked = [];
  const seeds = new Set();
  const weapons = new Map();
  for (const c of pool) {
    if (picked.length >= count) break;
    if (seeds.has(c.m.seed) || (weapons.get(c.x.weapon) ?? 0) >= 2) continue;
    picked.push(c);
    seeds.add(c.m.seed);
    weapons.set(c.x.weapon, (weapons.get(c.x.weapon) ?? 0) + 1);
  }
  if (!picked.length) {
    console.error(`Nothing to film for --kind ${kind}: scout more matches (npx tsx scripts/videos/scout.ts).`);
    process.exit(1);
  }
  if (picked.length < count) console.warn(`  only ${picked.length} moments of kind "${kind}" left; making those`);
  // Saved as used now, so the next job in the same batch doesn't pick these too.
  if (usedFile) writeFileSync(usedFile, [...used, ...picked.map(({ m, x }) => `${m.seed}:${x.fire}`)].join('\n') + '\n');
  mkdirSync(OUT, { recursive: true });
  const prefix = opt('name', `short-${new Date().toISOString().slice(0, 10)}`);
  const list = [];
  // --from 3: carry on from the third (the first two are already made).
  const from = Number(opt('from', '1'));
  for (const [n, { m, x }] of picked.entries()) {
    if (n + 1 < from) continue;
    const name = `${prefix}-${n + 1}`;
    dir = join(TMP, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    frameNo = 0;
    voice.length = 0;
    const t0 = Date.now();
    const where = `${m.teams} teams · ${MAPS[m.map] ?? m.map}`;
    const hooked = hook(x);
    // 1. The moment, from just before the shot (or, after a long flight, 6 s before the hit), with the hook on top.
    let { ctx, page } = await openReplay(m.replay);
    cdp = await screenSession(ctx, page);
    const peak = x.peak ?? x.to - 2 * TICK;
    const begin = peak - x.from > 9 * TICK ? peak - 6 * TICK : x.from;
    await cue(page, begin);
    // The hook first (the first second decides whether anyone watches), then who fires what, then what happened.
    await caption(page, hooked);
    say(spoken(hooked));
    const words = narrate(x);
    let shown = -1;
    await filmAction(page, x, {
      hold: () => shown < 0 || frameNo - shown < 2.5 * FPS,
      on: [
        { at: Math.max(begin + 1.8 * TICK, (x.fire ?? begin) - 0.6 * TICK), run: () => caption(page, setupCaption(x)) },
        { at: Math.max(begin + 3 * TICK, (x.fire ?? begin) + 1.2 * TICK), run: () => caption(page, null) },
        {
          at: Math.max(x.tally ?? -1, peak + TICK),
          run: async () => {
            await caption(page, resultCaption(x), true);
            say(words.result);
            shown = frameNo;
          },
        },
      ],
    });
    await caption(page, null);
    await ctx.close();
    // 2. The hit again, at half speed: from just before it to the blast's aftermath.
    ({ ctx, page } = await openReplay(m.replay));
    cdp = await screenSession(ctx, page);
    await cue(page, Math.max(0, peak - 0.6 * TICK));
    await page.evaluate(() => {
      const c = document.getElementById('vid-cap');
      c.textContent = 'Again, slowly 🐢';
      c.style.display = 'block';
    });
    await filmAction(page, x, { slow: 0.5, until: Math.min(peak + 2 * TICK, x.to) });
    // 3. The end card.
    await page.evaluate(() => (document.getElementById('vid-cap').style.display = 'none'));
    await card(page, 'Play free', 'tardigeddon.com/play', 60);
    await ctx.close();
    const out = encode(name, tracks ? tracks[n % tracks.length] : trackFor(m.teams, n + nameNumber(prefix)));
    const secs = Math.round(frameNo / FPS);
    // Words for posting: the same text suits YouTube Shorts, TikTok, Reels and Facebook.
    const article = m.teams === 8 ? 'an' : 'a';
    const title = `${hooked} ${weaponOf(x)} in ${article} ${m.teams}-team match`;
    const blurb = `${hooked} ${resultCaption(x)} ${m.teams} teams, one map. Free turn-based artillery game starring tardigrades. Play free: tardigeddon.com/play`;
    const text = [
      `Title (YouTube Shorts): ${title.slice(0, 90)} #Shorts`,
      '',
      `Caption (TikTok, Reels, Facebook, Shorts description): ${blurb}`,
      '',
      'Hashtags: #TardiGeddon #indiegame #gaming #tardigrade #browsergame',
      '',
      `Length: ${secs} s, 1080×1920. Kind: ${kind}. Every match is played by the computer. Made for kids: No. Altered or synthetic content: No (Yes if a voice is added).`,
      '',
      'Narration (optional, for a voice):',
      script(voice),
    ].join('\n');
    writeFileSync(join(OUT, `${name}.txt`), text + '\n');
    rmSync(dir, { recursive: true, force: true });
    list.push(`${out} (${secs} s): ${x.label}, ${where}`);
    console.log(`  ${name}: ${x.label}, ${where} (${secs} s, filmed in ${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  await browser.close();
  console.log(`\n${list.length} shorts:\n${list.join('\n')}`);
}

if (SHORTS) {
  await shorts();
  process.exit(0);
}

const p = plan();
if (!p.parts.length || !p.parts.some((g) => g.moments.length)) {
  console.error(`Nothing to film: run the scout first (npx tsx scripts/videos/scout.ts), or lower --teams / --min-score.`);
  process.exit(1);
}
dir = join(TMP, p.name);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const chapters = [];
/** The best moment of the video: the cold open and the thumbnail. */
const allMoments = p.parts.flatMap((g) => g.moments.map((x) => ({ m: g.m, x })));
const best = allMoments.reduce((a, b) => (b.x.score > a.x.score ? b : a));
const most = Math.max(...p.parts.map((g) => g.m.teams));
const countdown = mode === 'best';
const where = (m) => `${m.teams} teams · ${MAPS[m.map] ?? m.map}`;
/** The teams of a match, with their colours, from its start. */
const roster = (m) => JSON.parse(withTeamColours(m.replay).start).teams.map((t) => [t.name, `#${(t.color >>> 0).toString(16).padStart(6, '0')}`]);

// 1. The cold open: the best hit, slowly, with a hook. 2. What this is, and what the game is.
{
  const { ctx, page } = await openReplay(best.m.replay);
  cdp = await screenSession(ctx, page);
  say(spoken(hook(best.x)));
  await coldOpen(page, best.x);
  chapters.push({ at: 0, title: 'Intro' });
  const title = countdown ? `Top ${p.parts.length}: ${p.title}` : `${most} teams. 1 winner.`;
  const opening = intro(countdown ? 'countdown' : 'match', { count: p.parts.length, teams: countdown ? (most > 3 ? 'some very crowded matches' : 'one-on-one and three-way matches') : most, map: MAPS[best.m.map] ?? best.m.map });
  say(opening);
  // On screen as long as the narrator takes to say it (at least 4 s).
  const long = Math.round(Math.max(4, speech(opening) + 0.6) * FPS);
  await card(page, title, countdown ? EXPLAINER : `${MAPS[best.m.map] ?? best.m.map} · ${STYLES[best.m.style] ?? best.m.style} · ${EXPLAINER}`, long, countdown ? [] : roster(best.m));
  await ctx.close();
}

for (const [gi, g] of p.parts.entries()) {
  const { ctx, page } = await openReplay(g.m.replay);
  cdp = await screenSession(ctx, page);
  for (const [i, x] of g.moments.entries()) {
    chapters.push({ at: frameNo / FPS, title: countdown ? `#${g.n} ${x.label}` : x.label });
    await filmMoment(page, x, { last: g.ending && i === g.moments.length - 1, n: g.n ?? 0, where: where(g.m), count: !countdown });
    console.log(`  match ${g.m.seed}: ${countdown ? `#${g.n} ` : ''}${x.label} (${frameNo} frames, ${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  if (g.ending && g.m.winner) {
    chapters.push({ at: frameNo / FPS, title: `${g.m.winner} win` });
    say(outro('match', { winner: g.m.winner }));
    await card(page, `${g.m.winner} win!`, where(g.m), 120);
  }
  if (gi === p.parts.length - 1) {
    if (countdown) say(outro('countdown', {}));
    await card(page, 'Play free', 'tardigeddon.com/play', 150);
  }
  await ctx.close();
}
await browser.close();

// Music: the game's own tracks by default (game:<id>, rendered by music.ts), a file of
// your own (licensed for this), or none.
const out = encode(p.name, opt('music', trackFor(Math.max(...p.parts.map((g) => g.m.teams)), nameNumber(p.name))));
// YouTube chapters: paste these into the description (the first must be 0:00).
const stamp = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// The narration: a script with times (to read or to give an AI voice) and subtitles (to place it in Montaj).
writeFileSync(join(OUT, `${p.name}-narration.txt`), `Narration for ${p.name}.mp4: each line starts at its time. Music under it: duck to about -12 dB.

${script(voice)}
`);
writeFileSync(join(OUT, `${p.name}-narration.srt`), srt(voice));
// Which moments this video used (for --skip, so the next countdown has new ones).
writeFileSync(join(OUT, `${p.name}-moments.txt`), p.parts.flatMap((g) => g.moments.map((x) => `${g.m.seed}:${x.fire}`)).join('\n') + '\n');
const ytTitle = opt(
  'yt-title',
  mode === 'match'
    ? ((n) => `${most} teams, 1 winner: a whole match in ${n} minute${n === 1 ? '' : 's'} | TardiGeddon`)(Math.max(1, Math.round(frameNo / FPS / 60)))
    : `Top ${p.parts.length} ${most > 3 ? `shots from ${most}-team mayhem` : 'one-on-one shots'} | TardiGeddon`,
);
const blurb =
  mode === 'match'
    ? `${most} teams of tardigrades, one map, one winner: the best moments of a whole match of TardiGeddon (${MAPS[p.parts[0].m.map] ?? p.parts[0].m.map}, ${STYLES[p.parts[0].m.style] ?? p.parts[0].m.style} style), the free turn-based artillery game.`
    : `The top ${p.parts.length} shots, counted down: ${p.title.toLowerCase()} in TardiGeddon, the free turn-based artillery game starring tardigrades.`;
const desc = [
  `Title: ${ytTitle}`,
  '',
  'Description:',
  `${blurb} Every match here was played by the computer, so you can see what the CPU can do: ${most > 3 ? 'up to 10 teams on one map' : 'one on one, or three-way'}, 29 weapons, and maps you can blow to pieces.`,
  '',
  '▶ Play free in your browser (no download, no ads): https://tardigeddon.com/play',
  '📱 Also on Android, iPhone and iPad.',
  '💬 Discord: https://tardigeddon.com/discord',
  '',
  // YouTube shows chapters only with three or more.
  ...(chapters.length >= 3 ? ['Chapters:', ...chapters.map((c, i) => `${stamp(i === 0 ? 0 : c.at)} ${c.title}`), ''] : []),
  `Narration: ${p.name}-narration.txt (script with times) and ${p.name}-narration.srt.`,
  '',
  '#TardiGeddon #indiegame #browsergame',
  '',
  'Tags: TardiGeddon, tardigrade game, water bear, artillery game, turn based strategy, browser game, free game, indie game, local multiplayer, CPU vs CPU',
  '',
  `Thumbnail: ${p.name}-thumb.jpg. Made for kids: No. Altered or synthetic content: No for the gameplay; Yes if an AI or cloned voice is added.`,
].join('\n');
writeFileSync(join(OUT, `${p.name}.txt`), desc + '\n');
rmSync(dir, { recursive: true, force: true });
console.log(`\n${out}: ${stamp(frameNo / FPS)} long, filmed in ${Math.round((Date.now() - t0) / 60_000)} min. Description with chapters: ${join(OUT, `${p.name}.txt`)}`);
