// Draws the simulation state. Reads WorldState; never writes to it.

import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { SimEvent, Tardi, WorldState } from '../sim/types';
import { aimVector, activeTardi, girderFits, predictPath, ropeTrace, TARDI_R } from '../sim/world';
import { isSolid } from '../sim/terrain/terrain';
import { WEAPONS } from '../sim/weapons';
import { TerrainView } from './terrainView';
import { TardiView, type Mood } from './tardiView';
import { ObjectView } from './objectView';
import { PALETTE, hex, shown, teamSymbol } from './palette';
import { aimStyle, fxStyle, mixColor, rainbowAt, type AimStyle } from './cosmetics';
import { arenaTheme, type ArenaTheme } from './arenas';
import { WeatherView } from './weather';
import { t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

/** Text in the player's language (`t` is a tardigrade in most of this file). */
const tr = (text: string, vars?: Record<string, string | number>): string => t(text, vars);

/** Seconds a dying tardi spends curling up before it pops. */
const DEATH_CURL = 0.9;
/** Seconds the camera stays on a blast, a hit or a splash before going back to
 *  whoever's turn it is (after a shot: until they move, or the turn ends). */
const WATCH_HOLD = 1.8;
/** How far past the map's left/right edges the camera may look. */
const VIEW_MARGIN_X = 200;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  color: number;
  kind: 'flash' | 'smoke' | 'debris' | 'spark' | 'confetti';
  /** Bits thrown out by explosion effects and aim styles (shop cosmetics). */
  shape?: 'heart' | 'star' | 'coin' | 'snow' | 'bit';
  /** Gravity per 60 fps frame. */
  grav?: number;
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
  /** The player has moved the view this turn (dragged or pinched). */
  held = false;
}

export class GameRenderer {
  readonly camera = new Camera();
  private world = new Container();
  private sky: Sprite;
  /** Stars, snow or embers over the sky (arena themes), in screen space. */
  private ambient = new Graphics();
  private ambientBits: { x: number; y: number; r: number; v: number; p: number }[] = [];
  /** The background hills: pictures drawn once (makeHillTexture), moved for parallax. */
  private hills = new Container();
  private hillsNear = new Container();
  private terrainView: TerrainView;
  private entities = new Container();
  private projectiles = new Graphics();
  private overlay = new Graphics();
  private fx = new Graphics();
  private waterBack = new Graphics();
  private waterFront = new Graphics();
  private floatLayer = new Container();
  private markers = new Container();
  /** Rope Race flag and start sign (redrawn each frame so the flag waves). */
  private course = new Graphics();
  private tardiViews = new Map<number, TardiView>();
  private objectViews = new Map<number, ObjectView>();
  private objectLayer = new Container();
  private particles: Particle[] = [];
  private floats: FloatText[] = [];
  private tracers: { x0: number; y0: number; x1: number; y1: number; life: number }[] = [];
  /** Silk Ropes that caught nothing: how far they reached, and the rock they fell short of (if any). */
  private ropeMisses: { x0: number; y0: number; x1: number; y1: number; rx: number; ry: number; rock: boolean; life: number }[] = [];
  private prev = new Map<number, { x: number; y: number }>();
  private fuseTexts = new Map<number, Text>();
  private bubbles = new Map<number, { root: Container; until: number; x: number; y: number }>();
  /** Tardis curling up before they pop: id -> start time. */
  private dying = new Map<number, number>();
  /** Where the action just was (a blast, a hit): the camera stays there until
   *  it has played out, or the player whose turn it is moves off. `ax`/`ay`:
   *  where that player stood. */
  private watch: { x: number; y: number; until: number; turn: number; ax: number; ay: number } | null = null;
  /** When each tardi last said "Whoa!", so it doesn't repeat itself. */
  private teeterSaid = new Map<number, number>();
  private confettiDone = false;
  /** Cosmetic sound hook (set by the game). */
  onSound: ((name: 'pop' | 'whoa') => void) | null = null;
  private time = 0;
  private weather: WeatherView;

