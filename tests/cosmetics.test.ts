import { describe, expect, it } from 'vitest';
import { BUNDLES, COIN_PACKS, SHOP_ITEMS, bundlePrice, bundleValue, canUse, packTotal, shopItem } from '../src/shop/catalog';
import { HATS } from '../src/render/hats';
import { SKINS } from '../src/render/skins';
import { AIM_STYLES, FX_STYLES, aimStyle, fxStyle, rainbowAt } from '../src/render/cosmetics';
import { ARENAS, arenaTheme } from '../src/render/arenas';
import { cleanTeam, wearableTeam } from '../server/room';
import { createWorld, explode } from '../src/sim/world';
import type { SimEvent } from '../src/sim/types';

describe('shop catalogue', () => {
  it('has unique ids, and everything it sells exists in the game', () => {
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    const known: Record<string, string[]> = {
      hat: HATS.map((h) => h.id),
      skin: SKINS.map((s) => s.id),
      aim: AIM_STYLES.map((a) => a.id),
      fx: FX_STYLES.map((f) => f.id),
      arena: ARENAS.map((a) => a.id),
    };
    for (const item of SHOP_ITEMS) {
      expect(item.id).toBe(`${item.kind}:${item.ref}`);
      if (item.kind !== 'weapon') expect(known[item.kind], item.id).toContain(item.ref);
      // Exactly one price; aim styles and effects are coins only.
      expect((item.coins === undefined) !== (item.slime === undefined), item.id).toBe(true);
      if (item.kind === 'aim' || item.kind === 'fx' || item.kind === 'arena') expect(item.coins, item.id).toBeGreaterThan(0);
      // Money never buys weapons.
      if (item.kind === 'weapon') expect(item.coins, item.id).toBeUndefined();
    }
  });

  it('is worth more than the biggest coin pack, so big packs are useful', () => {
    const total = SHOP_ITEMS.reduce((s, i) => s + (i.coins ?? 0), 0);
    const biggest = Math.max(...COIN_PACKS.map(packTotal));
    expect(total).toBeGreaterThan(biggest * 3);
  });

  it('prices bundles below their looks, and charges only for what you are missing', () => {
    expect(new Set(BUNDLES.map((b) => b.id)).size).toBe(BUNDLES.length);
    for (const b of BUNDLES) {
      for (const id of b.items) expect(shopItem(id)?.coins, `${b.id} ${id}`).toBeGreaterThan(0);
      expect(b.coins).toBeLessThan(bundleValue(b));
      expect(bundlePrice(b)).toBe(b.coins);
      // Owning one look: the rest at the same discount, never more than buying them singly.
      const owned = [b.items[0]];
      const p = bundlePrice(b, owned);
      expect(p).toBeLessThan(b.coins);
      expect(p).toBeLessThan(bundleValue(b, owned));
      expect(bundlePrice(b, b.items)).toBe(0);
    }
  });

  it('falls back to the classic aim style and effect for unknown ids', () => {
    expect(aimStyle('nope').id).toBe('classic');
    expect(fxStyle(undefined).id).toBe('classic');
    expect(rainbowAt(0)).toBe(0xe04848);
    expect(rainbowAt(1)).toBe(0xe04848);
    expect(arenaTheme('nope').id).toBe('classic');
  });

  it('has a full palette for every arena, and the meadow is free', () => {
    expect(new Set(ARENAS.map((a) => a.id)).size).toBe(ARENAS.length);
    expect(SHOP_ITEMS.some((i) => i.id === 'arena:classic')).toBe(false);
    for (const a of ARENAS) {
      expect(a.skyTop, a.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.skyBottom, a.id).toMatch(/^#[0-9a-f]{6}$/i);
      for (const c of [a.hillFar, a.hillNear, a.water, a.waterLight, ...a.grass, ...a.soil]) expect(c, a.id).toBeLessThanOrEqual(0xffffff);
      if (a.id !== 'classic') expect(shopItem(`arena:${a.id}`), a.id).toBeDefined();
    }
  });
});

describe('aim styles and effects online', () => {
  it('are kept through the lobby, but only if the player owns them', () => {
    const t = cleanTeam({ name: 'A', aim: 'rainbow', fx: 'gold' }, 0);
    expect(t.aim).toBe('rainbow');
    expect(t.fx).toBe('gold');
    expect(cleanTeam({ name: 'A', aim: '<b>', fx: 42 }, 0)).toMatchObject({ aim: 'classic', fx: 'classic' });
    expect(wearableTeam({ aim: 'rainbow', fx: 'gold' }, [])).toEqual({ aim: 'classic', fx: 'classic' });
    expect(wearableTeam({ aim: 'rainbow', fx: 'gold' }, ['aim:rainbow', 'fx:gold'])).toEqual({ aim: 'rainbow', fx: 'gold' });
    expect(canUse('aim', 'classic', [])).toBe(true);
  });

  it('reach the match, defaulting to classic', () => {
    const w = createWorld({ seed: 1, teams: [{ name: 'A', color: 0xff0000, cpu: false, aim: 'laser', fx: 'hearts' }, { name: 'B', color: 0x00ff00, cpu: true }] });
    expect(w.teams[0]).toMatchObject({ aim: 'laser', fx: 'hearts' });
    expect(w.teams[1]).toMatchObject({ aim: 'classic', fx: 'classic' });
  });
});

describe('explosion effects', () => {
  it('remember whose turn it was, so catch-up replays use the right effect', () => {
    const w = createWorld({ seed: 1, teams: [{ name: 'A', color: 0xff0000, cpu: false, fx: 'gold' }, { name: 'B', color: 0x00ff00, cpu: true }] });
    const ev: SimEvent[] = [];
    w.turn.teamIdx = 1;
    explode(w, 500, 300, 20, 0, ev);
    w.turn.teamIdx = 0;
    explode(w, 600, 300, 20, 0, ev);
    expect(ev.map((e) => (e.t === 'explosion' ? e.team : -1))).toEqual([1, 0]);
  });
});
