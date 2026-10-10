import '@fontsource/luckiest-guy';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './style.css';
import { enforceLandscape } from './ui/landscape';
import { myUnlockedWeapons, refreshAccount, reportCpuMatch, wearHat, wearSkin } from './account/session';
import { MatchTally } from './stats/tally';
import { showHub, type Hub } from './ui/hub';
// Pixi without eval(), so the site's Content-Security-Policy can forbid it (site/public/_headers).
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import { createWorld, tick, type TeamConfig } from './sim/world';
import { EMPTY_INPUT, TICK_RATE, type SimEvent, type WorldState } from './sim/types';
import { GameRenderer } from './render/renderer';
import { Banter } from './render/banter';
import { loadProfiles, matchNames } from './ui/teams';
import { InputCollector, attachKeyboard } from './input/input';
import { Hud } from './ui/hud';
import { CpuPlayer, type CpuSkill } from './ai/cpu';
import { sfx, setMuted, unlockAudio } from './audio/sfx';
import type { MatchSetup } from './ui/menu';
import { loadRejoin, showOnline } from './ui/online';
import { NetClient } from './net/client';
import { Lockstep } from './net/lockstep';
import { toWire, type ServerMsg } from './net/protocol';
import { presetScheme } from './sim/schemes';
import { ANGLE_FULL } from './sim/math/trig';

const TICK_MS = 1000 / TICK_RATE;
const touchMode = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

async function boot(): Promise<void> {
  if (touchMode) enforceLandscape();
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
  let hub = null as Hub | null; // set by menu()

  const menu = () => {
    current?.destroy();
    current = null;
    hub = showHub(ui, (setup) => start(setup), () => online());
  };
  const start = (setup: MatchSetup) => {
    current?.destroy();
    ui.innerHTML = '';
    unlockAudio();
    current = new Match(app, ui, { kind: 'local', setup }, menu, () => start({ ...setup, seed: (Math.random() * 1e9) | 0 }));
  };
  const online = (opts: Parameters<typeof showOnline>[2] = {}) => {
    current?.destroy();
    current = null;
    showOnline(ui, { onBack: menu, onStart: startOnline }, opts);
  };
  const startOnline = (client: NetClient, ls: Lockstep) => {
    current?.destroy();
    ui.innerHTML = '';
    unlockAudio();
    const m: Match = new Match(
      app,
      ui,
      { kind: 'online', client, ls },
      () => {
        client.close();
        menu();
      },
      () => online({ client, room: m.lastRoom ?? undefined }),
    );
    m.onNetStart = (next) => startOnline(client, next);
    current = m;
  };
  const params = new URLSearchParams(location.search);
  // Debug/test hook: ?autostart=cpu skips the menu.
  const auto = params.get('autostart');
  const room = params.get('room');
  if (auto) {
    // ?autostart=cpu|hotseat, optionally &players=N (first slot human, rest CPU)
    const n = Number(params.get('players')) || 2;
    const players = Array.from({ length: n }, (_, i) => (auto === 'hotseat' ? false : i > 0));
    const skill = (params.get('skill') ?? 'normal') as CpuSkill;
    start({ players, teams: loadProfiles().slice(0, n), scheme: presetScheme('standard'), seed: 12345, cpuSkill: skill });
  } else if (room) {
    // Invite link: ?room=CODE
    online({ code: room.toUpperCase() });
  } else menu();

  // Who's signed in (and what they own); the menu updates when this lands.
  const before = (await refreshAccount())?.wallet.coins ?? 0;
  // Back from Stripe's payment page.
  const shop = params.get('shop');
  if (shop) {
    history.replaceState(null, '', location.pathname);
    if (shop === 'done') {
      hub?.go('shop', 'Thanks! Your coins will appear in your wallet in a moment.');
      // Stripe tells the server a few seconds after paying, so check back a few times.
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (((await refreshAccount())?.wallet.coins ?? 0) > before) break;
      }
    } else hub?.go('shop', 'Payment cancelled: nothing was charged.');
  }
}

type MatchMode = { kind: 'local'; setup: MatchSetup } | { kind: 'online'; client: NetClient; ls: Lockstep };

class Match {
  private local: WorldState | null = null;
  private net: { client: NetClient; ls: Lockstep } | null = null;
  private renderer: GameRenderer;
  private input = new InputCollector();
  private hud: Hud;
  private banter = new Banter();
  private cpu = new Map<number, CpuPlayer>();
  private events: SimEvent[] = [];
  /** Counts pops and damage in a vs-CPU match, for the signed-in player's stats (team 0). */
  private tally: MatchTally | null = null;
  private acc = 0;
  private last = performance.now();
  private detachKeys: () => void;
  private pointers = new Map<number, { x: number; y: number; startX: number; startY: number; moved: boolean; aim: boolean }>();
  private pinchDist = 0;
  private muted = false;
  private over = false;
  private destroyed = false;
  private tickerFn = () => this.frame();
  // Online bookkeeping
  private offNet: (() => void) | null = null;
  private sentHeld = 0;
  private sentTurn = -1;
  private resyncAsked = false;
  private reconnecting = false;
  /** Called when the server starts a new match on this connection (a rematch). */
  onNetStart: ((ls: Lockstep) => void) | null = null;
  /** Latest lobby state from the server (for "Back to room" after the match). */
  lastRoom: Extract<ServerMsg, { t: 'room' }> | null = null;

