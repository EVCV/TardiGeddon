import { describe, expect, it } from 'vitest';
import { allKeys, localeFiles, placeholders, readLocale } from '../scripts/i18n';
import { matchLang, t, useDict } from '../src/i18n/i18n';

describe('translations', () => {
  const keys = allKeys();

  it('finds the texts to translate', () => {
    expect(keys.length).toBeGreaterThan(50);
    expect(keys).toContain('Spore Bazooka');
  });

  for (const f of localeFiles()) {
    it(`${f} has every text, with the same placeholders, and nothing stale`, () => {
      const d = readLocale(f);
      const set = new Set(keys);
      expect(keys.filter((k) => !d[k])).toEqual([]);
      expect(Object.keys(d).filter((k) => !set.has(k))).toEqual([]);
      expect(keys.filter((k) => placeholders(k).join() !== placeholders(d[k]).join())).toEqual([]);
    });
  }

  it('fills placeholders and falls back to English', () => {
    useDict('de', { 'Hello {name}': 'Hallo {name}' });
    expect(t('Hello {name}', { name: 'Ana' })).toBe('Hallo Ana');
    expect(t('Not translated')).toBe('Not translated');
    useDict('en', {});
  });

  it('picks the device language', () => {
    expect(matchLang(['pt-PT', 'en'])).toBe('pt-BR');
    expect(matchLang(['de-AT'])).toBe('de');
    expect(matchLang(['ko', 'ja-JP'])).toBe('ja');
    expect(matchLang(['ko'])).toBe('en');
  });
});
