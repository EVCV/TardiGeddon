// Suggestions: ideas players send from the game's Roadmap view, which only the
// owner reads (server/roadmap.ts, docs/ROADMAP.md). The rules for what counts
// as one live here so the game's form and the server agree. Pure: no DOM.

export const SUGGESTION_CATEGORIES = ['weapon', 'map', 'mode', 'looks', 'other'] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

/** What the owner does with an idea. */
export const SUGGESTION_STATUSES = ['new', 'planned', 'declined', 'done'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/** Shortest and longest idea, in characters (after cleaning). */
export const SUGGESTION_MIN = 10;
export const SUGGESTION_MAX = 500;
/** Longest note the owner can keep with an idea. */
export const ADMIN_NOTE_MAX = 500;

export const isSuggestionCategory = (v: unknown): v is SuggestionCategory => typeof v === 'string' && (SUGGESTION_CATEGORIES as readonly string[]).includes(v);
export const isSuggestionStatus = (v: unknown): v is SuggestionStatus => typeof v === 'string' && (SUGGESTION_STATUSES as readonly string[]).includes(v);

/** Control characters (but not a new line), zero-width and text-direction tricks. */
const HIDDEN = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/g;

/**
 * What a person typed, made safe to keep and show as plain text: control and
 * invisible characters gone (tabs become spaces, new lines stay, at most one
 * blank line between paragraphs), spaces tidied. Null if it isn't text or is
 * absurdly long (a real idea is at most SUGGESTION_MAX characters).
 */
export function cleanText(raw: unknown, max = 2000): string | null {
  if (typeof raw !== 'string' || raw.length > max * 4) return null;
  const s = raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(HIDDEN, '')
    .replace(/[ \u00A0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

/** Characters in a text, as people count them (an emoji is one). */
export const textLength = (s: string): number => [...s].length;

export type IdeaProblem = 'short' | 'long' | 'bad';

/** An idea's text, cleaned, or what's wrong with it (too short or long once cleaned, or not text). */
export function cleanIdea(raw: unknown): { text: string } | { problem: IdeaProblem } {
  const text = cleanText(raw);
  if (text === null) return { problem: 'bad' };
  const n = textLength(text);
  if (n < SUGGESTION_MIN) return { problem: 'short' };
  if (n > SUGGESTION_MAX) return { problem: 'long' };
  return { text };
}

/** The same idea sent twice, however it's spaced or capitalised. */
export const ideaKey = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();
