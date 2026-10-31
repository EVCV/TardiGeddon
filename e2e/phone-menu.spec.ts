import { expect, test, type Page } from '@playwright/test';

/** The menu page fits the screen: nothing to scroll (lists scroll inside their own boxes). */
async function fits(page: Page): Promise<void> {
  const over = await page.evaluate(() => {
    const pg = document.querySelector('.hub-page')!;
    return pg.scrollHeight - pg.clientHeight;
  });
  expect(over).toBeLessThanOrEqual(1);
}

test('on a phone the menu is screens you tap through, each fitting the screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phones only');
  await page.goto('/');
  await expect(page.locator('.lobby-nav')).toBeVisible();
  await fits(page);

  await page.locator('.setup-btn').click();
  await expect(page.locator('.setup-head')).toBeVisible();
  await page.locator('select[name=players]').selectOption('6');
  await fits(page);
  await page.locator('.setup-back').click();
  await expect(page.locator('.lobby-nav')).toBeVisible();

  await page.locator('[data-go=settings]').click();
  await expect(page.locator('.hub-title')).toHaveText('Settings');
  await fits(page);
  await page.locator('.settings-menu-btn', { hasText: 'Keyboard' }).click();
  await fits(page);
  await page.locator('.settings-menu-btn', { hasText: 'Sound' }).click();
  await expect(page.locator('.settings-sound .sound-slider').first()).toBeVisible();
  await fits(page);
  await page.locator('.hub-back').click();
  await expect(page.locator('.lobby-nav')).toBeVisible();

  // PLAY on the home screen starts a match.
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.hud-timer')).toBeVisible({ timeout: 20_000 }); // a match can take a while to start on CI (software rendering)
});

/** Buttons whose text spills out of them. */
const spilling = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, .seg-btn')]
      .filter((b) => b.offsetParent && b.scrollWidth > b.clientWidth + 2)
      .map((b) => b.textContent?.trim()),
  );

for (const lang of ['es', 'pt-BR', 'de', 'fr', 'ja']) {
  test(`in ${lang} the phone menu still fits, with no text spilling out of buttons`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phones only');
    await page.goto(`/?lang=${lang}`);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.locator('.lobby-nav')).toBeVisible();
    // Translated, not English.
    await expect(page.locator('.setup-btn')).not.toHaveText('Match setup');
    await fits(page);
    expect(await spilling(page)).toEqual([]);
    await page.screenshot({ path: `test-results/lang-${lang}-home.png` });
    await page.locator('.setup-btn').click();
    await page.locator('select[name=players]').selectOption('6');
    await fits(page);
    expect(await spilling(page)).toEqual([]);
    await page.screenshot({ path: `test-results/lang-${lang}-setup.png` });
    await page.locator('.setup-back').click();
    await page.locator('[data-go=settings]').click();
    await fits(page);
    expect(await spilling(page)).toEqual([]);
    await page.locator('.hub-back').click();
    await page.locator('.lobby-nav .big-btn, .lobby-play .play').first().click();
    await expect(page.locator('.hud-timer')).toBeVisible({ timeout: 20_000 }); // a match can take a while to start on CI (software rendering)
    await page.waitForTimeout(1500);
    expect(await spilling(page)).toEqual([]);
    await page.screenshot({ path: `test-results/lang-${lang}-match.png` });
  });
}

test('picking something further down a menu keeps your place in it', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phones only');
  await page.setViewportSize({ width: 800, height: 360 });
  await page.goto('/');
  await page.locator('.lobby-nav button').filter({ hasText: /Settings/ }).first().click();
  const list = page.locator('.settings-menu');
  // Once the page (and its fonts) have settled, the list is taller than the screen.
  await expect.poll(() => list.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeGreaterThan(10);
  await list.evaluate((e) => (e.scrollTop = 1000));
  const before = await list.evaluate((e) => e.scrollTop);
  expect(before).toBeGreaterThan(0);
  await list.locator('button').last().click();
  await expect.poll(() => list.evaluate((e) => e.scrollTop)).toBe(before);
});

test('at the largest text size the phone menu scrolls, and nothing spills off the side', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phones only');
  await page.addInitScript(() => localStorage.setItem('tardigeddon.textsize', '2'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-big-text', '');
  const wide = () => page.evaluate(() => {
    const hub = document.querySelector<HTMLElement>('.menu.hub')!;
    return { over: hub.scrollWidth - hub.clientWidth, scrolls: hub.scrollHeight > hub.clientHeight };
  });
  expect(await wide()).toEqual({ over: 0, scrolls: true });
  // The whole home screen can be reached by scrolling: Settings is at the bottom.
  await page.locator('[data-go=settings]').scrollIntoViewIfNeeded();
  await page.locator('[data-go=settings]').click();
  await expect(page.locator('.hub-title')).toHaveText('Settings');
  expect((await wide()).over).toBe(0);
  await page.locator('.hub-back').click();
  await page.locator('.setup-btn').scrollIntoViewIfNeeded();
  await page.locator('.setup-btn').click();
  await expect(page.locator('.setup-head')).toBeVisible();
  expect((await wide()).over).toBe(0);
});

test('dark mode follows the device, and can be turned off', async ({ browser }, info) => {
  test.skip(info.project.name !== 'phone', 'phones only');
  const ctx = await browser.newContext({ ...info.project.use, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  // The panels are dark and the writing light.
  const colours = await page.locator('.nav-tile').first().evaluate((e) => {
    const c = getComputedStyle(e);
    return [c.backgroundColor, c.color];
  });
  const lum = (rgb: string) => {
    const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  expect(lum(colours[0])).toBeLessThan(0.25);
  expect(lum(colours[1])).toBeGreaterThan(0.75);
  await page.locator('[data-go=settings]').click();
  await page.locator('.settings-menu-btn', { hasText: 'Accessibility' }).click();
  await page.getByRole('group', { name: 'Dark mode' }).getByRole('button', { name: 'Off' }).click();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  await ctx.close();
});
