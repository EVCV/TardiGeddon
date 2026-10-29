// The tutorial: a practice match against a target dummy that just skips its
// turns, with a coach card that walks a new player through the controls one
// step at a time. Each step is ticked off by watching the game (the tardi
// moved, a 'jump' event happened...), so it works with any key bindings and
// with touch. Started from the lobby or Settings (main.ts: Match, kind 'tutorial').

import { PRACTICE_TARGETS, markTutorialSeen } from './learn';
export { PRACTICE_TARGETS, choosePractice, tutorialSeen } from './learn';
import { EMPTY_INPUT, type InputFrame, type SimEvent, type WorldState } from '../sim/types';
import { AIM_MAX, activeTardi, type TeamConfig, type WorldConfig } from '../sim/world';
import { hopTo, walkTo } from '../ai/cpu';
import { WEAPONS } from '../sim/weapons';
import { presetScheme } from '../sim/schemes';
import { actionFor, bindingText, controls, type Action } from '../input/controls';
import { t } from '../i18n/i18n';
import { usage } from '../usage/usage';
import type { USAGE_TUTORIAL } from '../usage/catalog';


/** The practice match: you against one dummy, no wind, mines, crates or barrels, and plenty of time. */
export function tutorialWorld(player: TeamConfig): WorldConfig {
  const dummy: TeamConfig = { name: 'Target Dummy', color: 0x9aa4ad, cpu: true, names: ['Dummy'], hat: 'beanie', skin: 'classic', aim: 'classic', fx: 'classic' };
  return {
    seed: 20241,
    // The lessons start on your turn: the dummy's wander comes after.
    firstTeam: 0,
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
      // The lessons are written for this map: always the classic islands, and no weather.
      mapStyle: 'islands',
      weather: false,
      // Popped or drowned? Back you come, and the lesson carries on.
      respawn: true,
    },
  };
}


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


/** The practice targets' "CPU": ends its turn straight away. */
export const dummyPlayer = {
  next(): InputFrame {
    return { ...EMPTY_INPUT, cmd: { t: 'skip' } };
  },
};

/** How far the tutorial's dummy strays from where it started (so the lessons still find it). */
const DUMMY_ROAM = 110;

/**
 * The tutorial's dummy: on its turn it has a look round, takes a short walk
 * or a hop or two (never far from where it started, never into the water),
 * then ends its turn. It never fights back. Works out its moves like the CPU
 * does, on a copy of the world.
 */
export class TutorialDummy {
  private turn = -1;
  private home: number | null = null;
  private frames: InputFrame[] = [];

  next(s: WorldState): InputFrame {
    if (s.turn.phase !== 'aim') return EMPTY_INPUT;
    const me = activeTardi(s);
    if (!me) return { ...EMPTY_INPUT, cmd: { t: 'skip' } };
    if (this.turn !== s.turn.turnNumber) {
      this.turn = s.turn.turnNumber;
      this.home ??= me.x;
      this.frames = this.plan(s, this.home);
    }
    return this.frames.shift() ?? { ...EMPTY_INPUT, cmd: { t: 'skip' } };
  }

  private plan(s: WorldState, home: number): InputFrame[] {
    const wait = (n: number) => Array.from({ length: n }, () => EMPTY_INPUT);
    // A look round first: the crosshair up, then down a little.
    const me = activeTardi(s)!;
    const look: InputFrame[] = [
      ...wait(25),
      { ...EMPTY_INPUT, cmd: { t: 'aim', facing: me.facing, aim: Math.round(AIM_MAX * 0.6) } },
      ...wait(20),
      { ...EMPTY_INPUT, cmd: { t: 'aim', facing: me.facing, aim: 0 } },
      ...wait(15),
    ];
    const moves = [walkTo(s, -1, 40), walkTo(s, 1, 40), hopTo(s, -1, 1), hopTo(s, 1, 1), hopTo(s, -1, 2), hopTo(s, 1, 2)].filter(
      (m) => m && Math.abs(activeTardi(m.end)!.x - home) < DUMMY_ROAM && m.hurt === 0,
    );
    const move = moves[Math.floor(Math.random() * moves.length)];
    // (The look round doesn't move it, so the walk plays out as worked out.)
    return [...look, ...(move?.frames ?? []), ...wait(40)];
  }
}

