import { describe, expect, it } from 'vitest';
import { BUNDLES, COIN_PACKS, SHOP_ITEMS, bundlePrice, bundleValue, canUse, packTotal, shopItem } from '../src/shop/catalog';
import { HATS } from '../src/render/hats';
import { SKINS } from '../src/render/skins';
import { AIM_STYLES, FX_STYLES, aimStyle, fxStyle, rainbowAt } from '../src/render/cosmetics';
import { ARENAS, arenaTheme } from '../src/render/arenas';
import { DANCES, GRAVES } from '../src/render/finales';
import { SEASONS, currentSeason, seasonArenaOpen, seasonEnds } from '../src/render/seasons';
import { defaultEmblem, emblemSvg, isEmblem, parseEmblem, randomEmblem } from '../src/render/emblems';
import { TRACKS } from '../src/audio/music';
import { SOUND_PACKS } from '../src/audio/sfx';
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
      // The first two dances and the husk and headstone are free.
      dance: DANCES.map((d) => d.id).filter((id) => id !== 'classic' && id !== 'wiggle'),
      grave: GRAVES.map((g) => g.id).filter((id) => id !== 'classic' && id !== 'stone'),
      arena: ARENAS.map((a) => a.id),
      // The menu theme and the standard tracks are free.
      music: TRACKS.map((t) => t.id).filter((id) => id !== 'menu' && id !== 'classic'),
      sound: SOUND_PACKS.map((p) => p.id).filter((id) => id !== 'classic'),
    };
    for (const item of SHOP_ITEMS) {
      expect(item.id).toBe(`${item.kind}:${item.ref}`);
      if (item.kind !== 'weapon') expect(known[item.kind], item.id).toContain(item.ref);
      // Exactly one price; aim styles and effects are coins only.
      expect((item.coins === undefined) !== (item.slime === undefined), item.id).toBe(true);
      if (['aim', 'fx', 'dance', 'grave', 'arena', 'music', 'sound'].includes(item.kind)) expect(item.coins, item.id).toBeGreaterThan(0);
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

  it('has a full palette for every arena; the meadow and a few plain looks are free', () => {
    expect(new Set(ARENAS.map((a) => a.id)).size).toBe(ARENAS.length);
    expect(SHOP_ITEMS.some((i) => i.id === 'arena:classic')).toBe(false);
    for (const a of ARENAS) {
      expect(a.skyTop, a.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.skyBottom, a.id).toMatch(/^#[0-9a-f]{6}$/i);
      for (const c of [a.hillFar, a.hillNear, a.water, a.waterLight, ...a.grass, ...a.soil]) expect(c, a.id).toBeLessThanOrEqual(0xffffff);
      // Free looks stay plain, so they never undercut the shop's.
      if (a.free) expect([shopItem(`arena:${a.id}`), a.stars, a.drift], a.id).toEqual([undefined, undefined, undefined]);
      // Seasonal worlds are free while their event is on, never sold.
      else if (a.season) expect([shopItem(`arena:${a.id}`), SEASONS.find((x) => x.id === a.season)?.arena], a.id).toEqual([undefined, a.id]);
      else expect(shopItem(`arena:${a.id}`), a.id).toBeDefined();
    }
    expect(ARENAS.filter((a) => a.free).map((a) => a.id)).toEqual(['classic', 'spring', 'moor', 'cove', 'bog']);
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

describe('victory dances, gravestones and emblems', () => {
  it('sells every dance and gravestone except the free ones, for coins', () => {
    for (const d of DANCES) expect(!!shopItem(`dance:${d.id}`), d.id).toBe(!['classic', 'wiggle'].includes(d.id));
    for (const g of GRAVES) expect(!!shopItem(`grave:${g.id}`), g.id).toBe(!['classic', 'stone'].includes(g.id));
  });

  it('go online with the team, but only if the player owns them; emblems are free but must be real', () => {
    const t = cleanTeam({ name: 'A', dance: 'worm', grave: 'rocket', emblem: '3-10-2-11-4' }, 0);
    expect(t).toMatchObject({ dance: 'worm', grave: 'rocket', emblem: '3-10-2-11-4' });
    expect(cleanTeam({ name: 'A', dance: '<b>', grave: 7, emblem: '99-0-0-0-0' }, 2)).toMatchObject({ dance: 'classic', grave: 'classic', emblem: defaultEmblem(2) });
    expect(wearableTeam({ dance: 'worm', grave: 'rocket', emblem: '1-1-1-1-1' }, [])).toEqual({ dance: 'classic', grave: 'classic', emblem: '1-1-1-1-1' });
    expect(wearableTeam({ dance: 'worm', grave: 'stone' }, ['dance:worm'])).toEqual({ dance: 'worm', grave: 'stone' });
  });

  it('builds emblems from parts, and rejects anything else', () => {
    for (let i = 0; i < 50; i++) expect(isEmblem(randomEmblem())).toBe(true);
    for (let slot = 0; slot < 10; slot++) expect(isEmblem(defaultEmblem(slot))).toBe(true);
    for (const bad of ['', '1-2-3-4', '1-2-3-4-5-6', 'a-b-c-d-e', '0-66-0-0-0', '0-0-14-0-0', '0-0-0-0-8', '<svg>', '1-1-1-1-1 ']) expect(isEmblem(bad), bad).toBe(false);
    expect(parseEmblem('9-65-13-13-7')).toEqual({ shape: 9, icon: 65, bg: 13, fg: 13, pattern: 7 });
    expect(new Set(Array.from({ length: 10 }, (_, i) => defaultEmblem(i))).size).toBe(10);
  });
});

describe('emblem pictures', () => {
  it('never lets a team name out of its label', () => {
    const svg = emblemSvg('1-1-1-1-1', '"><img src=x onerror=alert(1)> emblem');
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&#34;&#62;&#60;img');
  });
});

describe('seasonal events', () => {
  const on = (m: number, d: number) => currentSeason(new Date(2026, m - 1, d))?.id ?? null;
  it('run between their dates every year, including across New Year', () => {
    expect(on(10, 19)).toBeNull();
    expect(on(10, 20)).toBe('halloween');
    expect(on(11, 2)).toBe('halloween');
    expect(on(11, 3)).toBeNull();
    expect(on(12, 31)).toBe('newyear');
    expect(on(1, 3)).toBe('newyear');
    expect(on(1, 4)).toBeNull();
    expect(on(12, 20)).toBe('winter');
    expect(seasonEnds(SEASONS.find((s) => s.id === 'halloween')!)).toBe('2 Nov');
  });
  it('open their world only while on, and never overlap', () => {
    expect(seasonArenaOpen('pumpkin', new Date(2026, 9, 25))).toBe(true);
    expect(seasonArenaOpen('pumpkin', new Date(2026, 5, 1))).toBe(false);
    expect(seasonArenaOpen('classic', new Date(2026, 5, 1))).toBe(true);
    // Each season alone, on each day: never two at once.
    const k = (m: number, d: number) => m * 32 + d;
    for (let day = 0; day < 366; day++) {
      const d = new Date(2028, 0, 1 + day);
      const t = k(d.getMonth() + 1, d.getDate());
      const hits = SEASONS.filter((s) => {
        const a = k(...s.from);
        const b = k(...s.to);
        return a <= b ? t >= a && t <= b : t >= a || t <= b;
      }).length;
      expect(hits, d.toDateString()).toBeLessThanOrEqual(1);
    }
    for (const s of SEASONS) expect(ARENAS.find((a) => a.id === s.arena)?.season, s.id).toBe(s.id);
  });
});
