// Films the scout's best moments in the real game and joins them into one
// long video (16:9, for YouTube). docs/social/VIDEOS.md §3.6.
//
//   npm run build && npx vite preview --port 4173        (the game, in another terminal)
//   node scripts/videos/render.mjs best  [--minutes 8] [--per-match 3] [--teams 6]
//   node scripts/videos/render.mjs match --seed 4         (one whole match's highlights, to the winner)
//   node scripts/videos/render.mjs shorts [--count 8]     (vertical 1080×1920 Shorts / TikTok / Reels: one moment each)
//   options: --scout store/videos/scout  --out store/videos
//            --music game:boss (the default: the game's own tracks, see music.ts list) | track.mp3 | none
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
    const m = load(opt('seed', ''));
    const min = Number(opt('min-score', '120'));
    let ms = m.moments.filter((x) => x.score >= min);
    if (ms.length > 40) ms = [...ms].sort((a, b) => b.score - a.score).slice(0, 40).sort((a, b) => a.from - b.from);
    // Always end on the last shot (the winning one).
    const last = m.moments.at(-1);
    if (last && !ms.includes(last)) ms.push(last);
    return { title: opt('title', `${m.teams} teams · ${MAPS[m.map] ?? m.map} · ${STYLES[m.style] ?? m.style}`), name: opt('name', `match-${m.seed}`), parts: [{ m, moments: ms, ending: true }] };
  }
  const target = Number(opt('minutes', '8')) * 60;
  const perMatch = Number(opt('per-match', '3'));
  const minTeams = Number(opt('teams', '2'));
  const maxTeams = Number(opt('max-teams', '10'));
  const all = matches().filter((m) => m.teams >= minTeams && m.teams <= maxTeams);
  const pool = all.flatMap((m) => m.moments.map((x) => ({ m, x }))).sort((a, b) => b.x.score - a.x.score);
  const byWeapon = new Map();
  const byMatch = new Map();
  let seconds = 0;
  const chosen = [];
  for (const { m, x } of pool) {
    if (seconds >= target) break;
    if ((byMatch.get(m.seed) ?? 0) >= perMatch) continue;
    if ((byWeapon.get(x.weapon) ?? 0) >= Math.max(2, Math.ceil(target / 90))) continue;
    chosen.push({ m, x });
    byMatch.set(m.seed, (byMatch.get(m.seed) ?? 0) + 1);
    byWeapon.set(x.weapon, (byWeapon.get(x.weapon) ?? 0) + 1);
    seconds += (x.to - x.from) / TICK + 3;
  }
  // Grouped by match (filmed in order within each), building up to the best one at the end.
  const groups = [...new Set(chosen.map((c) => c.m))].map((m) => ({
    m,
    moments: chosen.filter((c) => c.m === m).map((c) => c.x).sort((a, b) => a.from - b.from),
  }));
  groups.sort((a, b) => Math.max(...a.moments.map((x) => x.score)) - Math.max(...b.moments.map((x) => x.score)));
  const title = opt('title', minTeams >= 6 ? 'Pure mayhem' : maxTeams <= 3 ? 'One on one' : 'Best shots');
  return { title, name: opt('name', `best-${new Date().toISOString().slice(0, 10)}`), parts: groups };
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