  constructor(
    private app: Application,
    private ui: HTMLElement,
    mode: MatchMode,
    private onMenu: () => void,
    private onAgain: () => void,
  ) {
    if (mode.kind === 'local') {
      const setup = mode.setup;
      const teams: TeamConfig[] = setup.players.map((cpu, i) => {
        const p = setup.teams[i];
        return { name: p.name, color: p.color, hat: wearHat(p.hat), skin: wearSkin(p.skin), names: matchNames(p, i), cpu };
      });
      // Season weapons this player has unlocked are switched on for everyone in the match.
      this.local = createWorld({ seed: setup.seed, teams, scheme: { ...setup.scheme, unlocked: myUnlockedWeapons() } });
      // Only one human (the player's own team, slot 0) against the CPU counts for their stats.
      if (!setup.players[0] && setup.players.slice(1).every(Boolean) && !this.local.race) this.tally = new MatchTally(teams.length);
      for (const t of this.local.teams) if (t.cpu) this.cpu.set(t.id, new CpuPlayer(setup.cpuSkill));
    } else {
      this.net = { client: mode.client, ls: mode.ls };
      this.listenNet();
    }

    this.renderer = new GameRenderer(app, this.state);
    this.renderer.onSound = (name) => sfx[name]();
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

  get state(): WorldState {
    return this.net ? this.net.ls.state : this.local!;
  }

  get world(): WorldState {
    return this.state;
  }

  private listenNet(): void {
    const net = this.net!;
    this.offNet = net.client.on((msg) => {
      switch (msg.t) {
        case 'frames': net.ls.onFrames(msg.from, msg.f); break;
        case 'hash': net.ls.onHash(msg.tick, msg.h); break;
        case 'snapshot':
          net.ls.onSnapshot(msg.state, msg.you);
          this.resyncAsked = false;
          // The world was replaced wholesale: redraw it from scratch.
          this.renderer.destroy();
          this.renderer = new GameRenderer(this.app, this.state);
          this.renderer.onSound = (name) => sfx[name]();
          break;
        case 'room': this.lastRoom = msg; break;
        case 'start':
          // The host started a rematch while we were still on the results screen.
          this.onNetStart?.(Lockstep.start(msg.seed, msg.scheme, msg.teams, msg.you));
          break;
        case 'error': this.hud.showBanner(msg.msg, 0xe04848, 3); break;
      }
    });
    net.client.onDrop = () => void this.reconnect();
  }

  /** Lost the server: keep trying to get back into our slot. */
  private async reconnect(): Promise<void> {
    if (this.reconnecting || !this.net) return;
    this.reconnecting = true;
    const re = loadRejoin();
    for (let i = 0; i < 15 && this.net && re; i++) {
      this.hud.showBanner('Reconnecting…', 0x7d8a99, 2.2);
      try {
        await this.net.client.connect();
        this.net.client.join(re.code, { name: '', color: 0, hat: '', names: [] }, re.token);
        this.reconnecting = false;
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    this.reconnecting = false;
    if (this.net) this.hud.showBanner('Disconnected', 0xe04848, 5);
  }

  private toggleMute(): boolean {
    this.muted = !this.muted;
    setMuted(this.muted);
    return this.muted;
  }

  private isHumanTurn(): boolean {
    if (this.net) return this.net.ls.myTurn;
    const team = this.state.teams[this.state.turn.teamIdx];
    return !team.cpu && this.state.turn.phase !== 'gameover';
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(250, now - this.last);
    this.last = now;
    this.acc += dt;
    if (this.net) this.netFrame();
    else {
      const s = this.local!;
      while (this.acc >= TICK_MS) {
        this.acc -= TICK_MS;
        const team = s.teams[s.turn.teamIdx];
        const human = this.isHumanTurn();
        const humanInput = this.input.frame(); // always drain
        const input = team.cpu ? this.cpu.get(team.id)!.next(s) : human ? humanInput : EMPTY_INPUT;
        this.renderer.capturePrev(s);
        const from = this.events.length;
        tick(s, input, this.events);
        this.tally?.add(s, this.events.slice(from));
      }
    }
    this.renderer.handleEvents(this.events);
    this.banter.onEvents(this.state, this.events, (id, text) => this.renderer.say(id, text));
    this.playSounds(this.events);
    this.events.length = 0;
    this.renderer.render(this.state, Math.min(1, this.acc / TICK_MS), dt / 1000, true);
    this.hud.update(this.state, this.isHumanTurn());
  }

  /** Online: send our inputs on our turn, and play the frames the server sends. */
  private netFrame(): void {
    const { client, ls } = this.net!;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      const f = this.input.frame();
      if (ls.myTurn) {
        // The server forgets held buttons when a turn starts.
        if (ls.state.turn.turnNumber !== this.sentTurn) {
          this.sentTurn = ls.state.turn.turnNumber;
          this.sentHeld = 0;
        }
        if (f.held !== this.sentHeld || f.pressed !== 0 || f.cmd) {
          client.send({ t: 'input', f: toWire(f) });
          this.sentHeld = f.held;
        }
      }
      if (ls.buffered > 0) {
        this.renderer.capturePrev(ls.state);
        ls.step(this.events);
      } else {
        // Waiting on the server: don't bank time we'd then rush through.
        this.acc = Math.min(this.acc, TICK_MS);
      }
    }
    // Fell behind (slow device or a burst of frames): catch up quickly.
    while (ls.buffered > 6) {
      this.renderer.capturePrev(ls.state);
      ls.step(this.events);
    }
    if (ls.desynced && !this.resyncAsked) {
      this.resyncAsked = true;
      client.send({ t: 'resync' });
    }
  }

  private playSounds(events: SimEvent[]): void {
    let hurt = false; // one voice per batch of damage
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
        case 'gas': sfx.chute(); break;
        case 'damage':
          if (!hurt) {
            hurt = true;
            if (e.amount >= 35) sfx.oof();
            else sfx.squeak();
          }
          break;
        case 'drown': sfx.gargle(); break;
        case 'finish': {
          sfx.collect();
          const tm = this.state.teams[e.team];
          this.hud.showBanner(`${tm.name}: ${(e.ticks / TICK_RATE).toFixed(1)}s${e.best ? ' — best!' : ''}`, tm.color, 2.5);
          break;
        }
        case 'turnStart':
          sfx.turn();
          this.announceTurn();
          break;
        case 'gameover':
          if (!this.over) {
            this.over = true;
            sfx.fanfare();
            // A sad trombone when you lost: a draw, a CPU win, or (online) someone else won.
            const youLost = e.winner < 0 || (this.net ? e.winner !== this.net.ls.you : this.state.teams[e.winner].cpu);
            if (youLost) sfx.wahwah();
            if (this.tally) {
              void reportCpuMatch({ won: e.winner === 0, ...this.tally.teams[0] }).then((slime) => {
                if (slime > 0 && !this.destroyed) this.hud.showBanner(`+${slime} Slime 🟢`, 0x5aa83a, 3);
              });
            }
            const labels = this.net ? (['Back to room', 'Leave'] as const) : (['Play again', 'Main menu'] as const);
            setTimeout(() => this.hud.showGameOver(this.state, this.onAgain, this.onMenu, labels), 4200); // after the victory dance
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
      // A drag that starts on your own tardi aims instead of moving the camera.
      const aim = this.pointers.size === 0 && this.nearActiveTardi(e.clientX, e.clientY);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, aim });
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
        if (this.pinchDist > 0) cam.zoom = Math.max(this.renderer.minZoom(), Math.min(3, cam.zoom * (d / this.pinchDist)));
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
      if (p.aim) {
        if (p.moved) this.dragAim(e.clientX, e.clientY);
        return;
      }
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
      cam.zoom = Math.max(this.renderer.minZoom(), Math.min(3, cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    };
  }

  /** Is this screen point on (or close to) the tardi whose turn it is? */
  private nearActiveTardi(sx: number, sy: number): boolean {
    const s = this.state;
    const t = s.tardis.find((x) => x.id === s.turn.activeTardi);
    if (!t || !this.isHumanTurn() || s.turn.phase !== 'aim' || t.rope) return false;
    const w = this.renderer.screenToWorld(sx, sy);
    return Math.hypot(w.x - t.x, w.y - t.y) * this.renderer.camera.zoom < 48;
  }

  /** Point the crosshair from the active tardi towards a screen point. */
  private dragAim(sx: number, sy: number): void {
    const s = this.state;
    const t = s.tardis.find((x) => x.id === s.turn.activeTardi);
    if (!t || !this.isHumanTurn()) return;
    const w = this.renderer.screenToWorld(sx, sy);
    const dx = w.x - t.x;
    const dy = w.y - t.y;
    if (Math.hypot(dx, dy) < 6) return;
    const facing = Math.abs(dx) < 2 ? t.facing : dx > 0 ? 1 : -1;
    const aim = (Math.atan2(-dy, Math.abs(dx)) * ANGLE_FULL) / (2 * Math.PI);
    this.input.command({ t: 'aim', facing, aim: Math.round(aim) });
  }

  private pointerSpread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  destroy(): void {
    this.destroyed = true;
    this.offNet?.();
    if (this.net) this.net.client.onDrop = null;
    this.net = null;
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
