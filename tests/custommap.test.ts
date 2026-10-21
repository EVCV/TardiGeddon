import { describe, expect, it } from 'vitest';
import { createWorld, hashWorld } from '../src/sim/world';
import { createTerrain } from '../src/sim/terrain/terrain';
import { decodeCustomMap, encodeCustomMap, isCustomMap } from '../src/sim/terrain/custom';
import { generateMap } from '../src/sim/terrain/generate';
import { cleanScheme } from '../server/room';

const teams = [
  { name: 'A', color: 1, cpu: false },
  { name: 'B', color: 2, cpu: false },
];

/** A flat shore with a hill: what someone might draw. */
function drawn(): string {
  const t = createTerrain(2000, 1000);
  for (let y = 700; y < 1000; y++) for (let x = 100; x < 1900; x++) t.mask[y * 2000 + x] = 1;
  for (let y = 500; y < 700; y++) for (let x = 800; x < 1100; x++) t.mask[y * 2000 + x] = 1;
  return encodeCustomMap(t);
}

describe('custom maps', () => {
  it('survive encoding exactly, and stay small', () => {
    const t = generateMap({ w: 2000, h: 1000, waterY: 930, seed: 3, style: 'sky' });
    const s = encodeCustomMap(t);
    expect(s.length).toBeLessThan(60_000);
    expect(Buffer.compare(decodeCustomMap(s)!.mask, t.mask)).toBe(0);
  });

  it('make the world, the same for everyone, with tardigrades on the land', () => {
    const map = drawn();
    const a = createWorld({ seed: 5, teams, scheme: { customMap: map } });
    const b = createWorld({ seed: 5, teams, scheme: { customMap: map } });
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.realm).toBe('custom');
    for (const t of a.tardis) expect(t.y).toBeLessThan(700);
    // A map with no land above the water can't hold a match.
    const sea = encodeCustomMap(createTerrain(2000, 1000));
    expect(() => createWorld({ seed: 5, teams, scheme: { customMap: sea } })).toThrow(/room/);
  });

  it('refuse anything that isn’t a sane map', () => {
    for (const bad of ['', 'x', '2000x1000:', '2000x1000:zzzzzzz', '99999x1000:1', '2000x1000:1.2', '2000x1000:-1', 42, null, '2000x1000:' + 'a.'.repeat(200_000)]) {
      expect(isCustomMap(bad), String(bad).slice(0, 30)).toBe(false);
    }
    expect(cleanScheme({ customMap: drawn() }).customMap).toBe(drawn());
    expect(cleanScheme({ customMap: '2000x1000:1' }).customMap).toBeUndefined();
  });
});
