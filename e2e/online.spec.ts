import { expect, test, type Page } from '@playwright/test';

// Two players in separate browsers: one creates a room, the other joins by
// code, and both see the same match once the host starts it.

type Tardi = { world: { tick: number; turn: { teamIdx: number; phase: string; turnNumber: number } } };
// Each test opens its own browser windows: close them after, or the matches left
// running in them slow the next test's windows to a crawl.
test.afterEach(async ({ browser }) => {
  for (const c of browser.contexts()) await c.close();
});

const world = (p: Page) => p.evaluate(() => (window as unknown as { __tardi?: Tardi }).__tardi?.world ?? null);

test('two players can play an online match', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  const errors: string[] = [];
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  }

  await a.goto('/');
  await a.getByRole('button', { name: 'Play online' }).click();
  await a.getByRole('button', { name: 'Create a room' }).click();
  const code = (await a.locator('.room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{5}$/);

  // The second player uses the invite link.
  await b.goto(`/?room=${code}`);
  await expect(b.getByText('Waiting for the host')).toBeVisible();
  await expect(a.locator('.lobby-slot')).toHaveCount(2);

  await a.getByRole('button', { name: 'Start match' }).click();
  for (const p of [a, b]) await expect(p.locator('.hud-timer')).toBeVisible();

  // Both clients follow the server's simulation.
  await a.waitForFunction(() => ((window as unknown as { __tardi?: Tardi }).__tardi?.world.tick ?? 0) > 150);
  // The second browser reaches the same tick (it may trail a little on a busy
  // machine: comparing two reads taken one after the other is racy).
  const wa = await world(a);
  await b.waitForFunction((t) => ((window as unknown as { __tardi?: Tardi }).__tardi?.world.tick ?? 0) >= t, wa!.tick, { timeout: 10_000 });
  const wb = await world(b);
  expect(wb!.tick - wa!.tick).toBeLessThan(100);
  expect(wa!.turn.teamIdx).toBe(wb!.turn.teamIdx);

  // Whoever's turn it is skips it; the other browser sees the turn pass.
  const active = wa!.turn.teamIdx === 0 ? a : b;
  const other = active === a ? b : a;
  await active.waitForFunction(() => (window as unknown as { __tardi?: Tardi }).__tardi?.world.turn.phase === 'aim');
  const turn = wa!.turn.turnNumber;
  await active.evaluate(() => {
    const m = (window as unknown as { __tardi: { input: { command: (c: unknown) => void } } }).__tardi;
    m.input.command({ t: 'skip' });
  });
  await other.waitForFunction((n) => ((window as unknown as { __tardi?: Tardi }).__tardi?.world.turn.turnNumber ?? 0) > n, turn, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('quick play matches two strangers, or one player with a CPU', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  test.setTimeout(150_000); // three software-rendered browsers are slow
  const errors: string[] = [];
  const pages = await Promise.all([0, 1, 2].map(async () => (await browser.newContext()).newPage()));
  for (const p of pages) {
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('/');
    await p.getByRole('button', { name: 'Play online' }).click();
  }
  const [a, b, c] = pages;
  // Two strangers: matched after a short wait for more players.
  await a.getByRole('button', { name: /Quick play/ }).click();
  await expect(a.getByText('Looking for players')).toBeVisible();
  await b.getByRole('button', { name: /Quick play/ }).click();
  for (const p of [a, b]) await expect(p.locator('.hud-timer')).toBeVisible({ timeout: 15_000 });
  // A third player gets bored of waiting and plays a CPU.
  await c.getByRole('button', { name: /Quick play/ }).click();
  await c.getByRole('button', { name: 'Play a CPU instead' }).click();
  await expect(c.locator('.hud-timer')).toBeVisible({ timeout: 10_000 });
  const teams = await c.evaluate(() => (window as unknown as { __tardi: { world: { teams: { cpu: boolean }[] } } }).__tardi.world.teams.map((t) => t.cpu));
  expect(teams).toEqual([false, true]);
  expect(errors).toEqual([]);
});

test('players can report and block each other, in the room and in a match', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one run is enough');
  const errors: string[] = [];
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  }
  await a.goto('/');
  await a.getByRole('button', { name: 'Play online' }).click();
  await a.getByRole('button', { name: 'Create a room' }).click();
  const code = (await a.locator('.room-code').textContent())!.trim();
  await b.goto(`/?room=${code}`);
  await expect(a.locator('.lobby-slot')).toHaveCount(2);

  // Only the other player has the buttons.
  await expect(a.locator('.lobby-slot').nth(0).locator('.safety-btn')).toHaveCount(0);
  const other = a.locator('.lobby-slot').nth(1);
  const theirName = (await other.locator('.lobby-name').textContent())!;

  // Report: pick a reason, then "Done".
  await other.getByRole('button', { name: `Report ${theirName}` }).click();
  await a.getByRole('button', { name: 'Rude or unsafe name' }).click();
  await expect(a.getByText('Your report has gone to our team')).toBeVisible();
  await a.getByRole('button', { name: 'Done' }).click();

  // Block: their name is hidden from now on.
  a.once('dialog', (d) => void d.accept());
  await other.getByRole('button', { name: `Block ${theirName}` }).click();
  await expect(other.locator('.lobby-name')).toHaveText('Blocked player');

  // In the match: hidden there too, and 👥 lists them to unblock.
  await a.getByRole('button', { name: 'Start match' }).click();
  await expect(a.locator('.hud-timer')).toBeVisible();
  await expect(a.locator('.team-name').nth(1)).toHaveText('Blocked player');
  await a.getByRole('button', { name: 'Players: report or block' }).click();
  await a.getByRole('button', { name: 'Unblock Blocked player' }).click();
  await expect(a.locator('.safety-box .lobby-name')).toHaveText(theirName);
  await a.getByRole('button', { name: 'Close' }).click();
  await expect(a.locator('.team-name').nth(1)).toHaveText(theirName);
  expect(errors).toEqual([]);
});
