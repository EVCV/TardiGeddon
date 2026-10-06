// Draws the simulation state. Reads WorldState; never writes to it.

import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { SimEvent, WorldState } from '../sim/types';
import { aimVector, activeTardi, girderFits } from '../sim/world';
import { WEAPONS } from '../sim/weapons';
import { TerrainView } from './terrainView';
import { TardiView } from './tardiView';
import { ObjectView } from './objectView';
import { PALETTE, hex } from './palette';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: number;
  kind: 'flash' | 'smoke' | 'debris' | 'spark';
}

interface FloatText {
  text: Text;
  life: number;
}

export class Camera {
  x = 1000;
  y = 500;
  zoom = 1;
  manualUntil = 0;
}

export class GameRenderer {
  readonly camera = new Camera();
  private world = new Container();
  private sky: Sprite;
  private hills = new Graphics();
  private hillsNear = new Graphics();
  private terrainView: TerrainView;
  private entities = new Container();
  private projectiles = new Graphics();
  private overlay = new Graphics();
  private fx = new Graphics();
  private waterBack = new Graphics();
  private waterFront = new Graphics();
  private floatLayer = new Container();
  private markers = new Container();
  private tardiViews = new Map<number, TardiView>();
  private objectViews = new Map<number, ObjectView>();
  private objectLayer = new Container();
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private tracers: { x0: number; y0: number; x1: number; y1: number; life: number }[] = [];
  private prev = new Map<number, { x: number; y: number }>();
  private fuseTexts = new Map<number, Text>();
  private time = 0;

  constructor(
    private app: Application,
    private state: WorldState,
  ) {
    this.sky = new Sprite(makeSkyTexture());
    app.stage.addChild(this.sky);
    this.terrainView = new TerrainView(state.terrain);
    this.world.addChild(
      this.hills,
      this.hillsNear,
      this.waterBack,
      this.terrainView.root,
      this.markers,
      this.objectLayer,
      this.entities,
      this.projectiles,
      this.fx,
      this.overlay,
      this.waterFront,
      this.floatLayer,
    );
    app.stage.addChild(this.world);
    for (const t of state.tardis) {
      const v = new TardiView(t, state.teams[t.team].color, state.teams[t.team].hat);
      this.tardiViews.set(t.id, v);
      this.entities.addChild(v.root);
    }
    this.drawHills();
    const me = activeTardi(state);
    if (me) {
      this.camera.x = me.x;
      this.camera.y = me.y;
    }
    this.camera.zoom = this.defaultZoom();
  }

  defaultZoom(): number {
    const { width, height } = this.app.screen;
    return Math.max(0.5, Math.min(2.2, Math.min(height / 600, width / 1000)));
  }

  /** Record positions before a sim tick so frames can interpolate. */
  capturePrev(s: WorldState): void {
    for (const t of s.tardis) this.prev.set(t.id, { x: t.x, y: t.y });
    for (const p of s.projectiles) this.prev.set(p.id, { x: p.x, y: p.y });
    for (const o of s.objects) this.prev.set(o.id, { x: o.x, y: o.y });
  }

  private lerpPos(id: number, x: number, y: number, a: number): { x: number; y: number } {
    const p = this.prev.get(id);
    if (!p || Math.abs(p.x - x) > 40 || Math.abs(p.y - y) > 40) return { x, y };
    return { x: p.x + (x - p.x) * a, y: p.y + (y - p.y) * a };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const { width, height } = this.app.screen;
    return {
      x: (sx - width / 2) / this.camera.zoom + this.camera.x,
      y: (sy - height / 2) / this.camera.zoom + this.camera.y,
    };
  }

  handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'explosion':
          this.terrainView.crater(e.x, e.y, e.r, e.rect);
          this.spawnExplosion(e.x, e.y, e.r);
          break;
        case 'shot':
          this.tracers.push({ ...e, life: 0.25 });
          break;
        case 'splash':
          for (let i = 0; i < 14; i++) {
            this.particles.push({
              x: e.x, y: this.state.waterY, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 4,
              life: 0.8, max: 0.8, r: 2 + Math.random() * 2, color: PALETTE.waterLight, kind: 'debris',
            });
          }
          break;
        case 'dud': {
          const o = this.state.objects.find((x) => x.id === e.id);
          if (o) this.floatText('Dud', o.x, o.y - 16, 0xcccccc);
          break;
        }
        case 'collect': {
          const t = this.state.tardis.find((x) => x.id === e.tardi);
          const label = e.contents === 'health' ? `+${e.amount}` : (WEAPONS[e.contents]?.name ?? e.contents);
          if (t) this.floatText(label, t.x, t.y - 40, e.contents === 'health' ? 0x5cff7a : 0xffd84a);
          break;
        }
        case 'damage': {
          const t = this.state.tardis.find((x) => x.id === e.id);
          if (t) this.floatText(`-${e.amount}`, t.x, t.y - 34, this.state.teams[t.team].color);
          break;
        }
        case 'drown': {
          const t = this.state.tardis.find((x) => x.id === e.id);
          if (t) this.floatText('Bye-bye!', t.x, Math.min(t.y, this.state.waterY) - 20, 0xffffff);
          break;
        }
        case 'death': {
          this.tardiViews.get(e.id)?.root.destroy({ children: true });
          this.tardiViews.delete(e.id);
          const t = this.state.tardis.find((x) => x.id === e.id);
          if (t) this.markers.addChild(makeHusk(t.x, t.y, this.state.teams[t.team].color));
          break;
        }
        case 'terrain':
          this.terrainView.repaint(e.rect);
          break;
        case 'punch':
          this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.2, max: 0.2, r: 14, color: 0xfff6c2, kind: 'flash' });
          for (let i = 0; i < 12; i++) {
            const a = -Math.PI * Math.random();
            this.particles.push({
              x: e.x, y: e.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3,
              life: 0.5, max: 0.5, r: 1.5, color: 0xff9a3b, kind: 'spark',
            });
          }
          this.floatText('POW!', e.x, e.y - 24, 0xff9a3b);
          break;
        case 'teleport':
          for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.push({
              x: e.x, y: e.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
              life: 0.6, max: 0.6, r: 1.5, color: 0xfff27a, kind: 'spark',
            });
          }
          break;
      }
    }
  }

  private floatText(s: string, x: number, y: number, color: number): void {
    const text = new Text({
      text: s,
      style: {
        fontFamily: 'Luckiest Guy, Arial Black, sans-serif',
        fontSize: 18,
        fill: hex(color),
        stroke: { color: '#1b1016', width: 4, join: 'round' },
      },
    });
    text.resolution = 2;
    text.anchor.set(0.5);
    text.position.set(x, y);
    this.floatLayer.addChild(text);
    this.floats.push({ text, life: 1.6 });
  }

  private spawnExplosion(x: number, y: number, r: number): void {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, r: r * 1.3, color: 0xfff6c2, kind: 'flash' });
    const n = Math.round(r / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 1.2;
      this.particles.push({
        x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6,
        life: 1 + Math.random() * 0.6, max: 1.6, r: 4 + Math.random() * r * 0.25, color: 0x6b5d63, kind: 'smoke',
      });
    }
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * Math.random();
      const sp = 2 + Math.random() * 4;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1.2, max: 1.2, r: 1.5 + Math.random() * 1.5, color: PALETTE.soil[2], kind: 'debris',
      });
    }
    if (r >= 20) this.floatText(r >= 30 ? 'POW!' : 'BIFF!', x, y - r - 10, 0xffd84a);
  }

  render(s: WorldState, alpha: number, dt: number, showAim: boolean): void {
    this.time += dt;
    const { width, height } = this.app.screen;
    this.sky.width = width;
    this.sky.height = height;

    // Tardis
    const active = activeTardi(s);
    for (const t of s.tardis) {
      const v = this.tardiViews.get(t.id);
      if (!v) continue;
      if (!t.alive && t.y > s.waterY) {
        v.root.visible = false;
        continue;
      }
      const p = this.lerpPos(t.id, t.x, t.y, alpha);
      v.update(t, p.x, p.y, this.time, t.id === active?.id && s.turn.phase !== 'settle', true);
    }

    // Map objects
    const live = new Set<number>();
    for (const o of s.objects) {
      live.add(o.id);
      let v = this.objectViews.get(o.id);
      if (!v) {
        v = new ObjectView(o);
        this.objectViews.set(o.id, v);
        this.objectLayer.addChild(v.root);
      }
      const p = this.lerpPos(o.id, o.x, o.y, alpha);
      v.update(o, p.x, p.y, this.time);
    }
    for (const [id, v] of this.objectViews) {
      if (!live.has(id)) {
        v.root.destroy({ children: true });
        this.objectViews.delete(id);
      }
    }

    // Projectiles, plus countdown numbers over grenades and armed mines
    const pg = this.projectiles;
    pg.clear();
    const seen = new Set<number>();
    const fuses: { id: number; x: number; y: number; ticks: number }[] = [];
    for (const pr of s.projectiles) {
      const p = this.lerpPos(pr.id, pr.x, pr.y, alpha);
      drawProjectile(pg, pr.weapon, p.x, p.y, pr.vx, pr.vy);
      if (pr.fuse > 0) fuses.push({ id: pr.id, x: p.x, y: p.y, ticks: pr.fuse });
    }
    for (const o of s.objects) {
      if (o.kind === 'mine' && o.fuse > 0) {
        const p = this.lerpPos(o.id, o.x, o.y, alpha);
        fuses.push({ id: o.id, x: p.x, y: p.y - 4, ticks: o.fuse });
      }
    }
    for (const pr of fuses) {
      seen.add(pr.id);
      let ft = this.fuseTexts.get(pr.id);
      if (!ft) {
        ft = new Text({
          text: '',
          style: { fontFamily: 'Luckiest Guy, Arial Black, sans-serif', fontSize: 12, fill: '#ffffff', stroke: { color: '#1b1016', width: 3, join: 'round' } },
        });
        ft.resolution = 3;
        ft.anchor.set(0.5);
        this.floatLayer.addChild(ft);
        this.fuseTexts.set(pr.id, ft);
      }
      ft.text = String(Math.ceil(pr.ticks / 50));
      ft.position.set(pr.x, pr.y - 14);
    }
    for (const [id, ft] of this.fuseTexts) {
      if (!seen.has(id)) {
        ft.destroy();
        this.fuseTexts.delete(id);
      }
    }

    // Silk ropes
    const ov = this.overlay;
    ov.clear();
    for (const t of s.tardis) {
      if (!t.rope) continue;
      const p = this.lerpPos(t.id, t.x, t.y, alpha);
      ov.moveTo(t.rope.x, t.rope.y).lineTo(p.x, p.y).stroke({ width: 3.2, color: PALETTE.outline });
      ov.moveTo(t.rope.x, t.rope.y).lineTo(p.x, p.y).stroke({ width: 1.6, color: 0xf4f1ff });
      ov.circle(t.rope.x, t.rope.y, 3).fill(0xf4f1ff).stroke({ width: 1.2, color: PALETTE.outline });
    }

    // Aim overlay
    const def = WEAPONS[s.turn.weapon];
    const canAimNow = active && !active.rope && (!active.airborne || def.kind === 'rope' || def.kind === 'parachute');
    if (active && showAim && s.turn.phase === 'aim' && canAimNow) {
      const ap = this.lerpPos(active.id, active.x, active.y, alpha);
      const color = s.teams[active.team].color;
      if (def.girder && s.turn.target) {
        // Ghost girder at the target, rotated by the aim.
        const { dx, dy } = aimVector(active.facing, s.turn.aim);
        const { x, y } = s.turn.target;
        const hl = def.girder.len / 2;
        const ht = def.girder.thick / 2;
        ov.poly([
          x - dx * hl - dy * ht, y - dy * hl + dx * ht,
          x + dx * hl - dy * ht, y + dy * hl + dx * ht,
          x + dx * hl + dy * ht, y + dy * hl - dx * ht,
          x - dx * hl + dy * ht, y - dy * hl - dx * ht,
        ]).fill({ color: girderFits(s) ? 0xc08a4a : 0xe04848, alpha: 0.55 }).stroke({ width: 2, color: PALETTE.outline, alpha: 0.8 });
      }
      if (def.kind === 'charge' || def.kind === 'hitscan' || def.kind === 'rope' || def.girder) {
        const { dx, dy } = aimVector(active.facing, s.turn.aim);
        const cx = ap.x + dx * 46;
        const cy = ap.y + dy * 46;
        ov.circle(cx, cy, 7).stroke({ width: 2.5, color: PALETTE.outline });
        ov.circle(cx, cy, 7).stroke({ width: 1.5, color });
        ov.moveTo(cx - 10, cy).lineTo(cx - 4, cy).moveTo(cx + 4, cy).lineTo(cx + 10, cy);
        ov.moveTo(cx, cy - 10).lineTo(cx, cy - 4).moveTo(cx, cy + 4).lineTo(cx, cy + 10);
        ov.stroke({ width: 2, color });
        if (s.turn.charging) {
          // Power wedge: grows and reddens with charge.
          const f = s.turn.power / 1000;
          const len = 14 + f * 60;
          const nx = -dy;
          const ny = dx;
          const w = 2 + f * 9;
          const col = lerpColor(0xffe14a, 0xe5332a, f);
          ov.poly([
            ap.x + dx * 12, ap.y + dy * 12,
            ap.x + dx * len + nx * w, ap.y + dy * len + ny * w,
            ap.x + dx * len - nx * w, ap.y + dy * len - ny * w,
          ]).fill({ color: col, alpha: 0.9 }).stroke({ width: 1.5, color: PALETTE.outline });
        }
      }
      if (s.turn.target && !def.girder) {
        const { x, y } = s.turn.target;
        ov.circle(x, y, 12).stroke({ width: 3, color: PALETTE.outline });
        ov.circle(x, y, 12).stroke({ width: 2, color });
        ov.moveTo(x - 16, y).lineTo(x + 16, y).moveTo(x, y - 16).lineTo(x, y + 16).stroke({ width: 2, color });
      }
      // Bouncing arrow over the active tardi during its turn
    }
    if (active && (s.turn.phase === 'start' || s.turn.phase === 'aim')) {
      const ap = this.lerpPos(active.id, active.x, active.y, alpha);
      const b = Math.abs(Math.sin(this.time * 5)) * 6;
      const ay = ap.y - 52 - b - (active.chute ? 34 : 0);
      ov.poly([ap.x - 7, ay - 8, ap.x + 7, ay - 8, ap.x, ay]).fill(s.teams[active.team].color).stroke({ width: 2, color: PALETTE.outline });
    }

    this.updateFx(dt);
    this.drawWater(s);
    this.updateCamera(s, dt, alpha);
  }

  private updateFx(dt: number): void {
    const g = this.fx;
    g.clear();
    for (const tr of this.tracers) {
      tr.life -= dt;
      g.moveTo(tr.x0, tr.y0).lineTo(tr.x1, tr.y1).stroke({ width: 2, color: 0xfff6c2, alpha: Math.max(0, tr.life * 4) });
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      p.x += p.vx;
      p.y += p.vy;
      if (p.kind === 'debris') p.vy += 0.25;
      if (p.kind === 'smoke') {
        p.vy -= 0.01;
        p.vx *= 0.98;
      }
      if (p.kind === 'flash') {
        g.circle(p.x, p.y, p.r * (1.2 - k * 0.4)).fill({ color: 0xffb13b, alpha: k * 0.8 });
        g.circle(p.x, p.y, p.r * (0.8 - k * 0.3)).fill({ color: p.color, alpha: k });
      } else if (p.kind === 'smoke') {
        g.circle(p.x, p.y, p.r * (1.6 - k * 0.6)).fill({ color: p.color, alpha: k * 0.55 });
      } else {
        g.circle(p.x, p.y, p.r).fill({ color: p.color, alpha: Math.min(1, k * 2) });
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floats) {
      f.life -= dt;
      f.text.y -= dt * 22;
      f.text.alpha = Math.min(1, f.life);
      if (f.life <= 0) f.text.destroy();
    }
    this.floats = this.floats.filter((f) => f.life > 0);
  }

  private drawWater(s: WorldState): void {
    const w = s.terrain.w;
    const left = -2000;
    const right = w + 2000;
    const wy = s.waterY;
    for (const [g, offset, color, alpha] of [
      [this.waterBack, 0, PALETTE.waterLight, 0.7],
      [this.waterFront, 1.7, PALETTE.water, 0.88],
    ] as const) {
      g.clear();
      g.moveTo(left, wy + 2000);
      for (let x = left; x <= right; x += 20) {
        const y = wy + Math.sin(x * 0.03 + this.time * 2 + offset) * 4 + (offset ? 6 : 0);
        g.lineTo(x, y);
      }
      g.lineTo(right, wy + 2000).closePath().fill({ color, alpha });
    }
  }

  private drawHills(): void {
    const w = this.state.terrain.w;
    const h = this.state.waterY;
    for (const [g, color, amp, base, freq] of [
      [this.hills, PALETTE.hillFar, 90, h - 260, 0.004],
      [this.hillsNear, PALETTE.hillNear, 70, h - 170, 0.007],
    ] as const) {
      g.moveTo(-3000, h + 200);
      for (let x = -3000; x <= w + 3000; x += 25) {
        g.lineTo(x, base - Math.sin(x * freq) * amp - Math.sin(x * freq * 2.7 + 1) * amp * 0.4);
      }
      g.lineTo(w + 3000, h + 200).closePath().fill(color).stroke({ width: 3, color: PALETTE.outline, alpha: 0.25 });
    }
  }

  private updateCamera(s: WorldState, dt: number, alpha: number): void {
    const cam = this.camera;
    const now = performance.now();
    if (now > cam.manualUntil) {
      let target: { x: number; y: number } | null = null;
      if (s.projectiles.length > 0) {
        const p = s.projectiles[0];
        target = this.lerpPos(p.id, p.x, p.y, alpha);
      } else {
        const a = activeTardi(s);
        const moving = s.tardis.find((t) => t.alive && t.airborne && t.knocked);
        const follow = moving ?? a;
        if (follow && (follow.alive || moving)) target = this.lerpPos(follow.id, follow.x, follow.y, alpha);
      }
      if (target) {
        const k = 1 - Math.pow(0.02, dt);
        cam.x += (target.x - cam.x) * k;
        cam.y += (target.y - 40 - cam.y) * k;
      }
    }
    const { width, height } = this.app.screen;
    const halfW = width / 2 / cam.zoom;
    const halfH = height / 2 / cam.zoom;
    cam.x = clamp(cam.x, -200 + halfW, s.terrain.w + 200 - halfW, s.terrain.w / 2);
    cam.y = clamp(cam.y, -300 + halfH, s.waterY + 60 - halfH, s.waterY / 2);
    this.world.scale.set(cam.zoom);
    this.world.position.set(width / 2 - cam.x * cam.zoom, height / 2 - cam.y * cam.zoom);
    // Parallax: background hills move slower than the world.
    this.hills.position.set(cam.x * 0.55, cam.y * 0.4);
    this.hillsNear.position.set(cam.x * 0.3, cam.y * 0.2);
  }

  destroy(): void {
    this.app.stage.removeChildren();
    this.world.destroy({ children: true });
    this.sky.destroy();
  }
}

