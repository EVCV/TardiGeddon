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
  mines: number; // placed at the start
  mineFuse: number; // seconds
  drums: number; // brine drums placed at the start
  crateChance: number; // 0..1 per turn
  roundTime: number; // minutes until sudden death
  waterRise: number; // px per turn in sudden death
  /** false = no walking or jumping (Artillery style). */
  movement: boolean;
  /** If set, the only weapons available and their starting ammo (-1 = unlimited). */
  weapons?: Record<string, number>;
}

export const DEFAULT_SCHEME: Scheme = {
  turnTime: 45,
  retreatTime: 3,
  startHp: 100,
  tardisPerTeam: 4,
  fallDamage: true,
  windMax: 1,
  mines: 8,
  mineFuse: 3,
  drums: 3,
  crateChance: 0.5,
  roundTime: 10,
  waterRise: 24,
  movement: true,
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
  /** Poisoned by a Cyanobloom Cloud: loses health each turn until cured. */
  poison: boolean;
}

export type ObjectKind = 'mine' | 'drum' | 'crate';

/** Map objects: mines, brine drums and supply crates. */
export interface MapObject {
  id: number;
  kind: ObjectKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  airborne: boolean;
  /** Mines: -1 idle, >0 ticks to detonation, -2 dud. Unused otherwise. */
  fuse: number;
  dud: boolean;
  /** Drums: damage left before bursting. */
  hp: number;
  /** Crates: still under their parachute. */
  chute: boolean;
  /** Crates: 'health' or a weapon id. */
  contents: string;
  amount: number;
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
  /** Homing target (Homing Spore). */
  tx: number;
  ty: number;
  /** Walking direction (Rotifer Roller): 1, -1, or 0 for other projectiles. */
  dir: number;
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
  /** Cosmetic only (never affects play). */
  hat: string;
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
  objects: MapObject[];
  teams: Team[];
  /** Ticks played this round (drives sudden death). */
  roundTicks: number;
  suddenDeath: boolean;
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
  | { t: 'mineArmed'; id: number }
  | { t: 'dud'; id: number }
  | { t: 'crateDrop'; id: number }
  | { t: 'collect'; id: number; tardi: number; contents: string; amount: number }
  | { t: 'suddenDeath' }
  | { t: 'gas'; x: number; y: number; r: number }
  | { t: 'waterRise'; y: number }
  | { t: 'gameover'; winner: number };
