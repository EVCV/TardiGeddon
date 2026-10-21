// Every text to translate (src/i18n/i18n.ts): the English in each t('…') or
// tk('…') call in the game and server code, plus the names and blurbs that
// live in data files (listed in DATA below, shown with t(x.name)).
//
//   npm run i18n                 how complete each language is
//   npm run i18n -- missing de   write the keys German lacks to i18n-missing-de.json
//   npm run i18n -- prune        drop keys no longer used from every locale file

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_KEYS } from '../src/i18n/dataKeys';

const ROOT = new URL('..', import.meta.url).pathname;
const LOCALES = join(ROOT, 'src/i18n/locales');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}

/** A JS string literal's value (the escapes our code uses). */
function unescape(s: string): string {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|.)/g, (_, c: string) => {
    if (c === 'n') return '\n';
    if (c.startsWith('u')) return String.fromCodePoint(parseInt(c.replace(/[u{}]/g, ''), 16));
    return c;
  });
}

const CALL = /\b(?:t|tk)\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\$])*)`)/g;

/** Keys used in code. */
export function codeKeys(): Set<string> {
  const keys = new Set<string>();
  for (const f of [...files(join(ROOT, 'src')), ...files(join(ROOT, 'server'))]) {
    if (f.includes('/i18n/')) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(CALL)) keys.add(unescape(m[1] ?? m[2] ?? m[3]));
  }
  return keys;
}

export function allKeys(): string[] {
  const keys = codeKeys();
  for (const k of DATA_KEYS()) keys.add(k);
  keys.delete('');
  return [...keys].sort();
}

export function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

export function localeFiles(): string[] {
  return readdirSync(LOCALES).filter((f) => f.endsWith('.json'));
}

export function readLocale(f: string): Record<string, string> {
  return JSON.parse(readFileSync(join(LOCALES, f), 'utf8')) as Record<string, string>;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const keys = allKeys();
  const [cmd, which] = process.argv.slice(2);
  if (cmd === 'missing') {
    const d = readLocale(`${which}.json`);
    const missing = keys.filter((k) => !d[k]);
    writeFileSync(join(ROOT, `i18n-missing-${which}.json`), JSON.stringify(Object.fromEntries(missing.map((k) => [k, ''])), null, 1) + '\n');
    console.log(`${missing.length} missing → i18n-missing-${which}.json`);
  } else if (cmd === 'prune') {
    const set = new Set(keys);
    for (const f of localeFiles()) {
      const d = readLocale(f);
      const kept = Object.fromEntries(Object.entries(d).filter(([k]) => set.has(k)).sort(([a], [b]) => (a < b ? -1 : 1)));
      writeFileSync(join(LOCALES, f), JSON.stringify(kept, null, 1) + '\n');
    }
  } else {
    console.log(`${keys.length} texts`);
    for (const f of localeFiles()) {
      const d = readLocale(f);
      console.log(`${f}: ${keys.filter((k) => d[k]).length} / ${keys.length}`);
    }
  }
}