const OVERLAY_CSS = `
  .replay-bar, .watching-badge, .toast { display: none !important; }
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
  #vid-card .small { font-size: 4vh; font-family: var(--body); opacity: 0.9; }
  #vid-cap { position: fixed; left: 50%; top: 9vh; transform: translateX(-50%); padding: 1.2vh 2.6vh; border-radius: 1.4vh;
    background: rgba(43, 27, 36, 0.82); color: #fff; font: 3.6vh var(--title); z-index: 99996; display: none; white-space: nowrap; }
  @media (orientation: portrait) {
    #vid-cap { top: 13vh; font-size: 3.2vh; white-space: normal; width: 86vw; text-align: center; line-height: 1.25; }
    #vid-tag { right: auto !important; left: 50%; transform: translateX(-50%); top: 6.5vh !important; }
    #vid-card .big { font-size: 7vh; }
    #vid-card .small { font-size: 3.2vh; }
  }
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

async function openReplayOnce(replay) {
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
    for (const id of ['vid-fade', 'vid-card', 'vid-cap', 'vid-tag', 'vid-thumb']) {
      const d = document.createElement('div');
      d.id = id;
      document.body.append(d);
    }
    document.getElementById('vid-card').innerHTML = '<div class="big"></div><div class="small"></div>';
    document.getElementById('vid-tag').textContent = 'tardigeddon.com/play';
    document.getElementById('vid-thumb').innerHTML = '<div class="lines"><div class="l1"></div><div class="l2"></div></div><div class="brand">TardiGeddon</div>';
  }, OVERLAY_CSS);
  await page.evaluate(() => window.__virt.freeze());
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
    await page.evaluate(([ms, src, i, n, zoom, abs]) => {
      if (src) new Function('i', 'n', src)(i, n);
      const r = window.__tardi.renderer;
      r.camera.zoom = abs || r.defaultZoom() * zoom;
      window.__virt.step(ms);
    }, [ms, each, i, n, ZOOM, ZOOM_ABS]);
    if (at[i]) await at[i]();
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    writeFileSync(join(dir, `${String(frameNo++).padStart(6, '0')}.jpg`), Buffer.from(data, 'base64'));
  }
}

const FADE_IN = `document.getElementById('vid-fade').style.opacity = String(Math.max(0, 1 - i / ${FADE}));`;
const FADE_OUT = `if (i >= n - ${FADE}) document.getElementById('vid-fade').style.opacity = String((i - (n - ${FADE})) / ${FADE});`;

/** A title card for `frames` frames. */
async function card(page, big, small, frames = 75) {
  await page.evaluate(([big, small]) => {
    const c = document.getElementById('vid-card');
    c.querySelector('.big').textContent = big;
    c.querySelector('.small').textContent = small;
    c.style.display = 'flex';
  }, [big, small]);
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
  // Closer still for the thumbnail, then back.
  await page.evaluate(() => {
    const r = window.__tardi.renderer;
    r.camera.zoom = r.defaultZoom() * 1.9;
    window.__virt.step(0);
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
    r.camera.zoom = r.defaultZoom() * zoom;
    window.__virt.step(0);
  }, ZOOM);
  thumbDone = true;
}

function thumbLines() {
  const most = Math.max(...p.parts.map((g) => g.m.teams));
  if (mode === 'match') return [`${most} TEAMS`, 'ONE MATCH'];
  if (p.title === 'Pure mayhem') return [`${most} TEAMS`, 'PURE MAYHEM'];
  return p.title.toUpperCase().split(' ').length > 1 ? [p.title.toUpperCase().split(' ').slice(0, -1).join(' '), p.title.toUpperCase().split(' ').at(-1)] : [p.title.toUpperCase(), ''];
}

async function filmMoment(page, x, last, thumb) {
  await seek(page, x.from);
  const frames = Math.round(((x.to - x.from) / TICK) * FPS) + (last ? FPS * 4 : 0);
  // The thumbnail: a moment after the big hit lands (older scout files: near the end).
  const peak = x.peak ?? x.to - 2 * TICK;
  const hitFrame = Math.max(0, Math.min(frames - 1, Math.round(((peak - x.from) / TICK + 0.15) * FPS)));
  const at = thumb ? { [hitFrame]: () => thumbnail(page) } : {};
  await page.evaluate((label) => {
    const c = document.getElementById('vid-cap');
    c.textContent = label;
    c.style.display = 'block';
  }, x.label);
  // Caption for the first 3 seconds; a short fade at each end.
  await film(page, frames, `${FADE_IN} if (i === ${FPS * 3}) document.getElementById('vid-cap').style.display = 'none'; ${FADE_OUT}`, at);
  await page.evaluate(() => (document.getElementById('vid-cap').style.display = 'none'));
}

/** Join the frames in `dir` into `<OUT>/<name>.mp4`, with music (game:<id>, a file, or none). */
function encode(name, musicOpt) {
  const out = join(OUT, `${name}.mp4`);
  let music = musicOpt;
  const length = frameNo / FPS;
  if (musicOpt.startsWith('game:')) {
    music = join(dir, 'music.wav');
    console.log(`  music: the game's "${musicOpt.slice(5)}" track`);
    execFileSync('npx', ['tsx', join(here, 'music.ts'), musicOpt.slice(5), String(Math.ceil(length) + 2), music], { stdio: 'inherit' });
  }
  const input = ['-framerate', String(FPS), '-i', join(dir, '%06d.jpg')];
  // Even loudness (YouTube's -14 LUFS), a fade in and a fade out.
  const audio =
    music !== 'none' && existsSync(music)
      ? ['-stream_loop', '-1', '-i', music, '-shortest', '-af', `loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:d=${SHORTS ? 0.3 : 1},afade=t=out:st=${Math.max(0, length - (SHORTS ? 1.5 : 3))}:d=${SHORTS ? 1.5 : 3}`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000']
      : ['-an'];
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, ...audio, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  return out;
}

