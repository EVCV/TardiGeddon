// Pictures for the coin products: the shop's own pack pictures
// (src/ui/coinArt.ts) on the game's sky blue. Google Play's icons
// (docs/GOOGLE_PLAY.md §7) are 512×512 PNG; the App Store's in-app purchase
// images (docs/IOS.md §3) are 1024×1024 PNG (App Store Connect takes PNG
// where it refuses .jpg; no transparency either way).
//
//   PW_CHROMIUM_PATH=… npx tsx scripts/product-icons.ts
//
// Writes store/google-play/products/<product id>.png and
// store/app-store/products/<product id>.png, and all-packs.png: the six
// together, for where App Store Connect takes one image for every pack.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { packArt } from '../src/ui/coinArt';
import { COIN_PACKS, storeProductId } from '../src/shop/catalog';

// The same pictures as the shop's PACK_LOOKS (src/ui/shop.ts).
const ART: Record<string, string> = {
  'coins:200': 'pouch',
  'coins:500': 'stack',
  'coins:1000': 'chest',
  'coins:2000': 'vault',
  'coins:5000': 'mountain',
  'coins:10000': 'dragon',
};

const STORES = [
  { out: 'store/google-play/products', size: 512 },
  { out: 'store/app-store/products', size: 1024 },
] as const;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
for (const { out, size } of STORES) {
  mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  for (const pack of COIN_PACKS) {
    const art = packArt(ART[pack.id] ?? 'pouch');
    await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;
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
    }, size * 0.78);
    await page.screenshot({ path: `${out}/${storeProductId(pack)}.png` });
  }
  await page.close();
}

// All six packs in one picture, smallest to biggest.
const ALL = 1024;
const page = await browser.newPage({ viewport: { width: ALL, height: ALL } });
const cells = COIN_PACKS.map((p) => `<div style="display:grid;place-items:center">${packArt(ART[p.id] ?? 'pouch')}</div>`).join('');
await page.setContent(`<html><body style="margin:0;width:${ALL}px;height:${ALL}px;display:grid;
  grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);padding:${ALL * 0.12}px ${ALL * 0.04}px;box-sizing:border-box;
  background:radial-gradient(circle at 50% 42%, #c4ecfb 0%, #7fd3f7 55%, #68a8e8 100%)">${cells}</body></html>`);
await page.evaluate((fill) => {
  for (const svg of document.querySelectorAll('svg')) {
    const b = svg.getBBox();
    const side = Math.max(b.width, b.height) + 8;
    svg.setAttribute('viewBox', `${b.x + b.width / 2 - side / 2} ${b.y + b.height / 2 - side / 2} ${side} ${side}`);
    svg.setAttribute('width', String(fill));
    svg.setAttribute('height', String(fill));
  }
}, ALL * 0.29);
await page.screenshot({ path: 'store/app-store/products/all-packs.png' });
await browser.close();
