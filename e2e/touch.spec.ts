import { expect, test } from '@playwright/test';

type Tardi = { renderer: { camera: { x: number; y: number } }; state: { turn: { phase: string; target: { x: number; y: number } | null } }; input: { command: (c: unknown) => void } };

test('on a phone, dragging the map scrolls it and a tap picks a target', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'phone', 'touch only');
  await page.goto('/?autostart=hotseat');
  await page.waitForFunction(() => (window as unknown as { __tardi?: Tardi }).__tardi?.state.turn.phase === 'aim');
  const cdp = await context.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

  const before = await page.evaluate(() => ({ ...(window as unknown as { __tardi: Tardi }).__tardi.renderer.camera }));
  await touch('touchStart', 300, 150);
  for (let i = 1; i <= 10; i++) await touch('touchMove', 300 + i * 20, 150 + i * 5);
  await touch('touchEnd');
  const after = await page.evaluate(() => ({ ...(window as unknown as { __tardi: Tardi }).__tardi.renderer.camera }));
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(50);

  await page.evaluate(() => (window as unknown as { __tardi: Tardi }).__tardi.input.command({ t: 'weapon', id: 'airstrike' }));
  await page.waitForTimeout(200);
  await touch('touchStart', 400, 120);
  await touch('touchEnd');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tardi: Tardi }).__tardi.state.turn.target)).not.toBeNull();
});