if (SHORTS) {
  await shorts();
  process.exit(0);
}

/**
 * Shorts: the best moments, one per match and at most two of a weapon. Each is
 * the moment (starting on the action), the hit again in slow motion, and a
 * "Play free" card: 15 to 25 seconds, with one of the game's tracks.
 */
async function shorts() {
  const count = Number(opt('count', '8'));
  const minTeams = Number(opt('teams', '2'));
  const maxTeams = Number(opt('max-teams', '10'));
  const tracks = opt('music', 'game:boss,game:chiptune,game:disco,game:classic,game:daybreak,game:shanty').split(',');
  const pool = matches()
    .filter((m) => m.teams >= minTeams && m.teams <= maxTeams)
    .flatMap((m) => m.moments.map((x) => ({ m, x })))
    .sort((a, b) => b.x.score - a.x.score);
  const picked = [];
  const used = new Set();
  const weapons = new Map();
  for (const c of pool) {
    if (picked.length >= count) break;
    if (used.has(c.m.seed) || (weapons.get(c.x.weapon) ?? 0) >= 2) continue;
    picked.push(c);
    used.add(c.m.seed);
    weapons.set(c.x.weapon, (weapons.get(c.x.weapon) ?? 0) + 1);
  }
  if (!picked.length) {
    console.error('Nothing to film: run the scout first (npx tsx scripts/videos/scout.ts).');
    process.exit(1);
  }
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
    const t0 = Date.now();
    const where = `${m.teams} teams · ${MAPS[m.map] ?? m.map}`;
    // 1. The moment, from just before the shot, with the hook on top.
    let { ctx, page } = await openReplay(m.replay);
    cdp = await screenSession(ctx, page);
    await seek(page, Math.max(x.from, (x.peak ?? x.to) - 6 * TICK));
    const start = await page.evaluate(() => window.__tardi.world.tick);
    const frames = Math.round(((x.to - start) / TICK) * FPS);
    await page.evaluate((label) => {
      const c = document.getElementById('vid-cap');
      c.textContent = label;
      c.style.display = 'block';
    }, `${x.label} 💥 ${where}`);
    await film(page, frames, `document.getElementById('vid-fade').style.opacity = String(Math.max(0, 1 - i / 4));`);
    await ctx.close();
    // 2. The hit again, at half speed.
    ({ ctx, page } = await openReplay(m.replay));
    cdp = await screenSession(ctx, page);
    const peak = x.peak ?? x.to - 2 * TICK;
    await seek(page, Math.max(0, peak - 1.2 * TICK));
    await page.evaluate(() => {
      const c = document.getElementById('vid-cap');
      c.textContent = 'Again, slowly 🐢';
      c.style.display = 'block';
    });
    await film(page, FPS * 4, FADE_IN, {}, FRAME_MS / 2);
    // 3. The end card.
    await page.evaluate(() => (document.getElementById('vid-cap').style.display = 'none'));
    await card(page, 'Play free', 'tardigeddon.com/play', 60);
    await ctx.close();
    const out = encode(name, tracks[n % tracks.length]);
    const secs = Math.round(frameNo / FPS);
    // Words for posting: the same text suits YouTube Shorts, TikTok, Reels and Facebook.
    const article = m.teams === 8 ? 'an' : 'a';
    const title = `${x.label.replace(', own goal!', ' (own goal!)')} in ${article} ${m.teams}-team match 💥`;
    const caption = `${x.label} 💥 ${m.teams} teams, one map. Free turn-based artillery game starring tardigrades. Play free: tardigeddon.com/play`;
    const text = [
      `Title (YouTube Shorts): ${title.slice(0, 90)} #Shorts`,
      '',
      `Caption (TikTok, Reels, Facebook, Shorts description): ${caption}`,
      '',
      'Hashtags: #TardiGeddon #indiegame #gaming #tardigrade #browsergame',
      '',
      `Length: ${secs} s, 1080×1920. Every match is played by the computer. Made for kids: No. Altered or synthetic content: No.`,
    ].join('\n');
    writeFileSync(join(OUT, `${name}.txt`), text + '\n');
    rmSync(dir, { recursive: true, force: true });
    list.push(`${out} (${secs} s): ${x.label}, ${where}`);
    console.log(`  ${name}: ${x.label}, ${where} (${secs} s, filmed in ${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  await browser.close();
  console.log(`\n${list.length} shorts:\n${list.join('\n')}`);
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
/** The best moment of the video gets the thumbnail. */
const best = p.parts.flatMap((g) => g.moments).reduce((a, b) => (b.score > a.score ? b : a));

for (const [gi, g] of p.parts.entries()) {
  const { ctx, page } = await openReplay(g.m.replay);
  cdp = await screenSession(ctx, page);
  if (gi === 0) await card(page, 'TardiGeddon', p.title, 90);
  chapters.push({ at: frameNo / FPS, title: `${g.m.teams} teams · ${MAPS[g.m.map] ?? g.m.map} · ${STYLES[g.m.style] ?? g.m.style}` });
  if (mode === 'best') await card(page, `${g.m.teams} teams`, `${MAPS[g.m.map] ?? g.m.map} · ${STYLES[g.m.style] ?? g.m.style}`, 60);
  for (const [i, x] of g.moments.entries()) {
    await filmMoment(page, x, g.ending && i === g.moments.length - 1, x === best && !thumbDone);
    console.log(`  match ${g.m.seed}: ${x.label} (${frameNo} frames, ${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  if (g.ending && g.m.winner) await card(page, `${g.m.winner} win!`, `${g.m.teams} teams · ${MAPS[g.m.map] ?? g.m.map}`, 75);
  if (gi === p.parts.length - 1) await card(page, 'Play free', 'tardigeddon.com/play', 120);
  await ctx.close();
}
await browser.close();

// Music: the game's own tracks by default (game:<id>, rendered by music.ts), a file of
// your own (licensed for this), or none.
const out = encode(p.name, opt('music', `game:${mode === 'match' ? 'disco' : p.title === 'One on one' ? 'classic' : 'boss'}`));
// YouTube chapters: paste these into the description (the first must be 0:00).
const stamp = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const most = Math.max(...p.parts.map((g) => g.m.teams));
const ytTitle = opt(
  'yt-title',
  mode === 'match'
    ? `${most} teams, 1 winner: a whole match in ${Math.max(1, Math.round(frameNo / FPS / 60))} minutes | TardiGeddon`
    : p.title === 'Pure mayhem'
      ? `${most} teams, 1 winner: pure tardigrade mayhem | TardiGeddon`
      : `${p.title}: the best shots | TardiGeddon`,
);
const intro =
  mode === 'match'
    ? `${most} teams of tardigrades, one map, one winner: the best moments of a whole match of TardiGeddon, the free turn-based artillery game.`
    : `${p.title}: the best moments from ${p.parts.length} matches of TardiGeddon, the free turn-based artillery game starring tardigrades.`;
const desc = [
  `Title: ${ytTitle}`,
  '',
  'Description:',
  `${intro} Every match here was played by the computer, so you can see what the CPU can do: ${most > 3 ? 'up to 10 teams on one map' : 'one on one, or three-way'}, 29 weapons, and maps you can blow to pieces.`,
  '',
  '▶ Play free in your browser (no download, no ads): https://tardigeddon.com/play',
  '📱 Also on Android, iPhone and iPad.',
  '💬 Discord: https://tardigeddon.com/discord',
  '',
  // YouTube shows chapters only with three or more.
  ...(chapters.length >= 3 ? ['Chapters:', ...chapters.map((c, i) => `${stamp(i === 0 ? 0 : c.at)} ${c.title}`), ''] : []),
  '#TardiGeddon #indiegame #browsergame',
  '',
  'Tags: TardiGeddon, tardigrade game, water bear, artillery game, turn based strategy, browser game, free game, indie game, local multiplayer, CPU vs CPU',
  '',
  `Thumbnail: ${p.name}-thumb.jpg. Made for kids: No. Altered or synthetic content: No (real gameplay footage).`,
].join('\n');
writeFileSync(join(OUT, `${p.name}.txt`), desc + '\n');
rmSync(dir, { recursive: true, force: true });
console.log(`\n${out}: ${stamp(frameNo / FPS)} long, filmed in ${Math.round((Date.now() - t0) / 60_000)} min. Description with chapters: ${join(OUT, `${p.name}.txt`)}`);
