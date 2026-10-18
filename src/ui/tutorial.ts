// The tutorial: a practice match against a target dummy that just skips its
// turns, with a coach card that walks a new player through the controls one
// step at a time. Each step is ticked off by watching the game (the tardi
// moved, a 'jump' event happened...), so it works with any key bindings and
// with touch. Started from the lobby or Settings (main.ts: Match, kind 'tutorial').

import { EMPTY_INPUT, type InputFrame, type SimEvent, type WorldState } from '../sim/types';
import { AIM_MAX, type TeamConfig, type WorldConfig } from '../sim/world';
import { WEAPONS } from '../sim/weapons';
import { presetScheme } from '../sim/schemes';
import { actionFor, bindingText, controls, type Action } from '../input/controls';

const DONE_KEY = 'tardigeddon.tutorial';

/** Whether this device has started the tutorial before (for the "New here?" nudge). */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* storage blocked */
  }
}

/** The practice match: you against one dummy, no wind, mines, crates or barrels, and plenty of time. */
export function tutorialWorld(player: TeamConfig): WorldConfig {
  const dummy: TeamConfig = { name: 'Target Dummy', color: 0x9aa4ad, cpu: true, names: ['Dummy'], hat: 'beanie', skin: 'classic', aim: 'classic', fx: 'classic' };
  return {
    seed: 20241,
    teams: [{ ...player, cpu: false, names: player.names?.slice(0, 1) }, dummy],
    scheme: {
      ...presetScheme('standard'),
      turnTime: 300,
      retreatTime: 3,
      tardisPerTeam: 1,
      mines: 0,
      drums: 0,
      crateChance: 0,
      windMax: 0,
      roundTime: 60,
      supers: 0,
      weapons: undefined,
    },
  };
}

/** Target dummies in Practice. */
export const PRACTICE_TARGETS = 10;

/**
 * Practice: your first team's tardigrade, which can't be hurt, with every
 * weapon and unlimited ammo, against target dummies all over the map. Wind
 * and brine drums are on, to practise with; no mines or crates.
 */
export function practiceWorld(player: TeamConfig, unlocked: string[], seed: number, endless = false): WorldConfig {
  const targets: TeamConfig = {
    name: 'Targets',
    color: 0x9aa4ad,
    cpu: true,
    names: Array.from({ length: PRACTICE_TARGETS }, (_, i) => `Target ${i + 1}`),
    hat: 'beanie',
    skin: 'classic',
    aim: 'classic',
    fx: 'classic',
  };
  return {
    seed,
    teams: [{ ...player, cpu: false, names: player.names?.slice(0, 1) }, targets],
    scheme: {
      ...presetScheme('standard'),
      practiceTargets: PRACTICE_TARGETS,
      practiceEndless: endless,
      turnTime: 90,
      retreatTime: 3,
      mines: 0,
      drums: 4,
      crateChance: 0,
      windMax: 1,
      roundTime: 60,
      supers: 0,
      weapons: undefined,
      unlocked,
    },
  };
}

/**
 * Which practice? Pop all the targets (it ends when they're gone), or endless
 * targets that keep coming back until you quit. Shown over the menu.
 */
export function choosePractice(host: HTMLElement, onPick: (endless: boolean) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  const box = document.createElement('div');
  box.className = 'editor practice-choice';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Practice');
  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  const h = document.createElement('h2');
  h.className = 'editor-title';
  h.textContent = '🎯 Practice';
  const p = document.createElement('p');
  p.className = 'account-note';
  p.textContent = 'Your tardigrade can’t be hurt and every weapon has unlimited ammo. The wind blows, and there are brine drums to try.';
  const option = (title: string, text: string, endless: boolean) => {
    const b = document.createElement('button');
    b.className = 'practice-option';
    const t = document.createElement('b');
    t.textContent = title;
    const d = document.createElement('span');
    d.textContent = text;
    b.append(t, d);
    b.onclick = () => {
      close();
      onPick(endless);
    };
    return b;
  };
  const cancel = document.createElement('button');
  cancel.className = 'hud-btn';
  cancel.textContent = 'Cancel';
  cancel.onclick = close;
  box.append(
    h,
    p,
    option(`🎯 Pop ${PRACTICE_TARGETS} targets`, `${PRACTICE_TARGETS} targets around the map. Pop them all to finish.`, false),
    option('♾️ Endless targets', 'Popped targets come back somewhere else. Keep going as long as you like, and quit from the ☰ menu.', true),
    cancel,
  );
  overlay.append(box);
  host.append(overlay);
}

