// Anonymous play statistics (docs/USAGE.md). The game counts what is used
// (pages opened, matches played and how long, weapons fired) and sends the
// counts to our own server about once a minute. Never who: no account, no ID,
// no cookie, nothing kept on the device, and only values from the catalogue
// (src/usage/catalog.ts). The server adds them to totals per day.
// Off when the player turns it off in Settings, or their browser asks sites
// not to track (Global Privacy Control, Do Not Track).

import { USAGE_BATCH, lengthBucket, usageDetail, usageMax, type UsageDetail, type UsageEntry, type UsageEvent } from './catalog';
import { serverUrl } from '../net/client';

const KEY = 'tardigeddon.shareUsage';
const FLUSH_MS = 60_000;

/** Waiting to be sent, by event and details. */
const queue = new Map<string, UsageEntry>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** The browser asks sites not to track. */
function browserSaysNo(): boolean {
  if (typeof navigator === 'undefined') return true;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === '1';
}

/** The player's choice in Settings (on unless turned off). */
export function usageSetting(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Whether the browser asks not to be tracked, so nothing is sent whatever the setting. */
export function usageBlockedByBrowser(): boolean {
  return browserSaysNo();
}

export function setUsageSetting(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // Storage blocked: the choice lasts until the page closes.
    memoryOff = !on;
  }
  if (!on) queue.clear();
}
let memoryOff = false;

function sharing(): boolean {
  return !memoryOff && usageSetting() && !browserSaysNo() && endpoint() !== null;
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

/** The game opened: count it with its platform, kind of device and language, then time how long it's on screen. */
export function startUsage(platform: 'web' | 'android' | 'ios', lang: string): void {
  if (typeof document === 'undefined') return;
  const short = Math.min(screen.width, screen.height);
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const device = short < 600 ? 'phone' : touch ? 'tablet' : 'desktop';
  usage('open', { platform, device, lang });
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
