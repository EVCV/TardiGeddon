// Serialise a WorldState to a JSON string and back (for online rejoin and
// desync recovery). The terrain mask is run-length encoded: it's mostly long
// runs of air or soil, so this keeps a snapshot to a few tens of KB.

import type { WorldState } from '../sim/types';
import { hashWorld } from '../sim/world';

// JSON writes -0 as 0, which would change the world hash; keep it exact.
const NEG_ZERO = '\u0000-0';

export function encodeWorld(s: WorldState): string {
  const m = s.terrain.mask;
  const runs: number[] = [];
  let i = 0;
  while (i < m.length) {
    const v = m[i];
    let j = i + 1;
    while (j < m.length && m[j] === v) j++;
    runs.push(v, j - i);
    i = j;
  }
  const { terrain, ...rest } = s;
  return JSON.stringify({ ...rest, terrain: { w: terrain.w, h: terrain.h, runs } }, (_k, v) => (Object.is(v, -0) ? NEG_ZERO : v));
}

export function decodeWorld(json: string): WorldState {
  const o = JSON.parse(json, (_k, v) => (v === NEG_ZERO ? -0 : v)) as Omit<WorldState, 'terrain'> & { terrain: { w: number; h: number; runs: number[] } };
  const { w, h, runs } = o.terrain;
  const mask = new Uint8Array(w * h);
  let p = 0;
  for (let k = 0; k < runs.length; k += 2) {
    mask.fill(runs[k], p, p + runs[k + 1]);
    p += runs[k + 1];
  }
  return { ...o, terrain: { w, h, mask } };
}

/**
 * Hash of everything a snapshot carries, for online desync checks. hashWorld
 * covers terrain and physics; this adds every other field (ammo, turn state,
 * projectile owners...) via the JSON form, which is identical on every client.
 */
export function syncHash(s: WorldState): number {
  // Leave terrain out (not just null it): key order must match a decoded snapshot's.
  const { terrain: _terrain, ...rest } = s;
  const json = JSON.stringify(rest);
  let h = hashWorld(s) ^ 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
