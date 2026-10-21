// Weather and little surprises: rain, snow, sunshine, fog, storms, the
// tornado's funnel, and a few rare easter eggs. Scenery only: the sim picks
// the weather (WorldState.weather) and does the tornado's moving; this just
// draws it, so it may use Math.random freely.

import { Graphics } from 'pixi.js';
import type { WeatherKind } from '../sim/types';
import { PALETTE } from './palette';

const O = PALETTE.outline;

interface Drop {
  x: number;
  y: number;
  v: number;
  r: number;
  p: number;
}

/** Easter eggs: each match rolls for them once. */
interface Eggs {
  /** A rubber duck bobbing on the water, at this x (world units). */
  duck: number | null;
  /** A little flying saucer that crosses the sky now and then. */
  ufo: boolean;
  /** A rainbow over a sunny map. */
  rainbow: boolean;
}

export class WeatherView {
  /** Behind the land, in screen space: sun, rainbow, saucer. */
  readonly back = new Graphics();
  /** In front of everything, in screen space: rain, snow, fog, lightning, the tornado. */
  readonly front = new Graphics();
  /** In the world, at the water line: the duck. */
  readonly world = new Graphics();
  private drops: Drop[] = [];
  private eggs: Eggs;
  private time = 0;
  private flash = 0;
  private nextFlash = 4 + Math.random() * 6;
  /** Seconds left of the tornado sweeping across the screen. */
  private twister = 0;
  private ufoAt = 20 + Math.random() * 40;

