import { expect, test } from '@playwright/test';

type Game = { state: { turn: { phase: string; weapon: string }; teams: { cpu: boolean }[] } };

test('settings bind left-click to Fire, and the tutorial walks through the basics', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard and mouse');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByRole('button', { name: /Controls/ }).click();
  // Fire's empty second box: click it, then click the mouse to bind left-click.
  await page.getByRole('button', { name: /^Fire \(hold to charge\), second key/ }).click();
  await expect(page.locator('.bind-key.listening')).toBeVisible();
  await page.mouse.click(30, 300);
  await expect(page.getByRole('button', { name: /^Fire \(hold to charge\), second key: Left click/ })).toBeVisible();

  await page.getByRole('button', { name: 'Start the tutorial' }).click();
  const coach = page.locator('.coach');
  await page.waitForFunction(() => (window as unknown as { __tardi?: Game }).__tardi?.state.turn.phase === 'aim');
  await expect(coach).toContainText('Step 1 of');
  await expect(coach).toContainText('Walk with ← or A');

  await page.keyboard.down('KeyD');
  await expect(coach).toContainText('Step 2 of', { timeout: 5000 });
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Enter');
  await expect(coach).toContainText('Step 3 of', { timeout: 5000 });
  await page.keyboard.down('ArrowUp');
  await expect(coach).toContainText('Step 4 of', { timeout: 5000 });
  await page.keyboard.up('ArrowUp');
  // Left-click fires now, so the map is dragged with another button; the wheel zooms.
  await expect(coach).toContainText('with the middle mouse button');
  await page.mouse.move(640, 300);
  await page.mouse.wheel(0, 300);
  await expect(coach).toContainText('Step 5 of', { timeout: 5000 });
  await page.keyboard.press('Tab');
  await expect(coach).toContainText('Step 6 of');
  await page.locator('.weapon-cell[data-id=bazooka]').click();
  await expect(coach).toContainText('Step 7 of');
  await expect(coach).toContainText('Hold Space or Left click');

  // Fire with the mouse: hold the left button on the map, then let go.
  await page.mouse.move(640, 120);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(coach).toContainText('Step 8 of', { timeout: 5000 });
  expect(errors).toEqual([]);
});
