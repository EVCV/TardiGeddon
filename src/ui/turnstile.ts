// Cloudflare Turnstile in the game: the security check behind voting on the
// roadmap and sending ideas (server/turnstile.ts has the other half).
//
// - Nothing is loaded until the Roadmap view is opened by a signed-in player
//   (preloadTurnstile): the menu stays small, and signed-out players never touch Cloudflare.
// - Each check is one token that works once, for five minutes. withTurnstile gets a
//   fresh one for each request and resets the widget afterwards, whether the request
//   worked or not, so a retry never sends a spent token.
// - The widget is "interaction only": invisible unless Cloudflare needs the player to
//   do something, when it shows at the bottom of the screen. It lives outside the menu's
//   page, which the hub redraws all the time, so a redraw never destroys a check in progress.

import { lang, t } from '../i18n/i18n';
import { isNativeApp } from '../native';

export type TurnstileAction = 'roadmap_vote' | 'suggestion';

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare's script, for drawing widgets ourselves ("explicit"). It calls the function named in `onload` once it is
 * ready. (Not turnstile.ready(): that throws when the script tag has async or defer, which a script added this way
 * should have so it never holds the page up.)
 */
const LOADED_CALLBACK = 'tardigeddonTurnstileLoaded';
const SCRIPT_URL = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${LOADED_CALLBACK}`;
/** How long to wait for Cloudflare's script, and for a check to finish (more if the player has a puzzle to do). */
const LOAD_TIMEOUT_MS = 20_000;
const CHECK_TIMEOUT_MS = 60_000;

export type TurnstileProblem = 'load' | 'failed';

/** The security check couldn't be had: its message is ready to show, in the player's language. */
export class TurnstileError extends Error {
  constructor(readonly problem: TurnstileProblem) {
    super(
      problem === 'load'
        ? isNativeApp()
          ? t('The security check couldn’t load in the app. You can vote and suggest ideas at tardigeddon.com/play instead.')
          : t('The security check couldn’t load. Check your connection and try again.')
        : t('The security check didn’t pass. Please try again.'),
    );
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** Load Cloudflare's script (once; a failed try can be made again). */
export function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    const global = window as unknown as Record<string, unknown>;
    const finish = () => {
      clearTimeout(timer);
      delete global[LOADED_CALLBACK];
    };
    const fail = () => {
      finish();
      loading = null;
      script.remove();
      reject(new TurnstileError('load'));
    };
    const timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    script.onerror = fail;
    global[LOADED_CALLBACK] = () => {
      const api = window.turnstile;
      if (!api) return fail();
      finish();
      resolve(api);
    };
    document.head.append(script);
  });
  return loading;
}

/** Start loading the script, quietly (the Roadmap view opened, signed in): a failure shows when a check is needed. */
export function preloadTurnstile(): void {
  loadTurnstile().catch(() => {});
}

/** Turnstile's name for the game's language. */
const turnstileLanguage = (): string => lang().toLowerCase();

interface Widget {
  id: string;
  host: HTMLElement;
  dark: boolean;
  language: string;
  /** Someone waiting for this widget's token. */
  waiting: { resolve: (token: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> } | null;
}

/** One widget per action and site key, kept (its id too) so it can be reset after each use. */
const widgets = new Map<string, Widget>();

function settle(w: Widget, outcome: { token: string } | { error: Error }): void {
  const waiting = w.waiting;
  if (!waiting) return;
  w.waiting = null;
  clearTimeout(waiting.timer);
  if ('token' in outcome) waiting.resolve(outcome.token);
  else waiting.reject(outcome.error);
}

function widgetFor(api: TurnstileApi, action: TurnstileAction, siteKey: string): Widget {
  const key = `${action}:${siteKey}`;
  const dark = document.documentElement.classList.contains('dark');
  const language = turnstileLanguage();
  const had = widgets.get(key);
  // The look or the language changed since it was drawn (Settings): draw it again.
  if (had && (had.dark !== dark || had.language !== language)) {
    try {
      api.remove(had.id);
    } catch {
      /* already gone */
    }
    had.host.remove();
    widgets.delete(key);
  } else if (had) return had;

  const host = document.createElement('div');
  host.className = 'turnstile-host';
  document.body.append(host);
  const w: Widget = { id: '', host, dark, language, waiting: null };
  w.id = api.render(host, {
    sitekey: siteKey,
    action,
    theme: dark ? 'dark' : 'light',
    language,
    // Invisible unless the player has something to do; run only when a check is asked for.
    appearance: 'interaction-only',
    execution: 'execute',
    'refresh-expired': 'manual',
    callback: (token: string) => settle(w, { token }),
    'error-callback': () => {
      settle(w, { error: new TurnstileError('failed') });
      return true;
    },
    'timeout-callback': () => settle(w, { error: new TurnstileError('failed') }),
    // A token that ran out before it was used isn't waited for: the next request asks for a new one.
    'expired-callback': () => {},
    'before-interactive-callback': () => host.classList.add('show'),
    'after-interactive-callback': () => host.classList.remove('show'),
  });
  widgets.set(key, w);
  return w;
}

/**
 * Run `use` with a fresh Turnstile token for `action` (a vote or a suggestion). Throws a TurnstileError
 * (with a message to show) if the check can't load or doesn't pass. The widget is reset afterwards
 * whatever happens: a token is good for one request.
 */
export async function withTurnstile<T>(action: TurnstileAction, siteKey: string, use: (token: string) => Promise<T>): Promise<T> {
  const api = await loadTurnstile();
  const w = widgetFor(api, action, siteKey);
  try {
    const token = await new Promise<string>((resolve, reject) => {
      if (w.waiting) return reject(new TurnstileError('failed'));
      const timer = setTimeout(() => settle(w, { error: new TurnstileError('failed') }), CHECK_TIMEOUT_MS);
      w.waiting = { resolve, reject, timer };
      try {
        api.reset(w.id);
        api.execute(w.id);
      } catch {
        settle(w, { error: new TurnstileError('failed') });
      }
    });
    return await use(token);
  } finally {
    w.host.classList.remove('show');
    try {
      api.reset(w.id);
    } catch {
      /* the widget is gone: the next check draws a new one */
      widgets.delete(`${action}:${siteKey}`);
    }
  }
}
