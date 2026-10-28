// Anonymous play statistics (docs/USAGE.md): every event the game may count,
// and every value each detail may take. Nothing else is accepted, by the game
// or the server, so no free text (names, codes, messages) can ever be sent.
// Shared by the game and the server; no sim or Pixi here (the menu loads it).

/** Ways to play. */
export const USAGE_MODES = ['cpu', 'hotseat', 'online', 'tutorial', 'practice', 'targets', 'rope', 'race'] as const;
/** The CPU's skill, or '-' when there's no CPU. */
export const USAGE_SKILLS = ['-', 'beginner', 'easy', 'normal', 'hard', 'perfect'] as const;
/** How long the game stayed on screen at a time. */
export const USAGE_LENGTHS = ['<10s', '10s-1m', '1-5m', '5-15m', '15-30m', '30-60m', '60m+'] as const;

/** A detail's allowed values; 'weapon' means a weapon id (checked by the server with isWeaponId). */
type Values = readonly string[] | 'weapon';

export const USAGE_EVENTS = {
  /** The game was opened. */
  open: { platform: ['web', 'android', 'ios'], device: ['phone', 'tablet', 'desktop'], lang: ['en', 'es', 'pt-BR', 'de', 'fr', 'ja'] },
  /** One stretch of the game on screen, by length. */
  visit: { length: USAGE_LENGTHS },
  /** Seconds the game was on screen (the count is the seconds). */
  seconds: {},
  /** A menu page opened. */
  page: { page: ['lobby', 'stats', 'shop', 'account', 'settings', 'sales', 'guide', 'looks', 'team', 'practice', 'online'] },
  /** A match started. */
  match: { mode: USAGE_MODES, skill: USAGE_SKILLS },
  /** A match ended: how it went for the player, or left before the end. */
  result: { mode: USAGE_MODES, skill: USAGE_SKILLS, outcome: ['won', 'lost', 'draw', 'done', 'left'] },
  /** Seconds spent in matches (the count is the seconds). */
  playtime: { mode: USAGE_MODES },
  /** Shots the player fired with a weapon (the count is the shots). */
  weapon: { weapon: 'weapon' },
} as const satisfies Record<string, Record<string, Values>>;

export type UsageEvent = keyof typeof USAGE_EVENTS;
export type UsageDetail<E extends UsageEvent> = { [K in keyof (typeof USAGE_EVENTS)[E]]: string };

/** The most one event may count at once (seconds up to 4 hours; anything else, a few hundred). */
export function usageMax(e: UsageEvent): number {
  return e === 'seconds' || e === 'playtime' ? 4 * 3600 : e === 'weapon' ? 500 : 50;
}

/** One counted thing, as sent: the event, its details in a fixed order ("mode=cpu&skill=normal") and how many. */
export interface UsageEntry {
  e: string;
  d: string;
  n: number;
}

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
  const spec = USAGE_EVENTS[ev] as Record<string, Values>;
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
