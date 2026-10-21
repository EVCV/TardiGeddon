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
  /** Set the aim directly (drag-to-aim on touch screens, and online when ▲▼ are let go). */
  | { t: 'aim'; facing: number; aim: number }
  /**
   * Sent with letting go of Fire online: the power the player saw. The
   * server's charge runs ahead of the player's screen by the connection's
   * delay, so the shot uses this instead (never more than was charged).
   */
  | { t: 'power'; p: number }
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
  /** Starting ammo of each superweapon (0 = crates only). */
  supers: number;
  /** Rope Race: no fighting, race from the start to the flag; fastest time wins. */
  race: boolean;
  /** Rope Race: how many attempts each team gets. */
  raceRounds: number;
  /** false = a team's own weapons don't hurt (or push) its own tardigrades. */
  friendlyFire: boolean;
  /**
   * Practice: one human tardigrade that can't be hurt (it climbs back out of
   * the water), unlimited ammo, against this many target dummies (team 1).
   */
  practiceTargets?: number;
  /** Practice: popped targets come back somewhere else, and it goes on until you quit. */
  practiceEndless?: boolean;
  /** If set, the only weapons available and their starting ammo (-1 = unlimited). */
  weapons?: Record<string, number>;
  /** Season weapons switched on for this match (WeaponDef.locked); all teams get them. */
  unlocked?: string[];
  /** Map style (terrain/generate.ts MAP_STYLES); unset or 'random' = a different one each match. */
  mapStyle?: string;
  /** Armour each tardigrade starts with: it soaks up this much damage before health does (0 = none). */
  armour: number;
  /**
   * Online rooms: the world look (render/arenas.ts) the host picked for
   * everyone. Scenery only: the sim never reads it.
   */
  arena?: string;
  /** Weather: rain, snow, sunshine... and, very rarely, a tornado that throws everyone somewhere new. */
  weather: boolean;
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
  supers: 0,
  race: false,
  raceRounds: 3,
  friendlyFire: true,
  armour: 0,
  weather: true,
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
  /** Silk Rope while swinging: the pivot it swings from, the free length
   *  below that pivot, and earlier pivots where it wrapped round corners. */
  rope: { x: number; y: number; len: number; bends: RopeBend[] } | null;
  /** Leaf Parachute open. */
  chute: boolean;
  /** Poisoned by a Cyanobloom Cloud: loses health each turn until cured. */
  poison: boolean;
  /** Armour plates left: damage comes off these before health (Scheme.armour). */
  armour: number;
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

/** A burning blob of sap (fire) or acid. Falls, settles, burns what it touches. */
export interface Flame {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ticks left before it burns out. */
  life: number;
  resting: boolean;
  acid: boolean;
}

/** A corner the Silk Rope wrapped round. `side` is the winding direction,
 *  so the rope unwraps when it swings back the other way. */
export interface RopeBend {
  x: number;
  y: number;
  side: number;
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
  /** Slams so far (Concrete Tun). */
  hits: number;
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
  /** Ticks Up (+) or Down (-) has been held, so aiming starts fine and speeds up. */
  aimHeld: number;
  /** Ticks Fire has been held at full power (the shot goes off by itself after FULL_HOLD_TICKS). */
  fullHold: number;
}

/** Rope Race course and results. */
export interface RaceState {
  startX: number;
  startY: number;
  goalX: number;
  goalY: number;
  /** Best time per team, in ticks (-1 = not finished yet). */
  best: number[];
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
  skin: string;
  /** Aim marker style and explosion effect (cosmetic only). */
  aim: string;
  fx: string;
  /** Victory dance, gravestone and team badge (cosmetic only). */
  dance: string;
  grave: string;
  emblem: string;
  ammo: Record<string, number>;
}

/** What the sky is doing. Only the tornado changes play; the rest is scenery. */
export type WeatherKind = 'clear' | 'sunny' | 'rain' | 'snow' | 'fog' | 'storm';

export interface WeatherState {
  kind: WeatherKind;
  /** Its own random numbers, so weather never changes the wind, crates or anything else. */
  rng: RngState;
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
  flames: Flame[];
  teams: Team[];
  /** Ticks played this round (drives sudden death). */
  roundTicks: number;
  suddenDeath: boolean;
  turn: TurnState;
  nextId: number;
  prevHeld: number;
  scheme: Scheme;
  /** Set in Rope Race games. */
  race: RaceState | null;
  /** The map style this match got (MAP_STYLES id). */
  realm: string;
  weather: WeatherState;
  /** Practice: where the immortal tardigrade (team 0) climbs back out after a dunking. */
  practice: { x: number; y: number; /** Targets popped so far. */ popped: number } | null;
}

export type SimEvent =
  | { t: 'explosion'; x: number; y: number; r: number; rect: Rect; /** Whose turn it was: picks the explosion effect. */ team: number }
  | { t: 'fire'; weapon: string; x: number; y: number }
  | { t: 'shot'; x0: number; y0: number; x1: number; y1: number }
  | { t: 'splash'; x: number }
  | { t: 'drown'; id: number }
  | { t: 'damage'; id: number; amount: number }
  /** Leech Lobber: the shooter got some health back. */
  | { t: 'heal'; id: number; amount: number }
  | { t: 'death'; id: number }
  | { t: 'jump'; id: number }
  | { t: 'teleport'; id: number; x: number; y: number }
  | { t: 'bounce'; x: number; y: number }
  | { t: 'rope'; id: number; x: number; y: number }
  /** The Silk Rope caught nothing: it reached (x, y); the nearest rock that way is `beyond` further (-1 = none). */
  | { t: 'ropeMiss'; id: number; x: number; y: number; beyond: number }
  | { t: 'punch'; id: number; x: number; y: number }
  | { t: 'chute'; id: number }
  | { t: 'terrain'; rect: Rect }
  | { t: 'turnStart'; team: number; tardi: number }
  | { t: 'mineArmed'; id: number }
  | { t: 'dud'; id: number }
  | { t: 'crateDrop'; id: number }
  | { t: 'collect'; id: number; tardi: number; contents: string; amount: number }
  | { t: 'suddenDeath' }
  /** A tornado swept through and set every tardigrade down somewhere new. */
  | { t: 'tornado' }
  /** Damage the armour soaked up. */
  | { t: 'armour'; id: number; amount: number }
  | { t: 'gas'; x: number; y: number; r: number }
  | { t: 'burn'; x: number; y: number; rect: Rect }
  | { t: 'waterRise'; y: number }
  /** Rope Race: a team reached the flag. */
  | { t: 'finish'; team: number; ticks: number; best: boolean }
  | { t: 'gameover'; winner: number };
