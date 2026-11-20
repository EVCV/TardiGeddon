// App Store Connect's review screenshot for each in-app purchase (In-App
// Purchases → the product → Review Information → Screenshot): the real shop at
// iPad size, signed in as a made-up player, with that pack ringed in gold.
//
//   npm run build && npx vite preview --port 4173
//   npx tsx scripts/iap-review-shots.ts          (PW_CHROMIUM_PATH=… in sandboxes)
//
// Writes store/app-store/products/review/<product id>.png, 2752×2064 (iPad
// 13" landscape, one of Apple's screenshot sizes). The server is faked, so no
// account or server is needed.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { COIN_PACKS, SUPPORTER_PACKS, storeProductId } from '../src/shop/catalog';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'store/app-store/products/review');
const BASE = process.env.GAME_URL ?? 'http://localhost:4173/';
const SERVER = 'http://localhost:8787';
const origin = new URL(BASE).origin;
const cors = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' };

const NO_STATS = { onlinePlayed: 0, onlineWon: 0, cpuPlayed: 0, cpuWon: 0, popped: 0, damage: 0, streak: 0, bestStreak: 0, selfDamage: 0, selfPopped: 0, rating: 1000, ratedGames: 0 };
const ME = { user: { id: 'u', name: 'Sam', email: 'sam@example.com', createdAt: '2026-11-01' }, owned: [], wallet: { coins: 0, slime: 120 }, stats: NO_STATS, shop: true, supporterSale: true, providers: [] };

async function openShop(page: Page): Promise<void> {
  await page.goto(`${BASE}?lang=en&touch`);
  // The coins button opens the shop on its coin packs (the phone menu has its own).
  await page.locator(':is(.nav-coins, .chip-coins):visible').first().click();
  await page.locator('.coin-pack').first().waitFor();
  await page.waitForTimeout(800);
}

/** Ring one pack (by CSS selector and index), scroll it into the middle, and take the picture. */
async function shoot(page: Page, selector: string, index: number, file: string): Promise<void> {
  await page.evaluate(
    ({ selector, index }) => {
      // As the iOS app shows it (src/ui/shop.ts, inApp() && apple()): the App Store pays, so no
      // Stripe lines, no Stripe receipts button, and no website footer (Guideline 3.1.1).
      const swap: [string, string][] = [
        ['🔒 Secure checkout by Stripe', '🔒 Secure checkout by the App Store'],
        ['🧾 Receipt by email', '🧾 Receipt from Apple'],
        ['Prices include VAT.', 'Prices include tax.'],
      ];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) for (const [a, b] of swap) if (n.nodeValue?.includes(a)) n.nodeValue = n.nodeValue.replace(a, b);
      document.querySelectorAll<HTMLElement>('.shop-manage, .hub-footer').forEach((e) => (e.style.display = 'none'));
      document.querySelectorAll('.iap-ring').forEach((e) => e.classList.remove('iap-ring'));
      const el = document.querySelectorAll(selector)[index] as HTMLElement;
      el.classList.add('iap-ring');
      el.scrollIntoView({ block: 'center', inline: 'center' });
    },
    { selector, index },
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, file) });
  console.log('wrote', file);
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  // iPad 13" landscape: 1376×1032 points at 2× = 2752×2064 (a whole pack, price and all, fits).
  const ctx = await browser.newContext({ viewport: { width: 1376, height: 1032 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('tardigeddon.tutorial', '1');
    localStorage.setItem('tardigeddon.access', JSON.stringify({ hints: false }));
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.hub-news { display: none !important; } .iap-ring { box-shadow: inset 0 0 0 6px #f5b400, 0 0 0 4px #f5b400 !important; }';
      document.head.append(style);
    });
  });
  // The made-up player; every other server call answers empty.
  await page.route(`${SERVER}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (path === '/api/me') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(ME) });
    if (path === '/api/friends') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ code: 'SAMCODE1', friends: [], requests: [], sent: [] }) });
    return route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{}' });
  });
  await page.route('**/news.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ v: 1, posts: [] }) }));

  await openShop(page);
  for (const [i, p] of SUPPORTER_PACKS.entries()) await shoot(page, '.supporter-card', i, `${p.storeId}.png`);
  for (const [i, p] of COIN_PACKS.entries()) await shoot(page, '.coin-pack', i, `${storeProductId(p)}.png`);
  await browser.close();
}

void main();
