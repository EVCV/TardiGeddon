import { expect, test } from '@playwright/test';

type Tardi = { state: { turn: { phase: string; teamIdx: number }; teams: { ammo: Record<string, number> }[]; tardis: { team: number }[] }; input: { command: (c: unknown) => void } };

test('practice: unlimited ammo against targets, from the lobby', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '🎯 Practice' }).click();
  await page.getByRole('button', { name: /Pop 10 targets/ }).click();
  await expect(page.locator('.hud-timer')).toBeVisible({ timeout: 20_000 }); // a match can take a while to start on CI (software rendering)
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

test('bigger text: everything scales together, text stays inside buttons, menus still fit', async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use });
  await ctx.addInitScript(() => localStorage.setItem('tardigeddon.textsize', '1.5'));
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('.lobby')).toBeVisible();
  const scale = Number(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')));
  expect(scale).toBeGreaterThan(1);
  const over = await page.evaluate(() => {
    const pg = document.querySelector('.hub-page')!;
    return pg.scrollHeight - pg.clientHeight;
  });
  if (info.project.name === 'phone') expect(over).toBeLessThanOrEqual(1);
  await page.goto('/?autostart=practice');
  await page.waitForFunction(() => (window as unknown as { __tardi?: Tardi }).__tardi?.state.turn.phase === 'aim');
  // No button's words spill out of it.
  const spill = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.touch-btn, .hud-btn, .hud-weapon')]
      .filter((b) => b.offsetParent && (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1))
      .map((b) => b.textContent),
  );
  expect(spill).toEqual([]);
  await ctx.close();
});
