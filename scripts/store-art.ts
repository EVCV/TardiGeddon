// The store listings' pictures, in every language the game speaks: designed
// screenshots (a headline, a real moment from the game in a frame, the mascot)
// for Google Play and the App Store, and Google Play's feature graphic.
// docs/STORE_LISTING.md has the plan and the listing text.
//
//   npm run build && npx vite preview --port 4173
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx scripts/store-art.ts [lang ...]   (all if none given)
//
// Writes store/listing/<lang>/: google-play/ (phone 1920×1080, tablet
// 2560×1600, feature graphic 1024×500) and app-store/ (iPhone 2622×1206,
// iPad 2752×2064), JPEG. The moments are played on the real game (GAME_URL,
// default the preview above), with its own text in that language.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { mascotSvg } from '../src/ui/mascot';
import { CAPTIONS, LANGS, type Lang, type Shot } from '../store/listing/captions';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.GAME_URL ?? 'http://localhost:4173/';
const font = (file: string) => readFileSync(join(root, 'node_modules', '@fontsource', file)).toString('base64');

// Each picture's moment, its colours and where the mascot peeks in.
const SHOTS: { id: Shot; bg: [string, string]; team: number; hat: string }[] = [
  { id: 'battle', bg: ['#4fb3e0', '#d9f3ff'], team: 0xe04848, hat: 'beanie' },
  { id: 'crater', bg: ['#f28b3c', '#ffe1a8'], team: 0x3a7be0, hat: 'hardhat' },
  { id: 'weapons', bg: ['#e04848', '#ffc2b0'], team: 0x3cb34a, hat: 'tophat' },
  { id: 'rope', bg: ['#5b3f8f', '#f0a35e'], team: 0xe0a020, hat: 'cap' },
  { id: 'strike', bg: ['#2f6fb8', '#b8e2ff'], team: 0xe04848, hat: 'propeller' },
  { id: 'teams', bg: ['#3cb34a', '#d6f5b8'], team: 0x3a7be0, hat: 'crown' },
  { id: 'dressup', bg: ['#e0a020', '#fff0b0'], team: 0xe04848, hat: 'flower' },
  { id: 'realms', bg: ['#2b5a8f', '#9fe0ff'], team: 0x3cb34a, hat: 'wizard' },
];

// The sizes each store wants, and the game window the moment is played in.
const SIZES = {
  phone: { w: 1920, h: 1080, game: { width: 800, height: 450, scale: 2.4 }, dir: 'google-play', name: 'phone' },
  tablet: { w: 2560, h: 1600, game: { width: 800, height: 450, scale: 2.4 }, dir: 'google-play', name: 'tablet' },
  iphone: { w: 2622, h: 1206, game: { width: 800, height: 450, scale: 2.4 }, dir: 'app-store', name: 'iphone' },
  ipad: { w: 2752, h: 2064, game: { width: 1024, height: 768, scale: 2 }, dir: 'app-store', name: 'ipad' },
} as const;
type Size = keyof typeof SIZES;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Tardi = { command(c: unknown): void };
const cmd = (p: Page, c: unknown) => p.evaluate((c) => (window as unknown as { __tardi: { input: Tardi } }).__tardi.input.command(c), c);
const inAim = (p: Page) =>
  p.waitForFunction(() => (window as unknown as { __tardi?: { state?: { turn?: { phase?: string } } } }).__tardi?.state?.turn?.phase === 'aim', null, { timeout: 30_000 });

