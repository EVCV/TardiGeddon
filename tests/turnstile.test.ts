import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEST_SECRET_KEY, TEST_SITE_KEY, createTurnstile, isProduction, type TurnstileEnv } from '../server/turnstile';

// Cloudflare Turnstile on votes and suggestions (server/turnstile.ts): everything is checked against a
// pretend Cloudflare, so these tests never touch the network. It must fail closed.

const KEYS: TurnstileEnv = {
  NODE_ENV: 'production',
  TURNSTILE_SITE_KEY: 'site-web',
  TURNSTILE_SECRET_KEY: 'secret-web',
  TURNSTILE_APP_SITE_KEY: 'site-app',
  TURNSTILE_APP_SECRET_KEY: 'secret-app',
};

type Answer = Record<string, unknown>;
const ok = (extra: Answer = {}): Answer => ({ success: true, action: 'suggestion', hostname: 'tardigeddon.com', 'error-codes': [], ...extra });

/** A pretend Cloudflare: answers with `answer`, and remembers what it was asked. */
function cloudflare(answer: Answer | (() => Promise<Response>)) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (typeof answer === 'function') return answer();
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

afterEach(() => vi.useRealTimers());

describe('which keys the game gets', () => {
  it('tells a public server from a developer’s computer the way Better Auth is told', () => {
    expect(isProduction({ NODE_ENV: 'production' })).toBe(true);
    expect(isProduction({ BETTER_AUTH_URL: 'https://server.tardigeddon.com' })).toBe(true);
    expect(isProduction({ BETTER_AUTH_URL: 'http://localhost:8787' })).toBe(false);
    expect(isProduction({})).toBe(false);
  });

  it('gives each platform its own site key, and only once its secret is set too', () => {
    expect(createTurnstile(KEYS).siteKeys()).toEqual({ web: 'site-web', app: 'site-app' });
    expect(createTurnstile({ ...KEYS, TURNSTILE_APP_SECRET_KEY: undefined }).siteKeys()).toEqual({ web: 'site-web' });
    expect(createTurnstile({ ...KEYS, TURNSTILE_SITE_KEY: undefined }).siteKeys()).toEqual({ app: 'site-app' });
  });

  it('is off in production without keys: never silently skipped', async () => {
    const t = createTurnstile({ NODE_ENV: 'production' });
    expect(t.siteKeys()).toEqual({});
    const cf = cloudflare(ok());
    const live = createTurnstile({ BETTER_AUTH_URL: 'https://server.tardigeddon.com' }, cf.fetchFn);
    expect(await live.verify('token', '1.2.3.4', 'suggestion', 'web')).toEqual({ ok: false, reason: 'unconfigured' });
    expect(cf.calls).toHaveLength(0);
  });

  it('uses Cloudflare’s test keys on a developer’s computer with none set (and not with half a pair)', () => {
    expect(createTurnstile({}).siteKeys()).toEqual({ web: TEST_SITE_KEY, app: TEST_SITE_KEY });
    expect(createTurnstile({ TURNSTILE_SITE_KEY: 'only-a-site-key' }).siteKeys()).toEqual({ app: TEST_SITE_KEY });
  });
});

