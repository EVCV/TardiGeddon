// Asking players for a review. In the phone apps: the store's own pop-up
// (Apple's star rating, Google Play's review card), which the store may or may
// not show. On the website: a link on the results screen to our review page,
// where players pick a review site. Only after a win, once someone has played
// a while on a few different days, and rarely. Never a reward for reviewing,
// and the same ask whoever it is (we never ask "enjoying it?" first and only
// send on the happy ones): the stores and review sites forbid both.

import { Capacitor, registerPlugin } from '@capacitor/core';

const Review = registerPlugin<{ request(): Promise<void> }>('Review');

/** Matches finished, and different days played, before the first ask. */
export const REVIEW_MATCHES = 5;
export const REVIEW_DAYS = 3;
/** Days between asks (the stores limit their pop-ups further). */
export const REVIEW_GAP_DAYS = 60;

/** The website's review page (several review sites in one form). Unset: no ask on the website. */
const REVIEW_URL = (import.meta.env.VITE_REVIEW_URL as string | undefined) ?? '';

export interface ReviewRecord {
  matches: number;
  /** The first few days played (YYYY-MM-DD), up to REVIEW_DAYS. */
  days: string[];
  /** When we last asked (YYYY-MM-DD), or ''. */
  asked: string;
}

const KEY = 'tardigeddon.review';

/** A match has ended: count it, and say whether to ask for a review now. */
export function afterMatch(r: ReviewRecord, won: boolean, today: string): { record: ReviewRecord; ask: boolean } {
  const days = r.days.includes(today) || r.days.length >= REVIEW_DAYS ? r.days : [...r.days, today];
  const record = { ...r, matches: r.matches + 1, days };
  const rested = !r.asked || daysBetween(r.asked, today) >= REVIEW_GAP_DAYS;
  const ask = won && record.matches >= REVIEW_MATCHES && days.length >= REVIEW_DAYS && rested;
  if (ask) record.asked = today;
  return { record, ask };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function load(): ReviewRecord {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ReviewRecord | null;
    if (r && typeof r.matches === 'number' && Array.isArray(r.days) && typeof r.asked === 'string') return r;
  } catch {
    // no saved record (private window, blocked storage): start afresh
  }
  return { matches: 0, days: [], asked: '' };
}

function save(r: ReviewRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    // can't save: we may just ask again another day
  }
}

/** Can this player be asked at all here (the apps, or the website once it has a review page)? */
function canAsk(): boolean {
  return Capacitor.isNativePlatform() || !!REVIEW_URL;
}

/**
 * A match the player took part in has ended. Returns the website's review
 * page when it's time to show its link on the results screen; in the apps it
 * asks the store itself (and returns null).
 */
export function noteMatchForReview(won: boolean): string | null {
  if (!canAsk()) return null;
  const { record, ask } = afterMatch(load(), won, new Date().toISOString().slice(0, 10));
  save(record);
  if (!ask) return null;
  if (Capacitor.isNativePlatform()) {
    void Review.request().catch(() => {});
    return null;
  }
  return REVIEW_URL;
}