/** Play one moment in the real game and take its picture. */
async function moment(browser: Browser, shot: Shot, lang: Lang, game: { width: number; height: number; scale: number }): Promise<Buffer> {
  const ctx = await browser.newContext({ viewport: { width: game.width, height: game.height }, deviceScaleFactor: game.scale, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  // No tutorial nudge, "New here?" pulse or help bubbles in the pictures.
  await p.addInitScript(() => {
    localStorage.setItem('tardigeddon.tutorial', '1');
    localStorage.setItem('tardigeddon.access', JSON.stringify({ hints: false }));
    // The classic sky world, whatever seasonal event is on.
    localStorage.setItem('tardigeddon.arena', 'classic');
  });
  const q = `lang=${lang}&touch`;
  const start = async (extra: string) => {
    await p.goto(`${BASE}?${q}&autostart=hotseat&${extra}`);
    await inAim(p);
    await sleep(1800);
  };
  const fire = async (aim: number, ms: number) => {
    await cmd(p, { t: 'aim', facing: 1, aim });
    await sleep(300);
    await p.keyboard.down('Space');
    await sleep(ms);
    await p.keyboard.up('Space');
  };
  // Pull the camera back (a share of the way to the whole map), and keep it there.
  const zoomOut = (share: number) =>
    p.evaluate((share) => {
      const g = (window as unknown as { __tardi: { renderer: { camera: { zoom: number; manualUntil: number }; minZoom(): number } } }).__tardi.renderer;
      g.camera.zoom = g.camera.zoom + (g.minZoom() - g.camera.zoom) * share;
      g.camera.manualUntil = performance.now() + 600_000;
    }, share);
  // Move the camera in closer to the action (it still follows the shot).
  const zoomIn = (f: number) =>
    p.evaluate((f) => {
      const g = (window as unknown as { __tardi: { renderer: { camera: { zoom: number } } } }).__tardi.renderer;
      g.camera.zoom *= f;
    }, f);
  // Point the camera at a spot and keep it there.
  const look = (x: number, y: number, zoom: number) =>
    p.evaluate(
      ({ x, y, zoom }) => {
        const cam = (window as unknown as { __tardi: { renderer: { camera: { x: number; y: number; zoom: number; manualUntil: number } } } }).__tardi.renderer.camera;
        Object.assign(cam, { x, y, zoom, manualUntil: performance.now() + 600_000 });
      },
      { x, y, zoom },
    );
  const projectiles = (n: number) =>
    p.waitForFunction((n) => (window as unknown as { __tardi: { state: { projectiles: unknown[] } } }).__tardi.state.projectiles.length > n, n, { timeout: 6000 }).catch(() => {});
  switch (shot) {
    case 'battle':
      await start('players=4&seed=11');
      await zoomIn(1.6);
      await fire(230, 700);
      await projectiles(0);
      await sleep(500);
      break;
    case 'crater':
      // A bazooka into the hillside: caught as it hits, with the hole it leaves.
      await start('players=4&seed=11');
      await zoomIn(1.6);
      await fire(250, 650);
      await projectiles(0);
      await p.waitForFunction(() => (window as unknown as { __tardi: { state: { projectiles: unknown[] } } }).__tardi.state.projectiles.length === 0, null, { timeout: 8000 }).catch(() => {});
      await sleep(150);
      break;
    case 'weapons':
      // Chaos: the superweapons are in play too.
      await start('players=3&style=chaos&seed=5');
      await p.locator('.hud-weapon').click();
      await sleep(600);
      break;
    case 'rope':
      await p.goto(`${BASE}?${q}&autostart=hotseat&style=roperace&seed=1`);
      await inAim(p);
      await sleep(1800);
      await zoomIn(1.4);
      await p.keyboard.down('Space');
      await sleep(80);
      await p.keyboard.up('Space');
      // Climb and swing out over the first pit.
      await p.keyboard.down('ArrowUp');
      await p.keyboard.down('ArrowRight');
      await sleep(1600);
      await p.keyboard.up('ArrowUp');
      await sleep(900);
      break;
    case 'strike': {
      await start('players=4&seed=3');
      await zoomIn(1.3);
      await cmd(p, { t: 'weapon', id: 'airstrike' });
      await sleep(300);
      const target = await p.evaluate(() => {
        const s = (window as unknown as { __tardi: { state: { tardis: { x: number; y: number; team: number; alive: boolean }[]; turn: { teamIdx: number } } } }).__tardi.state;
        const foe = s.tardis.find((t) => t.alive && t.team !== s.turn.teamIdx)!;
        return { x: foe.x, y: foe.y };
      });
      await cmd(p, { t: 'target', ...target });
      await sleep(200);
      await p.keyboard.down('Space');
      await sleep(80);
      await p.keyboard.up('Space');
      await projectiles(2);
      await look(target.x, target.y - 50, 1.4);
      await sleep(1250);
      break;
    }
    case 'teams':
      await p.goto(`${BASE}?${q}`);
      await sleep(1500);
      await p.locator('.setup-btn').click().catch(() => {});
      await p.locator('select[name=players]').selectOption('6');
      await sleep(800);
      break;
    case 'dressup':
      await p.goto(`${BASE}?${q}`);
      await sleep(1500);
      await p.locator('.setup-btn').click().catch(() => {});
      await sleep(400);
      await p.locator('.slot-edit').first().click();
      await sleep(800);
      break;
    case 'realms':
      await start('players=4&map=spires&seed=4');
      await zoomOut(0.55);
      await sleep(600);
      break;
  }
  const png = await p.screenshot();
  await ctx.close();
  return png;
}

const CSS = `
@font-face { font-family: 'Luckiest Guy'; src: url(data:font/woff2;base64,${font('luckiest-guy/files/luckiest-guy-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Nunito'; font-weight: 800; src: url(data:font/woff2;base64,${font('nunito/files/nunito-latin-800-normal.woff2')}) format('woff2'); }
* { box-sizing: border-box; }
html, body { margin: 0; overflow: hidden; }
body { font-family: 'Nunito', 'IPAPGothic', sans-serif; font-weight: 800; color: #2b1b24; }
.card { position: relative; overflow: hidden; }
.card::before { content: ''; position: absolute; inset: 0;
  background: radial-gradient(circle at 18% 12%, rgba(255,255,255,.45), transparent 38%), radial-gradient(circle at 85% 90%, rgba(255,255,255,.25), transparent 40%); }
.dots { position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.18) 2px, transparent 2.5px); background-size: 34px 34px; }
.head { position: absolute; font-family: 'Luckiest Guy', 'IPAPGothic', sans-serif; color: #fff; line-height: .98;
  -webkit-text-stroke: .09em #2b1b24; paint-order: stroke fill; text-shadow: 0 .09em 0 #2b1b24; letter-spacing: .01em; }
.sub { position: absolute; color: #2b1b24; background: #fff8ec; border: .14em solid #2b1b24; border-radius: 999px;
  box-shadow: 0 .16em 0 #2b1b24; padding: .25em .9em; white-space: nowrap; }
.frame { position: absolute; border: 10px solid #2b1b24; border-radius: 34px; overflow: hidden; background: #2b1b24;
  box-shadow: 0 18px 0 #2b1b24, 0 30px 60px rgba(43,27,36,.35); }
.frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
.mascot { position: absolute; filter: drop-shadow(0 10px 0 rgba(43,27,36,.25)); }
.mascot svg { width: 100%; height: auto; display: block; }
.burst { position: absolute; }
/* Japanese: the title font has no kana, so a heavier gothic with a lighter outline. */
.ja .head { font-family: 'IPAPGothic', sans-serif; font-weight: 900; -webkit-text-stroke: .05em #2b1b24; text-shadow: 0 .07em 0 #2b1b24; letter-spacing: 0; word-break: keep-all; }
`;

/** A star burst behind the mascot, in the picture's light colour. */
function burst(color: string): string {
  const pts: string[] = [];
  for (let i = 0; i < 24; i++) {
    const r = i % 2 ? 0.62 : 1;
    const a = (i / 24) * Math.PI * 2;
    pts.push(`${(50 + Math.cos(a) * 50 * r).toFixed(1)},${(50 + Math.sin(a) * 50 * r).toFixed(1)}`);
  }
  return `<svg viewBox="0 0 100 100"><polygon points="${pts.join(' ')}" fill="${color}" stroke="#2b1b24" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

/** One designed screenshot: the headline and subline, the moment in a frame, and the mascot. */
function compose(lang: Lang, size: Size, bg: [string, string], head: string, sub: string, img: string, team: number, hat: string): string {
  const { w, h } = SIZES[size];
  const shot = SIZES[size].game;
  const aspect = shot.width / shot.height;
  let frame: { x: number; y: number; w: number; h: number; rot: number };
  let headBox: string;
  let subBox: string;
  let mascot: { x: number; y: number; w: number };
  if (size === 'iphone') {
    // Very wide: words on the left, the game on the right.
    const fh = h * 0.76;
    const fw = fh * aspect;
    frame = { x: w - fw - h * 0.08, y: (h - fh) / 2 + 10, w: fw, h: fh, rot: 1.5 };
    const col = frame.x - h * 0.16;
    headBox = `left:${h * 0.08}px;top:${h * 0.08}px;width:${col}px;font-size:${h * 0.12}px" data-fit="${h * 0.42}`;
    subBox = `left:${h * 0.08}px;top:${h * 0.53}px;font-size:${h * 0.042}px;max-width:${col}px;white-space:normal" data-fit="${h * 0.14}`;
    mascot = { x: h * 0.1, y: h * 0.77, w: h * 0.21 };
  } else {
    // Words on top, the game below, a little tilted, running off the bottom.
    const top = size === 'ipad' ? h * 0.25 : h * 0.27;
    const fw = w * (size === 'ipad' ? 0.8 : 0.74);
    const fh = fw / aspect;
    frame = { x: w - fw - w * 0.05, y: top, w: fw, h: fh, rot: -1.5 };
    headBox = `left:0;right:0;text-align:center;top:${h * (size === 'ipad' ? 0.045 : 0.05)}px;font-size:${Math.min(w * 0.06, h * 0.11)}px;padding:0 ${w * 0.06}px;white-space:nowrap" data-fit="${h * 0.15}`;
    subBox = `left:50%;transform:translateX(-50%);top:${h * (size === 'ipad' ? 0.155 : 0.175)}px;font-size:${Math.min(w * 0.021, h * 0.04)}px;max-width:${w * 0.9}px" data-fit="${h * 0.09}`;
    const gutter = frame.x;
    mascot = { x: gutter * 0.12, y: h - gutter * 0.62, w: gutter * 0.78 };
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body class="${lang}">
  <div class="card" style="width:${w}px;height:${h}px;background:linear-gradient(160deg, ${bg[0]}, ${bg[1]})">
    <div class="dots"></div>
    <div class="head" style="${headBox}">${lang === 'ja' ? head.replaceAll('。', '。<wbr>') : head}</div>
    <div class="sub" style="${subBox}">${sub}</div>
    <div class="frame" style="left:${frame.x}px;top:${frame.y}px;width:${frame.w}px;height:${frame.h}px;transform:rotate(${frame.rot}deg)"><img src="${img}"></div>
    <div class="burst" style="left:${mascot.x - mascot.w * 0.25}px;top:${mascot.y - mascot.w * 0.35}px;width:${mascot.w * 1.5}px">${burst(bg[1])}</div>
    <div class="mascot" style="left:${mascot.x}px;top:${mascot.y}px;width:${mascot.w}px">${mascotSvg(team, hat)}</div>
  </div></body></html>`;
}

/** Google Play's 1024×500 feature graphic: the logo, the tagline, a battle. */
function featureGraphic(tagline: string, img: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
  .logo { position: absolute; left: 40px; top: 70px; font-family: 'Luckiest Guy', sans-serif; font-size: 78px; line-height: 1; color: #e04848;
    -webkit-text-stroke: 7px #2b1b24; paint-order: stroke fill; text-shadow: 0 8px 0 #2b1b24; white-space: nowrap; }
  .logo span { color: #ffd84a; }
  </style></head><body>
  <div class="card" style="width:1024px;height:500px;background:linear-gradient(160deg, #4fb3e0, #d9f3ff)">
    <div class="dots"></div>
    <div class="frame" style="left:556px;top:96px;width:540px;height:304px;transform:rotate(-3deg);border-width:7px;border-radius:24px"><img src="${img}"></div>
    <div class="logo">Tardi<span>Geddon</span></div>
    <div class="sub" style="left:44px;top:182px;font-size:24px">${tagline}</div>
    <div class="burst" style="left:110px;top:262px;width:250px">${burst('#ffd84a')}</div>
    <div class="mascot" style="left:158px;top:300px;width:165px">${mascotSvg(0xe04848, 'crown')}</div>
  </div></body></html>`;
}

async function render(browser: Browser, html: string, w: number, h: number, file: string): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  // Shrink any words that don't fit their box (some languages run long).
  await p.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-fit]')) {
      const maxH = Number(el.dataset.fit);
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (size > 12 && (el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().height > maxH)) {
        size *= 0.95;
        el.style.fontSize = `${size}px`;
      }
    }
  });
  await sleep(150);
  writeFileSync(file, await p.screenshot({ type: 'jpeg', quality: 90 }));
  await ctx.close();
}

const want = process.argv.slice(2).filter((a): a is Lang => (LANGS as readonly string[]).includes(a));
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
for (const lang of want.length ? want : LANGS) {
  const words = CAPTIONS[lang];
  const out = join(root, 'store', 'listing', lang);
  for (const d of ['google-play', 'app-store']) mkdirSync(join(out, d), { recursive: true });
  // The moments are played once per game window shape and shared between sizes.
  const pics = new Map<string, string>();
  for (const [i, s] of SHOTS.entries()) {
    if (process.env.SHOT && process.env.SHOT !== s.id) continue;
    for (const size of Object.keys(SIZES) as Size[]) {
      const game = SIZES[size].game;
      const key = `${s.id}-${game.width}`;
      if (!pics.has(key)) pics.set(key, `data:image/png;base64,${(await moment(browser, s.id, lang, game)).toString('base64')}`);
      const { w, h, dir, name } = SIZES[size];
      await render(browser, compose(lang, size, s.bg, words[s.id][0], words[s.id][1], pics.get(key)!, s.team, s.hat), w, h, join(out, dir, `${name}-${i + 1}-${s.id}.jpg`));
    }
  }
  await render(browser, featureGraphic(words.tagline, pics.get('battle-800')!), 1024, 500, join(out, 'google-play', 'feature-graphic.jpg'));
  console.log(`${lang}: done`);
}
await browser.close();
