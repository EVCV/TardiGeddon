// Custom maps (made in the map editor): the land as a run-length-encoded
// mask, "WxH:" then alternating runs of air and land in base 36, separated
// by dots ("2000x1000:1qx.3c.…", air first). Small enough to keep on the
// device, send in a file, or travel with an online match's rules. Decoding
// checks everything, as maps can come from anyone.

import { createTerrain, type Terrain } from './terrain';

export const CUSTOM_MAX_W = 4000;
export const CUSTOM_MAX_H = 1500;
/** Longest map string accepted (80 KB: it has to fit in one online message, server/main.ts). */
export const CUSTOM_MAX_LENGTH = 80_000;

export function encodeCustomMap(t: Terrain): string {
  const runs: string[] = [];
  let value = 0;
  let run = 0;
  for (let i = 0; i < t.mask.length; i++) {
    const v = t.mask[i] ? 1 : 0;
    if (v === value) run++;
    else {
      runs.push(run.toString(36));
      value = v;
      run = 1;
    }
  }
  runs.push(run.toString(36));
  return `${t.w}x${t.h}:${runs.join('.')}`;
}

/** The map's land, or null if it isn't a sane map. */
export function decodeCustomMap(s: unknown): Terrain | null {
  if (typeof s !== 'string' || s.length > CUSTOM_MAX_LENGTH) return null;
  const m = /^(\d{3,4})x(\d{3,4}):([0-9a-z.]+)$/.exec(s);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w < 800 || h < 500 || w > CUSTOM_MAX_W || h > CUSTOM_MAX_H) return null;
  const t = createTerrain(w, h);
  let p = 0;
  let value = 0;
  for (const part of m[3].split('.')) {
    if (part.length === 0 || part.length > 6) return null;
    const n = parseInt(part, 36);
    if (!(n >= 0) || p + n > t.mask.length) return null;
    if (value === 1) t.mask.fill(1, p, p + n);
    p += n;
    value = 1 - value;
  }
  return p === t.mask.length ? t : null;
}

export function isCustomMap(s: unknown): s is string {
  return decodeCustomMap(s) !== null;
}