/** What the coach can see each frame. */
export interface CoachView {
  state: WorldState;
  events: SimEvent[];
  humanTurn: boolean;
  panelOpen: boolean;
  camera: { zoom: number; manualUntil: number };
}

interface Step {
  /** Its name in the anonymous play statistics (USAGE_TUTORIAL, in the same order), to see where players stop. */
  id: (typeof USAGE_TUTORIAL)[number];
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
  return free === undefined ? t('a free mouse button') : [t('the left mouse button'), t('the middle mouse button'), t('the right mouse button')][free];
}

const STEPS: Step[] = [
  {
    id: 'walk',
    text: (touch) => (touch ? t('Hold ◀ or ▶ to walk.') : t('Walk with {left} and {right}.', { left: keys('left'), right: keys('right') })),
    done: (v, c) => {
      const me = v.state.tardis.find((x) => x.team === 0);
      return !!me && Math.abs(me.x - c.startX) > 40;
    },
  },
  {
    id: 'jump',
    text: (touch) => (touch ? t('Tap JUMP to hop. Tap it twice, quickly, for a backflip.') : t('Press {key} to jump. Press it twice, quickly, for a backflip.', { key: keys('jump') })),
    done: (_v, c) => c.seen.has('jump'),
  },
  {
    id: 'aim',
    text: (touch) =>
      touch ? t('Aim: drag from your tardigrade, or use ▲ and ▼. The crosshair shows where you’re pointing.') : t('Aim with {up} and {down}. The crosshair shows where you’re pointing.', { up: keys('up'), down: keys('down') }),
    done: (v, c) => Math.abs(v.state.turn.aim - c.startAim) > AIM_MAX / 6,
  },
  {
    id: 'look',
    text: (touch) =>
      touch ? t('Drag the map to look around and find the target dummy. Pinch to zoom.') : t('Drag the map with {button} to look around and find the target dummy. The wheel zooms.', { button: dragButton() }),
    done: (v, c) => v.camera.manualUntil > performance.now() || v.camera.zoom !== c.startZoom,
  },
  {
    id: 'weapons',
    text: (touch) => (touch ? t('Tap the weapon button (bottom right) to see your weapons.') : t('Press {key}, or click the weapon button (bottom right), to see your weapons.', { key: keys('weapons') })),
    done: (v) => v.panelOpen,
  },
  {
    id: 'pick',
    text: () => t('Pick the {weapon}.', { weapon: `${WEAPONS.bazooka.icon} ${t(WEAPONS.bazooka.name)}` }),
    done: (v) => v.state.turn.weapon === 'bazooka' && !v.panelOpen,
  },
  {
    id: 'fire',
    text: (touch) =>
      touch ? t('Hold FIRE to charge up, and let go to shoot. The longer you hold, the further it flies.') : t('Hold {key} to charge up, and let go to shoot. The longer you hold, the further it flies.', { key: keys('fire') }),
    done: (_v, c) => c.firedBazooka,
  },
  {
    id: 'hit',
    text: () => t('Now hit the target dummy! Point at it, and try different amounts of power. There’s no wind in practice.'),
    done: (_v, c) => c.hitDummy,
  },

  {
    id: 'strike',
    text: (touch) => {
      const weapon = `${WEAPONS.airstrike.icon} ${t(WEAPONS.airstrike.name)}`;
      return touch
        ? t('Some weapons need a spot. Open your weapons, pick the {weapon}, tap the map above the dummy, then FIRE. There’s no aiming, so the ▲▼ buttons hide.', { weapon })
        : t('Some weapons need a spot. Open your weapons, pick the {weapon}, click the map above the dummy, then press {key}. There’s no aiming, so the ▲▼ buttons hide.', { weapon, key: keys('fire') });
    },
    done: (_v, c) => c.seen.has('strike'),
  },
  {
    id: 'wind',
    wind: WIND_STEP,
    text: () =>
      t('The wind is blowing now! The bar at the top of the screen shows it: “WIND ▶▶” means it blows to the right, and more arrows mean stronger. It pushes shots and rain. Pick the {weapon} and fire once to watch it drift.', {
        weapon: `${WEAPONS.bazooka.icon} ${t(WEAPONS.bazooka.name)}`,
      }),
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
  /** Until when to say "Oops" (the player's tardigrade was popped or drowned, and comes back). */
  private oopsUntil = 0;
  startX = 0;
  startAim = 0;
  startZoom = 1;
  private finished = false;
  private started = false;

  constructor(
    private touch: boolean,
    private hooks: { onMenu: () => void; onAgain: () => void },
  ) {
    markTutorialSeen();
    this.root.className = 'coach';
    this.root.setAttribute('role', 'status');
  }

  /** Call every frame, with the frame's events. */
  update(v: CoachView): void {
    if (this.finished) return;
    const dummy = v.state.tardis.find((x) => x.team === 1);
    for (const e of v.events) {
      const mine = (id: number) => v.state.tardis.find((x) => x.id === id)?.team === 0;
      if ((e.t === 'death' || e.t === 'drown') && mine(e.id)) this.oopsUntil = performance.now() + 5000;
      if (e.t === 'jump' && mine(e.id)) this.seen.add('jump'); // (the dummy hops about too)
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
    const text =
      performance.now() < this.oopsUntil
        ? t('Oops! That one got you. Don’t worry: in the tutorial you come straight back. Carry on from where you were.')
        : v.humanTurn
          ? STEPS[this.step].text(this.touch)
          : t('The dummy’s turn: it wanders about a bit, but never fights back. Yours is next!');
    this.show(`<div class="coach-step">${t('Step {n} of {total}', { n: this.step + 1, total: STEPS.length })}</div><p class="coach-text"></p>`, text);
  }

  /** Remember where things were when a step started. */
  private begin(v: CoachView): void {
    const me = v.state.tardis.find((x) => x.team === 0);
    this.startX = me?.x ?? 0;
    this.startAim = v.state.turn.aim;
    this.startZoom = v.camera.zoom;
    this.firedThisStep = false;
    if (this.step < STEPS.length) usage('tutorial', { step: STEPS[this.step].id });
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
    if (this.step >= STEPS.length) usage('tutorial', { step: 'done' });
    this.root.className = 'coach coach-end';
    this.root.innerHTML = '';
    const h = document.createElement('h2');
    h.className = 'coach-title';
    h.textContent = won ? t('🎉 You’re ready!') : t('Practice over');
    const p = document.createElement('p');
    p.className = 'coach-text';
    p.textContent = won
      ? t('That’s the basics. In a real match each team takes turns, the wind changes every turn, and you have 45 seconds a turn. Careful: your own blasts can hurt your own team, and you (friendly fire: you can turn it off in Match setup → Customise). Try 🎯 Practice for unlimited ammo, read the 📖 Guide for online play, and change any control in ⚙️ Settings.')
      : t('Have another go: the tutorial starts again from the beginning.');
    const row = document.createElement('div');
    row.className = 'coach-buttons';
    const menu = document.createElement('button');
    menu.className = 'big-btn';
    menu.textContent = t('Back to the menu');
    menu.onclick = this.hooks.onMenu;
    const again = document.createElement('button');
    again.className = 'big-btn secondary';
    again.textContent = won ? t('Practise again') : t('Try again');
    again.onclick = this.hooks.onAgain;
    row.append(menu, again);
    this.root.append(h, p, row);
  }
}
