import { describe, expect, it } from 'vitest';
import { bounds, spring1, springTo } from '../src/render/cameraMotion';

/** Run the camera at 60 fps towards a target that may change; returns every position and speed. */
function run(targets: (frame: number) => { x: number; y: number }, frames: number, smooth = 0.3, maxSpeed = Infinity, dt = 1 / 60) {
  const pos = { x: 0, y: 0 };
  const vel = { x: 0, y: 0 };
  const out: { x: number; v: number }[] = [];
  for (let i = 0; i < frames; i++) {
    springTo(pos, vel, targets(i), smooth, dt, maxSpeed);
    out.push({ x: pos.x, v: vel.x });
  }
  return out;
}

describe('camera spring', () => {
  it('starts a pan gently: no jump in speed when the target jumps', () => {
    // A blast 1500 px away: the old camera moved ~6% of the way (90 px) in the first frame.
    const path = run(() => ({ x: 1500, y: 0 }), 120);
    expect(path[0].x).toBeLessThan(15);
    // The old camera went from still to ~5900 px/s in one frame; this one builds up its speed.
    expect(path[0].v).toBeLessThan(1200);
    for (let i = 1; i < path.length; i++) expect(Math.abs(path[i].v - path[i - 1].v)).toBeLessThan(1200);
    expect(Math.max(...path.map((p) => p.v))).toBeGreaterThan(2000);
  });

  it('gets there without overshooting, and stops', () => {
    const path = run(() => ({ x: 1000, y: 0 }), 180);
    for (const p of path) expect(p.x).toBeLessThanOrEqual(1000);
    expect(path.at(-1)!.x).toBeCloseTo(1000, 0);
    expect(Math.abs(path.at(-1)!.v)).toBeLessThan(1);
  });

  it('keeps a long pan to its top speed', () => {
    const path = run(() => ({ x: 5000, y: 0 }), 300, 0.3, 2000);
    for (const p of path) expect(Math.abs(p.v)).toBeLessThanOrEqual(2000 * 1.01);
    expect(path.at(-1)!.x).toBeCloseTo(5000, 0);
  });

  it('is the same at any frame rate (the video tools step 1/30 s, a seek 1/4 s)', () => {
    const at60 = run(() => ({ x: 800, y: 0 }), 60, 0.3, Infinity, 1 / 60).at(-1)!.x;
    const at30 = run(() => ({ x: 800, y: 0 }), 30, 0.3, Infinity, 1 / 30).at(-1)!.x;
    const at4 = run(() => ({ x: 800, y: 0 }), 4, 0.3, Infinity, 1 / 4).at(-1)!.x;
    expect(Math.abs(at60 - at30)).toBeLessThan(8);
    expect(Math.abs(at60 - at4)).toBeLessThan(20);
  });

  it('follows a target back and forth smoothly (cluster bits, blasts each side)', () => {
    const path = run((i) => ({ x: Math.floor(i / 15) % 2 ? 600 : -600, y: 0 }), 240);
    for (let i = 1; i < path.length; i++) expect(Math.abs(path[i].x - path[i - 1].x)).toBeLessThan(40);
  });

  it('zooms smoothly too', () => {
    const vel = { v: 0 };
    let z = Math.log(1.6);
    const zs: number[] = [];
    for (let i = 0; i < 90; i++) zs.push((z = spring1(z, vel, Math.log(0.9), 0.45, 1 / 30)));
    expect(Math.exp(zs.at(-1)!)).toBeCloseTo(0.9, 2);
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeLessThanOrEqual(zs[i - 1]);
  });

  it('measures the box round the action', () => {
    expect(bounds([])).toBeNull();
    expect(bounds([{ x: 3, y: 9 }, { x: -1, y: 2 }])).toEqual({ x0: -1, y0: 2, x1: 3, y1: 9 });
  });
});
