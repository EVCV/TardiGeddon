import { afterEach, describe, expect, it } from 'vitest';
import { newThing } from '../src/ui/drops';
import { DROPS } from '../src/shop/drops';

describe('the lobby banner for something new', () => {
  afterEach(() => {
    DROPS.length = 0;
  });

  it('announces a seasonal event while it’s on, once a year', () => {
    expect(newThing(new Date('2026-06-01T12:00:00Z'))).toBeNull();
    const halloween = newThing(new Date('2026-10-28T12:00:00Z'))!;
    expect(halloween.id).toBe('season-halloween-2026');
    expect(halloween.open).toBe('looks');
    expect(halloween.text).toContain('Pumpkin');
    // New Year runs over the turn of the year: the same banner on both sides.
    expect(newThing(new Date('2026-12-31T12:00:00Z'))!.id).toBe(newThing(new Date('2027-01-02T12:00:00Z'))!.id);
  });

  it('announces new looks in the Shop for their first month, ahead of a seasonal event', () => {
    DROPS.push({ id: 'winter-hats', emoji: '🎄', name: 'Winter hats', blurb: 'Six new hats', from: '2026-10-25' });
    const now = newThing(new Date('2026-10-28T12:00:00Z'))!;
    expect(now.id).toBe('drop-winter-hats');
    expect(now.open).toBe('shop');
    expect(newThing(new Date('2026-11-30T12:00:00Z'))).toBeNull();
  });
});
