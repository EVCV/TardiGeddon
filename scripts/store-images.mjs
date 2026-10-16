// Google Play store images, taken from the running game (docs/GOOGLE_PLAY.md).
//
//   npm run build && npx vite preview --port 4173      (and, for the shop: npm run server with accounts)
//   PW_CHROMIUM_PATH=… node scripts/store-images.mjs
//
// Writes store/google-play/: phone screenshots (1920×1080, the phone menu),
// 7" and 10" tablet screenshots, and the 1024×500 feature graphic.
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.GAME_URL ?? 'http://localhost:4173/';
const OUT = 'store/google-play';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

// 800×450 CSS px at 2.4× = 1920×1080: short enough for the phone menu layout.
const PHONE = { ...devices['Pixel 7 landscape'], viewport: { width: 800, height: 450 }, screen: { width: 800, height: 450 }, deviceScaleFactor: 2.4 };
const TABLET7 = { ...devices['Pixel 7 landscape'], viewport: { width: 960, height: 600 }, screen: { width: 960, height: 600 }, deviceScaleFactor: 2 };
const TABLET10 = { ...devices['Pixel 7 landscape'], viewport: { width: 1280, height: 800 }, screen: { width: 1280, height: 800 }, deviceScaleFactor: 2 };

const game = (p) => p.waitForFunction(() => window.__tardi?.state?.turn?.phase === 'aim', null, { timeout: 30_000 });
const settle = (p, ms = 900) => p.waitForTimeout(ms);
// No "New here?" pulse, and no tutorial nudge, in the pictures.
const fresh = () => localStorage.setItem('tardigeddon.tutorial', '1');

async function page(device) {
  const ctx = await browser.newContext(device);
  const p = await ctx.newPage();
  await p.addInitScript(fresh);
  return p;
}

/** A match (hot seat: every team human, so it's always "your turn" and the controls are live). */
async function match(p, players = 3) {
  await p.goto(`${BASE}?autostart=hotseat&players=${players}`);
  await game(p);
  await settle(p, 1500);
}

async function phoneShots() {
  // 1. Home screen.
  let p = await page(PHONE);
  await p.goto(BASE);
  await settle(p, 1500);
  await p.screenshot({ path: `${OUT}/phone-1-home.png` });

  // 2. Match setup with four teams.
  await p.locator('.setup-btn').click();
  await p.locator('select[name=players]').selectOption('4');
  await settle(p);
  await p.screenshot({ path: `${OUT}/phone-2-setup.png` });

  // 3. Team editor (hats).
  await p.locator('.slot-edit').first().click();
  await settle(p);
  await p.screenshot({ path: `${OUT}/phone-3-team.png` });
  await p.context().close();

  // 4. A match: aiming.
  p = await page(PHONE);
  await match(p);
  // Aim up a little so the crosshair shows clearly.
  await p.evaluate(() => window.__tardi.input.command({ t: 'aim', facing: 1, aim: 160 }));
  await settle(p, 400);
  await p.screenshot({ path: `${OUT}/phone-4-aim.png` });

  // 5. The weapon panel.
  await p.locator('.hud-weapon').click();
  await settle(p, 500);
  await p.screenshot({ path: `${OUT}/phone-5-weapons.png` });
  await p.context().close();

  // 6. Mid-battle: fire a shot and catch it in the air.
  p = await page(PHONE);
  await match(p, 4);
  await p.evaluate(() => window.__tardi.input.command({ t: 'aim', facing: 1, aim: 220 }));
  await settle(p, 300);
  await p.keyboard.down('Space');
  await settle(p, 650);
  await p.keyboard.up('Space');
  await p.waitForFunction(() => window.__tardi.state.projectiles.length > 0, null, { timeout: 5000 }).catch(() => {});
  await settle(p, 450);
  await p.screenshot({ path: `${OUT}/phone-6-battle.png` });
  await p.context().close();

  // 7. The tutorial.
  p = await page(PHONE);
  await p.goto(`${BASE}?autostart=tutorial`);
  await game(p);
  await settle(p, 3000); // after the "your turn" banner
  await p.screenshot({ path: `${OUT}/phone-7-tutorial.png` });
  await p.context().close();
}

async function tabletShots(device, name) {
  const p = await page(device);
  await p.goto(BASE);
  await settle(p, 1500);
  await p.screenshot({ path: `${OUT}/${name}-1-lobby.png` });
  await match(p, 4);
  await p.evaluate(() => window.__tardi.input.command({ t: 'aim', facing: 1, aim: 160 }));
  await settle(p, 400);
  await p.screenshot({ path: `${OUT}/${name}-2-match.png` });
  await p.context().close();
}

/** 1024×500: the title and a row of tardigrades in their hats, drawn by the game itself. */
async function featureGraphic() {
  const p = await page({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await p.goto(BASE);
  await settle(p, 1500);
  // Borrow the hat pictures from the team editor (the game's own artwork and fonts).
  await p.locator('.hero-edit').click();
  await settle(p, 400);
  const pics = await p.$$eval('.editor-hats .hat-btn svg', (svgs) => svgs.map((s) => s.outerHTML));
  const pick = [0, 2, 3, 1, 4].map((i) => pics[i]).filter(Boolean);
  await p.evaluate((pick) => {
    document.body.innerHTML = `
      <div id="fg">
        <div class="t">Tardi<span>Geddon</span></div>
        <div class="s">Tiny. Indestructible. Armed.</div>
        <div class="row">${pick.map((svg, i) => `<div class="m m${i}">${svg}</div>`).join('')}</div>
        <div class="boom">💥</div>
      </div>
      <style>
        body { margin: 0; }
        #fg { position: fixed; inset: 0; overflow: hidden; font-family: 'Luckiest Guy', sans-serif;
          background: radial-gradient(circle at 70% 30%, #d9f3ff 0%, #7fd3f7 55%, #4fb3e0 100%); }
        #fg::after { content: ''; position: absolute; left: -5%; right: -5%; bottom: -60px; height: 150px;
          background: #8a5a3b; border-top: 14px solid #6dbb58; border-radius: 50% 50% 0 0; }
        .t { position: absolute; top: 46px; left: 0; right: 0; text-align: center; font-size: 104px; line-height: 1;
          color: #e04848; -webkit-text-stroke: 4px #2b1b24; paint-order: stroke fill; text-shadow: 0 7px 0 #2b1b24; }
        .t span { color: #ffd84a; }
        .s { position: absolute; top: 166px; left: 0; right: 0; text-align: center; font: 800 26px Nunito, sans-serif; color: #2b1b24; }
        .row { position: absolute; left: 0; right: 0; bottom: 70px; display: flex; justify-content: center; align-items: flex-end; gap: 26px; z-index: 1; }
        .m svg { width: 150px; height: auto; display: block; }
        .m1 svg, .m3 svg { width: 130px; }
        .m0 svg, .m4 svg { width: 120px; }
        .boom { position: absolute; right: 70px; top: 200px; font-size: 80px; transform: rotate(12deg); }
      </style>`;
  }, pick);
  await settle(p, 500);
  await p.screenshot({ path: `${OUT}/feature-graphic.png` });
  await p.context().close();
}

await phoneShots();
await tabletShots(TABLET7, 'tablet7');
await tabletShots(TABLET10, 'tablet10');
await featureGraphic();
await browser.close();
console.log(`Store images written to ${OUT}/`);
