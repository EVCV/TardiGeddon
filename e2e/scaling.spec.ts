import { expect, test } from '@playwright/test';

// Bigger text (Settings → Text size, or the iPhone's own text size) scales the
// menus and the match HUD with transform, not CSS zoom (Safari's zoom gets the
// screen's size and the notch's safe areas wrong): the scaled screens must
// still exactly fill the window, never run past it under the Dynamic Island.

test.afterEach(async ({ browser, context }) => {
  for (const c of browser.contexts()) if (c !== context) await c.close();
});

const edges = (el: Element) => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
};

for (const size of [{ width: 874, height: 402 }, { width: 678, height: 466 }, { width: 951, height: 669 }, { width: 1180, height: 820 }]) {
  test(`bigger text on a ${size.width}x${size.height} touch screen still fills it exactly`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'phone', 'makes its own touch screens: once is enough');
    for (const text of ['1', '1.3', '2']) {
      const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      await page.addInitScript((v) => localStorage.setItem('tardigeddon.textsize', v), text);
      await page.goto('/');
      await expect(page.getByRole('button', { name: /^Play\b/ }).first()).toBeVisible();
      for (const sel of ['#ui', '.menu.hub']) {
        expect(await page.locator(sel).evaluate(edges), `${sel}, text ${text}`).toEqual([0, 0, size.width, size.height]);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `text ${text}`).toBeLessThanOrEqual(size.width);
      await ctx.close();
    }
  });
}

test('in dark mode, the Play online button keeps light writing on its blue', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect(page.locator('.lobby-play .online-btn')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await ctx.close();
});

test("on iPhone Duo's outer screen, Match setup shows six teams' whole names", async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone', 'makes its own touch screen');
  const ctx = await browser.newContext({ viewport: { width: 678, height: 466 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('.setup-btn').click();
  await page.locator('select[name=players]').selectOption('6');
  await expect(page.locator('.slot-name')).toHaveCount(6);
  const cut = await page.evaluate(() => [...document.querySelectorAll('.slot-name')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  expect(cut).toEqual([]);
  await ctx.close();
});

// Big screens zoom the menu up (style.css --hub-zoom), but only as far as the
// lobby fits the screen's height (ui/hubFit.ts): a wide, short window (a big
// screen less the browser's bars) used to cut off the lobby's bottom row.
for (const size of [{ width: 1920, height: 900 }, { width: 2000, height: 960 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
  test(`on a ${size.width}x${size.height} screen the whole lobby fits`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'one desktop run is enough');
    const page = await browser.newPage({ viewport: size });
    await page.goto('/');
    await expect(page.locator('.lobby-play')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (const card of ['.lobby-hero', '.lobby-play', '.lobby-setup']) {
      const box = await page.locator(card).boundingBox();
      expect(box!.y + box!.height, card).toBeLessThanOrEqual(size.height);
    }
    expect(await page.evaluate(() => document.querySelector('.menu.hub')!.scrollTop)).toBe(0);
  });
}
