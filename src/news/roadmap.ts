// The roadmap, worked out from the news posts (src/news/news.ts): shared by the
// game's Roadmap view (src/ui/roadmap.ts), the website's /roadmap page and the
// server (which checks a vote is for a real roadmap item). Pure: no DOM.
//
// A "coming" post is a roadmap item, in the column its `stage` names (no stage:
// "next"). An update that says `ships: '<id>'` delivers that item, which then
// shows as Shipped, with the update's date, with nothing to delete by hand.
// Items show no dates: players read a date as a promise. See docs/ROADMAP.md.

import type { NewsPost, NewsStage } from './news';

/** The roadmap's columns, in order. */
export const STAGES: NewsStage[] = ['now', 'next', 'later'];

/** An item that has arrived: the "coming" post, and the update that delivered it. */
export interface ShippedItem {
  post: NewsPost;
  update: NewsPost;
  /** When it shipped (the update's date). */
  date: string;
}

export interface Roadmap {
  now: NewsPost[];
  next: NewsPost[];
  later: NewsPost[];
  /** Newest first. */
  shipped: ShippedItem[];
}

/** The column a "coming" post is in: its stage, or "next" if it names none. */
export function stageOf(p: NewsPost): NewsStage {
  return p.stage && STAGES.includes(p.stage) ? p.stage : 'next';
}

/** The ids of every "coming" post: what players can vote on (shipped or not). */
export function comingIds(posts: NewsPost[]): Set<string> {
  return new Set(posts.filter((p) => p.kind === 'coming').map((p) => p.id));
}

/** The update that delivered each "coming" post, by the post's id (the newest, if two say they did). */
function shippers(posts: NewsPost[]): Map<string, NewsPost> {
  const coming = comingIds(posts);
  const by = new Map<string, NewsPost>();
  for (const u of posts) {
    if (u.kind !== 'update' || !u.ships || !coming.has(u.ships)) continue;
    const had = by.get(u.ships);
    if (!had || u.date > had.date) by.set(u.ships, u);
  }
  return by;
}

/** The ids of "coming" posts an update has delivered. */
export function shippedIds(posts: NewsPost[]): Set<string> {
  return new Set(shippers(posts).keys());
}

/** The roadmap: what's in each column (soonest first), and what has shipped (newest first). */
export function roadmapOf(posts: NewsPost[]): Roadmap {
  const by = shippers(posts);
  const out: Roadmap = { now: [], next: [], later: [], shipped: [] };
  for (const p of posts) {
    if (p.kind !== 'coming') continue;
    const update = by.get(p.id);
    if (update) out.shipped.push({ post: p, update, date: update.date });
    else out[stageOf(p)].push(p);
  }
  // Sorting is stable: posts on the same day stay in the list's order.
  for (const s of STAGES) out[s].sort((a, b) => a.date.localeCompare(b.date));
  out.shipped.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

/** A roadmap item's first paragraph (what it is, in a line or two), or nothing. */
export function summaryOf(body: string[]): string {
  return body.find((l) => !l.startsWith('- ')) ?? '';
}
