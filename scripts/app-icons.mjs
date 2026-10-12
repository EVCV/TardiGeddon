// Draws the app icon and splash source images in assets/ from public/icon.svg.
// Run: node scripts/app-icons.mjs, then npx @capacitor/assets generate (docs/APPS.md).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const art = svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect x="-40" y="-40" width="80" height="80" rx="16" fill="#7fd3f7"\/>/, '');
if (art.includes('rx="16" fill="#7fd3f7"')) throw new Error('bg not stripped');
const page = await (await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined })).newPage();
async function shot(file, size, viewBox, bg, body) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${bg}"><svg width="${size}" height="${size}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${body}</svg></body></html>`);
  await page.screenshot({ path: file, omitBackground: bg === 'transparent' });
}
// Square icon (iOS, Play Store listing, old Android): the whole SVG, square corners (the stores round them).
await shot('assets/icon-only.png', 1024, '-40 -40 80 80', '#7fd3f7', `<rect x="-40" y="-40" width="80" height="80" fill="#7fd3f7"/>${art}`);
// Android adaptive icon: the mascot alone, inside the centre that every launcher mask keeps.
await shot('assets/icon-foreground.png', 1024, '-56 -56 112 112', 'transparent', art);
await shot('assets/icon-background.png', 1024, '0 0 1 1', '#7fd3f7', '');
// Splash: the mascot small on sky blue.
await shot('assets/splash.png', 2732, '-200 -200 400 400', '#7fd3f7', art);
await shot('assets/splash-dark.png', 2732, '-200 -200 400 400', '#7fd3f7', art);
process.exit(0);
