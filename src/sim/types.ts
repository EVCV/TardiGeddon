import type { RngState } from './math/prng';
import type { Rect, Terrain } from './terrain/terrain';

export const TICK_RATE = 50;

// Input bits. `held` is the state of buttons this tick; `pressed` holds
// one-shot presses (edges) that happened since the previous tick.
export const BTN_LEFT = 1;
export const BTN_RIGHT = 2;
export const BTN_UP = 4;
export const BTN_DOWN = 8;
export const BTN_FIRE = 16;
export const PRESS_JUMP = 1;

export type Command =
  | { t: 'weapon'; id: string }
  | { t: 'fuse'; s: number }
  | { t: 'target'; x: number; y: number }
  | { t: 'skip' };

export interface InputFrame {
  held: number;
  pressed: number;
  cmd?: Command;
}

export const EMPTY_INPUT: InputFrame = { held: 0, pressed: 0 };

export interface Scheme {
  turnTime: number; // seconds
  retreatTime: number; // seconds
  startHp: number;
  tardisPerTeam: number;
  fallDamage: boolean;
  windMax: number; // 0..1
}

export const DEFAULT_SCHEME: Scheme = {
  turnTime: 45,
  retreatTime: 3,
  startHp: 100,
  tardisPerTeam: 4,
  fallDamage: true,
  windMax: 1,
};

export interface Tardi {
  id: number;
  team: number;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  pendingDmg: number;
  alive: boolean;
  facing: 1 | -1;
  airborne: boolean;
  /** Launched by an explosion (bounces, no fall damage). */
  knocked: boolean;
  fallStartY: number;
  /** Silk Rope anchor and length while swinging. */
  rope: { x: number; y: number; len: number } | null;
  /** Leaf Parachute open. */
  chute: boolean;
}

export interface Projectile {
  id: number;
  weapon: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ticks until detonation; -1 = explodes on impact. */
  fuse: number;
  owner: number;
  age: number;
}

export type Phase = 'start' | 'aim' | 'retreat' | 'settle' | 'gameover';

export interface TurnState {
  phase: Phase;
  timer: number;
  turnNumber: number;
  teamIdx: number;
  activeTardi: number;
  weapon: string;
  aim: number;
  power: number;
  charging: boolean;
  fuseSeconds: number;
  shotsLeft: number;
  jumpTimer: number;
  target: { x: number; y: number } | null;
  settleTimer: number;
  settleTotal: number;
  winner: number; // team id, -1 = none/draw
}

export interface Team {
  id: number;
  name: string;
  color: number;
  cpu: boolean;
  tardiIds: number[];
  nextIdx: number;
  /** Weapon this team last selected (restored at the start of its turns). */
  weapon: string;
  ammo: Record<string, number>;
}

export interface WorldState {
  tick: number;
  rng: RngState;
  terrain: Terrain;
  waterY: number;
  wind: number; // -1..1
  tardis: Tardi[];
  projectiles: Projectile[];
  teams: Team[];
  turn: TurnState;
  nextId: number;
  prevHeld: number;
  scheme: Scheme;
}

export type SimEvent =
  | { t: 'explosion'; x: number; y: number; r: number; rect: Rect }
  | { t: 'fire'; weapon: string; x: number; y: number }
  | { t: 'shot'; x0: number; y0: number; x1: number; y1: number }
  | { t: 'splash'; x: number }
  | { t: 'drown'; id: number }
  | { t: 'damage'; id: number; amount: number }
  | { t: 'death'; id: number }
  | { t: 'jump'; id: number }
  | { t: 'teleport'; id: number; x: number; y: number }
  | { t: 'bounce'; x: number; y: number }
  | { t: 'rope'; id: number; x: number; y: number }
  | { t: 'punch'; id: number; x: number; y: number }
  | { t: 'chute'; id: number }
  | { t: 'terrain'; rect: Rect }
  | { t: 'turnStart'; team: number; tardi: number }
  | { t: 'gameover'; winner: number };
