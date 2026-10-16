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
  await expect(page.locator('.hud-timer')).toBeVisible();
});
