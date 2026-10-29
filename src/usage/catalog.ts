// Anonymous play statistics (docs/USAGE.md): every event the game may count,
// and every value each detail may take. Nothing else is accepted, by the game
// or the server, so no free text (names, codes, messages) can ever be sent.
// Shared by the game and the server; no sim or Pixi here (the menu loads it).

import { COIN_PACKS } from '../shop/catalog';

/** Ways to play. */
export const USAGE_MODES = ['cpu', 'hotseat', 'online', 'tutorial', 'practice', 'targets', 'rope', 'race'] as const;
/** The CPU's skill, or '-' when there's no CPU. */
export const USAGE_SKILLS = ['-', 'beginner', 'easy', 'normal', 'hard', 'perfect'] as const;
/** How long the game stayed on screen at a time. */
export const USAGE_LENGTHS = ['<10s', '10s-1m', '1-5m', '5-15m', '15-30m', '30-60m', '60m+'] as const;

/** How long something took to load. */
export const USAGE_LOADS = ['<1s', '1-2s', '2-3s', '3-5s', '5-10s', '10-20s', '20s+'] as const;
/** How long a player waited in quick play. */
export const USAGE_WAITS = ['<5s', '5-10s', '10-20s', '20-30s', '30-60s', '1-2m', '2-5m', '5m+'] as const;
/** Kinds of device, by screen size and touch. */
export const USAGE_DEVICES = ['phone', 'tablet', 'desktop'] as const;
/** What went wrong: a script error, a promise nobody caught, the graphics or sound failing, or an online match out of step. */
export const USAGE_ERRORS = ['error', 'promise', 'webgl', 'audio', 'desync'] as const;
/** Where the game was: the menus, or a match by its mode (watching a replay, or an online match as a spectator). */
export const USAGE_PLACES = ['menu', ...USAGE_MODES, 'replay', 'watch'] as const;
/** The tutorial's steps, in order (src/ui/tutorial.ts), then finishing it. */
export const USAGE_TUTORIAL = ['walk', 'jump', 'aim', 'look', 'weapons', 'pick', 'fire', 'hit', 'strike', 'wind', 'done'] as const;
/** Where a "Get coins" button was tapped. */
export const USAGE_COIN_TAPS = ['banner', 'hero', 'nav', 'wallet', 'looks', 'tab', 'item', 'bundle'] as const;
/** Where coins are paid for. */
export const USAGE_STORES = ['stripe', 'play', 'appstore'] as const;

/** A detail's allowed values; 'weapon' means a weapon id (checked by the server with isWeaponId). */
type Values = readonly string[] | 'weapon';

export const USAGE_EVENTS = {
  /**
   * The game was opened: in which app, on which kind of device, in which
   * language. Counted separately, so no stored total combines them (a
   * rare mix could point to one person).
   */
  app: { platform: ['web', 'android', 'ios'] },
  device: { device: USAGE_DEVICES },
  lang: { lang: ['en', 'es', 'pt-BR', 'de', 'fr', 'ja'] },
  /** One stretch of the game on screen, by length. */
  visit: { length: USAGE_LENGTHS },
  /** Seconds the game was on screen (the count is the seconds). */
  seconds: {},
  /** A menu page opened. */
  page: { page: ['lobby', 'stats', 'shop', 'account', 'settings', 'sales', 'guide', 'looks', 'team', 'practice', 'online', 'news'] },
  /** A match started. */
  match: { mode: USAGE_MODES, skill: USAGE_SKILLS },
  /** A match ended: how it went for the player, or left before the end. */
  result: { mode: USAGE_MODES, skill: USAGE_SKILLS, outcome: ['won', 'lost', 'draw', 'done', 'left'] },
  /** Seconds spent in matches (the count is the seconds). */
  playtime: { mode: USAGE_MODES },
  /** Shots the player fired with a weapon (the count is the shots). */
  weapon: { weapon: 'weapon' },
  /** Something went wrong (never the message or the stack: they can hold names). */
  error: { kind: USAGE_ERRORS, where: USAGE_PLACES },
  /** A tutorial step reached (or the tutorial finished). */
  tutorial: { step: USAGE_TUTORIAL },
  /** A "Get coins" button tapped. */
  coinstap: { from: USAGE_COIN_TAPS },
  /** A coin pack chosen (its checkout opened). */
  coinspack: { pack: COIN_PACKS.map((p) => p.id) },
  /** Paying for coins: started, cancelled, failed, waiting on the store, or done. */
  checkout: { store: USAGE_STORES, step: ['start', 'cancel', 'fail', 'pending', 'done'] },
  /** Loading time: from opening the page to the menu, or from Play to the match running. */
  load: { what: ['menu', 'match'], time: USAGE_LOADS, device: USAGE_DEVICES },
  /** Online quick play (counted by the server): how long the wait was and how it ended. */
  quick: { wait: USAGE_WAITS, end: ['matched', 'cpu', 'gaveup', 'error', 'disconnected'] },
  /** Online rooms (counted by the server): private rooms created and joined, matches started and rematches. */
  room: { kind: ['private', 'quick'], action: ['created', 'joined', 'started', 'rematch'] },
} as const satisfies Record<string, Record<string, Values>>;