  constructor(
    private app: Application,
    private state: WorldState,
    /** This player's own arena theme: only they see it. */
    private theme: ArenaTheme = arenaTheme('classic'),
  ) {
    this.sky = new Sprite(makeSkyTexture(theme));
    app.stage.addChild(this.sky, this.ambient);
    if (theme.stars || theme.drift) {
      // Positions are fractions of the screen, so they fit any size.
      for (let i = 0; i < (theme.stars ? 70 : 0) + (theme.drift ? 60 : 0); i++) {
        this.ambientBits.push({ x: Math.random(), y: Math.random(), r: 0.8 + Math.random() * 1.8, v: 0.02 + Math.random() * 0.05, p: Math.random() * 6.28 });
      }
    }
    this.weather = new WeatherView(state.weather.kind, state.terrain.w, !!theme.drift);
    app.stage.addChild(this.weather.back);
    this.terrainView = new TerrainView(state.terrain, theme);
    this.world.addChild(
      this.hills,
      this.hillsNear,
      this.waterBack,
      this.terrainView.root,
      this.markers,
      this.course,
      this.objectLayer,
      this.entities,
      this.projectiles,
      this.fx,
      this.overlay,
      this.weather.world,
      this.waterFront,
      this.floatLayer,
    );
    app.stage.addChild(this.world, this.weather.front);
    for (const t of state.tardis) {
      if (!t.alive) {
        // Popped before this view was made (a replay of the winning shot, a rejoin): its gravestone, not a tardi on 0.
        const grave = state.teams[t.team].grave;
        const color = shown(state.teams[t.team].color);
        if (t.y < state.waterY) this.markers.addChild(grave === 'classic' ? makeHusk(t.x, t.y, color) : makeGrave(t.x, t.y, color, grave));
        continue;
      }
      const v = new TardiView(t, shown(state.teams[t.team].color), state.teams[t.team].hat, state.teams[t.team].skin, state.teams[t.team].dance, teamSymbol(state.teams[t.team].color));
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
    return Math.max(this.minZoom(), Math.max(0.5, Math.min(2.2, Math.min(height / 600, width / 1000))));
  }

  /**
   * Furthest the camera may zoom out: the whole map (plus a small margin) just
   * fills the screen's width, so the edges of the backdrop never show.
   */
  minZoom(): number {
    return Math.min(3, this.app.screen.width / (this.state.terrain.w + 2 * VIEW_MARGIN_X));
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

  /** An easter egg under a tap on the screen, if any. */
  tapEgg(sx: number, sy: number): string | null {
    const w = this.screenToWorld(sx, sy);
    return this.weather.eggAt(sx, sy, w.x, w.y);
  }

  /** Easter eggs that show up by themselves (the rainbow). */
  set onEgg(fn: ((id: string) => void) | null) {
    this.weather.onEgg = fn;
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
          this.watchAt(e.x, e.y, WATCH_HOLD);
          this.terrainView.crater(e.x, e.y, e.r, e.rect);
          this.spawnExplosion(e.x, e.y, e.r, this.state.teams[e.team]?.fx);
          break;
        case 'shot':
          this.tracers.push({ ...e, life: 0.25 });
          break;
        case 'splash':
          this.watchAt(e.x, this.state.waterY, 1);
          for (let i = 0; i < 14; i++) {
            this.particles.push({
              x: e.x, y: this.state.waterY, vx: (Math.random() - 0.5) * 3, vy: -2 - Math.random() * 4,
              life: 0.8, max: 0.8, r: 2 + Math.random() * 2, color: this.theme.waterLight, kind: 'debris',
            });
          }
          break;
        case 'tornado':
          this.weather.tornado();
          break;
        case 'ropeMiss': {
          const t = this.state.tardis.find((x) => x.id === e.id);
          if (!t) break;
          const dx = e.x - t.x;
          const dy = e.y - t.y;
          const d = Math.hypot(dx, dy) || 1;
          const rx = e.x + (dx / d) * e.beyond;
          const ry = e.y + (dy / d) * e.beyond;
          this.ropeMisses.push({ x0: t.x, y0: t.y, x1: e.x, y1: e.y, rx, ry, rock: e.beyond > 0, life: 1.6 });
          // Say how close it was, where the rope ran out.
          const msg = e.beyond < 0 ? tr(tk('Nothing to grab!')) : e.beyond <= 25 ? tr(tk('So close! {n} short'), { n: Math.round(e.beyond) }) : tr(tk('Too far: {n} short'), { n: Math.round(e.beyond) });
          this.floatText(msg, e.x, e.y - 14, e.beyond >= 0 && e.beyond <= 25 ? 0xffd84a : 0xff8a7a);
          break;
        }
        case 'dud': {
          const o = this.state.objects.find((x) => x.id === e.id);
          if (o) this.floatText(tr(tk('Dud')), o.x, o.y - 16, 0xcccccc);
          break;
        }
        case 'collect': {
          const t = this.state.tardis.find((x) => x.id === e.tardi);
          const label = e.contents === 'health' ? `+${e.amount}` : (WEAPONS[e.contents] ? tr(WEAPONS[e.contents].name) : e.contents);
          if (t) this.floatText(label, t.x, t.y - 40, e.contents === 'health' ? 0x5cff7a : 0xffd84a);
          break;
        }
        case 'heal': {
          const t = this.state.tardis.find((x) => x.id === e.id);
          if (t) this.floatText(`+${e.amount}`, t.x, t.y - 46, 0x5cff7a);
          break;
        }
        case 'damage': {
          const t = this.state.tardis.find((x) => x.id === e.id);
          if (t) {
            this.floatText(`-${e.amount}`, t.x, t.y - 34, shown(this.state.teams[t.team].color));
            this.watchAt(t.x, t.y, WATCH_HOLD);
          }
          break;
        }
        case 'drown': {
          const t = this.state.tardis.find((x) => x.id === e.id);
          if (t) {
            this.floatText(tr(tk('Bye-bye!')), t.x, Math.min(t.y, this.state.waterY) - 20, 0xffffff);
            this.watchAt(t.x, Math.min(t.y, this.state.waterY), WATCH_HOLD);
          }
          break;
        }
        case 'death':
          // Comedy death: curl up into a tun, wobble, then pop (see render()).
          if (this.tardiViews.has(e.id)) this.dying.set(e.id, this.time);
          {
            const t = this.state.tardis.find((x) => x.id === e.id);
            if (t) this.watchAt(t.x, t.y, DEATH_CURL + 1.2);
          }
          break;
        case 'burn':
          this.terrainView.crater(e.x, e.y, 2.5, e.rect);
          break;
        case 'gas':
          // Lingering green cloud
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.random() * e.r * 0.7;
            this.particles.push({
              x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d * 0.6,
              vx: (Math.random() - 0.5) * 0.3, vy: -0.1 - Math.random() * 0.2,
              life: 2.5 + Math.random(), max: 3.5, r: 6 + Math.random() * 8, color: 0x7fd06a, kind: 'smoke',
            });
          }
          this.floatText(tr(tk('Pee-yew!')), e.x, e.y - e.r * 0.6, 0x9be06a);
          break;
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
          this.floatText(tr(tk('POW!')), e.x, e.y - 24, 0xff9a3b);
          break;
        case 'respawn':
        case 'teleport':
          if (e.t === 'respawn') {
            this.floatText(tr(tk('Back again!')), e.x, e.y - 30, 0xffffff);
            this.watchAt(e.x, e.y, WATCH_HOLD);
          }
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

  /** Victory dance or teetering on an edge: purely for show. */
  private moodFor(s: WorldState, t: Tardi, v: TardiView): Mood {
    if (!t.alive) return 'none';
    if (s.turn.phase === 'gameover') return t.team === s.turn.winner ? 'dance' : 'none';
    if (t.airborne || t.rope) return 'none';
    // Teetering: ground under the middle, but a drop right beside one foot.
    const ground = (x: number) => {
      for (let y = t.y + TARDI_R; y < t.y + TARDI_R + 36; y += 2) if (isSolid(s.terrain, x, y)) return true;
      return false;
    };
    if (!ground(t.x)) return 'none';
    for (const dir of [-1, 1]) {
      if (!ground(t.x + dir * 10)) {
        v.teeterDir = dir;
        const last = this.teeterSaid.get(t.id) ?? -99;
        if (this.time - last > 10) {
          this.teeterSaid.set(t.id, this.time);
          if (Math.random() < 0.6) {
            this.say(t.id, Math.random() < 0.5 ? tr(tk('Whoa!')) : tr(tk('Whoa whoa WHOA!')), 1.6);
            this.onSound?.('whoa');
          }
        }
        return 'teeter';
      }
    }
    return 'none';
  }

  /** Rope Race: a waving flag at the finish and a sign at the start. */
  private drawCourse(s: WorldState): void {
    const r = s.race!;
    const g = this.course;
    const O = PALETTE.outline;
    g.clear();
    // Finish flag: pole, then a chequered flag that ripples.
    const px = r.goalX;
    const base = r.goalY + 24;
    g.rect(px - 1.5, base - 52, 3, 52).fill(0xeeeeee).stroke({ width: 1.2, color: O });
    const wave = (i: number) => Math.sin(this.time * 6 - i * 0.9) * 3;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const x0 = px + 1.5 + col * 6;
        const y0 = base - 52 + row * 6;
        g.poly([x0, y0 + wave(col), x0 + 6, y0 + wave(col + 1), x0 + 6, y0 + 6 + wave(col + 1), x0, y0 + 6 + wave(col)])
          .fill((row + col) % 2 ? 0x2b1b24 : 0xffffff);
      }
    }
    g.circle(px, base - 54, 3).fill(0xffd84a).stroke({ width: 1, color: O });
    // Start sign.
    const sx = r.startX - 26;
    const sy = r.startY + TARDI_R;
    g.rect(sx - 1.5, sy - 30, 3, 30).fill(0x8f5f2e).stroke({ width: 1, color: O });
    g.roundRect(sx - 16, sy - 42, 32, 14, 3).fill(0x9ee06a).stroke({ width: 1.5, color: O });
    g.moveTo(sx - 9, sy - 35).lineTo(sx + 7, sy - 35).moveTo(sx + 3, sy - 39).lineTo(sx + 7, sy - 35).lineTo(sx + 3, sy - 31);
    g.stroke({ width: 2, color: O });
  }

