// Links to the game that other people share (friend codes, room invites,
// invite codes) and that our emails send (confirm, reset). On a phone with the
// app, tapping one opens the app (docs/APPS.md, "App links"), which gets the
// whole address and reads the same ?things from it as the web game does.

/** The parts of a link the game acts on. */
const KEYS = ['room', 'invite', 'friend', 'verify', 'reset', 'shop'] as const;

/** A tardigeddon.com/play link's settings, or null if `url` isn't one. */
export function gameLinkParams(url: string | null | undefined): URLSearchParams | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !/^(www\.)?tardigeddon\.com$/.test(u.hostname) || !/^\/play(\/|\/index\.html)?$/.test(u.pathname)) return null;
  const out = new URLSearchParams();
  for (const k of KEYS) {
    const v = u.searchParams.get(k);
    if (v) out.set(k, v);
  }
  return out;
}

/** A friend code: letters and numbers (server/friends.ts). */
export const isFriendCode = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9-]{4,12}$/.test(s);

const FRIEND_KEY = 'tardigeddon.friendLink';

/** Came from a friend's link (?friend=CODE): kept until the Friends panel can offer to add them. */
export function savePendingFriend(code: string): void {
  try {
    localStorage.setItem(FRIEND_KEY, code.toUpperCase());
  } catch {
    /* storage blocked: the panel just won't fill it in */
  }
}

/** The friend code from a link, if one is waiting. `take`: and forget it. */
export function pendingFriend(take = false): string | null {
  try {
    const v = localStorage.getItem(FRIEND_KEY);
    if (take) localStorage.removeItem(FRIEND_KEY);
    return isFriendCode(v) ? v : null;
  } catch {
    return null;
  }
}
