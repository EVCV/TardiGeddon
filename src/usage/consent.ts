// Whether the player lets the game share anonymous statistics (docs/USAGE.md):
// on unless they turned it off in Settings, and off while their browser asks
// sites not to track (Global Privacy Control, Do Not Track), unless the player
// turned it on themselves in Settings (their own choice for this game beats
// the browser's general one). Its own module so the online client can tell
// the server too, without importing the counting.

const KEY = 'tardigeddon.shareUsage';
/** The choice, while storage is blocked: lasts until the page closes (null: none made). */
let memory: boolean | null = null;

/** The browser asks sites not to track. */
export function usageBlockedByBrowser(): boolean {
  if (typeof navigator === 'undefined') return true;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === '1';
}

function stored(): string | null {
  if (memory !== null) return memory ? 'on' : 'off';
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The player's choice in Settings (on unless turned off). */
export function usageSetting(): boolean {
  return stored() !== 'off';
}

/** The player turned it on themselves (only kept when their browser asks not to be tracked). */
export function usageChosenOn(): boolean {
  return stored() === 'on';
}

export function storeUsageSetting(on: boolean): void {
  try {
    // "On" is only worth keeping when it overrides the browser's signal.
    if (!on) localStorage.setItem(KEY, 'off');
    else if (usageBlockedByBrowser()) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
    memory = null;
  } catch {
    memory = on;
  }
}

/** Counting allowed: the player hasn't turned it off, and the browser doesn't object (or the player turned it on anyway). */
export function usageAllowed(): boolean {
  return usageSetting() && (!usageBlockedByBrowser() || usageChosenOn());
}
