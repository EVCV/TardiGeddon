// Draws the pictures social apps and search engines show for the site's
// pages (1200×630), the logo (transparent PNG) and the home-screen icon,
// from the game's own art: the mascot, the logo lettering and real
// screenshots (site/public/media, from capture-media.mjs).
//
//   npx tsx site/capture/share-images.ts
//
// Needs Playwright's Chromium (PW_CHROMIUM_PATH=/opt/pw-browsers/chromium in sandboxes).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { mascotSvg } from '../../src/ui/mascot';
import { PANEL_WEAPONS } from '../../src/sim/weapons';
import { MAP_STYLES } from '../../src/sim/terrain/generate';
import { PROMOS, PROMO_ITEMS } from '../../src/shop/catalog';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const media = join(root, 'site', 'public', 'media');
const font = (file: string) => readFileSync(join(root, 'node_modules', '@fontsource', file)).toString('base64');
const pic = (file: string) => `data:image/webp;base64,${readFileSync(join(media, file)).toString('base64')}`;

const WEAPONS = PANEL_WEAPONS.filter((w) => w.id !== 'skip').length;
const promo = PROMOS[0];
const promoHat = PROMO_ITEMS.find((i) => i.id === promo.items[0])!;

const CSS = `
@font-face { font-family: 'Luckiest Guy'; src: url(data:font/woff2;base64,${font('luckiest-guy/files/luckiest-guy-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Nunito'; font-weight: 800; src: url(data:font/woff2;base64,${font('nunito/files/nunito-latin-800-normal.woff2')}) format('woff2'); }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { font-family: 'Nunito', sans-serif; font-weight: 800; color: #2b1b24; }
.card { width: 1200px; height: 630px; position: relative; overflow: hidden; background: linear-gradient(#7fd3f7, #d9f3ff 70%); }
.ground { position: absolute; left: 0; right: 0; bottom: 0; height: 70px; background: #9c6438; border-top: 14px solid #5aa83a; box-shadow: 0 -4px 0 #2b1b24; }
.logo { font-family: 'Luckiest Guy', sans-serif; color: #e04848; -webkit-text-stroke: 5px #2b1b24; paint-order: stroke fill; text-shadow: 0 8px 0 #2b1b24; line-height: 1; letter-spacing: 0.01em; white-space: nowrap; }
.logo span { color: #ffd84a; }
.big { font-family: 'Luckiest Guy', sans-serif; color: #ffd84a; -webkit-text-stroke: 4px #2b1b24; paint-order: stroke fill; text-shadow: 0 6px 0 #2b1b24; line-height: 1.02; }
.tag { font-size: 34px; margin-top: 14px; }
.badges { display: flex; gap: 12px; margin-top: 22px; }
.badges b { background: #fff8ec; border: 4px solid #2b1b24; border-radius: 999px; padding: 4px 18px; font-size: 26px; }
.badges b::before { content: '✓ '; color: #3cb34a; }
.shot { position: absolute; border: 8px solid #2b1b24; border-radius: 26px; box-shadow: 0 14px 0 #2b1b24; overflow: hidden; background: #2b1b24; }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.mascot svg { display: block; width: 100%; height: auto; }
.code { display: inline-block; font-family: 'Luckiest Guy', sans-serif; font-size: 72px; letter-spacing: 0.08em; padding: 16px 30px 4px; background: #ffd84a; border: 6px dashed #2b1b24; border-radius: 24px; }
`;

