// Films the scout's best moments in the real game and joins them into one
// long video (16:9, for YouTube). docs/social/VIDEOS.md §3.6.
//
//   npm run build && npx vite preview --port 4173        (the game, in another terminal)
//   node scripts/videos/render.mjs best  [--minutes 8] [--per-match 3] [--teams 6]
//   node scripts/videos/render.mjs match --seed 4         (one whole match's highlights, to the winner)
//   options: --scout store/videos/scout  --out store/videos  --music track.mp3  --size 1920x1080
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
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
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
    return { title: `${m.teams} teams · ${MAPS[m.map] ?? m.map} · ${STYLES[m.style] ?? m.style}`, name: `match-${m.seed}`, parts: [{ m, moments: ms, ending: true }] };
  }
  const target = Number(opt('minutes', '8')) * 60;
  const perMatch = Number(opt('per-match', '3'));
  const minTeams = Number(opt('teams', '2'));
  const all = matches().filter((m) => m.teams >= minTeams);
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
  return { title: minTeams >= 6 ? 'Pure mayhem' : 'Best shots', name: `best-${new Date().toISOString().slice(0, 10)}`, parts: groups };
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

const OVERLAY_CSS = `
  .replay-bar, .watching-badge, .toast { display: none !important; }
  #vid-fade { position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none; z-index: 99998; }
  #vid-card { position: fixed; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 2vh;
    background: radial-gradient(circle at 50% 40%, #3b2a4a, #1a1020); color: #fff; z-index: 99997; text-align: center; font-family: var(--title); }
  #vid-card .big { font-size: 9vh; color: #ffd84a; text-shadow: 0 0.6vh 0 #2b1b24; }
  #vid-card .small { font-size: 4vh; font-family: var(--body); opacity: 0.9; }
  #vid-cap { position: fixed; left: 50%; top: 9vh; transform: translateX(-50%); padding: 1.2vh 2.6vh; border-radius: 1.4vh;
    background: rgba(43, 27, 36, 0.82); color: #fff; font: 3.6vh var(--title); z-index: 99996; display: none; white-space: nowrap; }
  #vid-tag { position: fixed; left: 50%; transform: translateX(-50%); bottom: 1.5vh; padding: 0.8vh 1.6vh; border-radius: 1vh; background: rgba(43, 27, 36, 0.7);
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
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
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
    for (const id of ['vid-fade', 'vid-card', 'vid-cap', 'vid-tag']) {
      const d = document.createElement('div');
      d.id = id;
      document.body.append(d);
    }
    document.getElementById('vid-card').innerHTML = '<div class="big"></div><div class="small"></div>';
    document.getElementById('vid-tag').textContent = 'tardigeddon.com/play';
  }, OVERLAY_CSS);
  await page.evaluate(() => window.__virt.freeze());
  return { ctx, page };
}

let frameNo = 0;
let dir = '';
let cdp = null;

/** Film `n` frames, calling `each(i)` in the page before each one. */
async function film(page, n, each = '') {
  for (let i = 0; i < n; i++) {
    await page.evaluate(([ms, src, i, n]) => {
      if (src) new Function('i', 'n', src)(i, n);
      window.__virt.step(ms);
    }, [FRAME_MS, each, i, n]);
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

async function filmMoment(page, x, last) {
  await seek(page, x.from);
  const frames = Math.round(((x.to - x.from) / TICK) * FPS) + (last ? FPS * 4 : 0);
  await page.evaluate((label) => {
    const c = document.getElementById('vid-cap');
    c.textContent = label;
    c.style.display = 'block';
  }, x.label);
  // Caption for the first 3 seconds; a short fade at each end.
  await film(page, frames, `${FADE_IN} if (i === ${FPS * 3}) document.getElementById('vid-cap').style.display = 'none'; ${FADE_OUT}`);
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

for (const [gi, g] of p.parts.entries()) {
  const { ctx, page } = await openReplay(g.m.replay);
  cdp = await ctx.newCDPSession(page);
  if (gi === 0) await card(page, 'TardiGeddon', p.title, 90);
  chapters.push({ at: frameNo / FPS, title: `${g.m.teams} teams · ${MAPS[g.m.map] ?? g.m.map} · ${STYLES[g.m.style] ?? g.m.style}` });
  if (mode === 'best') await card(page, `${g.m.teams} teams`, `${MAPS[g.m.map] ?? g.m.map} · ${STYLES[g.m.style] ?? g.m.style}`, 60);
  for (const [i, x] of g.moments.entries()) {
    await filmMoment(page, x, g.ending && i === g.moments.length - 1);
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
const desc = [`${p.title}: TardiGeddon, the free turn-based artillery game starring tardigrades. Every match here was played by the computer.`, '', '▶ Play free: https://tardigeddon.com/play', '', ...chapters.map((c, i) => `${stamp(i === 0 ? 0 : c.at)} ${c.title}`), '', '#TardiGeddon #indiegame #browsergame'].join('\n');
writeFileSync(join(OUT, `${p.name}.txt`), desc + '\n');
rmSync(dir, { recursive: true, force: true });
console.log(`\n${out}: ${stamp(frameNo / FPS)} long, filmed in ${Math.round((Date.now() - t0) / 60_000)} min. Description with chapters: ${join(OUT, `${p.name}.txt`)}`);
