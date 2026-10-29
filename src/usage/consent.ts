// Whether the player lets the game share anonymous statistics (docs/USAGE.md):
// on unless they turned it off in Settings, and never while their browser asks
// sites not to track (Global Privacy Control, Do Not Track). Its own module so
// the online client can tell the server too, without importing the counting.

const KEY = 'tardigeddon.shareUsage';
/** Turned off while storage is blocked: lasts until the page closes. */
let memoryOff = false;

/** The browser asks sites not to track. */
export function usageBlockedByBrowser(): boolean {
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

export function storeUsageSetting(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    memoryOff = !on;
  }
}

/** Counting allowed: the player hasn't turned it off, and the browser doesn't object. */
export function usageAllowed(): boolean {
  return !memoryOff && usageSetting() && !usageBlockedByBrowser();
}
