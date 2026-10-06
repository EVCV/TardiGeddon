import { describe, expect, it } from 'vitest';
import { createRng, rngNext } from '../src/sim/math/prng';
import { ANGLE_FULL, cosA, sinA } from '../src/sim/math/trig';

describe('prng', () => {
  it('is reproducible from a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(rngNext(a)).toBe(rngNext(b));
  });
  it('produces a known sequence', () => {
    const r = createRng(1);
    expect([rngNext(r), rngNext(r), rngNext(r)]).toMatchSnapshot();
  });
});

describe('trig table', () => {
  it('matches Math.sin closely', () => {
    for (let a = 0; a < ANGLE_FULL; a += 7) {
      const rad = (a / ANGLE_FULL) * 2 * Math.PI;
      expect(Math.abs(sinA(a) - Math.sin(rad))).toBeLessThan(1e-9);
      expect(Math.abs(cosA(a) - Math.cos(rad))).toBeLessThan(1e-9);
    }
  });
  it('wraps negative angles', () => {
    expect(sinA(-ANGLE_FULL / 4)).toBeCloseTo(-1, 12);
  });
});
