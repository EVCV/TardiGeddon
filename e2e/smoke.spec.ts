import { expect, test } from '@playwright/test';

test('menu loads and a CPU match can be played', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  await expect(page.locator('.title')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.hud-timer')).toBeVisible({ timeout: 20_000 }); // a match can take a while to start on CI (software rendering)

  // Let a couple of turns play out (the CPU and timers drive the game).
  await page.waitForFunction(() => {
    const m = (window as unknown as { __tardi?: { world: { tick: number } } }).__tardi;
    return !!m && m.world.tick > 200;
  });
  expect(errors).toEqual([]);
});

test('on a big screen the lobby\'s first card keeps every part in its place', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'big screens');
  for (const viewport of [{ width: 2000, height: 1000 }, { width: 1600, height: 760 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForSelector('.lobby-hero');
    // Signed in with the shop on, all of these show.
    await page.evaluate(() => {
      for (const e of document.querySelectorAll<HTMLElement>('.hero-coins, .hero-coins-banner, .hero-season')) e.hidden = false;
      document.querySelector('.hero-season')!.textContent = 'A seasonal event';
    });
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const art = await box('.lobby-hero .hero-art');
    const tagline = await box('.lobby-hero .tagline');
    const banner = await box('.lobby-hero .hero-coins-banner');
    // The team picture and the words sit side by side, the coins banner across the bottom.
    expect(tagline.x).toBeGreaterThan(art.x + art.width);
    expect(tagline.width).toBeGreaterThan(150);
    expect(banner.y).toBeGreaterThan(art.y + art.height - 1);
    expect(banner.width).toBeGreaterThan(art.width);
  }
});

test('the banner for something new can be closed, and stays closed', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-28T12:00:00Z')); // Spooky season
  await page.goto('/');
  const news = page.locator('.hub-news');
  await expect(news).toBeVisible();
  await expect(news).toContainText('Pumpkin Patch');
  await news.locator('.hub-notice-x').click();
  await expect(news).toBeHidden();
  await page.reload();
  await expect(page.locator('.lobby-hero, .lobby-nav').first()).toBeVisible();
  await expect(news).toBeHidden();
});
