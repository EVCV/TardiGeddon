import { describe, expect, it } from 'vitest';
import { carveCircle, circleCollides, createTerrain, isSolid, normalAt } from '../src/sim/terrain/terrain';
import { generateMap } from '../src/sim/terrain/generate';

describe('terrain', () => {
  it('carves circles', () => {
    const t = createTerrain(100, 100);
    t.mask.fill(1);
    carveCircle(t, 50, 50, 10);
    expect(isSolid(t, 50, 50)).toBe(false);
    expect(isSolid(t, 50, 39)).toBe(true);
    expect(isSolid(t, 50, 41)).toBe(false);
  });
  it('computes an upward normal on flat ground', () => {
    const t = createTerrain(100, 100);
    for (let y = 50; y < 100; y++) for (let x = 0; x < 100; x++) t.mask[y * 100 + x] = 1;
    const n = normalAt(t, 50, 50, 5);
    expect(n.nx).toBeCloseTo(0, 6);
    expect(n.ny).toBeLessThan(-0.99);
    expect(circleCollides(t, 50, 44, 5)).toBe(false);
    expect(circleCollides(t, 50, 46, 5)).toBe(true);
  });
  it('generates the same map for the same seed', () => {
    const a = generateMap({ w: 2000, h: 1000, waterY: 930, seed: 9 });
    const b = generateMap({ w: 2000, h: 1000, waterY: 930, seed: 9 });
    const c = generateMap({ w: 2000, h: 1000, waterY: 930, seed: 10 });
    // Buffer.compare is far faster than a deep equality on 2M entries.
    expect(Buffer.compare(a.mask, b.mask)).toBe(0);
    expect(Buffer.compare(a.mask, c.mask)).not.toBe(0);
  });
});
