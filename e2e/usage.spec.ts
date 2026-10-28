import { expect, test, type Page, type Request } from '@playwright/test';
import { validUsage } from '../src/usage/catalog';
import { isWeaponId } from '../src/sim/weapons';

// Anonymous play statistics (docs/USAGE.md): what the game really sends, and
// that the off switch and the browser's "don't track me" stop it.

const USAGE = 'http://localhost:8787/api/usage';

/** Catch every report the game sends (answered here, never reaching a server). */
async function catchReports(page: Page): Promise<Request[]> {
  const sent: Request[] = [];
  await page.route(USAGE, (route) => {
    sent.push(route.request());
    return route.fulfill({ status: 204 });
  });
  return sent;
}

/** Leave the game (as when switching app or tab), which sends what's waiting. */
async function leave(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
}

async function openPrivacy(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Settings/ }).first().click();
  await page.locator('.settings-menu-btn', { hasText: 'Privacy' }).click();
}

test('sends only counts from the list, with no cookie or anything else about the player', async ({ page, context }) => {
  await context.addCookies([{ name: 'some-cookie', value: 'x', domain: 'localhost', path: '/' }]);
  const sent = await catchReports(page);
  await page.goto('/');
  await openPrivacy(page);
  await leave(page);
  await expect.poll(() => sent.length).toBeGreaterThan(0);

  const entries: { e: string; d: string }[] = [];
  for (const r of sent) {
    const headers = await r.allHeaders();
    expect(headers.cookie).toBeUndefined();
    expect(headers.referer).toBeUndefined();
    const body = JSON.parse(r.postData() ?? '') as { v: number; entries: unknown[] };
    expect(Object.keys(body).sort()).toEqual(['entries', 'v']);
    for (const x of body.entries) {
      expect(validUsage(x, isWeaponId), JSON.stringify(x)).toBe(true);
      entries.push(x as { e: string; d: string });
    }
  }
  expect(entries.some((x) => x.e === 'open' && x.d.startsWith('platform=web&'))).toBe(true);
  expect(entries.some((x) => x.e === 'page' && x.d === 'page=settings')).toBe(true);
  expect(entries.some((x) => x.e === 'visit')).toBe(true);
});

test('turned off in Settings, nothing is sent', async ({ page }) => {
  const sent = await catchReports(page);
  await page.goto('/');
  await openPrivacy(page);
  const toggle = page.getByRole('switch', { name: 'Share anonymous statistics' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(page.getByRole('switch', { name: 'Share anonymous statistics' })).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await page.getByRole('button', { name: /Settings/ }).first().click();
  await leave(page);
  await page.waitForTimeout(500);
  expect(sent.length).toBe(0);
});

test("a browser that asks not to be tracked sends nothing, and can't be switched on", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }));
  const sent = await catchReports(page);
  await page.goto('/');
  await openPrivacy(page);
  const toggle = page.getByRole('switch', { name: 'Share anonymous statistics' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(toggle).toBeDisabled();
  await leave(page);
  await page.waitForTimeout(500);
  expect(sent.length).toBe(0);
});
