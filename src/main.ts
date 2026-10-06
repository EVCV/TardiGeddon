import '@fontsource/luckiest-guy';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './style.css';
import { Application } from 'pixi.js';
import { createWorld, tick, type TeamConfig } from './sim/world';
import { EMPTY_INPUT, TICK_RATE, type SimEvent, type WorldState } from './sim/types';
import { GameRenderer } from './render/renderer';
import { loadProfiles, matchNames } from './ui/teams';
import { InputCollector, attachKeyboard } from './input/input';
import { Hud } from './ui/hud';
import { CpuPlayer } from './ai/cpu';
import { sfx, setMuted, unlockAudio } from './audio/sfx';
import { showMenu, type MatchSetup } from './ui/menu';
import { presetScheme } from './sim/schemes';

const TICK_MS = 1000 / TICK_RATE;
/** Far enough out to see most of a big 10-player map. */
const MIN_ZOOM = 0.2;
const touchMode = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#7fd3f7',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.getElementById('game')!.appendChild(app.canvas);
  try {
    await document.fonts.load('16px "Luckiest Guy"');
  } catch {
    /* fall back to system font */
  }

  const ui = document.getElementById('ui')!;
  let current: Match | null = null;

  const menu = () => {
    current?.destroy();
    current = null;
    showMenu(ui, (setup) => start(setup));
  };
  const start = (setup: MatchSetup) => {
    current?.destroy();
    ui.innerHTML = '';
    unlockAudio();
    current = new Match(app, ui, setup, menu, () => start({ ...setup, seed: (Math.random() * 1e9) | 0 }));
  };
  // Debug/test hook: ?autostart=cpu skips the menu.
  const auto = new URLSearchParams(location.search).get('autostart');
  if (auto) {
    // ?autostart=cpu|hotseat, optionally &players=N (first slot human, rest CPU)
    const n = Number(new URLSearchParams(location.search).get('players')) || 2;
    const players = Array.from({ length: n }, (_, i) => (auto === 'hotseat' ? false : i > 0));
    start({ players, teams: loadProfiles().slice(0, n), scheme: presetScheme('standard'), seed: 12345 });
  }
  else menu();
}

