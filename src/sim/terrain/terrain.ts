// Destructible terrain: one byte per pixel (1 = solid, 0 = air).

export interface Terrain {
  w: number;
  h: number;
  mask: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function createTerrain(w: number, h: number): Terrain {
  return { w, h, mask: new Uint8Array(w * h) };
}

export function isSolid(t: Terrain, x: number, y: number): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || ix >= t.w || iy < 0 || iy >= t.h) return false;
  return t.mask[iy * t.w + ix] === 1;
}

// Integer offsets inside circles of each radius, cached.
const circleOffsets = new Map<number, Int16Array>();
function offsetsFor(r: number): Int16Array {
  let o = circleOffsets.get(r);
  if (!o) {
    const list: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) list.push(dx, dy);
      }
    }
    o = Int16Array.from(list);
    circleOffsets.set(r, o);
  }
  return o;
}

/** True if any solid pixel lies inside the circle (r is an integer). */
export function circleCollides(t: Terrain, x: number, y: number, r: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const o = offsetsFor(r);
  for (let i = 0; i < o.length; i += 2) {
    const px = cx + o[i];
    const py = cy + o[i + 1];
    if (px < 0 || px >= t.w || py < 0 || py >= t.h) continue;
    if (t.mask[py * t.w + px] === 1) return true;
  }
  return false;
}

/**
 * Approximate surface normal at a point, pointing from solid into air.
 * Returns (0, -1) when there is no nearby terrain.
 */
export function normalAt(t: Terrain, x: number, y: number, r: number): { nx: number; ny: number } {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const o = offsetsFor(r);
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < o.length; i += 2) {
    const px = cx + o[i];
    const py = cy + o[i + 1];
    if (px < 0 || px >= t.w || py < 0 || py >= t.h) continue;
    if (t.mask[py * t.w + px] === 1) {
      sx += o[i];
      sy += o[i + 1];
    }
  }
  const len = Math.sqrt(sx * sx + sy * sy);
  if (len === 0) return { nx: 0, ny: -1 };
  return { nx: -sx / len, ny: -sy / len };
}

/** Remove terrain in a circle. Returns the affected rectangle. */
export function carveCircle(t: Terrain, x: number, y: number, r: number): Rect {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const ri = Math.ceil(r);
  const r2 = r * r;
  const x0 = Math.max(0, cx - ri);
  const x1 = Math.min(t.w - 1, cx + ri);
  const y0 = Math.max(0, cy - ri);
  const y1 = Math.min(t.h - 1, cy + ri);
  for (let py = y0; py <= y1; py++) {
    const dy = py - cy;
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx;
      if (dx * dx + dy * dy <= r2) t.mask[py * t.w + px] = 0;
    }
  }
  return { x: x0, y: y0, w: Math.max(0, x1 - x0 + 1), h: Math.max(0, y1 - y0 + 1) };
}

/** Topmost solid y in a column at or below startY, or -1. */
export function surfaceBelow(t: Terrain, x: number, startY: number): number {
  const ix = Math.floor(x);
  if (ix < 0 || ix >= t.w) return -1;
  for (let y = Math.max(0, Math.floor(startY)); y < t.h; y++) {
    if (t.mask[y * t.w + ix] === 1) return y;
  }
  return -1;
}
