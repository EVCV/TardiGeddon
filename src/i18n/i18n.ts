// Translations. The English text is the key: `t('Play online')`, with
// `{name}` placeholders for what changes (`t('Saved “{name}”.', { name })`).
// Each language is a JSON file in locales/ mapping English to its own text,
// downloaded only by players who use it; anything missing shows in English.
// tests/i18n.test.ts checks every file covers every key with the same
// placeholders (`npm run i18n` lists what's missing).
//
// Text from data (weapon names, hats, map styles…) is translated where it's
// shown: `t(w.name)`. scripts/i18n.ts collects those keys too.

export type Lang = 'en' | 'es' | 'pt-BR' | 'de' | 'fr' | 'ja';

/** The languages, each named in itself. */
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'pt-BR', name: 'Português (Brasil)' },
  { id: 'de', name: 'Deutsch' },
  { id: 'fr', name: 'Français' },
  { id: 'ja', name: '日本語' },
];

const KEY = 'tardigeddon.lang';
/** The locale files (Vite fills this in; outside Vite, e.g. the server under tsx, there are none). */
const LOCALES: Record<string, () => Promise<Record<string, string>>> = (() => {
  try {
    return import.meta.glob<Record<string, string>>('./locales/*.json', { import: 'default' });
  } catch {
    return {};
  }
})();

let dict: Record<string, string> = {};
let current: Lang = 'en';

export function isLang(v: unknown): v is Lang {
  return LANGS.some((l) => l.id === v);
}

/** The best of our languages for these (the device's), or English. */
export function matchLang(prefs: readonly string[]): Lang {
  for (const p of prefs) {
    const exact = LANGS.find((l) => l.id.toLowerCase() === p.toLowerCase());
    if (exact) return exact.id;
    const base = p.toLowerCase().split('-')[0];
    // Any Portuguese gets Brazil's (the only one we have).
    const near = LANGS.find((l) => l.id.toLowerCase().split('-')[0] === base);
    if (near) return near.id;
  }
  return 'en';
}

/** What the player picked in Settings, or 'auto' (follow the device). */
export function langSetting(): Lang | 'auto' {
  try {
    const v = localStorage.getItem(KEY);
    return isLang(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** The language to use: ?lang=xx (for testing), the setting, else the device's. */
export function chosenLang(): Lang {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
  if (isLang(q)) return q;
  const s = langSetting();
  if (s !== 'auto') return s;
  return typeof navigator !== 'undefined' ? matchLang(navigator.languages ?? [navigator.language]) : 'en';
}

export function lang(): Lang {
  return current;
}

/** Load the chosen language (before the first screen is drawn). */
export async function loadLang(l: Lang = chosenLang()): Promise<void> {
  current = l;
  dict = {};
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  const load = LOCALES[`./locales/${l}.json`];
  if (!load) return;
  try {
    dict = await load();
  } catch {
    /* offline and not cached yet: English it is */
  }
}

/** Save the setting; the caller reloads the page so everything is redrawn in it. */
export function setLangSetting(l: Lang | 'auto'): void {
  try {
    if (l === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
}

/** Use this dictionary directly (tests). */
export function useDict(l: Lang, d: Record<string, string>): void {
  current = l;
  dict = d;
}

/** The text in the player's language, with {placeholders} filled in. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const s = dict[text] || text;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** A number in the player's language's style (1,234 / 1.234 / 1 234). */
export function num(n: number): string {
  return n.toLocaleString(current);
}