describe('checking a token with Cloudflare', () => {
  it('asks Cloudflare with the secret, the token, the address and a fresh idempotency key', async () => {
    const cf = cloudflare(ok());
    const t = createTurnstile(KEYS, cf.fetchFn);
    expect(await t.verify('the-token', '203.0.113.7', 'suggestion', 'web')).toEqual({ ok: true });
    await t.verify('the-token', '203.0.113.7', 'suggestion', 'web');
    expect(cf.calls).toHaveLength(2);
    expect(cf.calls[0].url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(cf.calls[0].init.method).toBe('POST');
    const form = (i: number) => new URLSearchParams((cf.calls[i].init.body as URLSearchParams).toString());
    expect(form(0).get('secret')).toBe('secret-web');
    expect(form(0).get('response')).toBe('the-token');
    expect(form(0).get('remoteip')).toBe('203.0.113.7');
    expect(form(0).get('idempotency_key')).toMatch(/^[0-9a-f-]{36}$/);
    // Each try has its own key.
    expect(form(1).get('idempotency_key')).not.toBe(form(0).get('idempotency_key'));
    expect(cf.calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves the address out when it isn’t known', async () => {
    const cf = cloudflare(ok());
    await createTurnstile(KEYS, cf.fetchFn).verify('t', 'unknown', 'suggestion', 'web');
    expect(new URLSearchParams((cf.calls[0].init.body as URLSearchParams).toString()).has('remoteip')).toBe(false);
  });

  it('uses the app widget’s secret for the apps, and accepts the apps’ own page', async () => {
    const cf = cloudflare(ok({ action: 'roadmap_vote', hostname: 'app.tardigeddon.com' }));
    const t = createTurnstile(KEYS, cf.fetchFn);
    expect(await t.verify('t', '1.1.1.1', 'roadmap_vote', 'app')).toEqual({ ok: true });
    expect(new URLSearchParams((cf.calls[0].init.body as URLSearchParams).toString()).get('secret')).toBe('secret-app');
  });

  it('refuses a token made for another form', async () => {
    const t = createTurnstile(KEYS, cloudflare(ok({ action: 'roadmap_vote' })).fetchFn);
    expect(await t.verify('t', '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: false, reason: 'rejected' });
    // No action at all counts as the wrong one.
    const none = createTurnstile(KEYS, cloudflare({ success: true, hostname: 'tardigeddon.com' }).fetchFn);
    expect(await none.verify('t', '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: false, reason: 'rejected' });
  });

  it('refuses a token from another site, and from the wrong platform’s site', async () => {
    for (const hostname of ['evil.example', 'localhost', 'tardigeddon.com.evil.example', 'app.tardigeddon.com', undefined]) {
      const t = createTurnstile(KEYS, cloudflare(ok({ hostname })).fetchFn);
      expect(await t.verify('t', '1.1.1.1', 'suggestion', 'web'), String(hostname)).toEqual({ ok: false, reason: 'rejected' });
    }
    // The website's page can't use the apps' widget.
    const web = createTurnstile(KEYS, cloudflare(ok({ hostname: 'www.tardigeddon.com' })).fetchFn);
    expect(await web.verify('t', '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: true });
    expect(await web.verify('t', '1.1.1.1', 'suggestion', 'app')).toEqual({ ok: false, reason: 'rejected' });
  });

  it('takes more app hostnames from TURNSTILE_APP_HOSTNAMES', async () => {
    const t = createTurnstile({ ...KEYS, TURNSTILE_APP_HOSTNAMES: 'localhost, App.Example.com' }, cloudflare(ok({ hostname: 'app.example.com' })).fetchFn);
    expect(await t.verify('t', '1.1.1.1', 'suggestion', 'app')).toEqual({ ok: true });
    const old = createTurnstile({ ...KEYS, TURNSTILE_APP_HOSTNAMES: 'localhost' }, cloudflare(ok({ hostname: 'app.tardigeddon.com' })).fetchFn);
    expect(await old.verify('t', '1.1.1.1', 'suggestion', 'app')).toEqual({ ok: false, reason: 'rejected' });
  });

  it('refuses what Cloudflare refuses', async () => {
    const t = createTurnstile(KEYS, cloudflare({ success: false, 'error-codes': ['timeout-or-duplicate'] }).fetchFn);
    expect(await t.verify('t', '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: false, reason: 'rejected' });
    // Anything but a real true is a no.
    for (const success of ['true', 1, null, undefined]) {
      const odd = createTurnstile(KEYS, cloudflare(ok({ success })).fetchFn);
      expect(await odd.verify('t', '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: false, reason: 'rejected' });
    }
  });

  it('never calls Cloudflare for a token that can’t be real', async () => {
    const cf = cloudflare(ok());
    const t = createTurnstile(KEYS, cf.fetchFn);
    for (const token of [undefined, null, '', 42, {}, ['x'], 'x'.repeat(2049)]) {
      expect(await t.verify(token, '1.1.1.1', 'suggestion', 'web'), String(token).slice(0, 10)).toEqual({ ok: false, reason: 'missing' });
    }
    expect(cf.calls).toHaveLength(0);
    // 2048 is the longest Cloudflare makes.
    expect(await t.verify('x'.repeat(2048), '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: true });
  });

  it('refuses an unknown platform', async () => {
    const cf = cloudflare(ok());
    const t = createTurnstile(KEYS, cf.fetchFn);
    expect(await t.verify('t', '1.1.1.1', 'suggestion', 'desktop' as never)).toEqual({ ok: false, reason: 'unconfigured' });
    expect(cf.calls).toHaveLength(0);
  });

  it('fails closed when Cloudflare can’t be asked, or answers nonsense', async () => {
    const fails: Record<string, () => Promise<Response>> = {
      'a network error': async () => Promise.reject(new TypeError('fetch failed')),
      'a server error': async () => new Response('oops', { status: 502 }),
      'not JSON': async () => new Response('<html>hi</html>', { status: 200 }),
      'JSON that is not an object': async () => new Response('null', { status: 200 }),
    };
    for (const [name, answer] of Object.entries(fails)) {
      const t = createTurnstile(KEYS, cloudflare(answer).fetchFn);
      expect(await t.verify('t', '1.1.1.1', 'suggestion', 'web'), name).toEqual({ ok: false, reason: 'unavailable' });
    }
  });

  it('gives up after 10 seconds, and says no', async () => {
    vi.useFakeTimers();
    // A Cloudflare that never answers, but stops when it's told to.
    const hang = (async (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;
    const t = createTurnstile(KEYS, hang);
    const result = t.verify('t', '1.1.1.1', 'suggestion', 'web');
    await vi.advanceTimersByTimeAsync(9_999);
    let done = false;
    void result.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('on a developer’s computer, accepts any good answer from the test keys, and localhost for real keys', async () => {
    // The test secret's answers carry no real action or hostname (Cloudflare's docs), so only success counts.
    const test = cloudflare({ success: true, hostname: 'example.com', 'error-codes': [] });
    const dev = createTurnstile({}, test.fetchFn);
    expect(await dev.verify('t', '127.0.0.1', 'roadmap_vote', 'web')).toEqual({ ok: true });
    expect(new URLSearchParams((test.calls[0].init.body as URLSearchParams).toString()).get('secret')).toBe(TEST_SECRET_KEY);
    expect(await createTurnstile({}, cloudflare({ success: false }).fetchFn).verify('t', '127.0.0.1', 'roadmap_vote', 'web')).toEqual({ ok: false, reason: 'rejected' });
    // Real keys on localhost are still checked properly, with localhost allowed.
    const real: TurnstileEnv = { TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k' };
    expect(await createTurnstile(real, cloudflare(ok({ hostname: 'localhost' })).fetchFn).verify('t', '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: true });
    expect(await createTurnstile(real, cloudflare(ok({ hostname: 'localhost', action: 'other' })).fetchFn).verify('t', '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: false, reason: 'rejected' });
    // But never in production, not even with the test secret set as the real one.
    const prod = { NODE_ENV: 'production', TURNSTILE_SITE_KEY: TEST_SITE_KEY, TURNSTILE_SECRET_KEY: TEST_SECRET_KEY };
    expect(await createTurnstile(prod, cloudflare({ success: true, hostname: 'example.com' }).fetchFn).verify('t', '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: false, reason: 'rejected' });
    expect(await createTurnstile({ ...KEYS }, cloudflare(ok({ hostname: 'localhost' })).fetchFn).verify('t', '1.1.1.1', 'suggestion', 'web')).toEqual({ ok: false, reason: 'rejected' });
  });
});
