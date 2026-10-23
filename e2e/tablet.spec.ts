import { expect, test, type Browser } from '@playwright/test';

// Contexts made with browser.newContext() outlive the test (the browser is shared
// by the worker): close them, or their matches keep running and starve later tests.
test.afterEach(async ({ browser, context }) => {
  for (const c of browser.contexts()) if (c !== context) await c.close();
});

// Tablets play either way up (the iPad app must: docs/IOS.md §7); phones held
// upright, and windows too narrow to play in, get a screen asking for more room.

async function touchPage(browser: Browser, viewport: { width: number; height: number }, screen: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport, screen, hasTouch: true, isMobile: true });
  return ctx.newPage();
}

// It makes its own touch screens, so once (in the desktop project) is enough.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop'));

test('an upright iPad plays, with the whole title in view', async ({ browser }) => {
  const page = await touchPage(browser, { width: 1032, height: 1376 }, { width: 1032, height: 1376 });
  await page.goto('/');
  await expect(page.locator('.title')).toBeVisible();
  await expect(page.locator('#rotate')).toBeHidden();
  // The title fits its card (the two-column lobby at this width squeezed it before).
  const spill = await page.evaluate(() => {
    const title = document.querySelector('.lobby .title') as HTMLElement;
    const card = document.querySelector('.lobby-hero') as HTMLElement;
    return title.getBoundingClientRect().left + title.scrollWidth - card.getBoundingClientRect().right;
  });
  expect(spill).toBeLessThan(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.hud-timer')).toBeVisible({ timeout: 20_000 }); // a match can take a while to start on CI (software rendering)
  await expect(page.locator('#rotate')).toBeHidden();
});

test('an upright phone is asked to turn sideways', async ({ browser }) => {
  const page = await touchPage(browser, { width: 412, height: 915 }, { width: 412, height: 915 });
  await page.goto('/');
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.locator('#rotate h2')).toHaveText('Turn your phone sideways');
});

test('a thin split-screen window on a tablet asks for a wider window', async ({ browser }) => {
  const page = await touchPage(browser, { width: 500, height: 1024 }, { width: 1366, height: 1024 });
  await page.goto('/');
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.locator('#rotate h2')).toHaveText('Make the window wider');
});
