import { describe, expect, it } from 'vitest';
import { TRACKS, melody, musicTrack } from '../src/audio/music';
import { SOUND_PACKS, soundPack } from '../src/audio/sfx';
import { SHOP_ITEMS, canUse, promoItem } from '../src/shop/catalog';

describe('music', () => {
  it('has unique tracks whose rhythms fill their bars', () => {
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
    for (const t of TRACKS) {
      const bar = [t.lead.pattern, t.bass.pattern, t.arp?.pattern, t.drums.kick, t.drums.snare, t.drums.hat];
      for (const p of bar) if (p !== undefined) expect(p.length, t.id).toBe(t.steps);
      expect(t.chords.length, t.id).toBeGreaterThan(0);
      expect(t.lead.pattern.indexOf('x'), `${t.id} starts its bar with a note`).toBeGreaterThanOrEqual(0);
    }
  });

  it('makes up the same tune every time, in a sensible range', () => {
    for (const t of TRACKS) {
      const tune = melody(t);
      expect(tune, t.id).toEqual(melody(t));
      expect(tune.length).toBe(t.steps * t.chords.length * 2);
      const notes = tune.filter((n): n is number => n !== null && n !== -1);
      expect(notes.length, t.id).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n, t.id).toBeGreaterThanOrEqual(48);
        expect(n, t.id).toBeLessThanOrEqual(110);
      }
    }
  });

  it('keeps the menu theme and the standard track free, and sells the rest for coins', () => {
    expect(canUse('music', 'menu', [])).toBe(true);
    expect(canUse('music', 'classic', [])).toBe(true);
    expect(canUse('sound', 'classic', [])).toBe(true);
    for (const t of TRACKS.filter((t) => t.id !== 'menu' && t.id !== 'classic')) {
      const item = SHOP_ITEMS.find((i) => i.id === `music:${t.id}`);
      // (The Early bird and Founder packs' tracks are never sold, only given.)
      if (promoItem(`music:${t.id}`)) expect(item, t.id).toBeUndefined();
      else expect(item?.coins, t.id).toBeGreaterThan(0);
      expect(canUse('music', t.id, [])).toBe(false);
      expect(canUse('music', t.id, [`music:${t.id}`])).toBe(true);
    }
    for (const p of SOUND_PACKS.filter((p) => p.id !== 'classic')) expect(SHOP_ITEMS.find((i) => i.id === `sound:${p.id}`)?.coins, p.id).toBeGreaterThan(0);
  });

  it('falls back to the standard track and sound pack for unknown ids', () => {
    expect(musicTrack('nope').id).toBe('classic');
    expect(musicTrack(null).id).toBe('classic');
    expect(soundPack('nope').id).toBe('classic');
  });
});
