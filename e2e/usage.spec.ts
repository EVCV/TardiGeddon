import { expect, test, type Page, type Request } from '@playwright/test';
import { validUsage } from '../src/usage/catalog';
import { isWeaponId } from '../src/sim/weapons';
import { NO_STATS } from '../server/store';

// Anonymous play statistics (docs/USAGE.md): what the game really sends, and
// that the off switch and the browser's "don't track me" stop it.

const USAGE = 'http://localhost:8787/api/usage';

/**
 * Every value in the catalogue is made of these: no spaces, dots, slashes or
 * quotes, so no message, stack, address, file or name can be hiding in one.
 */
const PLAIN = /^[A-Za-z0-9=&<+:-]*$/;

/** Every entry sent so far: each one on the list, and nothing but plain values. */
function entriesOf(sent: Request[]): { e: string; d: string; n: number }[] {
  return sent.flatMap((r) => {
    const body = JSON.parse(r.postData() ?? '') as { v: number; entries: { e: string; d: string; n: number }[] };
    expect(Object.keys(body).sort()).toEqual(['entries', 'v']);
    for (const x of body.entries) {
      expect(validUsage(x, isWeaponId), JSON.stringify(x)).toBe(true);
      expect(x.e + x.d, JSON.stringify(x)).toMatch(PLAIN);
      expect(Object.keys(x).sort()).toEqual(['d', 'e', 'n']);
    }
    return body.entries;
  });
}

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

  for (const r of sent) {
    const headers = await r.allHeaders();
    expect(headers.cookie).toBeUndefined();
    expect(headers.referer).toBeUndefined();
  }
  const entries = entriesOf(sent);
  // Opened: the app, the device and the language each on their own, never together.
  expect(entries.some((x) => x.e === 'app' && x.d === 'platform=web')).toBe(true);
  expect(entries.some((x) => x.e === 'device' && /^device=(phone|tablet|desktop)$/.test(x.d))).toBe(true);
  expect(entries.some((x) => x.e === 'lang' && x.d === 'lang=en')).toBe(true);
  expect(entries.some((x) => x.e === 'open')).toBe(false);
  expect(entries.some((x) => x.e === 'load' && x.d.startsWith('what=menu&'))).toBe(true);
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

test('errors are counted by kind and place only, never their message, and only a few per visit', async ({ page }) => {
  const sent = await catchReports(page);
  await page.goto('/');
  await expect(page.locator('.hub')).toBeVisible();
  // Messages that could hold a player's name, and a flood of them.
  await page.evaluate(() => {
    setTimeout(() => void Promise.reject(new Error('sam@example.com at https://tardigeddon.com/play/x.js:1:2')), 0);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) {
      setTimeout(() => {
        throw new Error(`Sam Smith's team broke ${i}`);
      }, 0);
    }
  });
  await page.waitForTimeout(300);
  await leave(page);
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  const entries = entriesOf(sent);
  const errors = entries.filter((x) => x.e === 'error');
  expect(errors.some((x) => x.d === 'kind=error&where=menu')).toBe(true);
  expect(errors.some((x) => x.d === 'kind=promise&where=menu')).toBe(true);
  expect(errors.reduce((n, x) => n + x.n, 0)).toBe(10);
  const all = sent.map((r) => r.postData() ?? '').join('\n');
  for (const text of ['Sam', 'sam@', 'example', 'https', '.js', 'broke']) expect(all).not.toContain(text);
});

test('counts the tutorial steps reached, and how long Play took to start the match', async ({ page }) => {
  const sent = await catchReports(page);
  await page.goto('/?autostart=tutorial');
  await expect(page.locator('.coach-step')).toBeVisible({ timeout: 30_000 });
  await leave(page);
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  const entries = entriesOf(sent);
  expect(entries).toContainEqual({ e: 'tutorial', d: 'step=walk', n: 1 });
  expect(entries.some((x) => x.e === 'load' && x.d.startsWith('what=match&'))).toBe(true);
  // (The menu never showed: it went straight to the tutorial.)
  expect(entries.some((x) => x.e === 'load' && x.d.startsWith('what=menu&'))).toBe(false);
});

test('counts the way to Get coins: the button tapped and the pack chosen, nothing about who', async ({ page }) => {
  // A server whose shop is on, with nobody signed in.
  await page.route('http://localhost:8787/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': 'http://localhost:4173', 'access-control-allow-credentials': 'true' },
      body: JSON.stringify({ user: null, owned: [], wallet: { coins: 0, slime: 0 }, stats: NO_STATS, shop: true, providers: [] }),
    }),
  );
  const sent = await catchReports(page);
  await page.goto('/');
  const get = page.locator('.hero-coins-banner:visible, .nav-coins:visible').first();
  await expect(get).toBeVisible();
  await get.click();
  await page.locator('.coin-pack').first().click();
  await expect(page.locator('.coin-dialog')).toBeVisible();
  await leave(page);
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  const entries = entriesOf(sent);
  expect(entries.some((x) => x.e === 'coinstap' && /^from=(banner|nav)$/.test(x.d))).toBe(true);
  expect(entries).toContainEqual({ e: 'coinspack', d: 'pack=coins:200', n: 1 });
});

test("a load that spent time in the background isn't timed", async ({ page }) => {
  const sent = await catchReports(page);
  // Hidden while the game starts, then shown again before the menu appears.
  await page.addInitScript(() => {
    let state: DocumentVisibilityState = 'hidden';
    Object.defineProperty(document, 'visibilityState', { get: () => state });
    // (Once the game's code has loaded, but before the menu is up.)
    document.addEventListener('DOMContentLoaded', () => {
      state = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
  });
  await page.goto('/');
  await expect(page.locator('.hub')).toBeVisible();
  await leave(page);
  await expect.poll(() => sent.length).toBeGreaterThan(0);
  expect(entriesOf(sent).some((x) => x.e === 'load')).toBe(false);
});
