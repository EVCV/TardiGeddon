import { expect, test, type Page } from '@playwright/test';

type W = { world: { tick: number; waterY: number; turn: { teamIdx: number; phase: string; timer: number }; tardis: { hp: number; team: number; y: number; airborne: boolean }[] } };
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
  // End it quickly: on our go, our whole team falls in the water. (Waiting for
  // the CPU to pop all four took most of two minutes on CI.)
  await page.waitForFunction(
    () => {
      const w = (window as unknown as { __tardi: W }).__tardi.world;
      if (w.turn.teamIdx === 0 && w.turn.phase === 'aim') {
        for (const t of w.tardis) {
          if (t.team !== 0) continue;
          t.y = w.waterY + 40;
          t.airborne = true;
        }
      }
      return w.turn.phase === 'gameover';
    },
    null,
    { timeout: 60_000, polling: 300 },
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

test('a map drawn in the map editor can be saved, picked in Customise and played', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto('/');
  if (info.project.name !== 'desktop') await page.getByRole('button', { name: 'Match setup' }).waitFor();
  await page.getByRole('button', { name: '🗺️ Map editor' }).click();
  const canvas = page.locator('.map-editor-canvas');
  await expect(canvas).toBeVisible();
  // The whole editor fits the screen.
  const box = (await canvas.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(view.height);
  // Draw a hill: one stroke across the middle.
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.getByLabel('Map name').fill('Hilly');
  await page.getByRole('button', { name: 'Save on this device' }).click();
  await expect(page.locator('.map-editor-note')).toContainText('Saved “Hilly”');
  await page.getByRole('button', { name: 'Leave the map editor' }).click();
  await expect(page.locator('.map-editor')).toHaveCount(0);
  // It's in the Map list.
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Customise', exact: true }).click();
    await expect(page.locator('.custom-panel select option', { hasText: '🗺️ Hilly' })).toHaveCount(1);
  }
  // And it plays.
  await page.getByRole('button', { name: '🗺️ Map editor' }).click();
  await page.getByLabel('Start from').selectOption({ label: '🗺️ Hilly' });
  await page.getByRole('button', { name: 'Play on this map against the computer' }).click();
  await page.waitForFunction(() => (window as unknown as { __tardi?: { world: { realm: string } } }).__tardi?.world.realm === 'custom');
});
