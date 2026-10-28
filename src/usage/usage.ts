// Anonymous play statistics (docs/USAGE.md). The game counts what is used
// (pages opened, matches played and how long, weapons fired) and sends the
// counts to our own server about once a minute. Never who: no account, no ID,
// no cookie, nothing kept on the device, and only values from the catalogue
// (src/usage/catalog.ts). The server adds them to totals per day.
// Off when the player turns it off in Settings, or their browser asks sites
// not to track (Global Privacy Control, Do Not Track).

import { USAGE_BATCH, USAGE_ERRORS_PER_VISIT, lengthBucket, loadBucket, usageDetail, usageMax, type USAGE_ERRORS, type USAGE_PLACES, type UsageDetail, type UsageEntry, type UsageEvent } from './catalog';
import { serverUrl } from '../net/client';
import { storeUsageSetting, usageAllowed } from './consent';

const FLUSH_MS = 60_000;

/** Waiting to be sent, by event and details. */
const queue = new Map<string, UsageEntry>();
let timer: ReturnType<typeof setTimeout> | null = null;

export { usageBlockedByBrowser, usageSetting } from './consent';

export function setUsageSetting(on: boolean): void {
  storeUsageSetting(on);
  if (!on) queue.clear();
}

function sharing(): boolean {
  return usageAllowed() && endpoint() !== null;
}

function endpoint(): string | null {
  const ws = serverUrl();
  return ws ? ws.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '') + '/api/usage' : null;
}

/** Count something (`n` times, or n seconds). */
export function usage<E extends UsageEvent>(e: E, detail: UsageDetail<E>, n = 1): void {
  if (!sharing()) return;
  const d = usageDetail(e, detail as Record<string, string>);
  const key = `${e}?${d}`;
  const was = queue.get(key);
  const max = usageMax(e);
  const count = Math.min(max, Math.round(n) + (was?.n ?? 0));
  if (count < 1) return;
  queue.set(key, { e, d, n: count });
  // A full count is sent now, so nothing is lost to the cap.
  if (count >= max || queue.size >= USAGE_BATCH) flushUsage();
  else timer ??= setTimeout(flushUsage, FLUSH_MS);
}

/** Send what's waiting (also when the game is hidden or closed). Lost if offline: they're only counts. */
export function flushUsage(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const url = endpoint();
  if (!queue.size || !url || !sharing()) return queue.clear();
  const entries = [...queue.values()].slice(0, USAGE_BATCH);
  queue.clear();
  try {
    // Plain text, no cookies, no referrer: nothing that says who sent it.
    void fetch(url, {
      method: 'POST',
      body: JSON.stringify({ v: 1, entries }),
      headers: { 'content-type': 'text/plain' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      keepalive: true,
      mode: 'cors',
    }).catch(() => {});
  } catch {
    // No fetch, or the request was refused: nothing to do.
  }
}

/** The kind of device, from its screen size and touch only. */
export function deviceClass(): 'phone' | 'tablet' | 'desktop' {
  const short = Math.min(screen.width, screen.height);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return short < 600 ? 'phone' : touch ? 'tablet' : 'desktop';
}

/**
 * The game opened: count its app, kind of device and language (each on its
 * own, never together), watch for errors, then time how long it's on screen.
 */
export function startUsage(platform: 'web' | 'android' | 'ios', lang: string): void {
  if (typeof document === 'undefined') return;
  usage('app', { platform });
  usage('device', { device: deviceClass() });
  usage('lang', { lang });
  watchErrors();
  let shownAt = document.visibilityState === 'visible' ? performance.now() : -1;
  const hidden = () => {
    if (shownAt < 0) return;
    const secs = (performance.now() - shownAt) / 1000;
    shownAt = -1;
    usage('visit', { length: lengthBucket(secs) });
    if (secs >= 1) usage('seconds', {}, Math.min(secs, usageMax('seconds')));
    flushUsage();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') shownAt = performance.now();
    else hidden();
  });
  addEventListener('pagehide', hidden);
}

/** Where the game is now: the menus, or a match's mode (for errors). */
let place: (typeof USAGE_PLACES)[number] = 'menu';
let errors = 0;

export function setUsagePlace(where: (typeof USAGE_PLACES)[number]): void {
  place = where;
}

/**
 * Count something going wrong: only its kind and where, never the message or
 * the stack (they can hold player names). At most a few per visit.
 */
export function usageError(kind: (typeof USAGE_ERRORS)[number]): void {
  if (errors >= USAGE_ERRORS_PER_VISIT) return;
  errors++;
  usage('error', { kind, where: place });
}

function watchErrors(): void {
  addEventListener('error', (e) => {
    // A script error, not a picture or sound that failed to load (those don't bubble here as ErrorEvents).
    if (e instanceof ErrorEvent) usageError('error');
  });
  addEventListener('unhandledrejection', () => usageError('promise'));
}

/** Count how long something took to load (from `since`, a performance.now() time; 0 = opening the page). */
export function usageLoad(what: 'menu' | 'match', since: number): void {
  if (typeof document === 'undefined' || document.visibilityState !== 'visible') return; // a tab opened in the background waits, so its time says nothing
  usage('load', { what, time: loadBucket(performance.now() - since), device: deviceClass() });
}