export type UsageEvent = keyof typeof USAGE_EVENTS;
export type UsageDetail<E extends UsageEvent> = { [K in keyof (typeof USAGE_EVENTS)[E]]: string };

/**
 * Events from older games, still accepted from builds already on testers'
 * phones and folded into today's events by the server (`foldLegacy`).
 */
const LEGACY_OPEN: Record<string, readonly string[]> = { platform: USAGE_EVENTS.app.platform, device: USAGE_DEVICES, lang: USAGE_EVENTS.lang.lang };

/** The most one event may count at once (seconds up to 4 hours; anything else, a few hundred). */
export function usageMax(e: UsageEvent): number {
  return e === 'seconds' || e === 'playtime' ? 4 * 3600 : e === 'weapon' ? 500 : e === 'error' ? USAGE_ERRORS_PER_VISIT : 50;
}

/** One counted thing, as sent: the event, its details in a fixed order ("mode=cpu&skill=normal") and how many. */
export interface UsageEntry {
  e: string;
  d: string;
  n: number;
}

/** Most errors one visit counts (so one broken device can't swamp the totals). */
export const USAGE_ERRORS_PER_VISIT = 10;

/** Most entries in one report. */
export const USAGE_BATCH = 60;

/** The details as one string, keys in the catalogue's order. */
export function usageDetail(e: UsageEvent, detail: Record<string, string>): string {
  return Object.keys(USAGE_EVENTS[e])
    .map((k) => `${k}=${detail[k] ?? ''}`)
    .join('&');
}

/**
 * Whether an entry is one the catalogue allows: a known event, exactly its
 * details with allowed values, and a whole count from 1 to its most.
 * `isWeapon` checks weapon ids (the server passes isWeaponId).
 */
export function validUsage(x: unknown, isWeapon: (id: string) => boolean): x is UsageEntry {
  if (!x || typeof x !== 'object') return false;
  const { e, d, n } = x as Record<string, unknown>;
  if (typeof e !== 'string' || !Object.hasOwn(USAGE_EVENTS, e) || typeof d !== 'string' || typeof n !== 'number') return false;
  const ev = e as UsageEvent;
  if (!Number.isInteger(n) || n < 1 || n > usageMax(ev)) return false;
  return detailFits(USAGE_EVENTS[ev] as Record<string, Values>, d, isWeapon);
}

/**
 * An old game's combined "open" (platform, device and language in one), as
 * its three separate counts; null if it isn't one. Never stored as it came.
 */
export function foldLegacy(x: unknown): UsageEntry[] | null {
  if (!x || typeof x !== 'object') return null;
  const { e, d, n } = x as Record<string, unknown>;
  if (e !== 'open' || typeof d !== 'string' || typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 50) return null;
  if (!detailFits(LEGACY_OPEN, d, () => false)) return null;
  const [platform, device, lang] = d.split('&');
  return [
    { e: 'app', d: platform, n },
    { e: 'device', d: device, n },
    { e: 'lang', d: lang, n },
  ];
}

/** Whether "k=v&k=v" has exactly the spec's keys, in order, each with an allowed value. */
function detailFits(spec: Record<string, Values>, d: string, isWeapon: (id: string) => boolean): boolean {
  const keys = Object.keys(spec);
  const parts = d === '' ? [] : d.split('&');
  if (parts.length !== keys.length) return false;
  return parts.every((p, i) => {
    const [k, v, extra] = p.split('=');
    if (k !== keys[i] || v === undefined || extra !== undefined) return false;
    const allowed = spec[k];
    return allowed === 'weapon' ? /^[a-z0-9]{1,24}$/.test(v) && isWeapon(v) : allowed.includes(v);
  });
}

/** A loading time (milliseconds) as its bucket. */
export function loadBucket(ms: number): (typeof USAGE_LOADS)[number] {
  const s = ms / 1000;
  return s < 1 ? '<1s' : s < 2 ? '1-2s' : s < 3 ? '2-3s' : s < 5 ? '3-5s' : s < 10 ? '5-10s' : s < 20 ? '10-20s' : '20s+';
}

/** A quick-play wait (milliseconds) as its bucket. */
export function waitBucket(ms: number): (typeof USAGE_WAITS)[number] {
  const s = ms / 1000;
  return s < 5 ? '<5s' : s < 10 ? '5-10s' : s < 20 ? '10-20s' : s < 30 ? '20-30s' : s < 60 ? '30-60s' : s < 120 ? '1-2m' : s < 300 ? '2-5m' : '5m+';
}

/** A visit's length as its bucket. */
export function lengthBucket(seconds: number): (typeof USAGE_LENGTHS)[number] {
  const m = seconds / 60;
  return seconds < 10 ? '<10s' : m < 1 ? '10s-1m' : m < 5 ? '1-5m' : m < 15 ? '5-15m' : m < 30 ? '15-30m' : m < 60 ? '30-60m' : '60m+';
}

/** The owner's report (GET /api/admin/usage). */
export interface UsageRow {
  event: string;
  detail: string;
  count: number;
}

export interface UsageReport {
  /** Totals for the period, by event and details. */
  rows: UsageRow[];
  /** Per day: times the game was opened and minutes it was on screen. */
  days: { day: string; opens: number; minutes: number }[];
}
