import { expect, test, type Browser, type Page } from '@playwright/test';

// Foldable phones (docs/APPS.md, "Foldables"): a tall outer screen, a
// near-square inner one, a flip phone's tiny cover screen, split screens, and
// the screen changing size mid-match when the phone is opened or closed.
// Sizes are the phones' CSS viewports (Galaxy Z Fold/Flip, Pixel Fold, iPhone Duo).

async function touchPage(browser: Browser, viewport: { width: number; height: number }, screen = viewport): Promise<Page> {
  const ctx = await browser.newContext({ viewport, screen, hasTouch: true, isMobile: true });
  return ctx.newPage();
}

/** Visible buttons and titles whose text runs out of their own box. */
const spills = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, .title, h1, h2, h3')]
      .filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).textOverflow !== 'ellipsis')
      .map((e) => (e.textContent ?? '').trim()),
  );

// It makes its own touch screens, so once (in the desktop project) is enough.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop'));

test('an open foldable on its side (near-square) shows the menu with nothing spilling', async ({ browser }) => {
  for (const size of [{ width: 783, height: 755 }, { width: 832, height: 750 }]) {
    const page = await touchPage(browser, size);
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Play\b/ }).first()).toBeVisible();
    await expect(page.locator('#rotate')).toBeHidden();
    expect(await spills(page), `${size.width}x${size.height}`).toEqual([]);
  }
});

test("each screen gets the right message: turn sideways, a wider window, or open the phone", async ({ browser }) => {
  const message = async (viewport: { width: number; height: number }, screen = viewport) => {
    const page = await touchPage(browser, viewport, screen);
    await page.goto('/');
    return (await page.locator('#rotate').isVisible()) ? await page.locator('#rotate h2').textContent() : null;
  };
  expect(await message({ width: 412, height: 960 })).toBe('Turn your phone sideways'); // outer screen, upright
  expect(await message({ width: 984, height: 1092 })).toBeNull(); // inner screen, upright: plays
  expect(await message({ width: 490, height: 1092 }, { width: 984, height: 1092 })).toBe('Make the window wider'); // split screen
  expect(await message({ width: 440, height: 626 }, { width: 890, height: 626 })).toBe('Make the window wider'); // split on a small inner screen
  expect(await message({ width: 360, height: 380 })).toBe('Open your phone'); // a flip phone's cover screen
});

test('opening and closing the phone mid-match keeps the game filling the screen', async ({ browser }) => {
  const page = await touchPage(browser, { width: 960, height: 412 }, { width: 1092, height: 984 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?autostart=cpu');
  await expect(page.locator('.hud-timer')).toBeVisible({ timeout: 20_000 }); // software rendering on CI is slow to start a match
  const fills = () => page.evaluate(() => { const r = document.querySelector('canvas')!.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
  for (const size of [{ width: 1092, height: 984 }, { width: 984, height: 1092 }, { width: 960, height: 412 }]) {
    await page.setViewportSize(size);
    await expect.poll(fills).toEqual([size.width, size.height]);
    await expect(page.locator('#rotate')).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('on narrow phones the health bars stay clear of the weapon button', async ({ browser }) => {
  for (const size of [{ width: 568, height: 320 }, { width: 667, height: 375 }, { width: 678, height: 466 }]) {
    const page = await touchPage(browser, size);
    await page.goto('/?autostart=cpu');
    await expect(page.locator('.hud-weapon')).toBeVisible({ timeout: 20_000 });
    const gap = await page.evaluate(() => document.querySelector('.hud-weapon')!.getBoundingClientRect().left - document.querySelector('.hud-teams')!.getBoundingClientRect().right);
    expect(gap, `${size.width}x${size.height}`).toBeGreaterThan(0);
    // Each match keeps running until its page closes: left open, they slow the next one's start past the timeout on CI.
    await page.context().close();
  }
});
