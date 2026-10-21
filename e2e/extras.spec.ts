import { expect, test, type Page } from '@playwright/test';

type W = { world: { tick: number; turn: { teamIdx: number; phase: string; timer: number }; tardis: { hp: number }[] } };
const tardi = (p: Page) => p.evaluate(() => (window as unknown as { __tardi: W }).__tardi.world.tick);

test('a daily challenge ends with its result, and its buttons work', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  test.setTimeout(120_000);
  await page.goto('/?autostart=targets');
  await page.waitForFunction(() => (window as unknown as { __tardi?: W }).__tardi?.world.turn.phase === 'aim');
  // Let every one of our turns run out at once.
  await page.waitForFunction(
    () => {
      const w = (window as unknown as { __tardi: W }).__tardi.world;
      if (w.turn.phase === 'aim') w.turn.timer = 1;
      return !!document.querySelector('.challenge-result');
    },
    null,
    { timeout: 90_000, polling: 200 },
  );
  await expect(page.locator('.challenge-result')).toContainText('/ 8 targets');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(page.locator('.title')).toBeVisible();
});

test('a finished match can be watched again, with working replay controls', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  test.setTimeout(150_000);
  await page.goto('/?autostart=cpu');
  await page.waitForFunction(() => (window as unknown as { __tardi?: W }).__tardi?.world.turn.phase === 'aim');
  await page.waitForFunction(
    () => {
      const w = (window as unknown as { __tardi: W }).__tardi.world;
      for (const t of w.tardis) t.hp = Math.min(t.hp, 5);
      if (w.turn.teamIdx === 0 && w.turn.phase === 'aim') w.turn.timer = 1;
      return w.turn.phase === 'gameover';
    },
    null,
    { timeout: 120_000, polling: 300 },
  );
  await page.getByRole('button', { name: 'Main menu' }).click({ timeout: 15_000 });
  await page.getByRole('button', { name: '🎬 Replays' }).click();
  await page.getByRole('button', { name: '▶ Watch' }).first().click();
  await expect(page.locator('.replay-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  const t0 = await tardi(page);
  await page.waitForTimeout(800);
  expect(await tardi(page)).toBe(t0);
  await page.getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Speed 4×' }).click();
  await expect.poll(() => tardi(page)).toBeGreaterThan(t0);
  await page.getByRole('button', { name: 'Stop watching' }).click();
  await expect(page.locator('.title')).toBeVisible();
});
