// What the weather does to the land, as you watch: snow settles over the
// grass until the hills are white; rain darkens it and fills the hollows (and
// fresh craters) with puddles that grow through the match, with little
// splashes where the drops land. Scenery only: the sim never knows (the
// ground plays the same), so it's drawn on its own layer over the terrain,
// redrawn column by column when the land changes or the weather builds up.

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Terrain } from '../sim/terrain/terrain';
import type { WeatherKind } from '../sim/types';

/** Seconds of the match for the snow or puddles to build up fully. */
const BUILD_UP = 60;
/** Deepest snow and deepest puddle (px). */
const SNOW_DEPTH = 7;
const PUDDLE_DEPTH = 14;
/** Wet grass: this far down from the surface. */
const WET_DEPTH = 10;
/** Snow and rain reach ground with at least this much open air above it (under a floating island too, not in a cave). */
const OPEN_AIR = 140;
/** Puddles: how far each side a dip's lowest point is looked for (so every little dip gets one). */
const DIP_REACH = 60;
const TILE_W = 1024;

interface Tile {
  x: number;
  w: number;
  ctx: CanvasRenderingContext2D;
  texture: Texture;
}

function firstSolid(m: Uint8Array, w: number, x: number, waterY: number): number {
  let y = 0;
  while (y < waterY && m[y * w + x] === 0) y++;
  return y;
}

export class GroundWeather {
  readonly root = new Container();
  /** Raindrops splashing on the ground (world space). */
  private splashes = new Graphics();
  private tiles: Tile[] = [];
  private amount = -1;
  private time = 0;
  private dirty = true;
  /** Top of the land in each column (-1: none), for the puddles and splashes. */
  private tops: Int32Array;
  /** Every floor in each column that snow or rain reaches (the top, and any with open air above). */
  private floors: number[][] = [];
  private splashList: { x: number; y: number; life: number }[] = [];

  constructor(
    private terrain: Terrain,
    private kind: WeatherKind,
  ) {
    this.tops = new Int32Array(terrain.w).fill(-1);
    if (!this.active) return;
    for (let x = 0; x < terrain.w; x += TILE_W) {
      const w = Math.min(TILE_W, terrain.w - x);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = terrain.h;
      const ctx = canvas.getContext('2d')!;
      const tile: Tile = { x, w, ctx, texture: Texture.from(canvas) };
      this.tiles.push(tile);
      const sprite = new Sprite(tile.texture);
      sprite.x = x;
      this.root.addChild(sprite);
    }
    this.root.addChild(this.splashes);
  }

  private get active(): boolean {
    return this.kind === 'snow' || this.kind === 'rain' || this.kind === 'storm';
  }

  /** The land changed (a crater, a girder): redraw on the next frame. */
  landChanged(): void {
    this.dirty = true;
  }

  update(dt: number, waterY: number): void {
    if (!this.active) return;
    this.time += dt;
    // Builds up in steps (each a cheap redraw), fully after BUILD_UP seconds.
    const amount = Math.round(Math.min(1, this.time / BUILD_UP) * 14) / 14;
    if (amount !== this.amount || this.dirty) {
      this.amount = amount;
      this.dirty = false;
      this.redraw(waterY);
    }
    if (this.kind !== 'snow') this.drawSplashes(dt, waterY);
  }

