// Seeded PRNG (mulberry32). Integer-only, so identical on every JS engine.

export interface RngState {
  a: number;
}

export function createRng(seed: number): RngState {
  return { a: seed | 0 };
}

/** Next unsigned 32-bit integer. */
export function rngNext(s: RngState): number {
  let t = (s.a = (s.a + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Float in [0, 1). */
export function rngFloat(s: RngState): number {
  return rngNext(s) / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function rngInt(s: RngState, min: number, max: number): number {
  return min + (rngNext(s) % (max - min + 1));
}
