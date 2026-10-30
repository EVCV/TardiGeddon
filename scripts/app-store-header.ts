// The App Store product page's optional creative assets (App Store Connect →
// the version → Product Page Information → Header and Search Results):
// a header (21:9, 3840×1646) and a search result picture (3:2, 3840×2560).
// A real game picture from the website (site/public/media) in a frame, on the
// game's sky with the mascots, which are vector so they stay sharp at this size.
// No words, so the same pictures do for every language; Apple puts the app's
// name and icon over the header, so its lower left is left plain.
//
//   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx scripts/app-store-header.ts
//
// Writes store/app-store/header.jpg and store/app-store/search-result.jpg
// (JPEG: Apple wants no transparency).

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { mascotSvg } from '../src/ui/mascot';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'store', 'app-store');
const pic = (file: string) => `data:image/webp;base64,${readFileSync(join(root, 'site', 'public', 'media', file)).toString('base64')}`;

const RED = 0xe04848;
const BLUE = 0x3a7be0;
const GREEN = 0x3cb34a;
const GOLD = 0xe0a020;

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; }
.sky { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(#7fd3f7, #d9f3ff 80%); }
.ground { position: absolute; left: 0; right: 0; bottom: 0; background: #9c6438; box-shadow: 0 -8px 0 #2b1b24; }
.shot { position: absolute; border: 16px solid #2b1b24; border-radius: 52px; box-shadow: 0 28px 0 #2b1b24; overflow: hidden; background: #2b1b24; }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.mascot { position: absolute; }
.mascot svg { display: block; width: 100%; height: auto; }
.cloud { position: absolute; }
.cloud i { position: absolute; background: #fff; border-radius: 50%; opacity: 0.9; }
`;

const page = (body: string, w: number, h: number) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="width:${w}px;height:${h}px;position:relative">${body}</body></html>`;
const shot = (file: string, style: string) => `<div class="shot" style="${style}"><img src="${pic(file)}"></div>`;
const tardi = (color: number, hat: string, style: string) => `<div class="mascot" style="${style}">${mascotSvg(color, hat, 'classic')}</div>`;
const ground = (h: number, grass: number) => `<div class="ground" style="height:${h}px;border-top:${grass}px solid #5aa83a"></div>`;
/** A puffy cloud: overlapping circles on a flat base, w wide. */
const cloud = (x: number, y: number, w: number) =>
  `<div class="cloud" style="left:${x}px;top:${y}px;width:${w}px;height:${w * 0.5}px">
    <i style="left:0;top:${w * 0.22}px;width:${w * 0.36}px;height:${w * 0.28}px"></i>
    <i style="left:${w * 0.18}px;top:${w * 0.06}px;width:${w * 0.38}px;height:${w * 0.38}px"></i>
    <i style="left:${w * 0.44}px;top:0;width:${w * 0.34}px;height:${w * 0.42}px"></i>
    <i style="left:${w * 0.64}px;top:${w * 0.18}px;width:${w * 0.36}px;height:${w * 0.3}px"></i>
    <i style="left:${w * 0.1}px;top:${w * 0.3}px;width:${w * 0.8}px;height:${w * 0.2}px;border-radius:${w}px"></i>
  </div>`;

const IMAGES = [
  {
    file: 'header.jpg',
    w: 3840,
    h: 1646,
    html: page(
      `<div class="sky">
        ${cloud(220, 150, 560)}${cloud(3080, 110, 620)}${cloud(840, 40, 360)}
        ${ground(230, 50)}
        ${shot('shot-crater.webp', 'left:1170px;top:140px;width:1600px;height:900px;transform:rotate(-2deg)')}
        ${tardi(RED, 'beanie', 'width:640px;left:520px;top:920px')}
        ${tardi(GREEN, 'crown', 'width:640px;left:2700px;top:920px;transform:scaleX(-1)')}
        ${tardi(BLUE, 'tophat', 'width:440px;left:3300px;top:1130px;transform:scaleX(-1)')}
      </div>`,
      3840,
      1646,
    ),
  },
  {
    file: 'search-result.jpg',
    w: 3840,
    h: 2560,
    html: page(
      `<div class="sky">
        ${cloud(160, 120, 700)}${cloud(2960, 160, 760)}
        ${ground(360, 70)}
        ${shot('shot-weapons.webp', 'left:380px;top:300px;width:1600px;height:900px;transform:rotate(-4deg)')}
        ${shot('shot-crater.webp', 'left:1860px;top:800px;width:1600px;height:900px;transform:rotate(3deg)')}
        ${tardi(RED, 'beanie', 'width:780px;left:160px;top:1640px')}
        ${tardi(GOLD, 'crown', 'width:780px;left:2940px;top:1640px;transform:scaleX(-1)')}
      </div>`,
      3840,
      2560,
    ),
  },
];

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
for (const img of IMAGES) {
  const p = await browser.newPage({ viewport: { width: img.w, height: img.h } });
  await p.setContent(img.html);
  await p.screenshot({ path: join(out, img.file), type: 'jpeg', quality: 90 });
  await p.close();
  console.log('wrote', img.file);
}
await browser.close();
