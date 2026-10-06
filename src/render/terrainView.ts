// Paints the terrain mask into a canvas texture in the vector-cartoon style:
// bold dark outline, a grassy moss band on top, pebbly soil below and
// scorch marks around craters.

import { Sprite, Texture } from 'pixi.js';
import type { Rect, Terrain } from '../sim/terrain/terrain';
import { PALETTE } from './palette';

const GRASS_DEPTH = 10;

function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
const OUTLINE = rgb(PALETTE.soil[0]);
const GRASS_DARK = rgb(PALETTE.grass[0]);
const GRASS = rgb(PALETTE.grass[1]);
const GRASS_LIGHT = rgb(PALETTE.grass[2]);
const SOIL = rgb(PALETTE.soil[1]);
const PEBBLE = rgb(PALETTE.soil[2]);
const PEBBLE_LIGHT = rgb(PALETTE.soil[3]);
const WOOD = rgb(0xc08a4a);
const WOOD_DARK = rgb(0x8f5f2e);
const WOOD_LIGHT = rgb(0xdcae6e);

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Pebble pattern: one blob per 16px cell at a hashed position. */
function pebble(x: number, y: number): 0 | 1 | 2 {
  const cs = 16;
  const cx = Math.floor(x / cs);
  const cy = Math.floor(y / cs);
  const h = hash(cx, cy);
  const px = cx * cs + 3 + (h % 10);
  const py = cy * cs + 3 + ((h >>> 8) % 10);
  const r = 2 + ((h >>> 16) % 3);
  const dx = x - px;
  const dy = y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 > r * r) return 0;
  return dx + dy < -1 ? 2 : 1;
}

export class TerrainView {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: Texture;
  private scorch: Uint8Array;

  constructor(private terrain: Terrain) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = terrain.w;
    this.canvas.height = terrain.h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.scorch = new Uint8Array(terrain.w * terrain.h);
    this.paint({ x: 0, y: 0, w: terrain.w, h: terrain.h });
    this.texture = Texture.from(this.canvas);
    this.sprite = new Sprite(this.texture);
  }

  /** Called after an explosion carved a crater. */
  crater(x: number, y: number, r: number, rect: Rect): void {
    const t = this.terrain;
    const ring = r + 6;
    const x0 = Math.max(0, Math.floor(x - ring));
    const x1 = Math.min(t.w - 1, Math.ceil(x + ring));
    const y0 = Math.max(0, Math.floor(y - ring));
    const y1 = Math.min(t.h - 1, Math.ceil(y + ring));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const d = Math.hypot(px - x, py - y);
        if (d <= ring) this.scorch[py * t.w + px] = Math.max(this.scorch[py * t.w + px], d > r + 3 ? 1 : 2);
      }
    }
    // Repaint a margin around the crater so outlines/grass update.
    const m = GRASS_DEPTH + 8;
    this.paint({ x: rect.x - m, y: rect.y - m, w: rect.w + m * 2, h: rect.h + m * 2 });
    this.texture.source.update();
  }

  /** Repaint after terrain was added (e.g. a girder). */
  repaint(rect: Rect): void {
    const m = GRASS_DEPTH + 4;
    this.paint({ x: rect.x - m, y: rect.y - m, w: rect.w + m * 2, h: rect.h + m * 2 });
    this.texture.source.update();
  }

  private paint(r: Rect): void {
    const t = this.terrain;
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(t.w, r.x + r.w);
    const y1 = Math.min(t.h, r.y + r.h);
    if (x1 <= x0 || y1 <= y0) return;
    const img = this.ctx.createImageData(x1 - x0, y1 - y0);
    const d = img.data;
    const m = t.mask;
    const w = t.w;
    const solid = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < t.h && m[y * w + x] !== 0;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = ((y - y0) * (x1 - x0) + (x - x0)) * 4;
        if (m[y * w + x] === 0) {
          d[o + 3] = 0;
          continue;
        }
        let c: [number, number, number];
        const edge =
          !solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y + 1) || !solid(x - 2, y) || !solid(x + 2, y) || !solid(x, y + 2);
        if (m[y * w + x] === 2) {
          // Twig girder: wood with grain flecks and a bold outline.
          const top = !solid(x, y - 1) || !solid(x, y - 2);
          if (edge || top) c = OUTLINE;
          else if (!solid(x, y - 3)) c = WOOD_LIGHT;
          else c = hash(x >> 2, y) % 5 === 0 ? WOOD_DARK : WOOD;
          d[o] = c[0];
          d[o + 1] = c[1];
          d[o + 2] = c[2];
          d[o + 3] = 255;
          continue;
        }
        // Distance to air straight above (for the moss band).
        let up = 0;
        while (up < GRASS_DEPTH && solid(x, y - up - 1)) up++;
        if (up < GRASS_DEPTH) {
          if (up < 2) c = GRASS_DARK;
          else if (up < 4) c = GRASS_LIGHT;
          else if (up < GRASS_DEPTH - 2) c = GRASS;
          else c = GRASS_DARK;
        } else if (edge) {
          c = OUTLINE;
        } else {
          const p = pebble(x, y);
          c = p === 0 ? SOIL : p === 1 ? PEBBLE : PEBBLE_LIGHT;
        }
        let k = 1;
        const sc = this.scorch[y * w + x];
        if (sc === 2) k = 0.55;
        else if (sc === 1) k = 0.78;
        d[o] = c[0] * k;
        d[o + 1] = c[1] * k;
        d[o + 2] = c[2] * k;
        d[o + 3] = 255;
      }
    }
    this.ctx.putImageData(img, x0, y0);
  }
}
