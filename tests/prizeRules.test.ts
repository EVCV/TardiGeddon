// Looks everyone has (EVERYONE_ITEMS) count as owned, signed in or not, and the prize grant limits.
import { describe, expect, it } from 'vitest';
import { EVERYONE_ITEMS, PRIZE_ITEMS, SHOP_ITEMS, canUse, canWearHat, prizeLook, unlockedWeapons } from '../src/shop/catalog';
import { PRIZE_GRANT_MAX, withEveryone } from '../src/shop/prizeRules';
import { wearableTeam } from '../server/room';
import { prizeBadge, prizeItems } from '../server/prizes';

describe('withEveryone', () => {
  it('adds the looks everyone has to what a player owns, without repeats, and never changes its input', () => {
    const owned = ['hat:wizard', 'skin:gold'];
    expect(withEveryone(owned, ['hat:waterbear', 'skin:gold'])).toEqual(['hat:wizard', 'skin:gold', 'hat:waterbear']);
    expect(owned).toEqual(['hat:wizard', 'skin:gold']);
    expect(withEveryone([], ['hat:waterbear'])).toEqual(['hat:waterbear']);
    expect(withEveryone(owned, [])).toEqual(owned);
    expect(withEveryone(owned, [])).not.toBe(owned);
  });

  it('makes those looks usable by anyone, including signed-out players, and wearable online', () => {
    // 'hat:waterbear' is a never-sold look that normally needs a code.
    expect(canWearHat('waterbear', withEveryone([], []))).toBe(false);
    EVERYONE_ITEMS.push('hat:waterbear');
    try {
      const signedOut = withEveryone([]);
      expect(signedOut).toEqual([...EVERYONE_ITEMS]);
      expect(canWearHat('waterbear', signedOut)).toBe(true);
      expect(canUse('hat', 'waterbear', withEveryone(['skin:gold']))).toBe(true);
      expect(wearableTeam({ name: 'A', hat: 'waterbear' }, signedOut).hat).toBe('waterbear');
      // Other looks still need owning.
      expect(canWearHat('wizard', signedOut)).toBe(false);
      expect(wearableTeam({ name: 'A', hat: 'wizard' }, signedOut).hat).toBe('beanie');
    } finally {
      EVERYONE_ITEMS.pop();
    }
    expect(canWearHat('waterbear', withEveryone([], []))).toBe(false);
  });

  it('never makes a weapon free: weapons stay unlocked by Slime', () => {
    // withEveryone only adds what EVERYONE_ITEMS lists, and none of them may be a weapon.
    expect(EVERYONE_ITEMS.filter((id) => id.startsWith('weapon:'))).toEqual([]);
    expect(unlockedWeapons(withEveryone([]))).toEqual(unlockedWeapons(EVERYONE_ITEMS));
  });
});

describe('prize requests', () => {
  const everyShopLook = SHOP_ITEMS.filter((i) => prizeLook(i.id)).map((i) => i.id);

  it('fit every Shop look in one grant, and every look a prize can be', () => {
    expect(everyShopLook.length).toBeGreaterThan(20);
    expect(prizeItems(everyShopLook)).toEqual({ items: everyShopLook });
    expect(prizeItems([...everyShopLook, ...PRIZE_ITEMS])).toHaveProperty('items');
    expect(everyShopLook.length + PRIZE_ITEMS.length).toBeLessThanOrEqual(PRIZE_GRANT_MAX);
  });

  it('refuse more than the limit, weapons, nothing, and (without a badge) an empty list', () => {
    expect(prizeItems(Array.from({ length: PRIZE_GRANT_MAX + 1 }, (_, i) => `hat:x${i}`))).toHaveProperty('error');
    expect(prizeItems(['weapon:pinball'])).toHaveProperty('error');
    expect(prizeItems([])).toHaveProperty('error');
    expect(prizeItems(undefined)).toHaveProperty('error');
    // With a badge, no looks is fine (a badge on its own), but bad ones are still refused.
    expect(prizeItems([], true)).toEqual({ items: [] });
    expect(prizeItems(undefined, true)).toEqual({ items: [] });
    expect(prizeItems(['weapon:pinball'], true)).toHaveProperty('error');
  });

  it('know one badge, "winner"', () => {
    expect(prizeBadge('winner')).toBe('winner');
    for (const v of ['creator', 'founder', '', 'WINNER', null, undefined, true, 1, {}]) expect(prizeBadge(v)).toBeNull();
  });
});
