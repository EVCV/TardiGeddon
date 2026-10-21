// Seeded island/cavern map generator using value noise (basic arithmetic only).

import { createRng, rngFloat, rngInt, type RngState } from '../math/prng';
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

/**
 * Map styles ("realms"). Every match picks one at random unless the rules
 * name one. All keep the same map size and leave wide enough ledges to stand
 * on, so they play as well on a phone as on a big screen.
 */
export const MAP_STYLES = [
  { id: 'islands', name: 'Twin Isles', blurb: 'The classic: a couple of big islands over the water.' },
  { id: 'mainland', name: 'Mainland', blurb: 'One long stretch of rolling hills, with caves to hide in.' },
  { id: 'archipelago', name: 'Archipelago', blurb: 'Lots of little islands. Mind the gaps.' },
  { id: 'sky', name: 'Sky Realms', blurb: 'Realms on realms: floating islands stacked over a low shore.' },
  { id: 'caverns', name: 'Caverns', blurb: 'A great hollow hill, riddled with tunnels.' },
  { id: 'canyon', name: 'Canyon', blurb: 'High cliffs either side of a deep valley, with a bridge of rock.' },
  { id: 'spires', name: 'Spires', blurb: 'Tall rock towers rising from the sea.' },
] as const;

export type MapStyle = (typeof MAP_STYLES)[number]['id'];

export function isMapStyle(id: unknown): id is MapStyle {
  return typeof id === 'string' && MAP_STYLES.some((m) => m.id === id);
}

export function mapStyleName(id: string): string {
  return MAP_STYLES.find((m) => m.id === id)?.name ?? MAP_STYLES[0].name;
}

/** The style a match with this seed gets when the rules leave it random. */
export function randomMapStyle(seed: number): MapStyle {
  const rng = createRng(seed ^ 0x7ea1);
  return MAP_STYLES[rngInt(rng, 0, MAP_STYLES.length - 1)].id;
}

export interface MapOptions {
  w: number;
  h: number;
  waterY: number;
  seed: number;
  /** Add a rocky ceiling across the top (Rope Race courses). */
  ceiling?: boolean;
  /** Which kind of land (default: the classic islands). */
  style?: MapStyle;
}

export function generateMap(o: MapOptions): Terrain {
  const rng = createRng(o.seed);
  const t = createTerrain(o.w, o.h);
  const style = o.style ?? 'islands';
  if (style === 'islands') islands(o, t, rng);
  else {
    LAND[style](o, t, rng);
    // Now and then a few small floating isles drift over other realms too.
    if (style !== 'sky' && style !== 'caverns' && rngFloat(rng) < 0.35) floatingTier(o, t, rng, o.h * 0.22, 1, 3);
  }
  if (o.ceiling) {
    // A bumpy roof to swing from, high enough to leave a clear course.
    const roof = lattice1D(rng, o.w, 160);
    const bumps = lattice1D(rng, o.w, 40);
    for (let x = 0; x < o.w; x++) {
      const bottom = Math.floor(30 + sample1D(roof, x, 160) * 90 + sample1D(bumps, x, 40) * 25);
      for (let y = 0; y < bottom; y++) t.mask[y * o.w + x] = 1;
    }
  }
  return t;
}

/** Land never touches the map's sides, so tardis can fall off them. */
const MARGIN = 60;

function islands(o: MapOptions, t: Terrain, rng: RngState): void {
  const big = lattice1D(rng, o.w, 420);
  const mid = lattice1D(rng, o.w, 130);
  const small = lattice1D(rng, o.w, 36);
  const isl = lattice1D(rng, o.w, 300);
  const caves = lattice2D(rng, o.w, o.h, 70);

  for (let x = MARGIN; x < o.w - MARGIN; x++) {
    const v = sample1D(isl, x, 300);
    if (v < 0.3) continue; // gap between islands
    // Taper island and map edges into slopes rather than sheer cliffs.
    const fromSide = Math.min(x - MARGIN, o.w - MARGIN - x) / 220;
    const e = Math.min(1, (v - 0.3) / 0.3, fromSide);
    const edge = smooth(e);
    const top =
      o.h * 0.3 +
      sample1D(big, x, 420) * 300 +
      sample1D(mid, x, 130) * 110 +
      sample1D(small, x, 36) * 24 +
      (1 - edge) * (o.waterY - o.h * 0.3);
    fillDown(o, t, x, top, caves, 0.7);
  }
}