const page = (body: string, w = 1200, h = 630) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="width:${w}px;height:${h}px">${body}</body></html>`;

/** A screenshot in a tilted frame. */
const shot = (file: string, style: string) => `<div class="shot" style="${style}"><img src="${pic(file)}"></div>`;

const IMAGES: { file: string; html: string; w?: number; h?: number; transparent?: boolean }[] = [
  {
    file: 'og-home.jpg',
    html: page(`<div class="card">
      ${shot('shot-crater.webp', 'left:640px;top:170px;width:620px;height:349px;transform:rotate(3deg)')}
      <div class="ground"></div>
      <div style="position:absolute;left:52px;top:36px;width:580px">
        <div class="mascot" style="width:240px;margin-left:150px">${mascotSvg(0xe04848, 'beanie')}</div>
        <div class="logo" style="font-size:86px;margin-top:6px">Tardi<span>Geddon</span></div>
        <div class="tag" style="font-size:31px">A free turn-based artillery game starring tardigrades</div>
        <div class="badges"><b>Free</b><b>No download</b><b>Online</b></div>
      </div>
    </div>`),
  },
  {
    file: 'og-how-to-play.jpg',
    html: page(`<div class="card">
      ${shot('shot-aim.webp', 'left:520px;top:110px;width:720px;height:405px;transform:rotate(-3deg)')}
      <div class="ground"></div>
      <div style="position:absolute;left:56px;top:60px;width:500px">
        <div class="logo" style="font-size:60px">Tardi<span>Geddon</span></div>
        <div class="big" style="font-size:104px;margin-top:20px">How to play</div>
        <div class="tag">Aim, power, wind: learn it in five minutes</div>
        <div class="mascot" style="width:170px;margin-top:10px">${mascotSvg(0x3a7be0, 'grad')}</div>
      </div>
    </div>`),
  },
  {
    file: 'og-weapons.jpg',
    html: page(`<div class="card">
      ${shot('shot-weapons.webp', 'left:540px;top:100px;width:700px;height:394px;transform:rotate(3deg)')}
      <div class="ground"></div>
      <div style="position:absolute;left:56px;top:60px;width:500px">
        <div class="logo" style="font-size:60px">Tardi<span>Geddon</span></div>
        <div class="big" style="font-size:150px;margin-top:20px">${WEAPONS}</div>
        <div class="big" style="font-size:80px">weapons</div>
        <div class="tag">From the Spore Bazooka to the Concrete Tun, on ${MAP_STYLES.length} kinds of map</div>
      </div>
    </div>`),
  },
  {
    file: 'og-promo.jpg',
    html: page(`<div class="card">
      <div class="ground"></div>
      <div class="mascot" style="position:absolute;left:690px;top:80px;width:470px">${mascotSvg(0x3a7be0, promoHat.ref)}</div>
      <div style="position:absolute;left:56px;top:60px;width:640px">
        <div class="logo" style="font-size:60px">Tardi<span>Geddon</span></div>
        <div class="big" style="font-size:84px;margin-top:22px">Free hat code</div>
        <div class="tag" style="margin:6px 0 26px">${promoHat.name}: only with this code</div>
        <div class="code">${promo.code}</div>
      </div>
    </div>`),
  },
  {
    file: 'logo.png',
    w: 1200,
    h: 400,
    transparent: true,
    html: page(
      `<div style="display:flex;align-items:center;justify-content:center;gap:28px;width:1200px;height:400px">
        <div class="mascot" style="width:250px">${mascotSvg(0xe04848, 'beanie')}</div>
        <div class="logo" style="font-size:112px">Tardi<span>Geddon</span></div>
      </div>`,
      1200,
      400,
    ),
  },
  {
    file: '../apple-touch-icon.png',
    w: 180,
    h: 180,
    html: page(
      `<div style="width:180px;height:180px;background:linear-gradient(#7fd3f7,#d9f3ff);display:flex;align-items:center;justify-content:center">
        <div class="mascot" style="width:156px;margin-top:22px">${mascotSvg(0xe04848, 'beanie')}</div>
      </div>`,
      180,
      180,
    ),
  },
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
for (const img of IMAGES) {
  const p = await browser.newPage({ viewport: { width: img.w ?? 1200, height: img.h ?? 630 } });
  await p.setContent(img.html);
  await p.evaluate(() => document.fonts.ready);
  const jpg = img.file.endsWith('.jpg');
  await p.screenshot({ path: join(media, img.file), type: jpg ? 'jpeg' : 'png', quality: jpg ? 86 : undefined, omitBackground: img.transparent });
  await p.close();
  console.log('wrote', img.file);
}
await browser.close();
