import { expect, test } from '@playwright/test';

type Tardi = { state: { turn: { phase: string; teamIdx: number }; teams: { ammo: Record<string, number> }[]; tardis: { team: number }[] }; input: { command: (c: unknown) => void } };

test('practice: unlimited ammo against targets, from the lobby', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '🎯 Practice' }).click();
  await page.getByRole('button', { name: /Pop 10 targets/ }).click();
  await expect(page.locator('.hud-timer')).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { __tardi?: Tardi }).__tardi?.state.turn.phase === 'aim');
  const info = await page.evaluate(() => {
    const s = (window as unknown as { __tardi: Tardi }).__tardi.state;
    return { mine: s.tardis.filter((t) => t.team === 0).length, targets: s.tardis.filter((t) => t.team === 1).length, bazooka: s.teams[0].ammo.bazooka, strike: s.teams[0].ammo.airstrike };
  });
  expect(info).toEqual({ mine: 1, targets: 10, bazooka: -1, strike: -1 });
  await expect(page.locator('.hud-wind-label')).toContainText(/WIND/);
  expect(errors).toEqual([]);
});

test('endless practice: from the lobby, with a popped-targets counter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '🎯 Practice' }).click();
  await page.getByRole('button', { name: /Endless targets/ }).click();
  await expect(page.locator('.hud-clock')).toContainText('🎯 0');
});

test('on a phone, ▲▼ hide for weapons that need no aiming', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only');
  await page.goto('/?autostart=practice');
  await page.waitForFunction(() => {
    const t = (window as unknown as { __tardi?: Tardi }).__tardi;
    return t?.state.turn.phase === 'aim' && t.state.turn.teamIdx === 0;
  });
  const aim = page.locator('.touch-aim');
  await expect(aim).toBeVisible();
  await page.evaluate(() => (window as unknown as { __tardi: Tardi }).__tardi.input.command({ t: 'weapon', id: 'airstrike' }));
  await expect(aim).toBeHidden();
  await page.evaluate(() => (window as unknown as { __tardi: Tardi }).__tardi.input.command({ t: 'weapon', id: 'girder' }));
  await expect(aim).toBeVisible(); // ▲▼ turn the girder
});

test('the guide explains wind, brine drums and online play, and fits a phone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '📖 Guide' }).click();
  for (const text of ['Wind', 'Brine drums', 'Playing online', 'Quick play', 'With friends']) await expect(page.locator('.page-guide')).toContainText(text);
  const over = await page.evaluate(() => {
    const pg = document.querySelector('.hub-page')!;
    return pg.scrollHeight - pg.clientHeight;
  });
  if (test.info().project.name === 'phone') expect(over).toBeLessThanOrEqual(1);
});