  /**
   * Tardigrades standing close together: their name tags would sit on top of
   * each other (long names especially), so each one that would overlap one to
   * its left is lifted a line higher.
   */
  private unstackLabels(): void {
    const tags = [...this.tardiViews.values()]
      .filter((v) => v.root.visible && v.labelWidth > 0)
      .map((v) => ({ v, x: v.root.x, y: v.root.y, w: v.labelWidth, lift: 0 }))
      .sort((a, b) => a.x - b.x);
    for (let i = 0; i < tags.length; i++) {
      const a = tags[i];
      for (let tries = 0; tries < 4; tries++) {
        const hit = tags.slice(0, i).some((b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 4 && Math.abs(a.y - a.lift - (b.y - b.lift)) < 13);
        if (!hit) break;
        a.lift += 13;
      }
      a.v.labelLift = a.lift;
    }
  }

  /** End of a comedy death: pop, leave a husk. */
  private pop(id: number, x: number, y: number, color: number, grave = 'classic'): void {
    this.dying.delete(id);
    this.tardiViews.get(id)?.root.destroy({ children: true });
    this.tardiViews.delete(id);
    this.spawnExplosion(x, y, 12);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5 - 1.5, life: 0.9, max: 0.9, r: 2 + Math.random() * 2, color, kind: 'debris' });
    }
    this.floatText(tr(tk('POP!')), x, y - 20, 0xffffff);
    this.markers.addChild(grave === 'classic' ? makeHusk(x, y, color) : makeGrave(x, y, color, grave));
    this.onSound?.('pop');
  }

  /** Confetti in the winners' colour. */
  private confetti(s: WorldState): void {
    const color = s.turn.winner >= 0 ? shown(s.teams[s.turn.winner].color) : 0xffffff;
    const { width, height } = this.app.screen;
    const z = this.camera.zoom;
    for (let i = 0; i < 140; i++) {
      this.particles.push({
        x: this.camera.x + (Math.random() - 0.5) * (width / z),
        y: this.camera.y - height / z / 2 - Math.random() * 200,
        vx: 0, vy: 1 + Math.random() * 1.5,
        life: 5 + Math.random() * 2, max: 7, r: Math.random(),
        color: [color, 0xffd84a, 0xffffff, 0xff7ac0][i % 4], kind: 'confetti',
      });
    }
  }

  /** A speech bubble over a tardi for a couple of seconds (replaces any it already has). */
  say(tardiId: number, text: string, seconds = 2.4): void {
    this.bubbles.get(tardiId)?.root.destroy({ children: true });
    const t = this.state.tardis.find((x) => x.id === tardiId);
    if (!t) return;
    const root = new Container();
    const label = new Text({
      text,
      style: { fontFamily: 'Nunito, Arial, Hiragino Sans, Yu Gothic, Noto Sans JP, sans-serif', fontWeight: '800', fontSize: 13, fill: '#2b1b24', wordWrap: true, wordWrapWidth: 150, align: 'center' },
    });
    label.resolution = 3;
    label.anchor.set(0.5, 1);
    const w = label.width + 16;
    const h = label.height + 10;
    const g = new Graphics();
    g.roundRect(-w / 2, -h - 8, w, h, 10).fill(0xffffff).stroke({ width: 2, color: PALETTE.outline });
    g.poly([-6, -9, 6, -9, 0, 0]).fill(0xffffff).stroke({ width: 2, color: PALETTE.outline });
    g.rect(-5, -11, 10, 4).fill(0xffffff); // hide the seam between bubble and tail
    label.position.set(0, -13);
    root.addChild(g, label);
    this.floatLayer.addChild(root);
    this.bubbles.set(tardiId, { root, until: this.time + seconds, x: t.x, y: t.y });
  }

  /** Keep the camera here for `hold` seconds (longer if something's already being watched). */
  private watchAt(x: number, y: number, hold: number): void {
    const s = this.state;
    const a = activeTardi(s);
    const w = this.watch;
    const fresh = !w || w.turn !== s.turn.turnNumber;
    this.watch = {
      x,
      y,
      until: Math.max(fresh ? 0 : w.until, this.time + hold),
      turn: s.turn.turnNumber,
      ax: fresh || !a ? (a?.x ?? 0) : w.ax,
      ay: fresh || !a ? (a?.y ?? 0) : w.ay,
    };
  }

  private floatText(s: string, x: number, y: number, color: number): void {
    const text = new Text({
      text: s,
      style: {
        fontFamily: 'Luckiest Guy, Arial Black, Hiragino Maru Gothic ProN, Yu Gothic, Noto Sans JP, sans-serif',
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

  /** A blast, in the explosion effect `style` (a shop cosmetic; 'classic' by default). */
  private spawnExplosion(x: number, y: number, r: number, style?: string): void {
    const st = fxStyle(style);
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.25, max: 0.25, r: r * 1.3, color: st.flash, kind: 'flash' });
    const n = Math.round(r / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 1.2;
      this.particles.push({
        x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6,
        life: 1 + Math.random() * 0.6, max: 1.6, r: 4 + Math.random() * r * 0.25, color: st.smoke[i % st.smoke.length], kind: 'smoke',
      });
    }
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * Math.random();
      const sp = 2 + Math.random() * 4;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1.2, max: 1.2, r: 1.5 + Math.random() * 1.5, color: st.debris ? st.debris[i % st.debris.length] : this.theme.soil[2], kind: 'debris',
      });
    }
    if (st.extra) {
      const { kind, colors } = st.extra;
      const count = Math.round(r / 1.5) + 6;
      for (let i = 0; i < count; i++) {
        const a = -Math.PI * (0.1 + Math.random() * 0.8);
        const sp = 1.5 + Math.random() * 3.5;
        const life = 1 + Math.random() * 0.8;
        this.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life, max: life, r: kind === 'snow' ? 1.5 + Math.random() * 1.5 : 3 + Math.random() * 2.5,
          color: colors[i % colors.length], kind: 'spark',
          shape: kind === 'confetti' ? 'bit' : kind,
          grav: kind === 'snow' ? 0.03 : kind === 'star' ? 0.06 : 0.12,
        });
      }
    }
    if (r >= 20) this.floatText(r >= 30 ? tr(tk('POW!')) : tr(tk('BIFF!')), x, y - r - 10, 0xffd84a);
  }

  render(s: WorldState, alpha: number, dt: number, showAim: boolean): void {
    this.time += dt;
    const { width, height } = this.app.screen;
    this.sky.width = width;
    this.sky.height = height;
    this.drawAmbient(width, height, dt);
    this.weather.update(dt, width, height, s.wind, s.waterY);

    // Tardis
    const active = activeTardi(s);
    for (const t of s.tardis) {
      let v = this.tardiViews.get(t.id);
      if (!v && t.alive && !this.dying.has(t.id)) {
        // Back again (endless practice targets): a fresh view.
        v = new TardiView(t, shown(s.teams[t.team].color), s.teams[t.team].hat, s.teams[t.team].skin, s.teams[t.team].dance, teamSymbol(s.teams[t.team].color));
        this.tardiViews.set(t.id, v);
        this.entities.addChild(v.root);
      }
      if (!v) continue;
      if (this.dying.has(t.id) && t.alive) {
        // Back again (the tutorial) before it finished curling up: pop where it lay; a fresh view comes next frame.
        this.pop(t.id, v.root.x, v.root.y, shown(s.teams[t.team].color), s.teams[t.team].grave);
        continue;
      }
      if (!t.alive && t.y > s.waterY) {
        v.root.visible = false;
        continue;
      }
      v.root.visible = true;
      const p = this.lerpPos(t.id, t.x, t.y, alpha);
      v.mood = this.moodFor(s, t, v);
      const dyingSince = this.dying.get(t.id);
      v.dying = dyingSince === undefined ? -1 : Math.min(1, (this.time - dyingSince) / DEATH_CURL);
      // Rope Race: only the current racer is solid; the rest wait as ghosts.
      const ghost = s.race !== null && t.id !== active?.id && s.turn.phase !== 'gameover';
      v.root.alpha = ghost ? 0.35 : 1;
      v.update(t, p.x, p.y, this.time, t.id === active?.id && s.turn.phase !== 'settle', dyingSince === undefined && !ghost);
      if (dyingSince !== undefined && v.dying >= 1) this.pop(t.id, p.x, p.y, shown(this.state.teams[t.team].color), this.state.teams[t.team].grave);
    }
    this.unstackLabels();
    // Tardigrades taken out of the world (endless practice clears popped targets).
    if (this.tardiViews.size > s.tardis.length) {
      for (const [id, v] of this.tardiViews) {
        if (s.tardis.some((t) => t.id === id)) continue;
        // Still curling up from its pop: finish with the bang where it lay.
        if (this.dying.has(id)) this.pop(id, v.root.x, v.root.y, 0x9aa4ad);
        else {
          v.root.destroy({ children: true });
          this.tardiViews.delete(id);
        }
      }
    }
    if (s.turn.phase === 'gameover' && !this.confettiDone) {
      this.confettiDone = true;
      this.confetti(s);
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
    // Flames: flickering sap fire (orange) or acid (green)
    for (const f of s.flames) {
      const flick = Math.sin(this.time * 20 + f.id) * 0.8;
      const k = Math.min(1, f.life / 60);
      const [outer, inner] = f.acid ? [0x6fd84a, 0xd8ff9a] : [0xff7a1a, 0xffe14a];
      pg.circle(f.x, f.y - 2 - flick, (3.4 + flick * 0.5) * k + 0.6).fill({ color: outer, alpha: 0.85 });
      pg.circle(f.x, f.y - 2.6 - flick, 1.8 * k + 0.4).fill({ color: inner, alpha: 0.95 });
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
          style: { fontFamily: 'Luckiest Guy, Arial Black, Hiragino Maru Gothic ProN, Yu Gothic, Noto Sans JP, sans-serif', fontSize: 12, fill: '#ffffff', stroke: { color: '#1b1016', width: 3, join: 'round' } },
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

    if (s.race) this.drawCourse(s);

    // Speech bubbles follow their tardi (and stay put if it's gone).
    for (const [id, b] of this.bubbles) {
      if (this.time > b.until) {
        b.root.destroy({ children: true });
        this.bubbles.delete(id);
        continue;
      }
      const t = s.tardis.find((x) => x.id === id && x.alive);
      if (t) {
        const p = this.lerpPos(t.id, t.x, t.y, alpha);
        b.x = p.x;
        b.y = p.y;
      }
      b.root.position.set(b.x, b.y - 48);
      // Readable even when zoomed right out.
      b.root.scale.set(Math.max(1, 0.8 / this.camera.zoom));
    }

    // Silk ropes
    const ov = this.overlay;
    ov.clear();
    for (const t of s.tardis) {
      if (!t.rope) continue;
      const p = this.lerpPos(t.id, t.x, t.y, alpha);
      // Through every corner it has wrapped round, then the pivot, then the tardi.
      const pts = [...t.rope.bends, { x: t.rope.x, y: t.rope.y }, p];
      for (const [w, c] of [[3.2, PALETTE.outline], [1.6, 0xf4f1ff]] as const) {
        ov.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ov.lineTo(pts[i].x, pts[i].y);
        ov.stroke({ width: w, color: c });
      }
      const a = pts[0];
      ov.circle(a.x, a.y, 3).fill(0xf4f1ff).stroke({ width: 1.2, color: PALETTE.outline });
    }

    // Ropes that missed: a fading dashed line to where the silk ran out, then red dots on to the rock it fell short of.
    for (const m of this.ropeMisses) {
      m.life -= dt;
      const a = Math.min(1, m.life);
      dots(ov, m.x0, m.y0, m.x1, m.y1, 9, 1.6, 0xf4f1ff, a);
      if (m.rock) {
        dots(ov, m.x1, m.y1, m.rx, m.ry, 7, 1.8, 0xff5a5a, a);
        ov.circle(m.rx, m.ry, 4).stroke({ width: 2, color: 0xff5a5a, alpha: a });
      }
      drawCross(ov, m.x1, m.y1, 5, 0xff5a5a, a);
    }
    this.ropeMisses = this.ropeMisses.filter((m) => m.life > 0);

    // Aim overlay
    const def = WEAPONS[s.turn.weapon];
    const canAimNow = active && !active.rope && (!active.airborne || def.kind === 'rope' || def.kind === 'parachute');
    if (active && showAim && s.turn.phase === 'aim' && canAimNow) {
      const ap = this.lerpPos(active.id, active.x, active.y, alpha);
      const teamColor = shown(s.teams[active.team].color);
      const style = aimStyle(s.teams[active.team].aim);
      const color = style.marker === 'team' ? teamColor : style.marker === 'rainbow' ? rainbowAt(this.time * 0.5) : style.marker;
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
      if (def.kind === 'rope') {
        // Where the rope would catch: a dotted line to it and a ring, or red to its reach and a cross when nothing's in range.
        const r = ropeTrace(s.terrain, active.x, active.y, active.facing, s.turn.aim);
        const ox = ap.x - active.x;
        const oy = ap.y - active.y;
        dots(ov, ap.x, ap.y, r.x + ox, r.y + oy, 10, 1.3, r.hit ? 0xffffff : 0xff8a7a, 0.55);
        if (r.hit) ov.circle(r.x + ox, r.y + oy, 4.5).stroke({ width: 2, color: 0x7dff8a, alpha: 0.9 });
        else drawCross(ov, r.x + ox, r.y + oy, 4, 0xff8a7a, 0.8);
      }
      if (def.kind === 'charge' || def.kind === 'hitscan' || def.kind === 'rope' || def.girder) {
        const { dx, dy } = aimVector(active.facing, s.turn.aim);
        const cx = ap.x + dx * 46;
        const cy = ap.y + dy * 46;
        if (style.laser !== undefined) {
          ov.moveTo(ap.x + dx * 12, ap.y + dy * 12).lineTo(cx, cy).stroke({ width: 3.5, color: style.laser, alpha: 0.25 });
          ov.moveTo(ap.x + dx * 12, ap.y + dy * 12).lineTo(cx, cy).stroke({ width: 1.3, color: style.laser, alpha: 0.9 });
        }
        this.drawMarker(ov, cx, cy, 7, color, style);
        if (s.turn.charging && def.kind === 'charge' && s.scheme.aimGuide > 0) {
          // Shot-path guide (a match rule): dots along where it would fly at this power.
          const path = predictPath(s, def.id, active, s.turn.aim, s.turn.power, s.turn.fuseSeconds * 50, s.scheme.aimGuide >= 2 ? 300 : 30);
          const ox = ap.x - active.x;
          const oy = ap.y - active.y;
          path.forEach((q, i) => {
            // Bold enough to tell from stars and snow; the short guide fades out along the way.
            const a = s.scheme.aimGuide >= 2 ? 1 : 1 - (0.6 * i) / path.length;
            ov.circle(q.x + ox, q.y + oy, 3.2).fill({ color: 0xffd84a, alpha: a }).stroke({ width: 1.6, color: PALETTE.outline, alpha: a });
          });
        }
        if (s.turn.charging) {
          // Power wedge: grows with charge, in the aim style's colours.
          const f = s.turn.power / 1000;
          const len = 14 + f * 60;
          const nx = -dy;
          const ny = dx;
          const w = 2 + f * 9;
          const N = 8;
          for (let i = 0; i < N; i++) {
            const t0 = i / N;
            const t1 = (i + 1) / N;
            const l0 = 12 + (len - 12) * t0;
            const l1 = 12 + (len - 12) * t1;
            const w0 = w * t0;
            const w1 = w * t1;
            ov.poly([
              ap.x + dx * l0 + nx * w0, ap.y + dy * l0 + ny * w0,
              ap.x + dx * l1 + nx * w1, ap.y + dy * l1 + ny * w1,
              ap.x + dx * l1 - nx * w1, ap.y + dy * l1 - ny * w1,
              ap.x + dx * l0 - nx * w0, ap.y + dy * l0 - ny * w0,
            ]).fill({ color: barColor(style, f, (i + 0.5) / N, i, this.time), alpha: 0.92 });
          }
          ov.poly([
            ap.x + dx * 12, ap.y + dy * 12,
            ap.x + dx * len + nx * w, ap.y + dy * len + ny * w,
            ap.x + dx * len - nx * w, ap.y + dy * len - ny * w,
          ]).stroke({ width: 1.5, color: PALETTE.outline });
          if (style.tail && Math.random() < dt * 40) {
            // Comet: sparks streaming back off the tip.
            this.particles.push({
              x: ap.x + dx * len, y: ap.y + dy * len, vx: -dx * (1 + Math.random()) + (Math.random() - 0.5), vy: -dy * (1 + Math.random()) + (Math.random() - 0.5),
              life: 0.45, max: 0.45, r: 2 + Math.random() * 2, color: Math.random() < 0.5 ? 0xffffff : 0x7fd3f7, kind: 'spark', shape: 'star',
            });
          }
        }
        this.sparkleAround(cx, cy, 14, style, dt);
      }
      if (s.turn.target && !def.girder) {
        const { x, y } = s.turn.target;
        this.drawMarker(ov, x, y, 12, color, style);
        this.sparkleAround(x, y, 20, style, dt);
      }
      // Bouncing arrow over the active tardi during its turn
    }
    if (active && (s.turn.phase === 'start' || s.turn.phase === 'aim')) {
      const ap = this.lerpPos(active.id, active.x, active.y, alpha);
      const b = Math.abs(Math.sin(this.time * 5)) * 6;
      const ay = ap.y - 52 - b - (active.chute ? 34 : 0);
      ov.poly([ap.x - 7, ay - 8, ap.x + 7, ay - 8, ap.x, ay]).fill(shown(s.teams[active.team].color)).stroke({ width: 2, color: PALETTE.outline });
    }

    this.updateFx(dt);
    this.drawWater(s);
    this.updateCamera(s, dt, alpha);
  }

  /** The aim marker: a ring and cross hairs, or the style's heart / star, with an optional glow. */
  private drawMarker(ov: Graphics, x: number, y: number, r: number, color: number, style: AimStyle): void {
    if (style.glow !== undefined) ov.circle(x, y, r * 1.9).fill({ color: style.glow, alpha: 0.18 + 0.1 * Math.sin(this.time * 6) });
    if (style.shape) {
      drawBit(ov, style.shape, x, y, r * 1.1, color, 1, this.time);
      return;
    }
    const arm = r * (16 / 12);
    const gap = r * (4 / 7);
    ov.circle(x, y, r).stroke({ width: r > 9 ? 3 : 2.5, color: PALETTE.outline });
    ov.circle(x, y, r).stroke({ width: r > 9 ? 2 : 1.5, color });
    ov.moveTo(x - arm, y).lineTo(x - gap, y).moveTo(x + gap, y).lineTo(x + arm, y);
    ov.moveTo(x, y - arm).lineTo(x, y - gap).moveTo(x, y + gap).lineTo(x, y + arm);
    ov.stroke({ width: 2, color });
  }

  /** Sparkler / golden aim: a few sparkles fizzing round the marker. */
  private sparkleAround(x: number, y: number, spread: number, style: AimStyle, dt: number): void {
    if (!style.sparkle || Math.random() > dt * 25) return;
    const a = Math.random() * Math.PI * 2;
    const d = spread * (0.5 + Math.random() * 0.6);
    this.particles.push({
      x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * 0.3, vy: Math.sin(a) * 0.3 - 0.2,
      life: 0.5, max: 0.5, r: 1.8 + Math.random() * 1.8, color: style.sparkle[Math.floor(Math.random() * style.sparkle.length)], kind: 'spark', shape: 'star',
    });
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
      // Speeds are "per 60 fps frame"; scale by elapsed time so motion is the
      // same on slow and high-refresh screens.
      const f = dt * 60;
      p.x += p.vx * f;
      p.y += p.vy * f;
      if (p.kind === 'debris') p.vy += 0.25 * f;
      if (p.grav) p.vy += p.grav * f;
      if (p.kind === 'confetti') p.vx = Math.sin(this.time * 4 + p.r * 7) * 0.8;
      if (p.kind === 'smoke') {
        p.vy -= 0.01 * f;
        p.vx *= Math.pow(0.98, f);
      }
      if (p.kind === 'flash') {
        g.circle(p.x, p.y, p.r * (1.2 - k * 0.4)).fill({ color: 0xffb13b, alpha: k * 0.8 });
        g.circle(p.x, p.y, p.r * (0.8 - k * 0.3)).fill({ color: p.color, alpha: k });
      } else if (p.kind === 'smoke') {
        g.circle(p.x, p.y, p.r * (1.6 - k * 0.6)).fill({ color: p.color, alpha: k * 0.55 });
      } else if (p.shape) {
        drawBit(g, p.shape, p.x, p.y, p.r, p.color, Math.min(1, k * 2), this.time + p.r);
      } else if (p.kind === 'confetti') {
        const w = 5 * Math.abs(Math.sin(this.time * 6 + p.r * 11));
        g.rect(p.x - w / 2, p.y - 2, w + 0.5, 4).fill({ color: p.color, alpha: Math.min(1, k * 3) });
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
      [this.waterBack, 0, this.theme.waterLight, 0.7],
      [this.waterFront, 1.7, this.theme.water, 0.88],
    ] as const) {
      g.clear();
      g.moveTo(left, wy + 8000);
      for (let x = left; x <= right; x += 20) {
        const y = wy + Math.sin(x * 0.03 + this.time * 2 + offset) * 4 + (offset ? 6 : 0);
        g.lineTo(x, y);
      }
      g.lineTo(right, wy + 8000).closePath().fill({ color, alpha });
    }
  }

  /** Twinkling stars, falling snow or rising embers (arena themes). */
  private drawAmbient(width: number, height: number, dt: number): void {
    const g = this.ambient;
    g.clear();
    const th = this.theme;
    const stars = th.stars ? 70 : 0;
    this.ambientBits.forEach((b, i) => {
      if (i < stars) {
        // Stars sit in the top two thirds and twinkle.
        const a = 0.45 + 0.55 * Math.abs(Math.sin(this.time * 1.3 + b.p));
        g.circle(b.x * width, b.y * height * 0.66, b.r).fill({ color: 0xffffff, alpha: a });
        return;
      }
      const d = th.drift!;
      b.y += (d.up ? -b.v : b.v) * dt * 4;
      if (b.y > 1.05) b.y -= 1.1;
      if (b.y < -0.05) b.y += 1.1;
      const x = b.x * width + Math.sin(this.time * 0.8 + b.p) * 12;
      g.circle(x, b.y * height, b.r + 0.6).fill({ color: d.color, alpha: d.up ? 0.75 : 0.9 });
    });
  }

  /**
   * The two rows of background hills. Drawn once into pictures (like the sky
   * and the ground) rather than as GPU shapes: as huge one-off shapes, some
   * graphics cards (Chrome) drew them as stray triangles and lines across the sky.
   */
  private drawHills(): void {
    const w = this.state.terrain.w;
    const h = this.state.waterY;
    for (const [layer, color, amp, base, freq] of [
      [this.hills, this.theme.hillFar, 90, h - 260, 0.004],
      [this.hillsNear, this.theme.hillNear, 70, h - 170, 0.007],
    ] as const) {
      const sprite = new Sprite(makeHillTexture(w, h, color, amp, base, freq));
      sprite.position.set(HILL_LEFT, h - HILL_ABOVE);
      sprite.scale.set(HILL_SCALE);
      layer.addChild(sprite);
    }
  }

  /** Is the player choosing a spot on the map for this weapon? */
  private pickingSpot(s: WorldState): boolean {
    const def = WEAPONS[s.turn.weapon];
    return s.turn.phase === 'aim' && !!def && (def.kind === 'target' || !!def.projectile?.homing);
  }

  /** Is this point well inside the view (not near an edge)? */
  private inMiddleOfView(p: { x: number; y: number }): boolean {
    const cam = this.camera;
    const { width, height } = this.app.screen;
    return Math.abs(p.x - cam.x) < (width * 0.35) / cam.zoom && Math.abs(p.y - cam.y) < (height * 0.35) / cam.zoom;
  }

  private updateCamera(s: WorldState, dt: number, alpha: number): void {
    const cam = this.camera;
    const now = performance.now();
    if (now > cam.manualUntil) {
      let target: { x: number; y: number } | null = null;
      const champ = s.turn.phase === 'gameover' ? s.tardis.find((t) => t.alive && t.team === s.turn.winner) : undefined;
      if (champ) {
        // Game over: watch the winners dance.
        target = this.lerpPos(champ.id, champ.x, champ.y, alpha);
      } else if (s.projectiles.length > 0) {
        const p = s.projectiles[0];
        target = this.lerpPos(p.id, p.x, p.y, alpha);
      } else if (this.pickingSpot(s) && (s.turn.target || cam.held)) {
        // Picking a spot on the map (a strike, the Teleport…): the view stays on
        // the spot picked, or where the player looked, not back on the tardi.
        target = s.turn.target && !this.inMiddleOfView(s.turn.target) ? { x: s.turn.target.x, y: s.turn.target.y + 40 } : null;
      } else {
        const a = activeTardi(s);
        const moving = s.tardis.find((t) => t.alive && t.airborne && (t.knocked || t.thrown));
        const w = this.watch;
        if (w && a) {
          // Thrown about by the blast: that's not the player walking off.
          if (a.airborne || a.knocked) {
            w.ax = a.x;
            w.ay = a.y;
          } else if (Math.abs(a.x - w.ax) + Math.abs(a.y - w.ay) > 8) this.watch = null;
        }
        // After the shot (retreat, then the damage being counted) it stays until
        // the player moves or the next turn starts; otherwise (a mine going off
        // as someone walks) just long enough to see it.
        const afterShot = s.turn.phase === 'retreat' || s.turn.phase === 'settle';
        if (this.watch && (this.watch.turn !== s.turn.turnNumber || (!afterShot && this.time > this.watch.until))) this.watch = null;
        if (moving) target = this.lerpPos(moving.id, moving.x, moving.y, alpha);
        else if (this.watch) target = this.watch;
        else if (a?.alive) target = this.lerpPos(a.id, a.x, a.y, alpha);
      }
      if (target) {
        const k = 1 - Math.pow(0.02, dt);
        cam.x += (target.x - cam.x) * k;
        cam.y += (target.y - 40 - cam.y) * k;
      }
    }
    const { width, height } = this.app.screen;
    // Also catches a window resize that leaves the old zoom too far out.
    cam.zoom = Math.max(cam.zoom, this.minZoom());
    const halfW = width / 2 / cam.zoom;
    const halfH = height / 2 / cam.zoom;
    cam.x = clamp(cam.x, -VIEW_MARGIN_X + halfW, s.terrain.w + VIEW_MARGIN_X - halfW, s.terrain.w / 2);
    // A view taller than the map (tall phone screens) centres it, with sky
    // above and deep sea below (drawWater reaches far enough down).
    cam.y = clamp(cam.y, -300 + halfH, s.waterY + 60 - halfH, (s.waterY - 240) / 2);
    this.world.scale.set(cam.zoom);
    this.world.position.set(width / 2 - cam.x * cam.zoom, height / 2 - cam.y * cam.zoom);
    // Parallax: background hills move slower than the world.
    this.hills.position.set(cam.x * 0.55, cam.y * 0.4);
    this.hillsNear.position.set(cam.x * 0.3, cam.y * 0.2);
  }

  destroy(): void {
    this.app.stage.removeChildren();
    this.world.destroy({ children: true });
    // The terrain and sky are big canvas textures, made per match: free them, or each match leaves its copy on the GPU.
    this.terrainView.destroy();
    this.weather.destroy();
    this.sky.destroy({ texture: true, textureSource: true });
    for (const layer of [this.hills, this.hillsNear]) for (const c of layer.children) if (c instanceof Sprite) c.texture.destroy(true);
    this.ambient.destroy();
  }
}

