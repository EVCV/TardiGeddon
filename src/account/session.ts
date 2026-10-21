// The signed-in player, as the game sees them: who they are and which shop
// items they own. Talks to the game server's /api (server/accounts.ts) with
// its session cookie. Ownership is enforced by the server for online games;
// the copy cached here only decides what this device shows as unlocked.

import { ARENAS, SURPRISE_ARENA } from '../render/arenas';
import { currentSeason, seasonArenaOpen } from '../render/seasons';
import type { UnspentRow } from '../shop/japan';
import { serverUrl } from '../net/client';
import { canUse, unlockedWeapons } from '../shop/catalog';
import { isNativeApp } from '../native';
import { playBillingAvailable, playBuy, playUnfinished } from '../shop/playBilling';
import { controls, sanitiseControls, setControls, type Controls } from '../input/controls';

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
  /** Whether "Purchases & receipts" (Stripe's customer portal) is offered. */
  receipts?: boolean;
  /** Sign-in providers besides email: 'google', 'apple'. */
  providers: string[];
  /** Whether the server can send email (password reset, confirming your email). */
  mail?: boolean;
  /** Only for the owner (ADMIN_EMAILS on the server): show the Sales page. */
  admin?: boolean;
  /** Set only on Cloudflare preview builds that can't reach the server (see refreshAccount). */
  preview?: boolean;
  /** Coin packs can be bought in the Android app, with Google Play Billing. */
  playBilling?: boolean;
  /** The player's control settings, if they've saved any (input/controls.ts). */
  controls?: unknown;
}

/** The owner's sales page: totals only, never who bought what. */
export interface SalesReport {
  /** Days covered (0 = all time). */
  days: number;
  /** When the owner last started the figures from zero (nothing before counts), if ever. */
  resetAt: string | null;
  players: { total: number; joined: number; buyers: number };
  /**
   * Coin packs per pack and currency (amounts in minor units, VAT included):
   * sold in the period (refunded later or not), and refunds made in the period.
   */
  packs: { item: string; currency: string; sold: number; amount: number; refunded: number; refundedAmount: number }[];
  /** Coins and Slime spent in the shop, per item or bundle. */
  spends: { item: string; currency: string; buys: number; amount: number }[];
  /** How many players own each shop item (all time, whatever the period). */
  owners: { item: string; owners: number }[];
  /** Coins bought with money and not spent yet (now, whatever the period), by country and currency. */
  unspent: UnspentRow[];
  /** Japan's Payment Services Act figure: what players in Japan's unspent paid coins cost (src/shop/japan.ts). */
  japan: { yen: number; limit: number; jpyPerGbp: number };
}

