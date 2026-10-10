// The signed-in player, as the game sees them: who they are and which shop
// items they own. Talks to the game server's /api (server/accounts.ts) with
// its session cookie. Ownership is enforced by the server for online games;
// the copy cached here only decides what this device shows as unlocked.

import { serverUrl } from '../net/client';
import { canUse, unlockedWeapons } from '../shop/catalog';

/** What GET /api/me returns. */
export interface MeResponse {
  user: { id: string; name: string; email: string; emailVerified?: boolean; createdAt: string } | null;
  owned: string[];
  /** Coins (bought) and Slime (earned). */
  wallet: { coins: number; slime: number };
  /** Lifetime stats for this account. */
  stats: PlayerStats;
  /** Whether coins can be bought (Stripe is set up). */
  shop: boolean;
  /** Sign-in providers besides email: 'google', 'apple'. */
  providers: string[];
  /** Whether the server can send email (password reset, confirming your email). */
  mail?: boolean;
  /** Set only on Cloudflare preview builds that can't reach the server (see refreshAccount). */
  preview?: boolean;
}

export interface PlayerStats {
  onlinePlayed: number;
  onlineWon: number;
  cpuPlayed: number;
  cpuWon: number;
  /** Enemy tardis popped, and damage dealt to enemies. */
  popped: number;
  damage: number;
  /** Wins in a row, and the best run so far. */
  streak: number;
  bestStreak: number;
  /** Own goals: damage to your own team, your own tardis popped. */
  selfDamage: number;
  selfPopped: number;
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
  return canUse('hat', hat, ownedItems()) ? hat : 'beanie';
}

/** Likewise for skins. */
export function wearSkin(skin: string): string {
  return canUse('skin', skin, ownedItems()) ? skin : 'classic';
}

/** Season weapons the signed-in player has unlocked (switched on in the matches they start). */
export function myUnlockedWeapons(): string[] {
  return unlockedWeapons(ownedItems());
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
  if (!r.ok) throw new Error(data.message || data.error || `Something went wrong (error ${r.status}). Please try again.`);
  return data;
}

/** Fetch who's signed in. Quietly leaves accounts off if the server can't be reached. */
export async function refreshAccount(): Promise<MeResponse | null> {
  try {
    const r = await call<MeResponse>('/api/me');
    set(Array.isArray(r.owned) ? { ...r, wallet: r.wallet ?? { coins: 0, slime: 0 } } : null);
  } catch {
    set(isPreviewBuild() ? previewMe() : null);
  }
  return me;
}

/**
 * Cloudflare's preview links (*.pages.dev) can't reach the game server, so
 * accounts would look switched off and the Stats, Shop and Account pages
 * would be hidden. There, show them signed out so the pages can be reviewed.
 */
function isPreviewBuild(): boolean {
  return location.hostname.endsWith('.pages.dev');
}

function previewMe(): MeResponse {
  return {
    user: null,
    owned: [],
    wallet: { coins: 0, slime: 0 },
    stats: { onlinePlayed: 0, onlineWon: 0, cpuPlayed: 0, cpuWon: 0, popped: 0, damage: 0, streak: 0, bestStreak: 0, selfDamage: 0, selfPopped: 0 },
    shop: true,
    providers: [],
    preview: true,
  };
}

export async function signIn(email: string, password: string): Promise<void> {
  await call('/api/auth/sign-in/email', { email, password });
  await refreshAccount();
}

export async function signUp(name: string, email: string, password: string): Promise<void> {
  await call('/api/auth/sign-up/email', { name, email, password });
  await refreshAccount();
}

/** Email a password reset link (if there's an account for that email; the answer is the same either way). */
export async function requestPasswordReset(email: string): Promise<void> {
  await call('/api/auth/request-password-reset', { email });
}

/** Set a new password with the token from the reset link. Signs out every device. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  try {
    await call('/api/auth/reset-password', { token, newPassword });
  } catch (e) {
    // Better Auth says "Invalid token" for expired and used links alike.
    if (e instanceof Error && /token/i.test(e.message)) throw new Error('That reset link has expired or was already used. Ask for a new one below.');
    throw e;
  }
}

/** Confirm the email address with the token from the "confirm your email" link. */
export async function confirmEmail(token: string): Promise<void> {
  try {
    await call(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  } catch {
    throw new Error('That confirmation link has expired or was already used. Sign in and ask for a new one on your Account page.');
  }
  await refreshAccount();
}

/** Send the "confirm your email" link again. */
export async function resendConfirmation(email: string): Promise<void> {
  await call('/api/auth/send-verification-email', { email });
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

/** Spend coins or Slime on an item. */
export async function unlock(item: string): Promise<void> {
  await call('/api/shop/unlock', { item });
  await refreshAccount();
}

/** Off to Stripe's page with the player's purchases and receipts. */
export async function managePurchases(): Promise<void> {
  const r = await call<{ url?: string }>('/api/shop/portal', {});
  if (r.url) location.href = r.url;
}

/** A finished match against the CPU, for the signed-in player's stats (online ones are counted by the server). */
export async function reportCpuMatch(r: { won: boolean; popped: number; damage: number; selfDamage: number; selfPopped: number }): Promise<number> {
  if (!me?.user) return 0;
  let slime = 0;
  try {
    slime = (await call<{ slime?: number }>('/api/stats/match', r)).slime ?? 0;
  } catch {
    /* stats are a nice-to-have */
  }
  await refreshAccount();
  return slime;
}

/** Google / Apple: off to the provider, then back to the game. */
export async function signInWith(provider: string): Promise<void> {
  const r = await call<{ url?: string }>('/api/auth/sign-in/social', { provider, callbackURL: location.href.split('?')[0] });
  if (r.url) location.href = r.url;
}

/**
 * Off to Stripe's payment page for a coin pack. `consent`: the player asked
 * for the coins straight away and accepted losing the 14-day cancellation right.
 */
/** `grownUp`: the buyer is 18+ or a parent or carer has agreed (needed for the biggest packs). */
export async function buyCoins(pack: string, consent: boolean, grownUp = false): Promise<void> {
  const r = await call<{ url?: string }>('/api/shop/checkout', { item: pack, consent, grownUp });
  if (r.url) location.href = r.url;
}
