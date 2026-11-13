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
  await page.locator('.news-pills .seg-btn').nth(3).click(); // (Being fixed: after What's new, Coming soon and the Roadmap)
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

// ---- The Roadmap view (src/ui/roadmap.ts): votes, ideas, and Cloudflare Turnstile ----

const LAUNCH = NEWS.find((p) => p.kind === 'coming')!;
const SERVER = 'http://localhost:8787';
const CORS = { 'access-control-allow-origin': 'http://localhost:4173', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' };

interface TsLog {
  rendered: Record<string, unknown>[];
  executed: number;
  resets: number;
}
const tsLog = (page: Page) => page.evaluate(() => (window as unknown as { __ts: TsLog }).__ts);

/**
 * A pretend game server for a signed-in player, and what it was sent (the real one has no accounts here).
 * `state.next` makes it answer the next vote or idea with an error.
 */
async function signedInServer(page: Page, me: Record<string, unknown> = {}) {
  const sent: { path: string; body: Record<string, unknown> }[] = [];
  const state = { votes: 3, mine: false, next: null as null | { status: number; error: string } };
  await page.route(`${SERVER}/api/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (path === '/api/me') {
      return json(200, { user: { id: 'u', name: 'Sam', email: 's@example.com', emailVerified: true, createdAt: '2026-01-01' }, owned: [], wallet: { coins: 0, slime: 0 }, stats: NO_STATS, shop: false, providers: [], turnstile: { web: 'site-web', app: 'site-app' }, ...me });
    }
    if (path === '/api/roadmap/votes') return json(200, { votes: { [LAUNCH.id]: state.votes }, mine: state.mine ? [LAUNCH.id] : [] });
    if (path === '/api/roadmap/vote' || path === '/api/suggestions') {
      const body = req.postDataJSON() as Record<string, unknown>;
      sent.push({ path, body });
      if (state.next) {
        const { status, error } = state.next;
        state.next = null;
        return json(status, { error });
      }
      if (path === '/api/suggestions') return json(200, { ok: true });
      const on = body.on === true;
      state.votes += on ? 1 : -1;
      state.mine = on;
      return json(200, { ok: true, on, votes: state.votes });
    }
    return route.fallback();
  });
  return { sent, state };
}

/** A pretend Cloudflare Turnstile: gives a token "tok-1", "tok-2"… each time it is asked, and logs what the game did with it. */
async function pretendTurnstile(page: Page): Promise<void> {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `window.__ts = { rendered: [], executed: 0, resets: 0 };
        const widgets = {};
        window.turnstile = {
          render(el, o) {
            const id = 'w' + Object.keys(widgets).length;
            widgets[id] = o;
            window.__ts.rendered.push({ sitekey: o.sitekey, action: o.action, theme: o.theme, language: o.language, appearance: o.appearance, execution: o.execution });
            return id;
          },
          execute(id) { const n = ++window.__ts.executed; setTimeout(() => widgets[id].callback('tok-' + n), 10); },
          reset() { window.__ts.resets++; },
          remove() {},
        };
        // As the real script does: call the function named in ?onload= once ready.
        const onload = new URL(document.currentScript.src).searchParams.get('onload');
        if (onload) window[onload]();`,
    }),
  );
}

/** Open the Roadmap, the third section of News (so it works in every language). */
async function openRoadmap(page: Page): Promise<void> {
  await openNews(page);
  await page.locator('.news-pills .seg-btn').nth(2).click();
  await expect(page.locator('.page-roadmap')).toBeVisible();
}

test('the Roadmap shows what is now, next and later, with nothing to vote with when there are no accounts', async ({ page }) => {
  // Cloudflare is only ever contacted for a signed-in player.
  const asked: string[] = [];
  page.on('request', (r) => r.url().includes('challenges.cloudflare.com') && asked.push(r.url()));
  // No accounts on this server: the roadmap is still there to read.
  await page.goto('/');
  await openRoadmap(page);
  await expect(page.locator('.roadmap-col')).toHaveCount(3);
  await expect(page.locator('.roadmap-col[data-stage=now] .roadmap-item .card-title')).toHaveText(LAUNCH.text.en.title);
  await expect(page.locator('.roadmap-col[data-stage=next] .roadmap-empty')).toBeVisible();
  await expect(page.locator('.roadmap-col[data-stage=later] .roadmap-empty')).toBeVisible();
  await expect(page.locator('.roadmap-vote')).toHaveCount(0);
  // No dates on the items: players read them as promises.
  await expect(page.locator('.roadmap-cols')).not.toContainText(/Expected|2026/);
  await page.waitForTimeout(300);
  expect(asked).toEqual([]);
});

test('signed-out players see the votes and are asked to sign in, without Cloudflare being contacted', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => r.url().includes('challenges.cloudflare.com') && asked.push(r.url()));
  await page.route(`${SERVER}/api/**`, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (path === '/api/me') return json({ user: null, owned: [], wallet: { coins: 0, slime: 0 }, stats: NO_STATS, shop: false, providers: [] });
    if (path === '/api/roadmap/votes') return json({ votes: { [LAUNCH.id]: 7 } });
    return route.fallback();
  });
  await page.goto('/');
  await openRoadmap(page);
  await expect(page.locator('.roadmap-item .roadmap-count')).toHaveText('Votes: 7');
  await expect(page.locator('.roadmap-vote')).toHaveCount(0);
  await expect(page.locator('.roadmap-signin')).toContainText('Sign in to vote');
  await expect(page.locator('.roadmap-suggest')).toContainText('Sign in to send us an idea');
  expect(await page.locator('.roadmap-form').count()).toBe(0);
  await page.waitForTimeout(300);
  expect(asked).toEqual([]);
});

test('signed-in players vote and send ideas, each with a fresh Turnstile token that is reset afterwards', async ({ page }) => {
  const server = await signedInServer(page);
  await pretendTurnstile(page);
  await page.goto('/?lang=de');
  await openRoadmap(page);

  // The script loads now; nothing is drawn until a check is asked for.
  const item = page.locator('.roadmap-item', { hasText: LAUNCH.text.de.title });
  await expect(item.locator('.roadmap-count')).toHaveText('Stimmen: 3');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __ts?: TsLog }).__ts)).toBe(true);
  expect((await tsLog(page)).rendered).toEqual([]);

  const vote = item.locator('.roadmap-vote');
  await expect(vote).toHaveAttribute('aria-pressed', 'false');
  await vote.click();
  await expect(vote).toHaveAttribute('aria-pressed', 'true');
  await expect(item.locator('.roadmap-count')).toHaveText('Stimmen: 4');
  expect(server.sent[0]).toEqual({ path: '/api/roadmap/vote', body: { itemId: LAUNCH.id, on: true, platform: 'web', turnstileToken: 'tok-1' } });
  // Drawn once, for this action, in the player's language, invisible unless it needs them, and run only when asked.
  expect((await tsLog(page)).rendered).toEqual([{ sitekey: 'site-web', action: 'roadmap_vote', theme: 'light', language: 'de', appearance: 'interaction-only', execution: 'execute' }]);

  // Taking the vote back needs a new check, not the old token.
  await vote.click();
  await expect(vote).toHaveAttribute('aria-pressed', 'false');
  expect(server.sent[1].body).toMatchObject({ on: false, turnstileToken: 'tok-2' });
  const log = await tsLog(page);
  expect(log.executed).toBe(2);
  // Reset before each check and after each request.
  expect(log.resets).toBeGreaterThanOrEqual(4);

  // A refused vote still resets the widget and shows the server's message in German; the next try has a new token.
  server.state.next = { status: 403, error: 'The security check didn’t pass. Please try again.' };
  await vote.click();
  await expect(page.locator('.hub-notice')).toContainText('Sicherheitsprüfung wurde nicht bestanden');
  await expect(vote).toHaveAttribute('aria-pressed', 'false');
  expect((await tsLog(page)).resets).toBeGreaterThanOrEqual(log.resets + 2);
  await vote.click();
  await expect(vote).toHaveAttribute('aria-pressed', 'true');
  expect(server.sent.at(-1)!.body.turnstileToken).toBe('tok-4');

  // An idea: too short is caught here; a good one is sent with its own check; the box empties.
  const form = page.locator('.roadmap-form');
  await form.locator('select').selectOption('mode');
  await form.locator('textarea').fill('zu kurz');
  await expect(form.locator('.roadmap-count-chars')).toHaveText('7/500');
  await form.locator('button[type=submit]').click();
  await expect(form.locator('.roadmap-note')).toContainText('mindestens 10 Zeichen');
  expect(server.sent.filter((s) => s.path === '/api/suggestions')).toHaveLength(0);
  const idea = 'Ein Modus ohne Schwerkraft, in dem die Bärtierchen schweben.';
  await form.locator('textarea').fill(idea);
  await form.locator('button[type=submit]').click();
  await expect(page.locator('.hub-notice')).toContainText('Danke');
  expect(server.sent.at(-1)).toEqual({ path: '/api/suggestions', body: { category: 'mode', text: idea, platform: 'web', turnstileToken: 'tok-5' } });
  await expect(page.locator('.roadmap-form textarea')).toHaveValue('');
  expect((await tsLog(page)).rendered.map((r) => r.action)).toEqual(['roadmap_vote', 'suggestion']);
});

test('without a confirmed email the idea box asks for it, and if the security check cannot load, says so and sends nothing', async ({ page }) => {
  const server = await signedInServer(page, { user: { id: 'u', name: 'Sam', email: 's@example.com', emailVerified: false, createdAt: '2026-01-01' } });
  // Cloudflare unreachable (blocked, or offline).
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
  await page.goto('/');
  await openRoadmap(page);
  await expect(page.locator('.roadmap-suggest')).toContainText('Confirm your email');
  expect(await page.locator('.roadmap-form').count()).toBe(0);
  await page.locator('.roadmap-vote').click();
  await expect(page.locator('.hub-notice')).toContainText('The security check couldn’t load');
  expect(server.sent).toEqual([]);
});

test('uses the dark Turnstile widget in dark mode, and the roadmap is readable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tardigeddon.access', JSON.stringify({ dark: 'on' })));
  await signedInServer(page);
  await pretendTurnstile(page);
  await page.goto('/');
  await openRoadmap(page);
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.locator('.roadmap-vote').click();
  await expect(page.locator('.roadmap-vote')).toHaveAttribute('aria-pressed', 'true');
  expect((await tsLog(page)).rendered[0]).toMatchObject({ theme: 'dark', language: 'en' });
  // Dark panels with light writing, not the light theme's.
  const colours = await page.locator('.roadmap-item').evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e.querySelector('.card-title')!).color }));
  expect(colours.bg).not.toBe('rgb(255, 248, 236)');
  expect(colours.fg).not.toBe('rgb(43, 27, 36)');
});

test('on a phone the Roadmap fits the screen in every language, with no text spilling out of buttons', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phones only');
  await signedInServer(page);
  await pretendTurnstile(page);
  for (const lang of ['en', 'es', 'pt-BR', 'de', 'fr', 'ja']) {
    await page.goto(`/?lang=${lang}`);
    await expect(page.locator('.lobby-nav')).toBeVisible();
    await openRoadmap(page);
    await expect(page.locator('.roadmap-form')).toBeVisible();
    await fits(page);
    expect(await spillingOf(page), lang).toEqual([]);
    // The page's own box scrolls to the idea form: nothing is cut off at the bottom.
    await page.locator('.roadmap-send').scrollIntoViewIfNeeded();
    await expect(page.locator('.roadmap-send')).toBeVisible();
    // Nothing wider than the screen.
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide, lang).toBeLessThanOrEqual(1);
  }
});