function clamp(v: number, lo: number, hi: number, fallback: number): number {
  if (lo > hi) return fallback;
  return Math.max(lo, Math.min(hi, v));
}

/** Colour of one slice of the power bar: `f` is the charge, `t` how far along the bar. */
function barColor(style: AimStyle, f: number, t: number, i: number, time: number): number {
  const bar = style.bar;
  if (bar === 'heat') return lerpColor(0xffe14a, 0xe5332a, f * t);
  if (bar === 'rainbow') return rainbowAt(t * 0.85 - time * 0.4);
  if (bar === 'stripes') return i % 2 === 0 ? 0xe04848 : 0xffffff;
  return mixColor(bar[0], bar[1], f * t);
}

/** A little shape thrown out by effects: a heart, a star, a coin, a snowflake or a scrap of confetti. */
function drawBit(g: Graphics, shape: 'heart' | 'star' | 'coin' | 'snow' | 'bit', x: number, y: number, r: number, color: number, alpha: number, spin: number): void {
  const O = PALETTE.outline;
  if (shape === 'heart') {
    g.moveTo(x, y + r)
      .bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.45)
      .bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r)
      .closePath()
      .fill({ color, alpha })
      .stroke({ width: 1.2, color: O, alpha });
  } else if (shape === 'star') {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = spin * 2 + (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.poly(pts).fill({ color, alpha }).stroke({ width: 1, color: O, alpha: alpha * 0.8 });
  } else if (shape === 'coin') {
    const w = r * Math.max(0.2, Math.abs(Math.cos(spin * 5)));
    g.ellipse(x, y, w, r).fill({ color, alpha }).stroke({ width: 1.2, color: O, alpha });
  } else if (shape === 'snow') {
    g.circle(x, y, r).fill({ color, alpha });
  } else {
    const w = r * 1.4 * Math.abs(Math.sin(spin * 6));
    g.rect(x - w / 2, y - r * 0.6, w + 0.5, r * 1.2).fill({ color, alpha });
  }
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
    case 'sapbomb':
      // Jar of glowing amber sap
      g.roundRect(x - 4, y - 5, 8, 10, 3).fill(0xf0a030).stroke({ width: 1.4, color: O });
      g.rect(x - 2.5, y - 7, 5, 2.5).fill(0x8f5f2e).stroke({ width: 1, color: O });
      g.circle(x - 1.5, y - 1, 1.2).fill(0xffe9a8);
      break;
    case 'aciddrop':
      g.poly([x, y + 6, x - 4, y - 1, x, y - 7, x + 4, y - 1]).fill(0x7ad84a).stroke({ width: 1.3, color: O });
      break;
    case 'bacteria':
      // Chunky rod-shaped bacterium
      g.roundRect(x - 6, y - 3.5, 12, 7, 3.5).fill(0x5fd0a0).stroke({ width: 1.5, color: O });
      g.circle(x - 2, y - 0.5, 1).fill(0x2f8f6a);
      g.circle(x + 2.5, y + 0.8, 1).fill(0x2f8f6a);
      break;
    case 'bacterlet':
      g.roundRect(x - 3.5, y - 2, 7, 4, 2).fill(0x5fd0a0).stroke({ width: 1, color: O });
      break;
    case 'dynamite': {
      g.roundRect(x - 2.5, y - 6, 5, 11, 1.5).fill(0xe04848).stroke({ width: 1.3, color: O });
      g.moveTo(x, y - 6).quadraticCurveTo(x + 3, y - 9, x + 2, y - 11).stroke({ width: 1, color: O });
      const flick = Math.random() * 1.5;
      g.circle(x + 2, y - 11.5, 1.6 + flick).fill({ color: 0xffd84a, alpha: 0.9 });
      break;
    }
    case 'cyanobloom':
      g.circle(x, y, 5).fill(0x4fc3b0).stroke({ width: 1.4, color: O });
      g.circle(x - 2, y - 2, 1.4).fill(0xb8f2e6);
      g.circle(x + 2.2, y + 1.5, 1).fill(0x2a8f80);
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
    case 'holywater': {
      // Glowing water droplet with a halo
      g.ellipse(x, y - 9, 6, 2).stroke({ width: 1.6, color: 0xffd84a });
      g.circle(x, y, 9).fill({ color: 0xbfe8ff, alpha: 0.35 });
      g.poly([x, y - 8, x + 5.5, y + 1, x + 4, y + 5, x, y + 6.5, x - 4, y + 5, x - 5.5, y + 1]).fill(0x63b7ff).stroke({ width: 1.5, color: O });
      g.circle(x - 1.8, y + 1, 1.5).fill(0xffffff);
      break;
    }
    case 'tun': {
      // Dried-up tardigrade "tun", cast in concrete
      g.ellipse(x, y, 12, 10).fill(0xa7a39b).stroke({ width: 2, color: O });
      for (const sx of [-5, 0, 5]) g.moveTo(x + sx, y - 9).quadraticCurveTo(x + sx - 2, y, x + sx, y + 9).stroke({ width: 1.2, color: 0x6f6b64 });
      g.circle(x - 6, y - 4, 1.4).fill(0x6f6b64);
      g.circle(x + 4, y + 4, 1).fill(0x6f6b64);
      break;
    }
    case 'shard': {
      // Spinning sliver of a glass microscope slide
      const a = (x + y) * 0.08;
      const c = Math.cos(a) * 7;
      const sn = Math.sin(a) * 7;
      g.poly([x + c, y + sn, x - sn * 0.4, y + c * 0.4, x - c, y - sn, x + sn * 0.4, y - c * 0.4])
        .fill({ color: 0xd8f4ff, alpha: 0.85 })
        .stroke({ width: 1.3, color: O });
      g.moveTo(x - c * 0.5, y - sn * 0.5).lineTo(x + c * 0.3, y + sn * 0.3).stroke({ width: 1, color: 0xffffff });
      break;
    }
    case 'gloop': {
      // A wobbly purple blob of goo
      const wob = Math.sin((x + y) * 0.3) * 0.8;
      g.ellipse(x, y, 6 + wob, 5.5 - wob).fill(0xa86af0).stroke({ width: 1.5, color: O });
      g.circle(x - 2, y - 2, 1.5).fill(0xe8d4ff);
      g.circle(x + 3, y + 3.5, 1.4).fill(0xa86af0).stroke({ width: 1, color: O });
      break;
    }
    case 'drill': {
      // Earthworm with a spinning drill-bit nose
      const len = Math.hypot(vx, vy) || 1;
      const dx = vx / len;
      const dy = vy / len;
      for (let i = 3; i >= 1; i--) g.circle(x - dx * i * 4, y - dy * i * 4, 3.4).fill(0xf29a9a).stroke({ width: 1.2, color: O });
      g.poly([x + dx * 9, y + dy * 9, x - dy * 4, y + dx * 4, x + dy * 4, y - dx * 4]).fill(0xc3cad6).stroke({ width: 1.3, color: O });
      break;
    }
    case 'gale': {
      // A round gourd with swirly wind marks
      g.circle(x, y + 1, 5.5).fill(0xf0c060).stroke({ width: 1.5, color: O });
      g.circle(x, y - 5, 2.6).fill(0xf0c060).stroke({ width: 1.2, color: O });
      g.moveTo(x - 3, y).quadraticCurveTo(x, y - 3, x + 3, y).stroke({ width: 1.1, color: 0xffffff });
      break;
    }
    case 'leech': {
      // A green leech, curled round
      g.ellipse(x, y, 7, 4.5).fill(0x3cb34a).stroke({ width: 1.5, color: O });
      g.circle(x + 5, y - 1, 2.4).fill(0x2a8a38).stroke({ width: 1.1, color: O });
      g.moveTo(x - 4, y - 1.5).lineTo(x + 1, y - 1.5).stroke({ width: 1, color: 0xa8f08a });
      break;
    }
    case 'pinball':
      g.circle(x, y, 4.5).fill(0xffd84a).stroke({ width: 1.5, color: O });
      g.circle(x - 1.4, y - 1.4, 1.4).fill(0xffffff);
      break;
    case 'megaspore':
      g.circle(x, y, 7).fill(0xe04848).stroke({ width: 1.6, color: O });
      g.circle(x - 2.5, y - 2, 1.6).fill(0xffffff);
      g.circle(x + 2.5, y + 1.5, 1.3).fill(0xffffff);
      break;
    case 'swarm':
      g.circle(x, y, 5).fill(0x7fd3f7).stroke({ width: 1.5, color: O });
      g.circle(x - 1.5, y - 1.5, 1.4).fill(0xffffff);
      break;
    case 'balloon':
      g.circle(x, y, 7).fill({ color: 0x63b7ff, alpha: 0.9 }).stroke({ width: 1.6, color: O });
      g.circle(x - 2.5, y - 2.5, 1.8).fill(0xffffff);
      g.poly([x - 1.5, y + 7, x + 1.5, y + 7, x, y + 9]).fill(0x63b7ff).stroke({ width: 1, color: O });
      break;
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

/** A gravestone (team cosmetic, render/finales.ts), standing where the tardi popped. Drawn like ui/cosmeticArt graveSvg, at about a third of the size. */
function makeGrave(x: number, y: number, color: number, id: string): Graphics {
  const g = new Graphics();
  const O = PALETTE.outline;
  const s = 0.45;
  switch (id) {
    case 'stone':
      g.moveTo(-14, 20).lineTo(-14, -6).quadraticCurveTo(-14, -20, 0, -20).quadraticCurveTo(14, -20, 14, -6).lineTo(14, 20).closePath().fill(0xa9b3bf).stroke({ width: 2.5, color: O });
      g.moveTo(-6, -8).lineTo(6, -8).moveTo(-6, -2).lineTo(6, -2).stroke({ width: 2, color: O, alpha: 0.6 });
      g.roundRect(-8, 6, 16, 4, 2).fill(color);
      break;
    case 'cross':
      g.moveTo(-2, 20).lineTo(-2, -20).moveTo(-12, -8).lineTo(10, -8).stroke({ width: 6, color: 0x8f5f2e, cap: 'round' });
      g.circle(-2, -8, 3).fill(color);
      break;
    case 'flowers':
      g.poly([-12, 20, -9, 4, 9, 4, 12, 20]).fill(0xc8693a).stroke({ width: 2, color: O });
      g.moveTo(0, 4).lineTo(0, -10).moveTo(-6, 4).lineTo(-10, -8).moveTo(6, 4).lineTo(10, -8).stroke({ width: 2, color: 0x3a8a28 });
      for (const [fx, fy] of [[-10, -10], [0, -14], [10, -10]]) g.circle(fx, fy, 5).fill(color).stroke({ width: 1.5, color: O }).circle(fx, fy, 1.8).fill(0xffd84a);
      break;
    case 'ghost':
      g.moveTo(-12, 14).lineTo(-12, -6).quadraticCurveTo(-12, -20, 0, -20).quadraticCurveTo(12, -20, 12, -6).lineTo(12, 14)
        .lineTo(8, 10).lineTo(4, 14).lineTo(0, 10).lineTo(-4, 14).lineTo(-8, 10).closePath().fill({ color: 0xf4f6fb, alpha: 0.85 }).stroke({ width: 2, color: O });
      g.circle(-4, -6, 2).fill(O).circle(4, -6, 2).fill(O);
      g.ellipse(0, 18, 10, 2).fill({ color, alpha: 0.5 });
      break;
    case 'trophy':
      g.moveTo(-10, -18).lineTo(10, -18).lineTo(10, -6).quadraticCurveTo(10, 6, 0, 6).quadraticCurveTo(-10, 6, -10, -6).closePath().fill(0xffd84a).stroke({ width: 2, color: O });
      g.rect(-3, 6, 6, 8).fill(0xe0a920).stroke({ width: 1.5, color: O });
      g.rect(-10, 14, 20, 6).fill(color).stroke({ width: 1.5, color: O });
      break;
    case 'rocket':
      g.moveTo(0, -24).quadraticCurveTo(10, -12, 8, 10).lineTo(-8, 10).quadraticCurveTo(-10, -12, 0, -24).closePath().fill(0xe8ecf2).stroke({ width: 2, color: O });
      g.circle(0, -8, 4).fill(color).stroke({ width: 1.5, color: O });
      g.poly([-8, 4, -14, 16, -7, 12]).fill(color).stroke({ width: 1.5, color: O });
      g.poly([8, 4, 14, 16, 7, 12]).fill(color).stroke({ width: 1.5, color: O });
      break;
    case 'crystal':
      g.poly([0, -24, 10, -4, 6, 20, -6, 20, -10, -4]).fill(0xbff3ff).stroke({ width: 2, color: O });
      g.moveTo(0, -24).lineTo(-3, 20).moveTo(0, -24).lineTo(3, 20).moveTo(-10, -4).lineTo(10, -4).stroke({ width: 1.2, color: 0x6ab0d8 });
      g.circle(0, -4, 3).fill({ color, alpha: 0.8 });
      break;
    case 'founder':
      g.moveTo(0, -8).lineTo(0, -20).stroke({ width: 2.5, color: 0x3a8a28 });
      g.ellipse(-5, -20, 5, 3).fill(0x5aa83a).stroke({ width: 1.5, color: O }).ellipse(5, -23, 5, 3).fill(0x5aa83a).stroke({ width: 1.5, color: O });
      g.roundRect(-14, -8, 28, 28, 4).fill(0xffd84a).stroke({ width: 2.5, color: O });
      g.roundRect(-9, -3, 18, 10, 2).fill(0xf0b400);
      g.roundRect(-8, 12, 16, 4, 2).fill(color);
      break;
    case 'egg':
      g.ellipse(0, 2, 13, 18).fill(0xfff6e0).stroke({ width: 2.5, color: O });
      g.moveTo(-12, -2).lineTo(-6, 3).lineTo(-1, -3).lineTo(4, 3).lineTo(8, -2).lineTo(12, 1).stroke({ width: 2, color: O });
      g.roundRect(-8, 12, 16, 4, 2).fill(color);
      break;
  }
  g.scale.set(s);
  g.position.set(x, y + 9 - 20 * s);
  return g;
}

/** The hills picture: from this far left of the map, this far above the water, at 1/HILL_SCALE size (they're soft shapes). */
const HILL_LEFT = -3000;
const HILL_ABOVE = 420;
const HILL_SCALE = 4;

/** One row of hills, the same shape as ever: a wavy top filled down past the water. */
function makeHillTexture(w: number, h: number, color: number, amp: number, base: number, freq: number): Texture {
  const width = w - 2 * HILL_LEFT;
  const height = HILL_ABOVE + 3000;
  const c = document.createElement('canvas');
  c.width = Math.ceil(width / HILL_SCALE);
  c.height = Math.ceil(height / HILL_SCALE);
  const ctx = c.getContext('2d')!;
  ctx.scale(1 / HILL_SCALE, 1 / HILL_SCALE);
  ctx.translate(-HILL_LEFT, -(h - HILL_ABOVE));
  ctx.beginPath();
  ctx.moveTo(HILL_LEFT, h + 3000);
  for (let x = HILL_LEFT; x <= w - HILL_LEFT; x += 25) {
    ctx.lineTo(x, base - Math.sin(x * freq) * amp - Math.sin(x * freq * 2.7 + 1) * amp * 0.4);
  }
  ctx.lineTo(w - HILL_LEFT, h + 3000);
  ctx.closePath();
  ctx.fillStyle = hex(color);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = hex(PALETTE.outline);
  ctx.globalAlpha = 0.25;
  ctx.stroke();
  return Texture.from(c);
}

function makeSkyTexture(theme: ArenaTheme): Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, theme.skyTop);
  grad.addColorStop(1, theme.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  return Texture.from(c);
}

/** A dotted line from (x0, y0) to (x1, y1). */
function dots(g: Graphics, x0: number, y0: number, x1: number, y1: number, gap: number, r: number, color: number, alpha: number): void {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.floor(d / gap);
  for (let i = 1; i <= n; i++) {
    const f = (i * gap) / d;
    g.circle(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, r);
  }
  if (n > 0) g.fill({ color, alpha });
}

function drawCross(g: Graphics, x: number, y: number, r: number, color: number, alpha: number): void {
  g.moveTo(x - r, y - r).lineTo(x + r, y + r).moveTo(x + r, y - r).lineTo(x - r, y + r).stroke({ width: 2.5, color, alpha, cap: 'round' });
}
