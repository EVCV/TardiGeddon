// How the camera moves: a critically damped spring. It eases out of rest and
// into its target, never overshoots, and its speed never jumps, so a new
// target (a blast across the map, the next player's turn) starts a smooth pan
// instead of a lurch. Pure (no Pixi), so it can be tested on its own.

export interface Vec {
  x: number;
  y: number;
}

/**
 * Move `pos` towards `to`, carrying the velocity `vel` (both changed in place).
 * `smooth` is roughly the seconds it takes to get there; `maxSpeed` (units a
 * second) keeps very long pans from racing.
 */
export function springTo(pos: Vec, vel: Vec, to: Vec, smooth: number, dt: number, maxSpeed = Infinity): void {
  if (dt <= 0) return;
  const st = Math.max(0.0001, smooth);
  const omega = 2 / st;
  const k = omega * dt;
  // e^-k, to within a hair (stable for any dt).
  const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  let cx = pos.x - to.x;
  let cy = pos.y - to.y;
  // Never further than maxSpeed can cover: a long pan runs at that speed, then eases in.
  const far = maxSpeed * st;
  const d = Math.hypot(cx, cy);
  if (d > far) {
    cx *= far / d;
    cy *= far / d;
  }
  const tx = pos.x - cx;
  const ty = pos.y - cy;
  const px = (vel.x + omega * cx) * dt;
  const py = (vel.y + omega * cy) * dt;
  // (Critically damped: it settles on a still target without going past it, and
  // chasing a moving one it never stops dead, which would be a jolt.)
  pos.x = tx + (cx + px) * e;
  pos.y = ty + (cy + py) * e;
  vel.x = (vel.x - omega * px) * e;
  vel.y = (vel.y - omega * py) * e;
}

/** The same spring for one number (the zoom). */
export function spring1(x: number, vel: { v: number }, to: number, smooth: number, dt: number): number {
  const p = { x, y: 0 };
  const v = { x: vel.v, y: 0 };
  springTo(p, v, { x: to, y: 0 }, smooth, dt);
  vel.v = v.x;
  return p.x;
}

/** The box around these points (null for none). */
export function bounds(ps: readonly Vec[]): { x0: number; y0: number; x1: number; y1: number } | null {
  if (ps.length === 0) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of ps) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}
