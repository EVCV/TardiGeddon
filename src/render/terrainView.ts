// Paints the terrain mask into a canvas texture in the vector-cartoon style:
// bold dark outline, a grassy moss band on top, pebbly soil below and
// scorch marks around craters.

import { Container, Sprite, Texture } from 'pixi.js';
import type { Rect, Terrain } from '../sim/terrain/terrain';
import { PALETTE } from './palette';

const GRASS_DEPTH = 10;
/** Max texture width per tile: big maps exceed phone GPU texture limits. */
const TILE_W = 1024;

interface Tile {
  x: number;
  w: number;
  ctx: CanvasRenderingContext2D;
  texture: Texture;
  dirty: boolean;
}

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
  readonly root = new Container();
  private tiles: Tile[] = [];
  private scorch: Uint8Array;

  constructor(private terrain: Terrain) {
    this.scorch = new Uint8Array(terrain.w * terrain.h);
    for (let x = 0; x < terrain.w; x += TILE_W) {
      const w = Math.min(TILE_W, terrain.w - x);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = terrain.h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const tile: Tile = { x, w, ctx, texture: Texture.EMPTY, dirty: false };
      this.tiles.push(tile);
      this.paint({ x, y: 0, w, h: terrain.h });
      tile.texture = Texture.from(canvas);
      tile.dirty = false;
      const sprite = new Sprite(tile.texture);
      sprite.x = x;
      this.root.addChild(sprite);
    }
  }

  private flush(): void {
    for (const t of this.tiles) {
      if (t.dirty) {
        t.texture.source.update();
        t.dirty = false;
      }
    }
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
    this.flush();
  }

  /** Repaint after terrain was added (e.g. a girder). */
  repaint(rect: Rect): void {
    const m = GRASS_DEPTH + 4;
    this.paint({ x: rect.x - m, y: rect.y - m, w: rect.w + m * 2, h: rect.h + m * 2 });
    this.flush();
  }

  /** Repaint a region, split across the tiles it overlaps. */
  private paint(r: Rect): void {
    for (const tile of this.tiles) {
      const x0 = Math.max(r.x, tile.x);
      const x1 = Math.min(r.x + r.w, tile.x + tile.w);
      if (x1 > x0) this.paintTile(tile, { x: x0, y: r.y, w: x1 - x0, h: r.h });
    }
  }

  private paintTile(tile: Tile, r: Rect): void {
    const t = this.terrain;
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(t.w, r.x + r.w);
    const y1 = Math.min(t.h, r.y + r.h);
    if (x1 <= x0 || y1 <= y0) return;
    const img = tile.ctx.createImageData(x1 - x0, y1 - y0);
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
    tile.ctx.putImageData(img, x0 - tile.x, y0);
    tile.dirty = true;
  }
}
