// Captures the website's screenshots and clips from the real game.
//
//   npm run build && npx vite preview --port 4173   (the game)
//   npm run server                                   (only for the online shots)
//   node site/capture/capture-media.mjs [scene ...]  (all scenes if none given)
//
// Clips are recorded frame by frame on a virtual clock (virtual-clock.js), so
// they are smooth even on a slow headless browser. Raw frames go to
// $CAPTURE_TMP (default: a temp folder); the encoded files land in
// site/public/media/. Needs ffmpeg with libx264 and libwebp.
// Set PW_CHROMIUM_PATH to use a preinstalled Chromium.

import { chromium, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../public/media');
const TMP = process.env.CAPTURE_TMP ?? join(tmpdir(), 'tardigeddon-capture');
const GAME = process.env.GAME_URL ?? 'http://localhost:4173/';
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const CLOCK = readFileSync(join(here, 'virtual-clock.js'), 'utf8');
const ROPE_BOT = readFileSync(join(here, 'rope-bot.js'), 'utf8');

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

/** Each page's device pixel ratio, for screenshots. */
const scale = new WeakMap();

/** Open the game in a fresh page with the virtual clock installed. */
async function open(url, ctxOptions = { viewport: { width: 1280, height: 720 } }, seed) {
  const ctx = await browser.newContext(ctxOptions);
  if (seed !== undefined) await ctx.addInitScript(`window.__seed = ${seed};`);
  await ctx.addInitScript(CLOCK);
  const page = await ctx.newPage();
  scale.set(page, ctxOptions.deviceScaleFactor ?? 1);
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(new URL(url, GAME).href);
  return { ctx, page };
}

/** Wait (real time) for the match to exist, then freeze its clock. */
async function freezeMatch(page) {
  await page.waitForFunction(() => window.__tardi?.world.tick > 5);
  await page.evaluate(() => window.__virt.freeze());
}

/** Advance `frames` frames of `ms` each without capturing (fast-forward). */
const run = (page, frames, ms = FRAME_MS) =>
  page.evaluate(([n, ms]) => { for (let i = 0; i < n; i++) window.__virt.step(ms); }, [frames, ms]);

/** Fast-forward until `cond(world, match)` is true (checked every 100 ms of game time). */
async function until(page, cond, maxSeconds = 120) {
  const ok = await page.evaluate(([src, max]) => {
    const f = new Function(`return (${src})`)();
    for (let i = 0; i < max * 10; i++) {
      const m = window.__tardi;
      if (f(m.world, m)) return true;
      window.__virt.step(50);
      window.__virt.step(50);
    }
    return false;
  }, [cond.toString(), maxSeconds]);
  if (!ok) throw new Error(`timed out waiting for ${cond}`);
}

/** The human's turn has started and they can aim. */
const humanAiming = (w) => w.turn.phase === 'aim' && !w.teams[w.turn.teamIdx].cpu;

/** Press buttons on the match's own input collector, like the keyboard does. */
const input = (page, fn, arg) => page.evaluate(fn, arg);

/** Record `frames` video frames into TMP/<name>/. */
async function record(page, name, frames) {
  const dir = join(TMP, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  for (let i = 0; i < frames; i++) {
    // window.__bot, if a scene installed one, plays the human's turn frame by frame.
    await page.evaluate((ms) => {
      window.__bot?.();
      window.__virt.step(ms);
    }, FRAME_MS);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(dir, `${String(i).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
  }
  console.log(`  recorded ${frames} frames of ${name}`);
  return dir;
}

/** Encode a frame folder as a muted looping H.264 clip plus a WebP poster. */
function encode(name, dir, { from = 0, to, poster = 0, width = 1280 } = {}) {
  const pattern = join(dir, '%04d.png');
  const range = ['-start_number', String(from), '-framerate', String(FPS), '-i', pattern];
  const count = to === undefined ? [] : ['-frames:v', String(to - from)];
  const scale = ['-vf', `scale=${width}:-2:flags=lanczos`];
  const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  ff([...range, ...count, ...scale, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, `${name}.mp4`)]);
  still(`${name}-poster`, frame(dir, poster), width);
  console.log(`  encoded ${name}`);
}

const frame = (dir, n) => join(dir, `${String(n).padStart(4, '0')}.png`);

/** Save one PNG as an optimised WebP. */
function still(name, png, width = 1600) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-vf', `scale='min(${width},iw)':-2:flags=lanczos`, '-c:v', 'libwebp', '-quality', '82', join(OUT, `${name}.webp`)]);
}

/** Screenshot the page, or just the element matching `selector` (with a
 *  margin of sky round it), and save it as WebP. Uses DevTools directly, as
 *  Playwright's screenshot waits for a frame that a frozen clock never gives. */
async function screenshot(page, name, width, selector) {
  const png = join(TMP, `${name}.png`);
  const dpr = scale.get(page) ?? 1;
  const pad = 24;
  const b = selector ? await page.locator(selector).boundingBox() : null;
  const clip = b
    ? { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
    : { x: 0, y: 0, ...page.viewportSize() };
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: dpr } });
  await cdp.detach();
  // That capture drops the emulated pixel ratio: put it back.
  await page.setViewportSize(page.viewportSize());
  writeFileSync(png, Buffer.from(data, 'base64'));
  still(name, png, width);
  console.log(`  saved ${name}.webp`);
}

/** Desktop stills are taken at 1.5x so they stay sharp on high-DPI screens. */
const DESKTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 };

/** Zoom the game camera in (the default shows most of the map, which is tiny in a clip). */
const zoom = (page, z) => page.evaluate((z) => (window.__tardi.renderer.camera.zoom = z), z);

/** Pick the enemy tardi with the most others (alive) nearby: the juiciest target. */
const bestTarget = (page) =>
  page.evaluate(() => {
    const w = window.__tardi.world;
    const me = w.turn.teamIdx;
    const alive = w.tardis.filter((t) => t.alive);
    const score = (t) => alive.filter((o) => Math.hypot(o.x - t.x, o.y - t.y) < 120).length;
    return alive.filter((t) => t.team !== me).sort((a, b) => score(b) - score(a))[0];
  });

/** Choose a weapon and (for targeted ones) a target, then tap Fire. */
async function fire(page, weapon, target) {
  await input(page, ([weapon, target]) => {
    const m = window.__tardi;
    m.world.teams[m.world.turn.teamIdx].ammo[weapon] = 1;
    m.input.command({ t: 'weapon', id: weapon });
    if (target) m.input.command({ t: 'target', x: Math.round(target.x), y: Math.round(target.y) });
  }, [weapon, target]);
  await run(page, 6);
  await input(page, () => window.__tardi.input.hold('capture', 16, true));
  await run(page, 2);
  await input(page, () => window.__tardi.input.hold('capture', 16, false));
}

/** Stage a scene: move the enemy tardis into a huddle round `t` (they drop in and settle). */
async function huddle(page, t, hp) {
  await page.evaluate(([t, hp]) => {
    const w = window.__tardi.world;
    const enemies = w.tardis.filter((x) => x.alive && x.team !== w.turn.teamIdx);
    enemies.forEach((x, i) => {
      x.x = t.x + (i - (enemies.length - 1) / 2) * 26;
      x.y = t.y - 60;
      x.vx = x.vy = 0;
      x.airborne = true;
      if (hp) x.hp = hp;
    });
  }, [t, hp]);
  await run(page, 75);
}

const SCENES = {
  /** Concrete Tun smashing down through a huddle of enemies. */
  async tun() {
    const { ctx, page } = await open('?autostart=cpu&players=2');
    await freezeMatch(page);
    await until(page, humanAiming);
    const t = await bestTarget(page);
    await huddle(page, t);
    await zoom(page, 1.7);
    await fire(page, 'tun', t);
    const dir = await record(page, 'tun', 210);
    encode('clip-tun', dir, { from: 44, to: 130, poster: 62 });
    still('shot-crater', frame(dir, 195));
    // Social preview (Open Graph): 1200x630 JPEG of the slam.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', frame(dir, 62), '-vf', 'crop=1280:672:0:24,scale=1200:630', '-q:v', '3', join(OUT, 'og-image.jpg')]);
    await ctx.close();
  },

  /** A Raindrop Strike finishes off the last enemies, then the winners dance in the confetti. */
  async victory() {
    const { ctx, page } = await open('?autostart=cpu&players=2');
    await freezeMatch(page);
    await until(page, humanAiming);
    const t = await bestTarget(page);
    await huddle(page, t, 1);
    await zoom(page, 1.7);
    await fire(page, 'airstrike', t);
    const dir = await record(page, 'victory', 540);
    encode('clip-victory', dir, { from: 40, to: 260, poster: 200 }); // stops before the results panel
    await ctx.close();
  },

  /** Rope Race: a scripted player (rope-bot.js) swings from rope to rope towards the flag.
   *  Courses are random, so try a few (seeded, so the best one can be replayed exactly). */
  async rope() {
    const FRAMES = 360;
    const start = async (seed) => {
      const { ctx, page } = await open('', undefined, seed);
      try {
        await page.selectOption('select[name=style]', 'roperace');
        await page.locator('.slot.cpu .slot-main').click(); // both teams human: the bot plays
        await page.getByRole('button', { name: 'Play', exact: true }).click();
        await freezeMatch(page);
        await until(page, humanAiming);
      } catch (e) {
        await ctx.close();
        throw e;
      }
      await zoom(page, 1.4);
      await page.evaluate(ROPE_BOT);
      return { ctx, page };
    };
    let best = { seed: 1, score: -Infinity };
    for (let seed = 1; seed <= 12; seed++) {
      const { ctx, page } = await start(seed).catch((e) => ({ error: e }));
      if (!page) {
        console.log(`  seed ${seed}: skipped`);
        continue;
      }
      // Score a run by how far it got and how much of it was spent swinging.
      const score = await page.evaluate((n) => {
        let roped = 0;
        let x0 = null;
        let far = 0;
        for (let i = 0; i < n; i++) {
          window.__bot();
          window.__virt.step(1000 / 30);
          const w = window.__tardi.world;
          const t = w.tardis.find((x) => x.id === w.turn.activeTardi);
          if (!t || w.turn.phase !== 'aim') break;
          x0 ??= t.x;
          far = Math.max(far, t.x - x0);
          if (t.rope) roped++;
        }
        return far + roped * 2;
      }, FRAMES);
      console.log(`  seed ${seed}: ${Math.round(score)}`);
      if (score > best.score) best = { seed, score };
      await ctx.close();
    }
    const { ctx, page } = await start(best.seed);
    const dir = await record(page, 'rope', FRAMES);
    // The first attempt: from the start sign to (nearly) the flag.
    encode('clip-rope', dir, { from: 20, to: 150, poster: 75 });
    await ctx.close();
  },

  /** The menus: main menu, online, a room lobby and quick play. */
  async menus() {
    const TALL = { viewport: { width: 1000, height: 1100 }, deviceScaleFactor: 2 };
    const { ctx, page } = await open('', TALL);
    await page.locator('.title').waitFor();
    await page.waitForTimeout(800);
    await screenshot(page, 'shot-menu', 900, '.menu-card');
    await page.getByRole('button', { name: 'Play online' }).click();
    await page.getByRole('button', { name: /Quick play/ }).waitFor();
    await screenshot(page, 'shot-online', 900, '.menu-card');
    await page.getByRole('button', { name: 'Create a room' }).click();
    await page.getByRole('button', { name: 'Start match' }).waitFor();
    await page.getByRole('button', { name: '+ Add CPU' }).click();
    await page.getByRole('button', { name: '+ Add CPU' }).click();
    await page.waitForTimeout(500);
    await screenshot(page, 'shot-lobby', 900, '.menu-card');
    await ctx.close();

    const quick = await open('', TALL);
    await quick.page.getByRole('button', { name: 'Play online' }).click();
    await quick.page.getByRole('button', { name: /Quick play/ }).click();
    await quick.page.getByRole('button', { name: 'Play a CPU instead' }).waitFor();
    await quick.page.waitForTimeout(500);
    await screenshot(quick.page, 'shot-quickplay', 900, '.menu-card');
    await quick.ctx.close();
  },

  /** In a match: aiming with the power bar filling, and the weapon panel. */
  async aim() {
    const { ctx, page } = await open('?autostart=cpu&players=4', DESKTOP);
    await freezeMatch(page);
    await until(page, humanAiming);
    await zoom(page, 1.6);
    await input(page, () => {
      const m = window.__tardi;
      m.input.hold('capture', 4, true); // aim up a bit
    });
    await run(page, 10);
    await input(page, () => {
      const m = window.__tardi;
      m.input.hold('capture', 4, false);
      m.input.hold('fire', 16, true);
    });
    await run(page, 20);
    await screenshot(page, 'shot-aim');
    await input(page, () => window.__tardi.input.hold('fire', 16, false));
    await run(page, 60);
    await until(page, humanAiming);
    await page.keyboard.press('Tab');
    await run(page, 10);
    await screenshot(page, 'shot-weapons');
    await ctx.close();
  },

  /** The phone layout with touch controls. */
  async phone() {
    const { ctx, page } = await open('?autostart=cpu&touch', { ...devices['Pixel 7 landscape'], deviceScaleFactor: 2 });
    await freezeMatch(page);
    await until(page, humanAiming);
    await run(page, 30);
    await screenshot(page, 'shot-phone', 1400);
    await ctx.close();
  },
};

const wanted = process.argv.slice(2);
for (const name of wanted.length ? wanted : Object.keys(SCENES)) {
  console.log(name);
  await SCENES[name]();
}
await browser.close();