/** Solid from `top` to the bottom of the map, less any caves deeper than 40px. */
function fillDown(o: MapOptions, t: Terrain, x: number, top: number, caves: Lattice2D | null, caveAbove: number): void {
  for (let y = Math.max(0, Math.floor(top)); y < o.h; y++) {
    if (caves && y - top > 40 && y < o.waterY - 30 && sample2D(caves, x, y) > caveAbove) continue;
    t.mask[y * o.w + x] = 1;
  }
}

/** How far into the land from the map's sides, 0..1 over `ramp` px. */
function sideRamp(o: MapOptions, x: number, ramp: number): number {
  return smooth(Math.max(0, Math.min(1, Math.min(x - MARGIN, o.w - MARGIN - x) / ramp)));
}

/** Raise land from the water by `e` (0 = under water, 1 = full height). */
function lift(o: MapOptions, top: number, e: number): number {
  return top + (1 - e) * (o.waterY + 20 - top);
}

const LAND: Record<Exclude<MapStyle, 'islands'>, (o: MapOptions, t: Terrain, rng: RngState) => void> = {
  mainland(o, t, rng) {
    const big = lattice1D(rng, o.w, 500);
    const mid = lattice1D(rng, o.w, 160);
    const small = lattice1D(rng, o.w, 40);
    const caves = lattice2D(rng, o.w, o.h, 80);
    for (let x = MARGIN; x < o.w - MARGIN; x++) {
      const top = o.h * 0.38 + sample1D(big, x, 500) * 260 + sample1D(mid, x, 160) * 90 + sample1D(small, x, 40) * 20;
      fillDown(o, t, x, lift(o, top, sideRamp(o, x, 260)), caves, 0.72);
    }
  },
  archipelago(o, t, rng) {
    const mid = lattice1D(rng, o.w, 140);
    const small = lattice1D(rng, o.w, 36);
    const isl = lattice1D(rng, o.w, 150);
    const caves = lattice2D(rng, o.w, o.h, 60);
    for (let x = MARGIN; x < o.w - MARGIN; x++) {
      const v = sample1D(isl, x, 150);
      if (v < 0.42) continue;
      const e = smooth(Math.min(1, (v - 0.42) / 0.22)) * sideRamp(o, x, 120);
      const top = o.h * 0.48 + sample1D(mid, x, 140) * 160 + sample1D(small, x, 36) * 22;
      fillDown(o, t, x, lift(o, top, e), caves, 0.74);
    }
  },
  sky(o, t, rng) {
    // A low, broken shore near the water...
    const isl = lattice1D(rng, o.w, 220);
    const small = lattice1D(rng, o.w, 40);
    for (let x = MARGIN; x < o.w - MARGIN; x++) {
      const v = sample1D(isl, x, 220);
      if (v < 0.35) continue;
      const e = smooth(Math.min(1, (v - 0.35) / 0.25)) * sideRamp(o, x, 120);
      fillDown(o, t, x, lift(o, o.waterY - 150 + sample1D(small, x, 40) * 40, e), null, 1);
    }
    // ...and two tiers of floating realms above it.
    floatingTier(o, t, rng, o.h * 0.56, 2, 4);
    floatingTier(o, t, rng, o.h * 0.3, 2, 4);
  },
  caverns(o, t, rng) {
    const big = lattice1D(rng, o.w, 400);
    const small = lattice1D(rng, o.w, 40);
    const caves = lattice2D(rng, o.w, o.h, 95);
    const fine = lattice2D(rng, o.w, o.h, 40);
    for (let x = MARGIN; x < o.w - MARGIN; x++) {
      const top = o.h * 0.2 + sample1D(big, x, 400) * 160 + sample1D(small, x, 40) * 18;
      const surface = lift(o, top, sideRamp(o, x, 200));
      for (let y = Math.max(0, Math.floor(surface)); y < o.h; y++) {
        // Wide tunnels: big noise, roughened by finer noise, with a thick crust on top.
        const n = sample2D(caves, x, y) * 0.8 + sample2D(fine, x, y) * 0.2;
        if (y - surface > 50 && y < o.waterY - 20 && n > 0.56) continue;
        t.mask[y * o.w + x] = 1;
      }
    }
  },
  canyon(o, t, rng) {
    const mid = lattice1D(rng, o.w, 150);
    const small = lattice1D(rng, o.w, 36);
    const caves = lattice2D(rng, o.w, o.h, 70);
    const centre = o.w * (0.4 + rngFloat(rng) * 0.2);
    const half = o.w / 2;
    for (let x = MARGIN; x < o.w - MARGIN; x++) {
      // 0 in the valley floor, 1 up on the cliffs.
      const v = smooth(Math.max(0, Math.min(1, (Math.abs(x - centre) / half - 0.12) / 0.3)));
      const top = o.h * 0.22 + (1 - v) * o.h * 0.45 + sample1D(mid, x, 150) * 70 + sample1D(small, x, 36) * 20;
      fillDown(o, t, x, lift(o, top, sideRamp(o, x, 160)), caves, 0.72);
    }
    // A natural arch across the valley, below the cliff tops.
    const by = o.h * 0.4;
    const span = half * 0.42;
    for (let x = Math.floor(centre - span); x < centre + span; x++) {
      const f = (x - centre) / span;
      const sag = f * f * 40;
      const thick = 26 + f * f * 40;
      const top = by + sag + sample1D(small, x, 36) * 10;
      for (let y = Math.floor(top); y < top + thick; y++) t.mask[y * o.w + x] = 1;
    }
  },
  spires(o, t, rng) {
    const towers = lattice1D(rng, o.w, 240);
    const mid = lattice1D(rng, o.w, 300);
    const small = lattice1D(rng, o.w, 30);
    const caves = lattice2D(rng, o.w, o.h, 60);
    for (let x = MARGIN; x < o.w - MARGIN; x++) {
      const v = sample1D(towers, x, 240);
      // Low rocky shelves between tall towers whose tops are wide enough to stand on.
      const k = smooth(Math.max(0, Math.min(1, (v - 0.45) / 0.1)));
      const shelf = o.waterY - 110 + sample1D(small, x, 30) * 30;
      const tower = o.h * 0.2 + sample1D(mid, x, 300) * 180 + sample1D(small, x, 30) * 12;
      fillDown(o, t, x, lift(o, shelf + (tower - shelf) * k, sideRamp(o, x, 100)), caves, 0.78);
    }
  },
};

