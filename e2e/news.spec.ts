import { expect, test, type Page } from '@playwright/test';
import { NEWS } from '../src/news/news';
import { NO_STATS } from '../server/store';

// The News page (src/ui/news.ts): release notes, what's coming and what's
// being fixed, a dot for news not yet read, and the website's newest list.

/** Open News from the lobby. */
async function openNews(page: Page): Promise<void> {
  // (On phones News is a tile in the bottom menu.)
  await page.locator('.news-btn:visible, .nav-news:visible').first().click();
  await expect(page.locator('.page-news')).toBeVisible();
}

/** The menu page fits the screen (phones): nothing to scroll outside the page's own box. */
async function fits(page: Page): Promise<void> {
  const over = await page.evaluate(() => {
    const pg = document.querySelector('.hub-page')!;
    return pg.scrollHeight - pg.clientHeight;
  });
  expect(over).toBeLessThanOrEqual(1);
}

/** Buttons whose text spills out of them. */
const spillingOf = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, .seg-btn')].filter((b) => b.offsetParent && b.scrollWidth > b.clientWidth + 2).map((b) => b.textContent?.trim()),
  );

test("shows what's new, what's coming and what's being fixed, with a dot until it's read", async ({ page }) => {
  // No website here (the game alone): it shows the posts it was built with.
  await page.goto('/');
  const dot = page.locator('.news-btn .news-dot:visible, .nav-news .news-dot:visible');
  await expect(dot).toHaveCount(1);
  await openNews(page);
  const latest = NEWS.filter((p) => p.kind === 'update').sort((a, b) => b.date.localeCompare(a.date))[0];
  await expect(page.locator('.news-post').first().locator('.card-title')).toHaveText(latest.text.en.title);
  await page.locator('.news-pills .seg-btn', { hasText: 'Coming soon' }).click();
  await expect(page.locator('.news-post[data-kind=coming]').first()).toBeVisible();
  await page.locator('.news-pills .seg-btn', { hasText: 'Being fixed' }).click();
  await expect(page.locator('.page-news')).toContainText('support@tardigeddon.com');
  // Read: no dot once back in the lobby, nor next visit.
  await page.locator('.hub-logo:visible, .hub-back:visible').first().click();
  await expect(page.locator('.news-btn:visible, .nav-news:visible')).toHaveCount(1);
  await expect(dot).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.news-btn:visible, .nav-news:visible')).toHaveCount(1);
  await expect(dot).toHaveCount(0);
});

test("the website's newer list replaces the built-in one, as plain text, in the player's language", async ({ page }) => {
  const post = {
    id: '2099-01-01-test',
    date: '2099-01-01',
    kind: 'issue',
    text: {
      en: { title: 'Sound cuts out on some tablets', body: ['<img src=x onerror="window.hacked=1">', '- We know, and a fix is on its way.'] },
      de: { title: 'Ton fällt auf manchen Tablets aus', body: ['<img src=x onerror="window.hacked=1">', '- Wir wissen es, eine Lösung kommt.'] },
    },
  };
  await page.route('**/news.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ v: 1, posts: [post, ...NEWS] }) }));
  await page.goto('/?lang=de');
  // A new post: the dot shows.
  await expect(page.locator('.news-btn .news-dot:visible, .nav-news .news-dot:visible')).toHaveCount(1);
  await openNews(page);
  await page.locator('.news-pills .seg-btn').nth(2).click();
  const card = page.locator('.news-post').first();
  await expect(card.locator('.card-title')).toHaveText('Ton fällt auf manchen Tablets aus');
  await expect(card).toHaveAttribute('data-kind', 'issue');
  // Shown as text, never run as HTML.
  await expect(card).toContainText('<img src=x');
  expect(await page.evaluate(() => (window as unknown as { hacked?: number }).hacked)).toBeUndefined();
});

test('on a phone the News page fits the screen in every language, with no text spilling out of buttons', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phones only');
  // Signed in where coins can be bought: the most tiles the bottom menu ever has.
  await page.route('http://localhost:8787/api/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': 'http://localhost:4173', 'access-control-allow-credentials': 'true' },
      body: JSON.stringify({ user: { id: 'u', name: 'Sam', email: 's@example.com', createdAt: '2026-01-01' }, owned: [], wallet: { coins: 1200, slime: 300 }, stats: NO_STATS, shop: true, providers: [] }),
    }),
  );
  for (const lang of ['en', 'es', 'pt-BR', 'de', 'fr', 'ja']) {
    await page.goto(`/?lang=${lang}`);
    await expect(page.locator('.lobby-nav .nav-coins')).toBeVisible();
    await fits(page);
    expect(await spillingOf(page), `${lang} lobby`).toEqual([]);
    await openNews(page);
    await fits(page);
    expect(await spillingOf(page), lang).toEqual([]);
  }
});
