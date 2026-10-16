// Icons for the Google Play coin products (docs/GOOGLE_PLAY.md §7): the shop's
// own pack pictures (src/ui/coinArt.ts) on the game's sky blue, 512×512 PNG.
//
//   PW_CHROMIUM_PATH=… npx tsx scripts/product-icons.ts
//
// Writes store/google-play/products/<product id>.png.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { packArt } from '../src/ui/coinArt';
import { COIN_PACKS, playProductId } from '../src/shop/catalog';

// The same pictures as the shop's PACK_LOOKS (src/ui/shop.ts).
const ART: Record<string, string> = {
  'coins:200': 'pouch',
  'coins:500': 'stack',
  'coins:1000': 'chest',
  'coins:2000': 'vault',
  'coins:5000': 'mountain',
  'coins:10000': 'dragon',
};

const OUT = 'store/google-play/products';
const SIZE = 512;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
for (const pack of COIN_PACKS) {
  const art = packArt(ART[pack.id] ?? 'pouch');
  await page.setContent(`<html><body style="margin:0;width:${SIZE}px;height:${SIZE}px;display:grid;place-items:center;
    background:radial-gradient(circle at 50% 42%, #c4ecfb 0%, #7fd3f7 55%, #68a8e8 100%)">${art}</body></html>`);
  // Centre each picture on its own outline (they sit differently in the shop's frame).
  await page.evaluate((fill) => {
    const svg = document.querySelector('svg')!;
    const b = svg.getBBox();
    const pad = 4; // room for the outline stroke
    const side = Math.max(b.width, b.height) + pad * 2;
    svg.setAttribute('viewBox', `${b.x + b.width / 2 - side / 2} ${b.y + b.height / 2 - side / 2} ${side} ${side}`);
    svg.setAttribute('width', String(fill));
    svg.setAttribute('height', String(fill));
  }, SIZE * 0.78);
  await page.screenshot({ path: `${OUT}/${playProductId(pack)}.png` });
}
await browser.close();