/** The dummy's "CPU": ends its turn straight away. */
export const dummyPlayer = {
  next(): InputFrame {
    return { ...EMPTY_INPUT, cmd: { t: 'skip' } };
  },
};

/** What the coach can see each frame. */
export interface CoachView {
  state: WorldState;
  events: SimEvent[];
  humanTurn: boolean;
  panelOpen: boolean;
  camera: { zoom: number; manualUntil: number };
}

interface Step {
  /** Wind to blow during this step (the practice match has none otherwise). */
  wind?: number;
  /** What to do, for touch and for keyboard/mouse. */
  text: (touch: boolean) => string;
  done: (v: CoachView, c: Coach) => boolean;
}

const keys = (a: Action) => bindingText(controls(), a);

/** The wind in the wind step: a good push to the right. */
const WIND_STEP = 0.7;

/** A mouse button that drags the map (any button not bound to an action does). */
function dragButton(): string {
  const free = [0, 1, 2].find((b) => !actionFor(controls(), `Mouse${b}`));
  return free === undefined ? 'a free mouse button' : ['the left mouse button', 'the middle mouse button', 'the right mouse button'][free];
}

const STEPS: Step[] = [
  {
    text: (touch) => (touch ? 'Hold ◀ or ▶ to walk.' : `Walk with ${keys('left')} and ${keys('right')}.`),
    done: (v, c) => {
      const t = v.state.tardis.find((x) => x.team === 0);
      return !!t && Math.abs(t.x - c.startX) > 40;
    },
  },
  {
    text: (touch) => (touch ? 'Tap JUMP to hop. Tap it twice, quickly, for a backflip.' : `Press ${keys('jump')} to jump. Press it twice, quickly, for a backflip.`),
    done: (_v, c) => c.seen.has('jump'),
  },
  {
    text: (touch) =>
      touch ? 'Aim: drag from your tardigrade, or use ▲ and ▼. The crosshair shows where you’re pointing.' : `Aim with ${keys('up')} and ${keys('down')}. The crosshair shows where you’re pointing.`,
    done: (v, c) => Math.abs(v.state.turn.aim - c.startAim) > AIM_MAX / 6,
  },
  {
    text: (touch) =>
      touch ? 'Drag the map to look around and find the target dummy. Pinch to zoom.' : `Drag the map with ${dragButton()} to look around and find the target dummy. The wheel zooms.`,
    done: (v, c) => v.camera.manualUntil > performance.now() || v.camera.zoom !== c.startZoom,
  },  {
    text: (touch) => (touch ? 'Tap the weapon button (bottom right) to see your weapons.' : `Press ${keys('weapons')}, or click the weapon button (bottom right), to see your weapons.`),
    done: (v) => v.panelOpen,
  },
  {
    text: () => `Pick the ${WEAPONS.bazooka.icon} ${WEAPONS.bazooka.name}.`,
    done: (v) => v.state.turn.weapon === 'bazooka' && !v.panelOpen,
  },
  {
    text: (touch) =>
      touch ? 'Hold FIRE to charge up, and let go to shoot. The longer you hold, the further it flies.' : `Hold ${keys('fire')} to charge up, and let go to shoot. The longer you hold, the further it flies.`,
    done: (_v, c) => c.firedBazooka,
  },
  {
    text: () => 'Now hit the target dummy! Point at it, and try different amounts of power. There’s no wind in practice.',
    done: (_v, c) => c.hitDummy,
  },

  {
    text: (touch) =>
      `Some weapons need a spot. Open your weapons, pick the ${WEAPONS.airstrike.icon} ${WEAPONS.airstrike.name}, ${touch ? 'tap' : 'click'} the map above the dummy, then ${touch ? 'FIRE' : `press ${keys('fire')}`}. There’s no aiming, so the ▲▼ buttons hide.`,
    done: (_v, c) => c.seen.has('strike'),
  },
  {
    wind: WIND_STEP,
    text: () =>
      `The wind is blowing now! The bar at the top of the screen shows it: “WIND ▶▶” means it blows to the right, and more arrows mean stronger. It pushes shots and rain. Pick the ${WEAPONS.bazooka.icon} ${WEAPONS.bazooka.name} and fire once to watch it drift.`,
    done: (_v, c) => c.firedThisStep,
  },
];

