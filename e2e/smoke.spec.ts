import { expect, test } from '@playwright/test';

test('menu loads and a CPU match can be played', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  await expect(page.locator('.title')).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();

  // Let a couple of turns play out (the CPU and timers drive the game).
  await page.waitForFunction(() => {
    const m = (window as unknown as { __tardi?: { world: { tick: number } } }).__tardi;
    return !!m && m.world.tick > 200;
  });
  expect(errors).toEqual([]);
});
