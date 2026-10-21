import { describe, expect, it } from 'vitest';
import { createWorld, hashWorld, pickWeather, tick, TORNADO_ODDS_STORM, mapSizeFor } from '../src/sim/world';
import { MAP_STYLES, randomMapStyle } from '../src/sim/terrain/generate';
import { presetScheme } from '../src/sim/schemes';
import { rngNext } from '../src/sim/math/prng';
import { circleCollides, isSolid } from '../src/sim/terrain/terrain';
import { TARDI_R } from '../src/sim/world';
import { DEFAULT_SCHEME, type SimEvent } from '../src/sim/types';
import { makeWorld, run, runUntilPhase } from './helpers';

const teams = (n: number): { name: string; color: number; cpu: boolean }[] =>
  Array.from({ length: n }, (_, i) => ({ name: `T${i}`, color: i, cpu: false }));

describe('map styles (realms)', () => {
  it('every style has room for small and big matches, on the same map sizes as before', () => {
    for (const m of MAP_STYLES) {
      for (const [n, per] of [[2, 4], [6, 3], [10, 4]] as const) {
        for (const seed of [3, 1001]) {
          const s = createWorld({ seed, teams: teams(n), scheme: { mapStyle: m.id, tardisPerTeam: per } });
          expect(s.realm).toBe(m.id);
          expect(s.terrain.w).toBe(mapSizeFor(n * per).w);
          // Everyone starts standing on dry land.
          for (const t of s.tardis) {
            expect(t.y).toBeLessThan(s.waterY - 20);
            expect(circleCollides(s.terrain, t.x, t.y, TARDI_R)).toBe(false);
          }
        }
      }
    }
  });

  it('land never touches the sides of the map, so you can always fall off', () => {
    for (const m of MAP_STYLES) {
      const s = createWorld({ seed: 8, teams: teams(2), scheme: { mapStyle: m.id } });
      for (let y = 0; y < s.terrain.h; y += 4) {
        expect(isSolid(s.terrain, 10, y)).toBe(false);
        expect(isSolid(s.terrain, s.terrain.w - 10, y)).toBe(false);
      }
    }
  });

  it('picks a style from the seed when the rules leave it random, so matches vary', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) seen.add(randomMapStyle(seed));
    expect(seen.size).toBe(MAP_STYLES.length);
    const a = createWorld({ seed: 42, teams: teams(2) });
    const b = createWorld({ seed: 42, teams: teams(2), scheme: { mapStyle: 'random' } });
    expect(a.realm).toBe(randomMapStyle(42));
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('Rope Race courses are always the classic islands', () => {
    const s = createWorld({ seed: 5, teams: teams(2), scheme: { ...presetScheme('roperace'), mapStyle: 'sky' } });
    expect(s.realm).toBe('islands');
    expect(s.weather.kind).toBe('clear');
  });
});

describe('weather', () => {
  it('comes from the seed, and is clear with weather off', () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 300; seed++) kinds.add(pickWeather(seed, DEFAULT_SCHEME));
    expect(createWorld({ seed: 9, teams: teams(2) }).weather.kind).toBe(pickWeather(9, DEFAULT_SCHEME));
    expect([...kinds].sort()).toEqual(['clear', 'fog', 'rain', 'snow', 'storm', 'sunny']);
    expect(createWorld({ seed: 1, teams: teams(2), scheme: { weather: false } }).weather.kind).toBe('clear');
  });

  it('a tornado sets every tardigrade down somewhere new, on dry land', () => {
    const s = makeWorld();
    s.weather.kind = 'storm';
    // Find the weather dice roll that brings the storm's tornado on the next turn.
    let a = 0;
    while (rngNext({ a }) % TORNADO_ODDS_STORM !== 0) a++;
    s.weather.rng.a = a;
    s.scheme.crateChance = 0;
    const before = s.tardis.map((t) => [t.x, t.y]);
    runUntilPhase(s, 'aim');
    const ev: SimEvent[] = [];
    tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, ev);
    for (let i = 0; i < 3000 && !ev.some((e) => e.t === 'turnStart'); i++) tick(s, { held: 0, pressed: 0 }, ev);
    expect(ev.some((e) => e.t === 'tornado')).toBe(true);
    expect(s.tardis.filter((t, i) => t.x !== before[i][0] || t.y !== before[i][1]).length).toBeGreaterThan(4);
    for (const t of s.tardis) expect(circleCollides(s.terrain, t.x, t.y, TARDI_R)).toBe(false);
    // Nothing else changed by it: the game goes on.
    run(s, 400);
    expect(s.tardis.every((t) => t.alive)).toBe(true);
  });

  it('never brings a tornado with weather off', () => {
    const s = createWorld({ seed: 2, teams: teams(2), scheme: { weather: false, crateChance: 0, turnTime: 10 } });
    s.weather.kind = 'storm';
    s.weather.rng.a = 0;
    let tornadoes = 0;
    for (let i = 0; i < 50 * 400; i++) {
      const ev: SimEvent[] = [];
      tick(s, { held: 0, pressed: 0 }, ev);
      tornadoes += ev.filter((e) => e.t === 'tornado').length;
    }
    expect(s.turn.turnNumber).toBeGreaterThan(10);
    expect(tornadoes).toBe(0);
  });
});

describe('armour', () => {
  it('soaks up half of each hit until it is used up, then health takes it all', () => {
    const s = createWorld({ seed: 4, teams: teams(2), scheme: { armour: 10, mapStyle: 'islands', mines: 0, drums: 0, crateChance: 0 } });
    const t = s.tardis[1];
    expect(t.armour).toBe(10);
    runUntilPhase(s, 'aim');
    t.pendingDmg = 30;
    const ev: SimEvent[] = [];
    tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, ev);
    for (let i = 0; i < 3000 && !ev.some((e) => e.t === 'damage'); i++) tick(s, { held: 0, pressed: 0 }, ev);
    // 30 damage: armour takes half (15), but only has 10.
    expect(ev.find((e) => e.t === 'armour')).toEqual({ t: 'armour', id: t.id, amount: 10 });
    expect(t.armour).toBe(0);
    expect(t.hp).toBe(80);
  });

  it('is off unless the rules turn it on, and gone in sudden death', () => {
    expect(makeWorld().tardis.every((t) => t.armour === 0)).toBe(true);
    const s = createWorld({ seed: 4, teams: teams(2), scheme: { armour: 50, roundTime: 0 } });
    runUntilPhase(s, 'aim');
    tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
    run(s, 3000);
    expect(s.suddenDeath).toBe(true);
    expect(s.tardis.every((t) => t.armour === 0)).toBe(true);
  });
});
