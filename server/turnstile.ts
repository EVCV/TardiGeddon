// Cloudflare Turnstile: the check that a vote or a suggestion comes from a real
// player using the game, not a script. The game shows a widget (src/ui/turnstile.ts),
// which gives a one-use token; the server asks Cloudflare whether it's good
// before doing anything (docs/SECURITY.md, docs/ROADMAP.md).
//
// - Two widgets, so the website's game and the phone apps each have their own
//   keys and hostnames: web (tardigeddon.com) and app (app.tardigeddon.com, where the
//   Capacitor apps' pages are served from: capacitor.config.ts).
// - It fails closed: no secret set in production, a network error, a timeout, an
//   answer we can't read, the wrong action or the wrong hostname all say no.
// - On a developer's computer (not production) with no keys set, Cloudflare's published
//   always-pass test keys are used, so the flow can be tried without an account.

import { randomUUID } from 'node:crypto';

/** What a token is for: the widget on the page sets it, and we check it came back. */
export type TurnstileAction = 'roadmap_vote' | 'suggestion';
export type TurnstilePlatform = 'web' | 'app';

export const TURNSTILE_ACTIONS: TurnstileAction[] = ['roadmap_vote', 'suggestion'];

export interface TurnstileEnv {
  /** The website widget's keys (the site key is public: it goes to the game). */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** The phone apps' widget's keys. */
  TURNSTILE_APP_SITE_KEY?: string;
  TURNSTILE_APP_SECRET_KEY?: string;
  /** Comma-separated hostnames the apps' widget may be served from (default app.tardigeddon.com). */
  TURNSTILE_APP_HOSTNAMES?: string;
  /** "production" on the live server (the Dockerfile sets it). */
  NODE_ENV?: string;
  /** This server's public URL: https means a public server. */
  BETTER_AUTH_URL?: string;
}

/** Why a check said no. */
export type TurnstileFailure =
  /** No keys for this platform on this server (production): voting and suggestions are off. */
  | 'unconfigured'
  /** The request had no token (or an impossible one). */
  | 'missing'
  /** Cloudflare says the token is bad, used, expired, or for something else. */
  | 'rejected'
  /** Cloudflare couldn't be asked, or answered nonsense: no. */
  | 'unavailable';

export type TurnstileResult = { ok: true } | { ok: false; reason: TurnstileFailure };

export interface Turnstile {
  /** The (public) site keys the game may show widgets for: only platforms that also have a secret here. */
  siteKeys(): { web?: string; app?: string };
  verify(token: unknown, remoteIp: string | undefined, action: TurnstileAction, platform: TurnstilePlatform): Promise<TurnstileResult>;
}

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** How long to wait for Cloudflare. */
const TIMEOUT_MS = 10_000;
/** The longest token Cloudflare issues. */
const MAX_TOKEN = 2048;

/** Cloudflare's published always-pass keys for testing (they work on any hostname). */
export const TEST_SITE_KEY = '1x00000000000000000000AA';
export const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

const WEB_HOSTNAMES = ['tardigeddon.com', 'www.tardigeddon.com'];
const APP_HOSTNAMES = ['app.tardigeddon.com'];
const DEV_HOSTNAMES = ['localhost', '127.0.0.1'];

/** The live server: NODE_ENV=production, or a public https address (as Better Auth is told: server/accounts.ts). */
export function isProduction(env: TurnstileEnv): boolean {
  return env.NODE_ENV === 'production' || (env.BETTER_AUTH_URL ?? '').startsWith('https://');
}

interface Widget {
  siteKey: string;
  secret: string;
  hostnames: string[];
  /** Cloudflare's always-pass test keys: its answers carry no real action or hostname, so only success is checked. */
  testKeys: boolean;
}

/** The widget for a platform: its own keys, or (not in production, none set) the test keys; null if it has none. */
function widgetFor(env: TurnstileEnv, platform: TurnstilePlatform, production: boolean): Widget | null {
  const siteKey = (platform === 'web' ? env.TURNSTILE_SITE_KEY : env.TURNSTILE_APP_SITE_KEY)?.trim();
  const secret = (platform === 'web' ? env.TURNSTILE_SECRET_KEY : env.TURNSTILE_APP_SECRET_KEY)?.trim();
  if (siteKey && secret) {
    const own = platform === 'web' ? WEB_HOSTNAMES : (env.TURNSTILE_APP_HOSTNAMES ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
    return {
      siteKey,
      secret,
      hostnames: [...(platform === 'app' && !own.length ? APP_HOSTNAMES : own), ...(production ? [] : DEV_HOSTNAMES)],
      testKeys: false,
    };
  }
  // One key of the pair, or none, in production: off, never silently skipped.
  if (production || siteKey || secret) return null;
  return { siteKey: TEST_SITE_KEY, secret: TEST_SECRET_KEY, hostnames: DEV_HOSTNAMES, testKeys: true };
}

/** `fetchFn`: tests stand in for Cloudflare. */
export function createTurnstile(env: TurnstileEnv, fetchFn: typeof fetch = fetch): Turnstile {
  const production = isProduction(env);
  const widgets: Record<TurnstilePlatform, Widget | null> = { web: widgetFor(env, 'web', production), app: widgetFor(env, 'app', production) };
  return {
    siteKeys() {
      return { ...(widgets.web ? { web: widgets.web.siteKey } : {}), ...(widgets.app ? { app: widgets.app.siteKey } : {}) };
    },
    async verify(token, remoteIp, action, platform) {
      const widget = platform === 'web' || platform === 'app' ? widgets[platform] : null;
      if (!widget) return { ok: false, reason: 'unconfigured' };
      // Never sent to Cloudflare if it can't be one: not text, empty, or longer than any it makes.
      if (typeof token !== 'string' || !token || token.length > MAX_TOKEN) return { ok: false, reason: 'missing' };

      const form = new URLSearchParams({ secret: widget.secret, response: token, idempotency_key: randomUUID() });
      if (remoteIp && remoteIp !== 'unknown') form.set('remoteip', remoteIp);
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
      let answer: { success?: unknown; action?: unknown; hostname?: unknown; 'error-codes'?: unknown };
      try {
        const r = await fetchFn(VERIFY_URL, { method: 'POST', body: form, signal: abort.signal, headers: { accept: 'application/json' } });
        if (!r.ok) throw new Error(`Cloudflare answered ${r.status}`);
        answer = (await r.json()) as typeof answer;
        if (!answer || typeof answer !== 'object') throw new Error('unreadable answer');
      } catch (e) {
        // Never the token or address: just why.
        console.warn('turnstile: could not check a token:', e instanceof Error ? e.message : 'unknown error');
        return { ok: false, reason: 'unavailable' };
      } finally {
        clearTimeout(timer);
      }

      if (answer.success !== true) {
        const codes = Array.isArray(answer['error-codes']) ? answer['error-codes'].filter((c): c is string => typeof c === 'string').slice(0, 5).join(',') : '';
        // "invalid-input-secret" means our setup is wrong: say so in the log, never to the player.
        if (/invalid-input-secret|missing-input-secret/.test(codes)) console.error(`turnstile: Cloudflare refused our secret key (${platform}): ${codes}`);
        return { ok: false, reason: 'rejected' };
      }
      if (widget.testKeys) return { ok: true };
      // A token made for another form or another site isn't ours to accept.
      if (answer.action !== action) return { ok: false, reason: 'rejected' };
      if (typeof answer.hostname !== 'string' || !widget.hostnames.includes(answer.hostname.toLowerCase())) return { ok: false, reason: 'rejected' };
      return { ok: true };
    },
  };
}
