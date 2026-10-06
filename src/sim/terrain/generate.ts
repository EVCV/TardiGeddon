// Seeded island/cavern map generator using value noise (basic arithmetic only).

import { createRng, rngFloat, type RngState } from '../math/prng';
import { createTerrain, type Terrain } from './terrain';

function lattice1D(rng: RngState, length: number, spacing: number): Float64Array {
  const n = Math.ceil(length / spacing) + 2;
  const a = new Float64Array(n);
  for (let i = 0; i < n; i++) a[i] = rngFloat(rng);
  return a;
}

function smooth(f: number): number {
  return f * f * (3 - 2 * f);
}

function sample1D(a: Float64Array, x: number, spacing: number): number {
  const fx = x / spacing;
  const i = Math.floor(fx);
  const s = smooth(fx - i);
  return a[i] + (a[i + 1] - a[i]) * s;
}

interface Lattice2D {
  cols: number;
  v: Float64Array;
  spacing: number;
}

function lattice2D(rng: RngState, w: number, h: number, spacing: number): Lattice2D {
  const cols = Math.ceil(w / spacing) + 2;
  const rows = Math.ceil(h / spacing) + 2;
  const v = new Float64Array(cols * rows);
  for (let i = 0; i < v.length; i++) v[i] = rngFloat(rng);
  return { cols, v, spacing };
}

function sample2D(l: Lattice2D, x: number, y: number): number {
  const fx = x / l.spacing;
  const fy = y / l.spacing;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const sx = smooth(fx - ix);
  const sy = smooth(fy - iy);
  const i = iy * l.cols + ix;
  const a = l.v[i] + (l.v[i + 1] - l.v[i]) * sx;
  const b = l.v[i + l.cols] + (l.v[i + l.cols + 1] - l.v[i + l.cols]) * sx;
  return a + (b - a) * sy;
}

export interface MapOptions {
  w: number;
  h: number;
  waterY: number;
  seed: number;
}

export function generateMap(o: MapOptions): Terrain {
  const rng = createRng(o.seed);
  const t = createTerrain(o.w, o.h);
  const big = lattice1D(rng, o.w, 420);
  const mid = lattice1D(rng, o.w, 130);
  const small = lattice1D(rng, o.w, 36);
  const islands = lattice1D(rng, o.w, 300);
  const caves = lattice2D(rng, o.w, o.h, 70);

  const margin = 60;
  for (let x = 0; x < o.w; x++) {
    // Land never touches the map edges, so tardis can fall off the sides.
    if (x < margin || x >= o.w - margin) continue;
    const isl = sample1D(islands, x, 300);
    if (isl < 0.3) continue; // gap between islands
    // Taper island and map edges into slopes rather than sheer cliffs.
    const fromSide = Math.min(x - margin, o.w - margin - x) / 220;
    const e = Math.min(1, (isl - 0.3) / 0.3, fromSide);
    const edge = smooth(e);
    const top =
      o.h * 0.3 +
      sample1D(big, x, 420) * 300 +
      sample1D(mid, x, 130) * 110 +
      sample1D(small, x, 36) * 24 +
      (1 - edge) * (o.waterY - o.h * 0.3);
    for (let y = Math.max(0, Math.floor(top)); y < o.h; y++) {
      const depth = y - top;
      if (depth > 40 && y < o.waterY - 30 && sample2D(caves, x, y) > 0.7) continue;
      t.mask[y * o.w + x] = 1;
    }
  }
  return t;
}
