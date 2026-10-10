// A quiet CPU-vs-CPU match playing behind the menu on big screens, so the
// space around the menu shows the game itself. No sound, no input, no stats;
// a new match starts a few seconds after one ends.

import type { Application } from 'pixi.js';
import { createWorld, tick, type TeamConfig } from './sim/world';
import { TICK_RATE, type SimEvent, type WorldState } from './sim/types';
import { presetScheme } from './sim/schemes';
import { GameRenderer } from './render/renderer';
import { CpuPlayer, type Plan, type Planner } from './ai/cpu';
import { HATS } from './render/hats';
import { SKINS } from './render/skins';
import { defaultProfile, matchNames } from './ui/teams';

const TICK_MS = 1000 / TICK_RATE;
/** At most this many ticks per frame, so a slow frame never stalls the menu. */
const MAX_STEPS = 3;
/** Wait after a match ends before the next one. */
const NEXT_MS = 5000;

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/** CPU planning in a Web Worker, so the menu never stalls while a CPU thinks. */
function workerPlanner(): { plan: Planner; stop: () => void } | null {
  try {
    const w = new Worker(new URL('./ai/planWorker.ts', import.meta.url), { type: 'module' });
    let id = 0;
    const waiting = new Map<number, (p: Plan | null) => void>();
    w.onmessage = (e: MessageEvent<{ id: number; plan: Plan | null }>) => {
      waiting.get(e.data.id)?.(e.data.plan);
      waiting.delete(e.data.id);
    };
    const plan: Planner = (s, skill) =>
      new Promise((resolve) => {
        const n = ++id;
        waiting.set(n, resolve);
        w.postMessage({ id: n, s, skill });
      });
    return { plan, stop: () => w.terminate() };
  } catch {
    return null;
  }
}

/** Whether this screen gets the background match: big, mouse-driven, motion allowed. */
export function wantsAttract(): boolean {
  return matchMedia('(min-width: 1500px) and (min-height: 760px) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches;
}

export class Attract {
  private state!: WorldState;
  private renderer!: GameRenderer;
  private cpus = new Map<number, CpuPlayer>();
  private events: SimEvent[] = [];
  private acc = 0;
  private last = performance.now();
  private endedAt = 0;
  private fn = () => this.frame();
  private planner = workerPlanner();

  constructor(private app: Application) {
    this.start();
    app.ticker.add(this.fn);
  }

  private start(): void {
    const n = 2 + Math.floor(Math.random() * 2);
    // Show off the wardrobe: every team wears something random.
    const teams: TeamConfig[] = Array.from({ length: n }, (_, i) => {
      const p = defaultProfile(i);
      return { name: p.name, color: p.color, hat: pick(HATS).id, skin: pick(SKINS).id, names: matchNames(p, i), cpu: true };
    });
    this.state = createWorld({ seed: (Math.random() * 1e9) | 0, teams, scheme: { ...presetScheme('standard'), turnTime: 20 } });
    this.cpus.clear();
    for (const t of this.state.teams) this.cpus.set(t.id, new CpuPlayer(pick(['normal', 'hard'] as const), this.planner?.plan));
    this.renderer = new GameRenderer(this.app, this.state);
    // Pulled back so most of the island shows around the menu.
    this.renderer.camera.zoom = this.renderer.minZoom() * 1.25;
    this.endedAt = 0;
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(250, now - this.last);
    this.last = now;
    this.acc = Math.min(this.acc + dt, TICK_MS * MAX_STEPS);
    const s = this.state;
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      if (s.turn.phase === 'gameover') break;
      const team = s.teams[s.turn.teamIdx];
      this.renderer.capturePrev(s);
      tick(s, this.cpus.get(team.id)!.next(s), this.events);
    }
    this.renderer.handleEvents(this.events);
    this.events.length = 0;
    this.renderer.render(s, Math.min(1, this.acc / TICK_MS), dt / 1000, false);
    if (s.turn.phase === 'gameover') {
      this.endedAt ||= now;
      if (now - this.endedAt > NEXT_MS) {
        this.renderer.destroy();
        this.start();
      }
    }
  }

  stop(): void {
    this.app.ticker.remove(this.fn);
    this.planner?.stop();
    this.renderer.destroy();
  }
}