class Match {
  private state: WorldState;
  private renderer: GameRenderer;
  private input = new InputCollector();
  private hud: Hud;
  private cpu = new Map<number, CpuPlayer>();
  private events: SimEvent[] = [];
  private acc = 0;
  private last = performance.now();
  private detachKeys: () => void;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number; moved: boolean }>();
  private pinchDist = 0;
  private muted = false;
  private over = false;
  private tickerFn = () => this.frame();

  constructor(
    private app: Application,
    private ui: HTMLElement,
    setup: MatchSetup,
    private onMenu: () => void,
    private onAgain: () => void,
  ) {
    const teams: TeamConfig[] = setup.players.map((cpu, i) => {
      const p = setup.teams[i];
      return { name: p.name, color: p.color, hat: p.hat, names: matchNames(p, i), cpu };
    });
    this.state = createWorld({
      seed: setup.seed,
      teams,
      scheme: setup.scheme,
    });
    for (const t of this.state.teams) if (t.cpu) this.cpu.set(t.id, new CpuPlayer());

    this.renderer = new GameRenderer(app, this.state);
    this.hud = new Hud(this.input, { onQuit: onMenu, onToggleMute: () => this.toggleMute() }, touchMode);
    ui.append(this.hud.root);
    this.detachKeys = attachKeyboard(this.input, {
      onWeaponPanel: () => this.hud.togglePanel(),
      onEscape: () => this.hud.togglePanel(false),
    });
    this.attachPointer();
    this.announceTurn();
    app.ticker.add(this.tickerFn);
    (window as unknown as { __tardi: unknown }).__tardi = this; // for e2e tests
  }

  get world(): WorldState {
    return this.state;
  }

  private toggleMute(): boolean {
    this.muted = !this.muted;
    setMuted(this.muted);
    return this.muted;
  }

  private isHumanTurn(): boolean {
    const team = this.state.teams[this.state.turn.teamIdx];
    return !team.cpu && this.state.turn.phase !== 'gameover';
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(250, now - this.last);
    this.last = now;
    this.acc += dt;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const team = this.state.teams[this.state.turn.teamIdx];
      const human = this.isHumanTurn();
      const humanInput = this.input.frame(); // always drain
      const input = team.cpu ? this.cpu.get(team.id)!.next(this.state) : human ? humanInput : EMPTY_INPUT;
      this.renderer.capturePrev(this.state);
      tick(this.state, input, this.events);
    }
    this.renderer.handleEvents(this.events);
    this.playSounds(this.events);
    this.events.length = 0;
    this.renderer.render(this.state, this.acc / TICK_MS, dt / 1000, true);
    this.hud.update(this.state, this.isHumanTurn());
  }

  private playSounds(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'explosion': sfx.explosion(e.r); break;
        case 'fire': sfx.fire(); break;
        case 'shot': sfx.shot(); break;
        case 'jump': sfx.jump(); break;
        case 'splash': sfx.splash(); break;
        case 'bounce': sfx.bounce(); break;
        case 'teleport': sfx.teleport(); break;
        case 'rope': sfx.rope(); break;
        case 'chute': sfx.chute(); break;
        case 'punch': sfx.punch(); break;
        case 'terrain': sfx.build(); break;
        case 'mineArmed': sfx.tick(); break;
        case 'crateDrop': sfx.chute(); break;
        case 'collect': sfx.collect(); break;
        case 'dud': sfx.bounce(); break;
        case 'suddenDeath':
          sfx.suddenDeath();
          setTimeout(() => this.hud.showBanner('SUDDEN DEATH!', 0xe04848, 2.5), 2100);
          break;
        case 'waterRise': sfx.splash(); break;
        case 'turnStart':
          sfx.turn();
          this.announceTurn();
          break;
        case 'gameover':
          if (!this.over) {
            this.over = true;
            setTimeout(() => this.hud.showGameOver(this.state, this.onAgain, this.onMenu), 1200);
          }
          break;
      }
    }
  }

  private announceTurn(): void {
    const s = this.state;
    const team = s.teams[s.turn.teamIdx];
    const t = s.tardis.find((x) => x.id === s.turn.activeTardi);
    if (t) this.hud.showBanner(`${t.name}'s turn!`, team.color);
    this.renderer.camera.manualUntil = 0;
  }

  private attachPointer(): void {
    const c = this.app.canvas;
    c.style.touchAction = 'none';
    c.oncontextmenu = (e) => {
      e.preventDefault();
      this.hud.togglePanel();
    };
    c.onpointerdown = (e) => {
      unlockAudio();
      if (e.button === 2) return;
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false });
      if (this.pointers.size === 2) this.pinchDist = this.pointerSpread();
    };
    c.onpointermove = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const cam = this.renderer.camera;
      if (this.pointers.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const d = this.pointerSpread();
        if (this.pinchDist > 0) cam.zoom = Math.max(MIN_ZOOM, Math.min(3, cam.zoom * (d / this.pinchDist)));
        this.pinchDist = d;
        p.moved = true;
        cam.manualUntil = performance.now() + 3000;
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 8) p.moved = true;
      if (p.moved) {
        cam.x -= dx / cam.zoom;
        cam.y -= dy / cam.zoom;
        cam.manualUntil = performance.now() + 2500;
      }
    };
    const up = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (p && !p.moved && this.isHumanTurn()) {
        const w = this.renderer.screenToWorld(e.clientX, e.clientY);
        this.input.command({ t: 'target', x: Math.round(w.x), y: Math.round(w.y) });
      }
    };
    c.onpointerup = up;
    c.onpointercancel = up;
    c.onwheel = (e) => {
      e.preventDefault();
      const cam = this.renderer.camera;
      cam.zoom = Math.max(MIN_ZOOM, Math.min(3, cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    };
  }

  private pointerSpread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  destroy(): void {
    this.app.ticker.remove(this.tickerFn);
    this.detachKeys();
    const c = this.app.canvas;
    c.onpointerdown = c.onpointermove = c.onpointerup = c.onpointercancel = null;
    c.onwheel = null;
    c.oncontextmenu = null;
    this.renderer.destroy();
    this.ui.innerHTML = '';
  }
}

void boot();