/**
 * A row of floating islands around height `cy`: rounded tops to stand on,
 * hanging rocky bottoms. Between `min` and `max` of them, spread across the map.
 */
function floatingTier(o: MapOptions, t: Terrain, rng: RngState, cy: number, min: number, max: number): void {
  const n = rngInt(rng, min, max);
  const slot = (o.w - 2 * MARGIN) / n;
  const bumps = lattice1D(rng, o.w, 30);
  for (let i = 0; i < n; i++) {
    const hw = 70 + rngFloat(rng) * Math.min(130, slot * 0.35);
    const cx = MARGIN + slot * i + slot / 2 + (rngFloat(rng) - 0.5) * (slot - 2 * hw) * 0.8;
    const y0 = cy + (rngFloat(rng) - 0.5) * 120;
    const depth = 40 + rngFloat(rng) * 50;
    for (let x = Math.max(MARGIN, Math.floor(cx - hw)); x < Math.min(o.w - MARGIN, cx + hw); x++) {
      const f = (x - cx) / hw; // -1..1
      const r = 1 - f * f;
      const top = y0 - r * 14 + sample1D(bumps, x, 30) * 6;
      const bottom = y0 + 12 + r * depth * (0.7 + sample1D(bumps, x + 15, 30) * 0.3);
      for (let y = Math.max(0, Math.floor(top)); y < bottom && y < o.waterY - 20; y++) t.mask[y * o.w + x] = 1;
    }
  }
}
