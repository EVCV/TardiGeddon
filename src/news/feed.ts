// The game's news (src/news/news.ts): the posts it was built with, swapped for
// the website's newest list (/news.json, written by the website build) once
// that arrives, so the apps show new posts without an app update. Anything
// fetched is checked first and only ever shown as plain text.

import { NEWS, NEWS_LANGS, type NewsKind, type NewsPost, type NewsText } from './news';
import { isNativeApp } from '../native';

const KEY = 'tardigeddon.newsSeen';
const KINDS: NewsKind[] = ['update', 'coming', 'issue'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Most posts kept from the website's list, and the longest text in one. */
const MAX_POSTS = 100;
const MAX_TEXT = 2000;

let posts: NewsPost[] = NEWS;
const listeners = new Set<() => void>();

/** Every post, newest posted first (the order of the list). */
export function newsPosts(): NewsPost[] {
  return posts;
}

/** Called when the website's list arrives. */
export function onNews(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Where the website's list is: the same site in a browser, tardigeddon.com in the apps. */
function newsUrl(): string {
  return isNativeApp() ? 'https://tardigeddon.com/news.json' : '/news.json';
}

/** Fetch the website's list; keep the built-in one if it can't be had (offline, or a build with no website). */
export async function refreshNews(): Promise<void> {
  try {
    const r = await fetch(newsUrl(), { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache' });
    if (!r.ok) return;
    const got = cleanNews(await r.json());
    if (!got?.length) return;
    posts = got;
    for (const fn of listeners) fn();
  } catch {
    // Offline, or no list here: the built-in posts stay.
  }
}

/** The website's list, checked: only well-formed posts, with English text at least. Null if it isn't a list. */
export function cleanNews(raw: unknown): NewsPost[] | null {
  const list = (raw as { posts?: unknown } | null)?.posts;
  if (!Array.isArray(list)) return null;
  const out: NewsPost[] = [];
  const ids = new Set<string>();
  for (const p of list.slice(0, MAX_POSTS)) {
    if (!p || typeof p !== 'object') continue;
    const { id, date, kind, fixed, text } = p as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(id) || ids.has(id)) continue;
    if (typeof date !== 'string' || !DATE.test(date) || !KINDS.includes(kind as NewsKind)) continue;
    if (fixed !== undefined && (typeof fixed !== 'string' || !DATE.test(fixed))) continue;
    if (!text || typeof text !== 'object') continue;
    const texts: Partial<Record<string, NewsText>> = {};
    for (const l of NEWS_LANGS) {
      const tx = cleanText((text as Record<string, unknown>)[l]);
      if (tx) texts[l] = tx;
    }
    if (!texts.en) continue;
    ids.add(id);
    // Languages it lacks show the English.
    const full = Object.fromEntries(NEWS_LANGS.map((l) => [l, texts[l] ?? texts.en])) as NewsPost['text'];
    out.push({ id, date, kind: kind as NewsKind, ...(fixed ? { fixed } : {}), text: full });
  }
  return out;
}

function cleanText(raw: unknown): NewsText | null {
  if (!raw || typeof raw !== 'object') return null;
  const { title, body } = raw as Record<string, unknown>;
  if (typeof title !== 'string' || !title.trim() || title.length > 200) return null;
  if (!Array.isArray(body) || body.length > 30 || !body.every((b) => typeof b === 'string' && b.length <= MAX_TEXT)) return null;
  return { title, body: body as string[] };
}

/** Is there a post the player hasn't seen (the newest one, since they last opened News)? */
export function newsUnread(): boolean {
  const newest = posts[0];
  if (!newest) return false;
  try {
    return localStorage.getItem(KEY) !== newest.id;
  } catch {
    return false;
  }
}

/** The player opened News: everything there now is read. */
export function markNewsRead(): void {
  const newest = posts[0];
  if (!newest) return;
  try {
    localStorage.setItem(KEY, newest.id);
  } catch {
    // Can't remember: the dot shows again next visit.
  }
}
