import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAPTIONS, LANGS } from '../store/listing/captions';

type Listing = Record<string, { play: { title: string; short: string; full: string }; appStore: { name: string; subtitle: string; promo: string; keywords: string } }>;
const listing = JSON.parse(readFileSync('store/listing/listing.json', 'utf8')) as Listing;
// Characters as the stores count them (an emoji or accented letter is one).
const len = (s: string) => [...s].length;

describe('store listings (docs/STORE_LISTING.md)', () => {
  it('have every language the game speaks', () => {
    expect(Object.keys(listing).sort()).toEqual([...LANGS].sort());
    expect(Object.keys(CAPTIONS).sort()).toEqual([...LANGS].sort());
  });

  it.each(LANGS)('%s fits Google Play’s and the App Store’s limits', (lang) => {
    const { play, appStore } = listing[lang];
    expect(len(play.title)).toBeLessThanOrEqual(30);
    expect(len(play.short)).toBeLessThanOrEqual(80);
    expect(len(play.full)).toBeLessThanOrEqual(4000);
    expect(len(appStore.name)).toBeLessThanOrEqual(30);
    expect(len(appStore.subtitle)).toBeLessThanOrEqual(30);
    expect(len(appStore.promo)).toBeLessThanOrEqual(170);
    expect(len(appStore.keywords)).toBeLessThanOrEqual(100);
  });

  it.each(LANGS)('%s says nothing the stores’ listing rules forbid', (lang) => {
    const { play, appStore } = listing[lang];
    const words = [play.title, play.short, appStore.name, appStore.subtitle, ...Object.values(CAPTIONS[lang]).flat()].join(' ').toLowerCase();
    // No prices or "free", rankings, or calls to download; no other games' names.
    for (const banned of ['free', 'gratis', 'gratuit', 'kostenlos', '無料', '#1', 'best', 'download', 'install', 'worms']) expect(words).not.toContain(banned);
    // Apple: the keywords mustn't repeat the app's name.
    expect(appStore.keywords.toLowerCase()).not.toContain('tardigeddon');
  });
});