  constructor(
    private kind: WeatherKind,
    mapW: number,
    /** The arena already snows or rains embers: don't double up. */
    hasDrift: boolean,
  ) {
    const n = hasDrift ? 0 : kind === 'rain' ? 140 : kind === 'storm' ? 220 : kind === 'snow' ? 90 : 0;
    for (let i = 0; i < n; i++) this.drops.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.6, r: 1 + Math.random() * 1.6, p: Math.random() * 6.28 });
    this.eggs = {
      duck: Math.random() < 1 / 25 ? 150 + Math.random() * (mapW - 300) : null,
      ufo: Math.random() < 1 / 40,
      rainbow: kind === 'sunny' && Math.random() < 1 / 3,
    };
  }

  /** The tornado came through (SimEvent 'tornado'). */
  tornado(): void {
    this.twister = 3.2;
  }

  update(dt: number, width: number, height: number, wind: number, waterY: number): void {
    this.time += dt;
    const t = this.time;
    const b = this.back;
    const f = this.front;
    b.clear();
    f.clear();

    if (this.kind === 'sunny') {
      // A warm sun in the corner with slowly turning rays.
      const sx = width - 70;
      const sy = 70;
      for (let i = 0; i < 12; i++) {
        const a = t * 0.15 + (i * Math.PI) / 6;
        b.moveTo(sx + Math.cos(a) * 40, sy + Math.sin(a) * 40).lineTo(sx + Math.cos(a) * 62, sy + Math.sin(a) * 62);
      }
      b.stroke({ width: 5, color: 0xffd84a, alpha: 0.7, cap: 'round' });
      b.circle(sx, sy, 32).fill(0xffe27a).stroke({ width: 3, color: 0xf0a020 });
    }
    if (this.eggs.rainbow) {
      const cols = [0xff5a5a, 0xffa040, 0xffe060, 0x7ad860, 0x5aa8ff, 0x9a6ae0];
      cols.forEach((c, i) => {
        b.arc(width * 0.3, height * 0.75, width * 0.32 - i * 9, Math.PI, Math.PI * 2).stroke({ width: 9, color: c, alpha: 0.28 });
      });
    }
    if (this.eggs.ufo) {
      this.ufoAt -= dt;
      if (this.ufoAt < 0) {
        // Crosses in 8 seconds, then waits a minute or two.
        const k = -this.ufoAt / 8;
        if (k > 1) this.ufoAt = 60 + Math.random() * 60;
        else {
          const x = -40 + k * (width + 80);
          const y = height * 0.18 + Math.sin(k * 12) * 14;
          b.ellipse(x, y - 5, 9, 7).fill({ color: 0xbff7ff, alpha: 0.85 }).stroke({ width: 1.5, color: O });
          b.ellipse(x, y, 22, 6).fill(0xc3cad6).stroke({ width: 2, color: O });
          for (let i = -1; i <= 1; i++) b.circle(x + i * 10, y + 1, 1.8).fill(Math.sin(t * 10 + i) > 0 ? 0xffd84a : 0x5aff7a);
        }
      }
    }

    // Rain and snow lean with the wind.
    const rain = this.kind === 'rain' || this.kind === 'storm';
    for (const d of this.drops) {
      if (rain) {
        d.y += d.v * dt * 1.6;
        d.x += wind * dt * 0.25;
      } else {
        d.y += d.v * dt * 0.12;
        d.x += (wind * 0.12 + Math.sin(t + d.p) * 0.02) * dt;
      }
      if (d.y > 1.02) {
        d.y -= 1.04;
        d.x = Math.random();
      }
      if (d.x < -0.02) d.x += 1.04;
      if (d.x > 1.02) d.x -= 1.04;
      const x = d.x * width;
      const y = d.y * height;
      if (rain) f.moveTo(x, y).lineTo(x + wind * 6, y + 12);
      else f.circle(x, y, d.r + 0.5);
    }
    if (rain) f.stroke({ width: 1.4, color: 0xd8ecff, alpha: 0.55 });
    else if (this.drops.length) f.fill({ color: 0xffffff, alpha: 0.9 });

    if (this.kind === 'fog') {
      // Slow drifting banks of mist, thicker low down.
      for (let i = 0; i < 4; i++) {
        const y = height * (0.45 + i * 0.15);
        const x = ((t * (8 + i * 3) + i * 300) % (width + 600)) - 300;
        f.ellipse(x, y, 320, 50 + i * 10).fill({ color: 0xffffff, alpha: 0.13 + i * 0.03 });
        f.ellipse(x + width * 0.55, y + 20, 280, 40 + i * 10).fill({ color: 0xffffff, alpha: 0.1 + i * 0.03 });
      }
    }
    if (this.kind === 'storm') {
      // Gloom, and lightning every few seconds.
      f.rect(0, 0, width, height).fill({ color: 0x1a2040, alpha: 0.14 });
      this.nextFlash -= dt;
      if (this.nextFlash < 0) {
        this.flash = 0.35;
        this.nextFlash = 5 + Math.random() * 9;
      }
      if (this.flash > 0) {
        this.flash -= dt;
        f.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: Math.max(0, this.flash) * 1.4 });
      }
    }

    if (this.twister > 0) {
      // A swaying funnel that crosses the screen.
      this.twister -= dt;
      const k = 1 - this.twister / 3.2;
      const cx = -120 + k * (width + 240);
      for (let i = 0; i < 14; i++) {
        const yy = height * (0.95 - i * 0.065);
        const rw = 14 + i * i * 1.3;
        const sway = Math.sin(t * 6 + i * 0.6) * (6 + i * 2);
        f.ellipse(cx + sway, yy, rw, 7 + i * 0.6).fill({ color: 0x8a8f9e, alpha: 0.5 }).stroke({ width: 2, color: 0x4a4f5e, alpha: 0.6 });
      }
    }

    const w = this.world;
    w.clear();
    if (this.eggs.duck !== null) {
      const x = this.eggs.duck + Math.sin(t * 0.2) * 40;
      const y = waterY - 6 + Math.sin(t * 2) * 2;
      w.ellipse(x, y, 12, 7).fill(0xffd84a).stroke({ width: 1.5, color: O });
      w.circle(x + 8, y - 9, 6).fill(0xffd84a).stroke({ width: 1.5, color: O });
      w.poly([x + 13, y - 10, x + 19, y - 8, x + 13, y - 6]).fill(0xf08a2a).stroke({ width: 1, color: O });
      w.circle(x + 10, y - 11, 1.2).fill(O);
    }
  }

  /** `world` goes with the world container it sits in. */
  destroy(): void {
    this.back.destroy();
    this.front.destroy();
  }
}

/** Names for the start-of-match banner. */
export const WEATHER_NAMES: Record<WeatherKind, string> = {
  clear: '',
  sunny: 'Sunny',
  rain: 'Rain',
  snow: 'Snow',
  fog: 'Fog',
  storm: 'Storm',
};
