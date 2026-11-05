// Films the scout's best moments in the real game and joins them into one
// long video (16:9, for YouTube). docs/social/VIDEOS.md §3.6.
//
//   npm run build && npx vite preview --port 4173        (the game, in another terminal)
//   node scripts/videos/render.mjs best  [--minutes 8] [--per-match 3] [--teams 6]
//   node scripts/videos/render.mjs match --seed 4         (one whole match's highlights, to the winner)
//   options: --scout store/videos/scout  --out store/videos  --music track.mp3
//            --max-teams 3 (only small matches)  --name duels  --zoom 1.35
//            --title "Best shots"  --thumb "BEST|SHOTS" (the thumbnail's two lines)
//
// Out: <name>.mp4 (1920×1080), <name>-thumb.jpg (the YouTube thumbnail, from the
// best moment) and <name>.txt (title, description with chapters, and tags).
//
// Each frame is drawn on a virtual clock (site/capture/virtual-clock.js), so the
// video is smooth however slow the computer is. Between moments the replay is
// fast-forwarded without filming. Captions and title cards are drawn in the page
// in the game's own fonts. Sound: the game makes its sound live, which can't be
// filmed on a virtual clock, so the video is silent unless --music is given
// (only the game's own tracks or YouTube's Audio Library: docs/social/README.md).
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
const SCOUT = opt('scout', 'store/videos/scout');
const OUT = opt('out', 'store/videos');
const GAME = process.env.GAME_URL ?? 'http://localhost:4173/';
// Laid out as a 1280×720 screen and drawn 1.5× (1920×1080): the game's text and
// tardis come out the size a viewer expects, not tiny as on a big monitor.
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const SCALE = Number(opt('scale', '1.5'));
/** Closer than the game's own camera: the tardis fill more of the picture. */
const ZOOM = Number(opt('zoom', '1.35'));
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

let frameNo = 0;
let dir = '';
let cdp = null;

/** Film `n` frames, calling `each(i)` in the page before each one (and `at[i]()` after drawing frame i, before it's kept). */
async function film(page, n, each = '', at = {}) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(([ms, src, i, n, zoom]) => {
      if (src) new Function('i', 'n', src)(i, n);
      const r = window.__tardi.renderer;
      r.camera.zoom = r.defaultZoom() * zoom;
      window.__virt.step(ms);
    }, [FRAME_MS, each, i, n, ZOOM]);
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
  cdp = await ctx.newCDPSession(page);
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

const out = join(OUT, `${p.name}.mp4`);
const music = opt('music', '');
const input = ['-framerate', String(FPS), '-i', join(dir, '%06d.jpg')];
const audio = music && existsSync(music) ? ['-stream_loop', '-1', '-i', music, '-shortest', '-af', `afade=t=out:st=${Math.max(0, frameNo / FPS - 3)}:d=3`, '-c:a', 'aac', '-b:a', '160k'] : ['-an'];
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, ...audio, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
// YouTube chapters: paste these into the description (the first must be 0:00).
const stamp = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const most = Math.max(...p.parts.map((g) => g.m.teams));
const ytTitle = opt(
  'yt-title',
  mode === 'match'
    ? `One whole ${most}-team match, start to finish | TardiGeddon`
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
  `${intro} Every match here was played by the computer, so you can see what the CPU can do: up to 10 teams on one map, 29 weapons, and maps you can blow to pieces.`,
  '',
  '▶ Play free in your browser (no download, no ads): https://tardigeddon.com/play',
  '📱 Also on Android, iPhone and iPad.',
  '💬 Discord: https://tardigeddon.com/discord',
  '',
  'Chapters:',
  ...chapters.map((c, i) => `${stamp(i === 0 ? 0 : c.at)} ${c.title}`),
  '',
  '#TardiGeddon #indiegame #browsergame',
  '',
  'Tags: TardiGeddon, tardigrade game, water bear, artillery game, turn based strategy, browser game, free game, indie game, local multiplayer, CPU vs CPU',
  '',
  `Thumbnail: ${p.name}-thumb.jpg. Made for kids: No. Altered or synthetic content: No (real gameplay footage).`,
].join('\n');
writeFileSync(join(OUT, `${p.name}.txt`), desc + '\n');
rmSync(dir, { recursive: true, force: true });
console.log(`\n${out}: ${stamp(frameNo / FPS)} long, filmed in ${Math.round((Date.now() - t0) / 60_000)} min. Description with chapters: ${join(OUT, `${p.name}.txt`)}`);