/** A gift this player has sent (the full code is only shown once, when it's bought). */
export interface GiftSent {
  id: number;
  item: string;
  /** Last 4 characters of the code. */
  hint: string;
  message: string;
  createdAt: string;
  status: 'waiting' | 'claimed' | 'cancelled';
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
  /** Quick-play rating (stats/rank.ts) and how many rated matches it's from. */
  rating: number;
  ratedGames: number;
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
  // In the phone apps: Google and Apple only allow their own payment systems,
  // so no coin packs or Stripe receipts (coins bought on the website still
  // spend). And Google/Apple sign-in pages refuse to open inside an app, and
  // would come back to the website: email sign-in only, for now (docs/APPS.md).
  // In the Android app, coin packs are sold with Google Play Billing instead.
  if (next && isNativeApp()) next = { ...next, shop: next.playBilling === true && playBillingAvailable(), receipts: false, providers: [] };
  // Signed in with saved controls: use them (signed out, this visit's settings stay).
  const saved = next?.user ? sanitiseControls(next.controls) : null;
  if (saved && JSON.stringify(saved) !== JSON.stringify(controls())) setControls(saved);
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

/**
 * Choices kept on this device rather than on a team: the arena you see, the
 * music you hear in matches and the sound pack your effects use. Only you
 * see or hear them, so nothing changes for anyone else online.
 */
function deviceChoice(key: string, fallback: string) {
  /** The choice made on this page, for when the browser won't let us store it. */
  let thisPage: string | null = null;
  return {
    get(): string {
      if (thisPage) return thisPage;
      try {
        return localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(id: string): void {
      thisPage = id;
      try {
        localStorage.setItem(key, id);
      } catch {
        // Storage blocked: the choice lasts until the page closes.
      }
    },
  };
}

const arenaChoice = deviceChoice('tardigeddon.arena', SURPRISE_ARENA);
const musicChoice = deviceChoice('tardigeddon.music', 'classic');
const soundsChoice = deviceChoice('tardigeddon.sounds', 'classic');

/** The arena theme this player picked (only they see it), whether or not they own it. */
export const chosenArena = (): string => arenaChoice.get();
export const chooseArena = (id: string): void => arenaChoice.set(id);

/** Arenas this player can use: the free ones and any they own. */
export function usableArenas(): string[] {
  const owned = ownedItems();
  return ARENAS.filter((a) => canUse('arena', a.id, owned) && seasonArenaOpen(a.id)).map((a) => a.id);
}

/**
 * The arena to actually show: "Surprise me" picks one of the usable ones at
 * random each match; one this device hasn't unlocked falls back to the meadow.
 */
export function wearArena(): string {
  const id = chosenArena();
  if (id === SURPRISE_ARENA) {
    // During a seasonal event, its world comes up half the time.
    const season = currentSeason();
    if (season && Math.random() < 0.5) return season.arena;
    const all = usableArenas();
    return all[Math.floor(Math.random() * all.length)] ?? 'classic';
  }
  return canUse('arena', id, ownedItems()) && seasonArenaOpen(id) ? id : 'classic';
}

/** The match music this player picked (only they hear it). */
export const chosenMusic = (): string => musicChoice.get();
export const chooseMusic = (id: string): void => musicChoice.set(id);

/** The match music to actually play: a track this device hasn't unlocked falls back to the standard one. */
export function wearMusic(): string {
  const id = chosenMusic();
  return canUse('music', id, ownedItems()) ? id : 'classic';
}

/** The sound pack this player picked for their effects (only they hear it). */
export const chosenSounds = (): string => soundsChoice.get();
export const chooseSounds = (id: string): void => soundsChoice.set(id);

/** The sound pack to actually use. */
export function wearSounds(): string {
  const id = chosenSounds();
  return canUse('sound', id, ownedItems()) ? id : 'classic';
}

/** The hat to actually wear: a shop hat this device hasn't unlocked falls back to the beanie. */
export function wearHat(hat: string): string {
  return canUse('hat', hat, ownedItems()) ? hat : 'beanie';
}

/** Likewise for skins. */
export function wearSkin(skin: string): string {
  return canUse('skin', skin, ownedItems()) ? skin : 'classic';
}

/** Likewise for aim styles and explosion effects. */
export function wearAim(aim: string): string {
  return canUse('aim', aim, ownedItems()) ? aim : 'classic';
}

export function wearFx(fx: string): string {
  return canUse('fx', fx, ownedItems()) ? fx : 'classic';
}

export function wearDance(dance: string): string {
  return canUse('dance', dance, ownedItems()) ? dance : 'classic';
}

export function wearGrave(grave: string): string {
  return canUse('grave', grave, ownedItems()) ? grave : 'classic';
}

/** A saved team's looks as worn in a match: anything this device hasn't unlocked swapped for the free one. */
export function wornLooks(p: { hat: string; skin: string; aim: string; fx: string; dance: string; grave: string; emblem: string }) {
  return { hat: wearHat(p.hat), skin: wearSkin(p.skin), aim: wearAim(p.aim), fx: wearFx(p.fx), dance: wearDance(p.dance), grave: wearGrave(p.grave), emblem: p.emblem };
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
    stats: { onlinePlayed: 0, onlineWon: 0, cpuPlayed: 0, cpuWon: 0, popped: 0, damage: 0, streak: 0, bestStreak: 0, selfDamage: 0, selfPopped: 0, rating: 1000, ratedGames: 0 },
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

/** The owner's sales figures for the last `days` days (0 = all time). */
export function salesReport(days: number): Promise<SalesReport> {
  return call<SalesReport>(`/api/admin/sales?days=${days}`);
}

/** Spend coins on a gift for someone else; returns its one-use code. */
export async function buyGift(item: string, message: string): Promise<string> {
  const r = await call<{ code: string }>('/api/gift/buy', { item, message });
  await refreshAccount();
  return r.code;
}

/** Claim a gift with its code. */
export async function redeemGift(code: string): Promise<{ item: string; items: string[]; from: string | null; message: string }> {
  const r = await call<{ item: string; items: string[]; from: string | null; message: string }>('/api/gift/redeem', { code });
  await refreshAccount();
  return r;
}

/** Take back an unclaimed gift (the coins come back). */
export async function cancelGift(id: number): Promise<void> {
  await call('/api/gift/cancel', { id });
  await refreshAccount();
}

export async function sentGifts(): Promise<GiftSent[]> {
  return (await call<{ gifts: GiftSent[] }>('/api/gift/sent')).gifts;
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
/** `grownUp`: the buyer is 18+ or a parent or carer has agreed (needed for every pack). */
/**
 * Buy a coin pack in the Android app: Google's payment sheet, then the server
 * checks the purchase with Google and adds the coins.
 */
export async function buyCoinsInApp(packId: string): Promise<{ result: 'done'; coins: number } | { result: 'pending' | 'cancelled' }> {
  if (!me?.user) throw new Error('Please sign in first.');
  const r = await playBuy(packId, me.user.id);
  if (r.status === 'cancelled') return { result: 'cancelled' };
  if (r.status === 'pending') return { result: 'pending' };
  if (r.status === 'owned') {
    // An earlier purchase of this pack that never reached the server: finish that one now.
    const coins = await finishPlayPurchases();
    return coins > 0 ? { result: 'done', coins } : { result: 'pending' };
  }
  if (r.status !== 'purchased') return { result: 'pending' };
  const done = await call<{ coins?: number }>('/api/shop/google', { productId: r.productId, token: r.token });
  await refreshAccount();
  return { result: 'done', coins: done.coins ?? 0 };
}

let finishing: Promise<number> | null = null;

/**
 * Send the server any completed Google Play purchase it hasn't granted yet
 * (the app closed mid-purchase, no signal, or a slow payment went through).
 * Resolves to the coins added. Safe to call any time: the server grants each
 * purchase once.
 */
export function finishPlayPurchases(): Promise<number> {
  if (!me?.user || !me.playBilling || !playBillingAvailable()) return Promise.resolve(0);
  finishing ??= (async () => {
    let added = 0;
    try {
      for (const p of await playUnfinished()) {
        try {
          added += (await call<{ coins?: number }>('/api/shop/google', p)).coins ?? 0;
        } catch {
          // e.g. bought on another account: leave it for that account.
        }
      }
    } finally {
      finishing = null;
    }
    if (added > 0) await refreshAccount();
    return added;
  })();
  return finishing;
}

export async function buyCoins(pack: string, consent: boolean, grownUp = false): Promise<void> {
  const r = await call<{ url?: string }>('/api/shop/checkout', { item: pack, consent, grownUp });
  if (r.url) location.href = r.url;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let waiting: { resolve: (w: 'account') => void; reject: (e: unknown) => void }[] = [];

/**
 * Change the control settings: for this visit at once, and on the account
 * (a moment later, so a burst of changes is one save) when signed in.
 * Resolves to where they were kept.
 */
export function saveControls(c: Controls): Promise<'account' | 'visit'> {
  setControls(c);
  if (!me?.user) return Promise.resolve('visit');
  if (saveTimer) clearTimeout(saveTimer);
  return new Promise((resolve, reject) => {
    waiting.push({ resolve, reject });
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const these = waiting;
      waiting = [];
      const latest = controls();
      call('/api/settings', { controls: latest }).then(
        () => {
          if (me) me = { ...me, controls: latest };
          for (const w of these) w.resolve('account');
        },
        (e: unknown) => {
          for (const w of these) w.reject(e);
        },
      );
    }, 500);
  });
}

/** A leaderboard row (server/challenges.ts). */
export interface BoardRow {
  rank: number;
  name: string;
  value: number;
  ticks: number;
  you?: boolean;
}

/** Today's (or a day's) leaderboard for a daily challenge; null if the server can't be reached. */
export async function challengeBoard(kind: string, day: string): Promise<{ rows: BoardRow[]; me: BoardRow | null } | null> {
  try {
    return await call<{ rows: BoardRow[]; me: BoardRow | null }>(`/api/challenge/board?kind=${encodeURIComponent(kind)}&day=${encodeURIComponent(day)}`);
  } catch {
    return null;
  }
}

/** Send a finished run; the server plays it back and keeps the player's best. */
export function submitChallenge(kind: string, day: string, frames: unknown): Promise<{ me: BoardRow | null }> {
  return call<{ me: BoardRow | null }>('/api/challenge/submit', { kind, day, frames });
}