function clamp(v: number, lo: number, hi: number, fallback: number): number {
  if (lo > hi) return fallback;
  return Math.max(lo, Math.min(hi, v));
}

function lerpColor(a: number, b: number, f: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * f);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * f);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * f);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function drawProjectile(g: Graphics, weapon: string, x: number, y: number, vx: number, vy: number): void {
  const O = PALETTE.outline;
  switch (weapon) {
    case 'bazooka': {
      const len = Math.hypot(vx, vy) || 1;
      const dx = vx / len;
      const dy = vy / len;
      // Spore: green pod with a trailing puff
      g.circle(x - dx * 9, y - dy * 9, 3).fill({ color: 0xffffff, alpha: 0.5 });
      g.poly([x + dx * 7, y + dy * 7, x - dx * 5 - dy * 4, y - dy * 5 + dx * 4, x - dx * 5 + dy * 4, y - dy * 5 - dx * 4])
        .fill(0x7ac943)
        .stroke({ width: 1.5, color: O });
      break;
    }
    case 'grenade':
      g.circle(x, y, 4.5).fill(0x8a8f99).stroke({ width: 1.5, color: O });
      g.circle(x - 1.4, y - 1.4, 1.3).fill(0xd7dbe2);
      break;
    case 'cluster':
      g.circle(x, y, 5).fill(0x3cb34a).stroke({ width: 1.5, color: O });
      g.circle(x - 1.5, y - 1.5, 1.4).fill(0xa8f08a);
      break;
    case 'clusterlet':
      g.circle(x, y, 2.5).fill(0x3cb34a).stroke({ width: 1, color: O });
      break;
    case 'raindrop':
      g.poly([x, y + 6, x - 4, y - 1, x, y - 7, x + 4, y - 1]).fill(0x63b7ff).stroke({ width: 1.3, color: O });
      break;
    case 'mortar':
      // Acorn-like seed pod
      g.ellipse(x, y + 1, 4.5, 5).fill(0xa0632f).stroke({ width: 1.4, color: O });
      g.ellipse(x, y - 3, 5, 2.4).fill(0x6b3f1c).stroke({ width: 1.2, color: O });
      break;
    case 'mortarlet':
      g.circle(x, y, 2.2).fill(0xa0632f).stroke({ width: 1, color: O });
      break;
    case 'homing': {
      // Glowing pink spore with a sparkle trail
      const len = Math.hypot(vx, vy) || 1;
      g.circle(x - (vx / len) * 8, y - (vy / len) * 8, 2.5).fill({ color: 0xff9ad5, alpha: 0.5 });
      g.circle(x, y, 6).fill({ color: 0xff7ac0, alpha: 0.35 });
      g.circle(x, y, 4).fill(0xe85fa8).stroke({ width: 1.4, color: O });
      g.circle(x - 1.2, y - 1.2, 1.2).fill(0xffffff);
      break;
    }
    case 'rotifer': {
      // Rotifer: stubby body with a spinning crown of cilia
      g.roundRect(x - 5, y - 4, 10, 8, 4).fill(0xffe3a3).stroke({ width: 1.4, color: O });
      const spin = (x * 0.4) % (Math.PI * 2);
      for (let i = 0; i < 6; i++) {
        const a = spin + (i * Math.PI) / 3;
        g.moveTo(x, y - 5).lineTo(x + Math.cos(a) * 4, y - 6 + Math.sin(a) * 1.5).stroke({ width: 1, color: O });
      }
      g.circle(x + 2, y - 1, 1.1).fill(O);
      break;
    }
    default:
      g.circle(x, y, 3).fill(0xffffff).stroke({ width: 1, color: O });
  }
}

/** Shed-cuticle marker left where a tardi died (the gravestone equivalent). */
function makeHusk(x: number, y: number, color: number): Graphics {
  const g = new Graphics();
  const O = PALETTE.outline;
  g.ellipse(0, 0, 9, 6).fill({ color: PALETTE.tardiBody, alpha: 0.65 }).stroke({ width: 1.5, color: O });
  for (const sx of [-4, 0, 4]) g.moveTo(sx, -5).lineTo(sx - 1, 5).stroke({ width: 1, color: O, alpha: 0.5 });
  g.moveTo(-4, -2).lineTo(-1, 1).moveTo(-1, -2).lineTo(-4, 1).stroke({ width: 1.3, color: O });
  g.moveTo(2, -2).lineTo(5, 1).moveTo(5, -2).lineTo(2, 1).stroke({ width: 1.3, color: O });
  g.circle(0, -7, 2).fill(color).stroke({ width: 1, color: O });
  g.position.set(x, y + 1);
  return g;
}

function makeSkyTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  return Texture.from(c);
}