  private redraw(waterY: number): void {
    const t = this.terrain;
    const m = t.mask;
    const snow = this.kind === 'snow';
    // The top of the land in each column: snow and rain only reach what's open to the sky.
    for (let x = 0; x < t.w; x++) {
      const floors: number[] = [];
      let air = 0;
      for (let y = 0; y < waterY - 30; y++) {
        if (m[y * t.w + x] === 0) {
          air++;
          continue;
        }
        if (air === y || air >= OPEN_AIR) floors.push(y);
        air = 0;
      }
      this.floors[x] = floors;
      this.tops[x] = floors.length && floors[0] === firstSolid(m, t.w, x, waterY) ? floors[0] : -1;
    }
    const puddles = snow ? null : this.puddleLevels(waterY);
    const a = this.amount;
    for (const tile of this.tiles) {
      const c = tile.ctx;
      c.clearRect(0, 0, tile.w, t.h);
      for (let x = tile.x; x < tile.x + tile.w; x++) {
        const lx = x - tile.x;
        for (const top of this.floors[x]) {
          if (snow) {
            // A cap of snow over the grass, deeper as it falls, with a dark rim
            // on top and a blue-grey shade underneath (the cartoon outline).
            const depth = Math.max(0, Math.round(a * SNOW_DEPTH));
            if (depth === 0) continue;
            // A little lumpy, never quite even.
            const lump = depth > 2 ? ((x * 7) % 5 === 0 ? 1 : 0) : 0;
            c.fillStyle = '#4e6684';
            c.fillRect(lx, top - lump, 1, 1);
            c.fillStyle = '#ffffff';
            c.fillRect(lx, top - lump + 1, 1, depth + lump);
            c.fillStyle = '#c7d8ec';
            c.fillRect(lx, top + depth, 1, 2);
          } else {
            // Wet, darker grass...
            c.fillStyle = `rgba(15, 50, 110, ${(0.38 * a).toFixed(3)})`;
            c.fillRect(lx, top, 1, WET_DEPTH);
            // ...and a puddle in the hollows (of the land's top).
            const level = puddles![x];
            if (top === this.tops[x] && level < top) {
              c.fillStyle = 'rgba(80, 160, 235, 0.85)';
              c.fillRect(lx, level, 1, top - level + 1);
              c.fillStyle = 'rgba(225, 245, 255, 0.95)';
              c.fillRect(lx, level, 1, 1);
            }
          }
        }
      }
      tile.texture.source.update();
    }
  }

  /**
   * Where the water stands in each column (a y; >= the top when there's no
   * puddle). Rain collects in dips of the land's top surface: each dip fills
   * from its lowest point up, never higher than its lower rim, and not more
   * than the rain so far allows.
   */
  private puddleLevels(waterY: number): Int32Array {
    const w = this.terrain.w;
    const tops = this.tops;
    const out = new Int32Array(w).fill(waterY);
    // Surface height (bigger = higher); no land counts as a drop to the sea.
    const hgt = (x: number) => (tops[x] < 0 ? -waterY : -tops[x]);
    const left = new Float64Array(w);
    const right = new Float64Array(w);
    for (let x = 0; x < w; x++) left[x] = Math.max(x ? left[x - 1] : -Infinity, hgt(x));
    for (let x = w - 1; x >= 0; x--) right[x] = Math.max(x < w - 1 ? right[x + 1] : -Infinity, hgt(x));
    const cap = this.amount * PUDDLE_DEPTH;
    for (let x = 0; x < w; x++) {
      // Not on the shore: that's the sea's job.
      if (tops[x] < 0 || tops[x] > waterY - 40) continue;
      const full = Math.min(left[x], right[x]);
      if (full <= hgt(x)) continue;
      // Each dip fills from its own lowest point (the lowest ground near by), up to its rim.
      let bottom = hgt(x);
      for (let k = Math.max(0, x - DIP_REACH); k <= Math.min(w - 1, x + DIP_REACH); k++) if (tops[k] >= 0) bottom = Math.min(bottom, hgt(k));
      const level = Math.min(full, bottom + cap);
      if (level > hgt(x)) out[x] = Math.round(-level);
    }
    return out;
  }

  /** Little crowns of water where raindrops hit the ground. */
  private drawSplashes(dt: number, waterY: number): void {
    const g = this.splashes;
    g.clear();
    const w = this.terrain.w;
    const n = this.kind === 'storm' ? 10 : 5;
    for (let i = 0; i < n; i++) {
      if (Math.random() > dt * 30) continue;
      const x = Math.floor(Math.random() * w);
      const y = this.tops[x];
      if (y >= 0 && y < waterY) this.splashList.push({ x, y, life: 0.3 });
    }
    for (const s of this.splashList) {
      s.life -= dt;
      const k = 1 - s.life / 0.3;
      const r = 2 + k * 5;
      g.moveTo(s.x - r, s.y - 1).quadraticCurveTo(s.x - r * 0.6, s.y - 2 - r * 0.8, s.x - r * 0.2, s.y - 1);
      g.moveTo(s.x + r * 0.2, s.y - 1).quadraticCurveTo(s.x + r * 0.6, s.y - 2 - r * 0.8, s.x + r, s.y - 1);
    }
    g.stroke({ width: 1.6, color: 0xd8efff, alpha: 0.85, cap: 'round' });
    this.splashList = this.splashList.filter((s) => s.life > 0);
  }

  destroy(): void {
    for (const t of this.tiles) t.texture.destroy(true);
    this.tiles = [];
  }
}
