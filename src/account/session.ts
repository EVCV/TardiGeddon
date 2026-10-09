// The signed-in player, as the game sees them: who they are and which shop
// items they own. Talks to the game server's /api (server/accounts.ts) with
// its session cookie. Ownership is enforced by the server for online games;
// the copy cached here only decides what this device shows as unlocked.

import { serverUrl } from '../net/client';
import { canWearHat } from '../shop/catalog';

/** What GET /api/me returns. */
export interface MeResponse {
  user: { id: string; name: string; email: string } | null;
  owned: string[];
  /** Whether the shop can take payments. */
  shop: boolean;
  /** Sign-in providers besides email: 'google', 'apple'. */
  providers: string[];
}

const OWNED_KEY = 'tardigeddon.owned';

/** null until loaded, or when the server is unreachable / has accounts turned off. */
let me: MeResponse | null = null;
let loaded = false;
const listeners = new Set<() => void>();

/** HTTP(S) address of the game server, from its WebSocket address. */
export function apiBase(): string | null {
  const ws = serverUrl();
  return ws ? ws.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '') : null;
}

export function account(): { me: MeResponse | null; loaded: boolean } {
  return { me, loaded };
}

export function onAccountChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next: MeResponse | null): void {
  me = next;
  loaded = true;
  if (next) {
    try {
      localStorage.setItem(OWNED_KEY, JSON.stringify(next.owned));
    } catch {
      /* ignore */
    }
  }
  for (const fn of listeners) fn();
}

/** Items owned by the last signed-in player on this device (works offline). */
export function ownedItems(): string[] {
  if (me) return me.owned;
  try {
    const v = JSON.parse(localStorage.getItem(OWNED_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The hat to actually wear: a shop hat this device hasn't unlocked falls back to the beanie. */
export function wearHat(hat: string): string {
  return canWearHat(hat, ownedItems()) ? hat : 'beanie';
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const base = apiBase();
  if (!base) throw new Error('Accounts are not available here.');
  let r: Response;
  try {
    r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  const data = (await r.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!r.ok) throw new Error(data.message || data.error || 'Something went wrong. Please try again.');
  return data;
}

/** Fetch who's signed in. Quietly leaves accounts off if the server can't be reached. */
export async function refreshAccount(): Promise<MeResponse | null> {
  try {
    const r = await call<MeResponse>('/api/me');
    set(Array.isArray(r.owned) ? r : null);
  } catch {
    set(null);
  }
  return me;
}

export async function signIn(email: string, password: string): Promise<void> {
  await call('/api/auth/sign-in/email', { email, password });
  await refreshAccount();
}

export async function signUp(name: string, email: string, password: string): Promise<void> {
  await call('/api/auth/sign-up/email', { name, email, password });
  await refreshAccount();
}

export async function signOut(): Promise<void> {
  await call('/api/auth/sign-out', {});
  try {
    localStorage.removeItem(OWNED_KEY);
  } catch {
    /* ignore */
  }
  await refreshAccount();
}

export async function deleteAccount(password: string): Promise<void> {
  await call('/api/auth/delete-user', password ? { password } : {});
  await signOut().catch(() => refreshAccount());
}

/** Google / Apple: off to the provider, then back to the game. */
export async function signInWith(provider: string): Promise<void> {
  const r = await call<{ url?: string }>('/api/auth/sign-in/social', { provider, callbackURL: location.href.split('?')[0] });
  if (r.url) location.href = r.url;
}

/** Off to Stripe's payment page for one item. */
export async function buy(item: string): Promise<void> {
  const r = await call<{ url?: string }>('/api/shop/checkout', { item });
  if (r.url) location.href = r.url;
}