export class Coach {
  readonly root = document.createElement('div');
  private step = 0;
  private lastHtml = '';
  /** Things that happened (for steps that can be done ahead of time). */
  seen = new Set<string>();
  firedBazooka = false;
  /** A bazooka shot since the current step began. */
  firedThisStep = false;
  hitDummy = false;
  startX = 0;
  startAim = 0;
  startZoom = 1;
  private finished = false;
  private started = false;

  constructor(
    private touch: boolean,
    private hooks: { onMenu: () => void; onAgain: () => void },
  ) {
    markSeen();
    this.root.className = 'coach';
    this.root.setAttribute('role', 'status');
  }

  /** Call every frame, with the frame's events. */
  update(v: CoachView): void {
    if (this.finished) return;
    const dummy = v.state.tardis.find((x) => x.team === 1);
    for (const e of v.events) {
      if (e.t === 'jump') this.seen.add('jump');
      else if (e.t === 'fire' && e.weapon === 'bazooka') this.firedBazooka = this.firedThisStep = true;
      else if (e.t === 'fire' && e.weapon === 'airstrike') this.seen.add('strike');
      else if (e.t === 'damage' && dummy && e.id === dummy.id) this.hitDummy = true;
    }
    if (!this.started) {
      this.started = true;
      this.begin(v);
    }

    while (this.step < STEPS.length && STEPS[this.step].done(v, this)) {
      this.step++;
      this.begin(v);
    }
    if (v.state.turn.phase === 'gameover') {
      this.end(this.step >= STEPS.length || v.state.turn.winner === 0);
      return;
    }
    if (this.step >= STEPS.length) {
      this.end(true);
      return;
    }
    // The wind step: blow while the player's turn lasts (each turn starts calm here).
    // Only this tutorial's local world is touched, never an online match.
    const wind = STEPS[this.step].wind;
    if (wind !== undefined && v.humanTurn) v.state.wind = wind;
    const text = v.humanTurn ? STEPS[this.step].text(this.touch) : 'The dummy’s turn: it just skips it. Yours is next!';
    this.show(`<div class="coach-step">Step ${this.step + 1} of ${STEPS.length}</div><p class="coach-text"></p>`, text);
  }

  /** Remember where things were when a step started. */
  private begin(v: CoachView): void {
    const t = v.state.tardis.find((x) => x.team === 0);
    this.startX = t?.x ?? 0;
    this.startAim = v.state.turn.aim;
    this.startZoom = v.camera.zoom;
    this.firedThisStep = false;
  }

  private show(html: string, text: string): void {
    const key = html + text;
    if (key === this.lastHtml) return;
    this.lastHtml = key;
    this.root.innerHTML = html;
    this.root.querySelector('.coach-text')!.textContent = text;
  }

  private end(won: boolean): void {
    this.finished = true;
    this.root.className = 'coach coach-end';
    this.root.innerHTML = '';
    const h = document.createElement('h2');
    h.className = 'coach-title';
    h.textContent = won ? '🎉 You’re ready!' : 'Practice over';
    const p = document.createElement('p');
    p.className = 'coach-text';
    p.textContent = won
      ? 'That’s the basics. In a real match each team takes turns, the wind changes every turn, and you have 45 seconds a turn. Careful: your own blasts can hurt your own team, and you (friendly fire: you can turn it off in Match setup → Customise). Try 🎯 Practice for unlimited ammo, read the 📖 Guide for online play, and change any control in ⚙️ Settings.'
      : 'Have another go: the tutorial starts again from the beginning.';
    const row = document.createElement('div');
    row.className = 'coach-buttons';
    const menu = document.createElement('button');
    menu.className = 'big-btn';
    menu.textContent = 'Back to the menu';
    menu.onclick = this.hooks.onMenu;
    const again = document.createElement('button');
    again.className = 'big-btn secondary';
    again.textContent = won ? 'Practise again' : 'Try again';
    again.onclick = this.hooks.onAgain;
    row.append(menu, again);
    this.root.append(h, p, row);
  }
}
