// The deterministic game simulation.
//
// Rules for everything under src/sim:
//  - No DOM, no rendering, no wall-clock time, no Math.random.
//  - Only + - * / and Math.sqrt/floor/ceil/round/abs/min/max on floats;
//    angles go through math/trig.ts. (Enforced by tests/purity.test.ts.)
//  - All state lives in WorldState so it can be cloned, hashed and replayed.

import { cosA, sinA, ANGLE_QUARTER } from './math/trig';
import { createRng, rngFloat, rngInt } from './math/prng';
import { generateMap } from './terrain/generate';
import { carveCircle, circleCollides, isSolid, normalAt, placeGirder, surfaceBelow, type Rect, type Terrain } from './terrain/terrain';
import {
  BTN_DOWN,
  BTN_FIRE,
  BTN_LEFT,
  BTN_RIGHT,
  BTN_UP,
  DEFAULT_SCHEME,
  PRESS_JUMP,
  TICK_RATE,
  type InputFrame,
  type MapObject,
  type ObjectKind,
  type Projectile,
  type Scheme,
  type SimEvent,
  type Tardi,
  type Team,
  type WorldState,
} from './types';
import { PANEL_WEAPONS, WEAPONS, type ProjectileSpec, type WeaponDef } from './weapons';

export const GRAVITY = 0.22;
export const TARDI_R = 7;
export const WALK_SPEED = 0.75;
export const AIM_STEP = 12;
/** Aiming starts slow for fine control and speeds up while held. */
const AIM_STEP_MIN = 2;
const AIM_STEP_MAX = 16;
/** Rope Race: how close (px) counts as touching the flag. */
const RACE_GOAL_R = 22;
export const AIM_MAX = ANGLE_QUARTER;
export const POWER_STEP = 20;
export const POWER_MAX = 1000;
export const WIND_ACCEL = 0.05;
const MAX_STEP_UP = 4;
const START_TICKS = 60;
const SETTLE_DELAY = 25;
const SAFE_FALL = 90;
const JUMP_DELAY = 10;
const MAX_FALL_SPEED = 14;
export const ROPE_MAX = 320;
const ROPE_MIN = 14;
const ROPE_REEL = 1.6;
const ROPE_SWING = 0.12;
const ROPE_BENDS_MAX = 24;
const CHUTE_FALL = 1.3;
const MINE_R = 4;
const DRUM_R = 8;
const CRATE_R = 8;
const MINE_TRIGGER = 26;
const CRATE_FALL = 1.5;
/** Crate contents: weapon ids weighted by how often they appear. */
const CRATE_WEAPONS = ['cluster', 'cluster', 'airstrike', 'teleport', 'girder', 'parachute', 'grenade', 'mortar', 'homing', 'rotifer', 'bacteria', 'dynamite', 'cyanobloom', 'sapbomb', 'acidrain', 'holywater', 'tun', 'slideslam'];
const HOMING_START = 15;
const POISON_DMG = 5;
const FLAME_LIFE = 220;
const FLAME_BURN_EVERY = 10;
/** Ground scorching is slower than burning tardis, so fire leaves dents, not pits. */
const FLAME_CARVE_EVERY = 40;
const FLAME_REACH = 9;
/** Collision radius of the Concrete Tun. */
const CRUSHER_R = 10;
const FLAME_DMG = 2;
const HOMING_TICKS = 120;
const WALKER_R = 4;
/** Hard cap on end-of-turn settling so a turn can never soft-lock. */
const SETTLE_MAX = 20 * TICK_RATE;

export interface TeamConfig {
  name: string;
  color: number;
  cpu: boolean;
  names?: string[];
  hat?: string;
  skin?: string;
}

export interface WorldConfig {
  seed: number;
  teams: TeamConfig[];
  scheme?: Partial<Scheme>;
  mapW?: number;
  mapH?: number;
}

export const DEFAULT_NAMES = [
  'Waddles', 'Tun', 'Mossy', 'Pudge', 'Cuticle', 'Stylet', 'Bubbles', 'Nibs',
  'Squish', 'Clawdia', 'Dewdrop', 'Gristle', 'Puddles', 'Lichen', 'Bramble', 'Pip',
  'Sprout', 'Gloop', 'Pebble', 'Fuzz', 'Dumpling', 'Biscuit', 'Wiggles', 'Plop',
  'Nugget', 'Snoot', 'Tater', 'Bean', 'Mochi', 'Crumb', 'Sludge', 'Zippy',
  'Barnacle', 'Muffin', 'Scoot', 'Gumdrop', 'Toggle', 'Blip', 'Ripple', 'Puff',
];

/** Most teams a match supports. */
export const MAX_TEAMS = 10;

/**
 * Map size for a match: 2000x1000 for the classic 2 teams of 4, growing with
 * the number of tardis so bigger games still have room to move.
 */
export function mapSizeFor(totalTardis: number): { w: number; h: number } {
  const w = Math.max(2000, Math.min(6000, Math.round((800 + totalTardis * 150) / 100) * 100));
  return { w, h: w > 2500 ? 1200 : 1000 };
}

// ---------------------------------------------------------------- creation

export function createWorld(cfg: WorldConfig): WorldState {
  const scheme: Scheme = { ...DEFAULT_SCHEME, ...cfg.scheme };
  if (cfg.teams.length < 2 || cfg.teams.length > MAX_TEAMS) throw new Error(`Need 2-${MAX_TEAMS} teams`);
  const size = mapSizeFor(cfg.teams.length * scheme.tardisPerTeam);
  const w = cfg.mapW ?? size.w;
  const h = cfg.mapH ?? size.h;
  const waterY = h - 70;
  const needed = cfg.teams.length * scheme.tardisPerTeam;

  // Retry seeds until the map has room for every tardi.
  for (let attempt = 0; attempt < 50; attempt++) {
    const seed = (cfg.seed + attempt * 7919) | 0;
    const terrain = generateMap({ w, h, waterY, seed, ceiling: scheme.race });
    const rng = createRng(seed ^ 0x5eed);
    const spots = findSpawns(terrain, waterY, needed, rng);
    if (!spots) continue;

    const s: WorldState = {
      tick: 0,
      rng,
      terrain,
      waterY,
      wind: 0,
      tardis: [],
      projectiles: [],
      objects: [],
      flames: [],
      teams: [],
      roundTicks: 0,
      suddenDeath: false,
      turn: {
        phase: 'start',
        timer: START_TICKS,
        turnNumber: 0,
        teamIdx: 0,
        activeTardi: -1,
        weapon: 'bazooka',
        aim: 256,
        power: 0,
        charging: false,
        fuseSeconds: 3,
        shotsLeft: 1,
        jumpTimer: 0,
        target: null,
        settleTimer: 0,
        settleTotal: 0,
        winner: -1,
        aimHeld: 0,
      },
      nextId: 1,
      prevHeld: 0,
      scheme,
      race: null,
    };

    cfg.teams.forEach((tc, ti) => {
      const ammo: Record<string, number> = {};
      for (const def of Object.values(WEAPONS)) {
        // A scheme weapon list restricts the arsenal; Skip Go is always allowed.
        const listed = scheme.weapons?.[def.id];
        const base = def.super ? scheme.supers : def.ammo;
        ammo[def.id] = !scheme.weapons || def.hidden || def.id === 'skip' ? base : (listed ?? 0);
        if (def.locked && !scheme.unlocked?.includes(def.id)) ammo[def.id] = 0;
      }
      const team: Team = { id: ti, name: tc.name, color: tc.color, cpu: tc.cpu, tardiIds: [], nextIdx: 0, weapon: 'bazooka', hat: tc.hat ?? 'beanie', skin: tc.skin ?? 'classic', ammo };
      s.teams.push(team);
    });
    // Interleave spawns so teams are mixed across the map.
    let spot = 0;
    for (let i = 0; i < scheme.tardisPerTeam; i++) {
      for (const team of s.teams) {
        const p = spots[spot++];
        const names = cfg.teams[team.id].names ?? DEFAULT_NAMES.slice(team.id * 4).concat(DEFAULT_NAMES);
        const t: Tardi = {
          id: s.nextId++,
          team: team.id,
          name: names[i % names.length],
          x: p.x,
          y: p.y,
          vx: 0,
          vy: 0,
          hp: scheme.startHp,
          pendingDmg: 0,
          alive: true,
          facing: rngInt(rng, 0, 1) ? 1 : -1,
          airborne: false,
          knocked: false,
          fallStartY: p.y,
          rope: null,
          chute: false,
          poison: false,
        };
        s.tardis.push(t);
        team.tardiIds.push(t.id);
      }
    }
    if (scheme.race) {
      // Start on the left-most land, flag on the right-most.
      const start = raceSpot(terrain, waterY, 1);
      const goal = raceSpot(terrain, waterY, -1);
      if (!start || !goal || goal.x - start.x < w / 2) continue;
      s.race = { startX: start.x, startY: start.y - TARDI_R - 1, goalX: goal.x, goalY: goal.y - 24, best: s.teams.map(() => -1) };
      for (const t of s.tardis) {
        t.x = s.race.startX;
        t.y = s.race.startY;
      }
    }
    // Bigger maps get proportionally more mines and drums.
    const scale = w / 2000;
    placeObjects(s, 'mine', Math.round(scheme.mines * scale));
    placeObjects(s, 'drum', Math.round(scheme.drums * scale));
    s.turn.teamIdx = rngInt(rng, 0, s.teams.length - 1);
    beginTurn(s, s.turn.teamIdx, []);
    return s;
  }
  throw new Error('Could not generate a map with enough room');
}

function newObject(s: WorldState, kind: ObjectKind, x: number, y: number): MapObject {
  const o: MapObject = {
    id: s.nextId++, kind, x, y, vx: 0, vy: 0, airborne: false,
    fuse: -1, dud: false, hp: 25, chute: false, contents: '', amount: 0,
  };
  s.objects.push(o);
  return o;
}

/** Scatter mines/drums on the ground, keeping clear of tardis. */
function placeObjects(s: WorldState, kind: ObjectKind, count: number): void {
  const r = kind === 'mine' ? MINE_R : DRUM_R;
  let placed = 0;
  for (let tries = 0; tries < 600 + count * 80 && placed < count; tries++) {
    const x = rngInt(s.rng, 40, s.terrain.w - 40);
    const sy = surfaceBelow(s.terrain, x, 0);
    if (sy < 0 || sy > s.waterY - 30) continue;
    // Lift off sloped ground until the object fits.
    let y = sy - r - 1;
    while (circleCollides(s.terrain, x, y, r) && y > sy - r - 16) y--;
    if (circleCollides(s.terrain, x, y, r)) continue;
    if (s.tardis.some((t) => Math.abs(t.x - x) < 60 && Math.abs(t.y - y) < 60)) continue;
    if (s.objects.some((o) => Math.abs(o.x - x) < 30 && Math.abs(o.y - y) < 30)) continue;
    const o = newObject(s, kind, x, y);
    if (kind === 'mine') o.dud = rngInt(s.rng, 0, 9) === 0;
    placed++;
  }
}

function objectRadius(o: MapObject): number {
  return o.kind === 'mine' ? MINE_R : o.kind === 'drum' ? DRUM_R : CRATE_R;
}

/** Rope Race: the first stretch of dry land scanning in from one side. */
function raceSpot(terrain: Terrain, waterY: number, dir: 1 | -1): { x: number; y: number } | null {
  for (let i = 80; i < terrain.w - 80; i += 4) {
    const x = dir === 1 ? i : terrain.w - i;
    // Below the ceiling, find the first ground.
    let y = 0;
    while (y < terrain.h && isSolid(terrain, x, y)) y++;
    while (y < terrain.h && !isSolid(terrain, x, y)) y++;
    if (y > 200 && y < waterY - 30 && !circleCollides(terrain, x, y - TARDI_R - 2, TARDI_R)) return { x, y };
  }
  return null;
}

function findSpawns(
  terrain: WorldState['terrain'],
  waterY: number,
  count: number,
  rng: WorldState['rng'],
): { x: number; y: number }[] | null {
  const spots: { x: number; y: number }[] = [];
  for (let tries = 0; tries < 2000 + count * 200 && spots.length < count; tries++) {
    const x = rngInt(rng, 40, terrain.w - 40);
    const sy = surfaceBelow(terrain, x, 0);
    if (sy < 0 || sy > waterY - 30) continue;
    const y = sy - TARDI_R - 1;
    if (circleCollides(terrain, x, y, TARDI_R)) continue;
    if (!circleCollides(terrain, x, y + 2, TARDI_R)) continue;
    if (spots.some((p) => Math.abs(p.x - x) < 50 && Math.abs(p.y - y) < 50)) continue;
    spots.push({ x, y });
  }
  return spots.length === count ? spots : null;
}

// ---------------------------------------------------------------- helpers

export function cloneWorld(s: WorldState): WorldState {
  return structuredClone(s);
}

export function getTardi(s: WorldState, id: number): Tardi | undefined {
  return s.tardis.find((t) => t.id === id);
}

export function activeTardi(s: WorldState): Tardi | undefined {
  return getTardi(s, s.turn.activeTardi);
}

export function activeTeam(s: WorldState): Team {
  return s.teams[s.turn.teamIdx];
}

export function aimVector(facing: number, aim: number): { dx: number; dy: number } {
  return { dx: facing * cosA(aim), dy: -sinA(aim) };
}

function inControl(s: WorldState): boolean {
  return s.turn.phase === 'aim' || s.turn.phase === 'retreat';
}

function endTurnNow(s: WorldState): void {
  if (!inControl(s) && s.turn.phase !== 'start') return;
  s.turn.phase = 'settle';
  s.turn.settleTimer = 0;
  s.turn.settleTotal = 0;
  s.turn.charging = false;
  s.turn.jumpTimer = 0;
  const t = activeTardi(s);
  if (t?.rope) releaseRope(t);
}

// ---------------------------------------------------------------- tick

export function tick(s: WorldState, input: InputFrame, events: SimEvent[]): void {
  if (s.turn.phase === 'gameover') return;
  s.tick++;
  const turn = s.turn;

  switch (turn.phase) {
    case 'start':
      if (--turn.timer <= 0) {
        turn.phase = 'aim';
        turn.timer = s.scheme.turnTime * TICK_RATE;
      }
      break;
    case 'aim':
    case 'retreat':
      handleControls(s, input, events);
      if (inControl(s) && --turn.timer <= 0) endTurnNow(s);
      break;
    case 'settle':
      break;
  }
  s.prevHeld = inControl(s) ? input.held : 0;

  if (turn.phase !== 'start') s.roundTicks++;
  updateProjectiles(s, events);
  updateObjects(s, events);
  updateFlames(s, events);
  for (const t of s.tardis) if (t.alive) updateTardi(s, t, events);
  if (s.race) checkFinish(s, events);

  if (turn.phase === 'settle') updateSettle(s, events);
}

// ---------------------------------------------------------------- controls

function handleControls(s: WorldState, input: InputFrame, events: SimEvent[]): void {
  const turn = s.turn;
  const t = activeTardi(s);
  if (!t || !t.alive) {
    endTurnNow(s);
    return;
  }
  const team = activeTeam(s);
  const def = WEAPONS[turn.weapon];
  const aiming = turn.phase === 'aim';
  const held = input.held;
  const fireEdge = (held & BTN_FIRE) !== 0 && (s.prevHeld & BTN_FIRE) === 0;
  const fireReleased = (held & BTN_FIRE) === 0 && (s.prevHeld & BTN_FIRE) !== 0;

  // Commands
  const cmd = input.cmd;
  if (cmd && aiming) {
    if (cmd.t === 'weapon') {
      const nd = WEAPONS[cmd.id];
      const midTurn = turn.shotsLeft < def.shots;
      if (nd && !nd.hidden && team.ammo[nd.id] !== 0 && !turn.charging && !midTurn) {
        turn.weapon = nd.id;
        team.weapon = nd.id;
        turn.shotsLeft = nd.shots;
        turn.target = null;
        turn.power = 0;
      }
    } else if (cmd.t === 'fuse') {
      turn.fuseSeconds = Math.max(1, Math.min(5, Math.round(cmd.s)));
    } else if (cmd.t === 'target') {
      if (def.kind === 'target' || def.projectile?.homing) turn.target = { x: cmd.x, y: cmd.y };
    } else if (cmd.t === 'aim') {
      if (!t.rope) {
        turn.aim = Math.max(-AIM_MAX, Math.min(AIM_MAX, Math.round(cmd.aim)));
        if (!turn.charging && (cmd.facing === 1 || cmd.facing === -1)) t.facing = cmd.facing;
      }
    } else if (cmd.t === 'skip') {
      endTurnNow(s);
      return;
    }
  }

  // Swinging on the Silk Rope: left/right swing, up/down reel, jump or fire lets go.
  if (t.rope) {
    const dir = ((held & BTN_RIGHT) !== 0 ? 1 : 0) - ((held & BTN_LEFT) !== 0 ? 1 : 0);
    if (dir !== 0) {
      t.facing = dir as 1 | -1;
      t.vx += dir * ROPE_SWING;
    }
    if ((held & BTN_UP) !== 0) t.rope.len = Math.max(ROPE_MIN, t.rope.len - ROPE_REEL);
    if ((held & BTN_DOWN) !== 0) t.rope.len = Math.min(ROPE_MAX, t.rope.len + ROPE_REEL);
    if ((input.pressed & PRESS_JUMP) !== 0 || fireEdge) releaseRope(t);
    return;
  }

  // Leaf Parachute steering
  if (t.chute) {
    const dir = ((held & BTN_RIGHT) !== 0 ? 1 : 0) - ((held & BTN_LEFT) !== 0 ? 1 : 0);
    if (dir !== 0) {
      t.facing = dir as 1 | -1;
      t.vx = Math.max(-1.6, Math.min(1.6, t.vx + dir * 0.1));
    }
  }

  // Jump / backflip: a second press within the delay turns a jump into a backflip.
  const canMove = s.scheme.movement;
  if (canMove && (input.pressed & PRESS_JUMP) !== 0 && !t.airborne && !turn.charging) {
    if (turn.jumpTimer > 0) {
      turn.jumpTimer = 0;
      launchJump(t, -t.facing * 1.1, -6.6, events);
    } else {
      turn.jumpTimer = JUMP_DELAY;
    }
  }
  if (turn.jumpTimer > 0 && --turn.jumpTimer === 0 && !t.airborne) {
    launchJump(t, t.facing * 2.4, -4.2, events);
  }

  // Walking
  const dir = ((held & BTN_RIGHT) !== 0 ? 1 : 0) - ((held & BTN_LEFT) !== 0 ? 1 : 0);
  if (dir !== 0 && !t.airborne && !turn.charging && turn.jumpTimer === 0) {
    t.facing = dir as 1 | -1;
    if (canMove) walk(s, t, dir); // without movement you can still turn round
  }

  // During retreat, Fire sets off your Rotifer Roller.
  if (turn.phase === 'retreat' && fireEdge) {
    const w = s.projectiles.find((p) => p.owner === t.id && p.dir !== 0);
    if (w) w.fuse = 1;
  }

  if (!aiming) return;

  // Aiming
  const aimDir = ((held & BTN_UP) !== 0 ? 1 : 0) - ((held & BTN_DOWN) !== 0 ? 1 : 0);
  // aimHeld counts ticks held, signed by direction: a change of direction
  // starts again from a fine nudge.
  if (aimDir === 0 || aimDir * turn.aimHeld < 0) turn.aimHeld = 0;
  if (aimDir !== 0) {
    // Fine to start with, faster the longer it's held.
    const step = Math.min(AIM_STEP_MAX, AIM_STEP_MIN + (Math.abs(turn.aimHeld) >> 2));
    turn.aimHeld += aimDir;
    turn.aim = Math.max(-AIM_MAX, Math.min(AIM_MAX, turn.aim + aimDir * step));
  }

  // Utilities usable mid-air
  if (team.ammo[def.id] !== 0 && fireEdge) {
    if (def.kind === 'rope') {
      castRope(s, t, events);
      return;
    }
    if (def.kind === 'parachute') {
      if (t.airborne && !t.chute && !t.knocked) {
        t.chute = true;
        t.vy = Math.min(t.vy, CHUTE_FALL);
        if (team.ammo[def.id] > 0) team.ammo[def.id]--;
        events.push({ t: 'chute', id: t.id });
      }
      return;
    }
  }

  // Firing
  if (t.airborne || turn.shotsLeft <= 0 || team.ammo[def.id] === 0) return;
  switch (def.kind) {
    case 'charge':
      if (def.projectile?.homing && !turn.target) break; // pick a target first
      if (fireEdge && !turn.charging) {
        turn.charging = true;
        turn.power = 0;
      }
      if (turn.charging) {
        if ((held & BTN_FIRE) !== 0) turn.power = Math.min(POWER_MAX, turn.power + POWER_STEP);
        if (fireReleased || turn.power >= POWER_MAX) {
          fireProjectile(s, t, def, events);
          afterShot(s, def);
        }
      }
      break;
    case 'hitscan':
      if (fireEdge) {
        fireHitscan(s, t, def, events);
        afterShot(s, def);
      }
      break;
    case 'target':
      if (fireEdge && turn.target) {
        if (fireTargeted(s, t, def, events)) afterShot(s, def);
      }
      break;
    case 'drop':
      if (fireEdge) {
        const spec = def.projectile!;
        spawnProjectile(s, def.id, t.x + t.facing * 4, t.y, t.facing * 0.4, -0.5, spec.fuseTicks ?? 150, t.id);
        events.push({ t: 'fire', weapon: def.id, x: t.x, y: t.y });
        afterShot(s, def);
      }
      break;
    case 'walker':
      if (fireEdge) {
        fireWalker(s, t, def, events);
        afterShot(s, def);
      }
      break;
    case 'melee':
      if (fireEdge) {
        firePunch(s, t, def, events);
        afterShot(s, def);
      }
      break;
    case 'instant':
      if (fireEdge) {
        if (def.shower) slideShower(s, t, def.shower, events);
        afterShot(s, def);
      }
      break;
  }
}

function castRope(s: WorldState, t: Tardi, events: SimEvent[]): void {
  const { dx, dy } = aimVector(t.facing, s.turn.aim);
  let x = t.x;
  let y = t.y;
  for (let i = 0; i < ROPE_MAX; i++) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= s.terrain.w || ny < 0 || ny >= s.terrain.h) return;
    if (isSolid(s.terrain, nx, ny)) {
      const len = Math.max(ROPE_MIN, i);
      t.rope = { x, y, len, bends: [] };
      t.airborne = true;
      t.knocked = false;
      t.chute = false;
      events.push({ t: 'rope', id: t.id, x, y });
      return;
    }
    x = nx;
    y = ny;
  }
}

function releaseRope(t: Tardi): void {
  t.rope = null;
  t.fallStartY = t.y;
}

function firePunch(s: WorldState, t: Tardi, def: WeaponDef, events: SimEvent[]): void {
  const m = def.melee!;
  for (const o of s.tardis) {
    if (!o.alive || o.id === t.id) continue;
    const ahead = (o.x - t.x) * t.facing;
    if (ahead > -4 && ahead < m.reach && Math.abs(o.y - t.y) < 16) {
      o.pendingDmg += m.damage;
      o.vx = t.facing * m.vx;
      o.vy = m.vy;
      o.airborne = true;
      o.knocked = true;
      o.rope = null;
      o.chute = false;
    }
  }
  launchJump(t, t.facing * 0.6, -4.6, events);
  events.push({ t: 'punch', id: t.id, x: t.x + t.facing * 10, y: t.y });
}

function launchJump(t: Tardi, vx: number, vy: number, events: SimEvent[]): void {
  t.airborne = true;
  t.knocked = false;
  t.vx = vx;
  t.vy = vy;
  t.fallStartY = t.y;
  events.push({ t: 'jump', id: t.id });
}

function walk(s: WorldState, t: Tardi, dir: number): void {
  const terrain = s.terrain;
  const nx = t.x + dir * WALK_SPEED;
  let ny = -1;
  for (let k = 0; k <= MAX_STEP_UP; k++) {
    if (!circleCollides(terrain, nx, t.y - k, TARDI_R)) {
      ny = t.y - k;
      break;
    }
  }
  if (ny < 0) return; // wall
  // Snap down onto the ground if it slopes away.
  let grounded = false;
  for (let k = 1; k <= MAX_STEP_UP + 1; k++) {
    if (circleCollides(terrain, nx, ny + k, TARDI_R)) {
      ny = ny + k - 1;
      grounded = true;
      break;
    }
  }
  t.x = nx;
  t.y = ny;
  if (!grounded) {
    t.airborne = true;
    t.knocked = false;
    t.vx = dir * WALK_SPEED;
    t.vy = 0;
    t.fallStartY = t.y;
  }
}

function afterShot(s: WorldState, def: WeaponDef): void {
  const turn = s.turn;
  const team = activeTeam(s);
  turn.charging = false;
  turn.power = 0;
  turn.shotsLeft--;
  if (turn.shotsLeft === 0 && team.ammo[def.id] > 0) team.ammo[def.id]--;
  if (def.endsTurn) {
    endTurnNow(s);
  } else if (turn.shotsLeft <= 0 && turn.phase === 'aim') {
    turn.phase = 'retreat';
    // A walker keeps the turn going until it goes off (then normal retreat).
    const walker = def.projectile?.walker;
    turn.timer = (walker ? walker.fuseTicks : 0) + s.scheme.retreatTime * TICK_RATE;
  }
}

function spawnProjectile(
  s: WorldState,
  weapon: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  fuse: number,
  owner: number,
): Projectile {
  const p: Projectile = { id: s.nextId++, weapon, x, y, vx, vy, fuse, owner, age: 0, tx: 0, ty: 0, dir: 0, hits: 0 };
  s.projectiles.push(p);
  return p;
}

export function launchVelocity(
  spec: ProjectileSpec,
  facing: number,
  aim: number,
  power: number,
): { vx: number; vy: number } {
  const { dx, dy } = aimVector(facing, aim);
  const speed = (spec.speed * Math.max(power, 50)) / POWER_MAX;
  return { vx: dx * speed, vy: dy * speed };
}

function fireProjectile(s: WorldState, t: Tardi, def: WeaponDef, events: SimEvent[]): void {
  const spec = def.projectile!;
  const { vx, vy } = launchVelocity(spec, t.facing, s.turn.aim, s.turn.power);
  const fuse = spec.playerFuse ? s.turn.fuseSeconds * TICK_RATE : (spec.fuseTicks ?? -1);
  const p = spawnProjectile(s, def.id, t.x, t.y, vx, vy, fuse, t.id);
  if (spec.homing && s.turn.target) {
    p.tx = s.turn.target.x;
    p.ty = s.turn.target.y;
  }
  events.push({ t: 'fire', weapon: def.id, x: t.x, y: t.y });
}

/** Microscope Slide Slam: glass shards rain down all over the map. */
function slideShower(s: WorldState, t: Tardi, sh: { per1000: number; weapon: string }, events: SimEvent[]): void {
  const n = Math.round((sh.per1000 * s.terrain.w) / 1000);
  for (let i = 0; i < n; i++) {
    const x = rngInt(s.rng, 30, s.terrain.w - 30);
    const y = -40 - rngInt(s.rng, 0, 700);
    spawnProjectile(s, sh.weapon, x, y, (rngFloat(s.rng) - 0.5) * 2, 6, -1, t.id);
  }
  events.push({ t: 'fire', weapon: 'slideslam', x: t.x, y: 0 });
}

function fireWalker(s: WorldState, t: Tardi, def: WeaponDef, events: SimEvent[]): void {
  const w = def.projectile!.walker!;
  // Start just in front of the tardi, or on top of it if a wall is in the way.
  const x = circleCollides(s.terrain, t.x + t.facing * 10, t.y, WALKER_R) ? t.x : t.x + t.facing * 10;
  const p = spawnProjectile(s, def.id, x, t.y, 0, 0, w.fuseTicks, t.id);
  p.dir = t.facing;
  events.push({ t: 'fire', weapon: def.id, x: t.x, y: t.y });
}

/** Rotifer Roller: walks along the ground, hops over steps it can't climb. */
function stepWalker(s: WorldState, p: Projectile, speed: number, events: SimEvent[] | null): StepResult {
  const terrain = s.terrain;
  const grounded = circleCollides(terrain, p.x, p.y + 1, WALKER_R);
  if (grounded && p.vy >= 0) {
    p.vy = 0;
    const nx = p.x + p.dir * speed;
    let ny = -1;
    for (let k = 0; k <= 5; k++) {
      if (!circleCollides(terrain, nx, p.y - k, WALKER_R)) {
        ny = p.y - k;
        break;
      }
    }
    if (ny < 0) {
      p.vy = -4.5; // wall: hop
    } else {
      for (let k = 1; k <= 6; k++) {
        if (circleCollides(terrain, nx, ny + k, WALKER_R)) {
          ny = ny + k - 1;
          break;
        }
        if (k === 6) ny = ny + k; // walked off a ledge: start falling
      }
      p.x = nx;
      p.y = ny;
    }
  } else {
    p.vy = Math.min(MAX_FALL_SPEED, p.vy + GRAVITY);
    const vx = p.dir * speed * 0.8;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(p.vy))));
    for (let i = 0; i < steps; i++) {
      const nx = p.x + vx / steps;
      const ny = p.y + p.vy / steps;
      if (!circleCollides(terrain, nx, ny, WALKER_R)) {
        p.x = nx;
        p.y = ny;
        continue;
      }
      if (!circleCollides(terrain, p.x, ny, WALKER_R)) {
        p.y = ny; // blocked sideways only: keep falling/rising
        continue;
      }
      p.vy = 0; // landed or bumped head
      break;
    }
  }
  if (p.y >= s.waterY) {
    events?.push({ t: 'splash', x: p.x });
    return { k: 'gone' };
  }
  if (p.x < -60 || p.x > terrain.w + 60) return { k: 'gone' };
  return { k: 'alive' };
}

/** Trace an instant shot from a tardi along an aim. Read-only (used by the CPU too). */
export function traceHitscan(
  s: WorldState,
  t: Tardi,
  facing: number,
  aim: number,
  range: number,
): { x: number; y: number; hit: boolean } {
  const { dx, dy } = aimVector(facing, aim);
  let x = t.x;
  let y = t.y;
  let hit = false;
  for (let i = 0; i < range && !hit; i++) {
    x += dx;
    y += dy;
    if (x < 0 || x >= s.terrain.w || y < 0 || y >= s.waterY) break;
    if (isSolid(s.terrain, x, y)) hit = true;
    for (const o of s.tardis) {
      if (!o.alive || o.id === t.id) continue;
      const ox = o.x - x;
      const oy = o.y - y;
      if (ox * ox + oy * oy < TARDI_R * TARDI_R) hit = true;
    }
  }
  return { x, y, hit };
}

function fireHitscan(s: WorldState, t: Tardi, def: WeaponDef, events: SimEvent[]): void {
  const hs = def.hitscan!;
  const { x, y, hit } = traceHitscan(s, t, t.facing, s.turn.aim, hs.range);
  events.push({ t: 'fire', weapon: def.id, x: t.x, y: t.y });
  events.push({ t: 'shot', x0: t.x, y0: t.y, x1: x, y1: y });
  if (hit) explode(s, x, y, hs.radius, hs.damage, events);
}

function fireTargeted(s: WorldState, t: Tardi, def: WeaponDef, events: SimEvent[]): boolean {
  const target = s.turn.target!;
  if (def.id === 'teleport') {
    const { x, y } = target;
    if (x < TARDI_R || x > s.terrain.w - TARDI_R || y < TARDI_R || y > s.waterY - TARDI_R) return false;
    if (circleCollides(s.terrain, x, y, TARDI_R)) return false;
    t.x = x;
    t.y = y;
    t.vx = 0;
    t.vy = 0;
    t.airborne = true;
    t.knocked = false;
    t.fallStartY = y;
    events.push({ t: 'teleport', id: t.id, x, y });
    return true;
  }
  if (def.girder) {
    const rect = tryGirder(s, t, def, true);
    if (!rect) return false;
    events.push({ t: 'terrain', rect });
    return true;
  }
  if (def.projectile?.crusher) {
    // Dropped from high above the target, straight down.
    spawnProjectile(s, def.id, target.x, -60, 0, 4, -1, t.id);
    events.push({ t: 'fire', weapon: def.id, x: target.x, y: 0 });
    return true;
  }
  if (def.strike) {
    const st = def.strike;
    const dir = target.x < t.x ? -1 : 1;
    for (let i = 0; i < st.count; i++) {
      const ox = (i - (st.count - 1) / 2) * st.spacing;
      // Drops start offset so they arrive over the target.
      spawnProjectile(s, st.weapon, target.x + ox - dir * 60, -30 - i * 4, dir * 2, 5, -1, t.id);
    }
    events.push({ t: 'fire', weapon: def.id, x: target.x, y: 0 });
    return true;
  }
  return false;
}

/** Place (or with commit=false, just test) the active girder at the turn's target. */
function tryGirder(s: WorldState, t: Tardi, def: WeaponDef, commit: boolean): Rect | null {
  const g = def.girder!;
  const target = s.turn.target!;
  const { dx, dy } = aimVector(t.facing, s.turn.aim);
  // Never build a girder through a tardi.
  for (const o of s.tardis) {
    if (!o.alive) continue;
    const rx = o.x - target.x;
    const ry = o.y - target.y;
    const along = Math.max(-g.len / 2, Math.min(g.len / 2, rx * dx + ry * dy));
    const cx = rx - along * dx;
    const cy = ry - along * dy;
    if (cx * cx + cy * cy < (TARDI_R + g.thick / 2 + 1) * (TARDI_R + g.thick / 2 + 1)) return null;
  }
  return placeGirder(s.terrain, target.x, target.y, dx, dy, g.len, g.thick, commit);
}

/** Whether the selected girder would fit at the current target (for previews). */
export function girderFits(s: WorldState): boolean {
  const t = activeTardi(s);
  const def = WEAPONS[s.turn.weapon];
  if (!t || !def.girder || !s.turn.target) return false;
  return tryGirder(s, t, def, false) !== null;
}

// ---------------------------------------------------------------- projectiles

export type StepResult = { k: 'alive' } | { k: 'gone' } | { k: 'explode'; x: number; y: number };

/** Advance one projectile one tick. Pure apart from mutating `p` (and events). */
export function stepProjectile(s: WorldState, p: Projectile, events: SimEvent[] | null): StepResult {
  const spec = WEAPONS[p.weapon].projectile!;
  p.age++;
  if (p.fuse > 0 && --p.fuse === 0) return { k: 'explode', x: p.x, y: p.y };
  if (spec.walker) return stepWalker(s, p, spec.walker.speed, events);
  if (spec.homing && p.age > HOMING_START && p.age < HOMING_START + HOMING_TICKS) {
    // Steer towards the target instead of falling.
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1) {
      const speed = Math.max(8, Math.sqrt(p.vx * p.vx + p.vy * p.vy));
      p.vx = p.vx * 0.85 + (dx / d) * speed * 0.15;
      p.vy = p.vy * 0.85 + (dy / d) * speed * 0.15;
    }
  } else {
    p.vy += GRAVITY;
  }
  p.vx += s.wind * WIND_ACCEL * spec.windFactor;
  // The Concrete Tun is big: it hits things further from its centre.
  const size = spec.crusher ? CRUSHER_R : 2;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy))));
  const sx = p.vx / steps;
  const sy = p.vy / steps;
  for (let i = 0; i < steps; i++) {
    const nx = p.x + sx;
    const ny = p.y + sy;
    if (nx < -200 || nx > s.terrain.w + 200) return { k: 'gone' };
    if (ny >= s.waterY) {
      events?.push({ t: 'splash', x: nx });
      return { k: 'gone' };
    }
    if (spec.bounce === null) {
      for (const o of s.tardis) {
        if (!o.alive || (o.id === p.owner && p.age < 15)) continue;
        const dx = o.x - nx;
        const dy = o.y - ny;
        if (dx * dx + dy * dy < (TARDI_R + size) * (TARDI_R + size)) return { k: 'explode', x: nx, y: ny };
      }
      for (const o of s.objects) {
        if (o.kind === 'mine') continue;
        const dx = o.x - nx;
        const dy = o.y - ny;
        if (dx * dx + dy * dy < (CRATE_R + size) * (CRATE_R + size)) return { k: 'explode', x: nx, y: ny };
      }
    }
    if (circleCollides(s.terrain, nx, ny, size)) {
      if (spec.bounce === null) return { k: 'explode', x: nx, y: ny };
      const n = normalAt(s.terrain, nx, ny, 4);
      const dot = p.vx * n.nx + p.vy * n.ny;
      if (dot < 0) {
        p.vx = (p.vx - 2 * dot * n.nx) * spec.bounce;
        p.vy = (p.vy - 2 * dot * n.ny) * spec.bounce;
        if (dot < -2) events?.push({ t: 'bounce', x: p.x, y: p.y });
      }
      return { k: 'alive' };
    }
    p.x = nx;
    p.y = ny;
  }
  return { k: 'alive' };
}

function updateProjectiles(s: WorldState, events: SimEvent[]): void {
  const list = s.projectiles.slice();
  for (const p of list) {
    const r = stepProjectile(s, p, events);
    if (r.k === 'alive') continue;
    const crusher = WEAPONS[p.weapon].projectile!.crusher;
    if (r.k === 'explode' && crusher && ++p.hits < crusher.slams) {
      // Concrete Tun: blast a hole and keep smashing down through it.
      const spec = WEAPONS[p.weapon].projectile!;
      explode(s, r.x, r.y, spec.radius, spec.damage, events);
      p.x = r.x;
      p.y = r.y;
      p.vx = 0;
      p.vy = 3;
      continue;
    }
    s.projectiles.splice(s.projectiles.indexOf(p), 1);
    if (p.dir !== 0 && s.turn.phase === 'retreat') {
      // Walker is done: the usual short retreat follows.
      s.turn.timer = Math.min(s.turn.timer, s.scheme.retreatTime * TICK_RATE);
    }
    if (r.k === 'explode') {
      const spec = WEAPONS[p.weapon].projectile!;
      explode(s, r.x, r.y, spec.radius, spec.damage, events);
      if (spec.poison) poisonCloud(s, r.x, r.y, spec.poison, events);
      if (spec.fire) spillFlames(s, r.x, r.y, spec.fire.count, spec.fire.acid === true);
      if (spec.cluster) {
        for (let i = 0; i < spec.cluster.count; i++) {
          const vx = (rngFloat(s.rng) - 0.5) * 6;
          const vy = -3 - rngFloat(s.rng) * 3;
          spawnProjectile(s, spec.cluster.weapon, r.x, r.y - 4, vx, vy, -1, -1);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- explosions

export function explode(
  s: WorldState,
  x: number,
  y: number,
  radius: number,
  damage: number,
  events: SimEvent[],
): void {
  const rect = carveCircle(s.terrain, x, y, radius);
  events.push({ t: 'explosion', x, y, r: radius, rect });
  const reach = radius + TARDI_R;
  for (const t of s.tardis) {
    if (!t.alive) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= reach) continue;
    const f = 1 - d / reach;
    const dmg = Math.round(damage * (0.25 + 0.75 * f));
    const imp = f * damage * 0.11;
    const nx = d < 1 ? 0 : dx / d;
    const ny = d < 1 ? -1 : dy / d;
    t.vx += nx * imp;
    t.vy += ny * imp - imp * 0.35;
    t.airborne = true;
    t.knocked = true;
    t.rope = null;
    t.chute = false;
    t.pendingDmg += dmg;
    if (t.id === s.turn.activeTardi && inControl(s)) endTurnNow(s);
  }
  const hit = s.objects.slice();
  for (const o of hit) {
    if (!s.objects.includes(o)) continue;
    const dx = o.x - x;
    const dy = o.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const oreach = radius + objectRadius(o);
    if (d >= oreach) continue;
    const f = 1 - d / oreach;
    if (o.kind === 'crate') {
      // Crates break open; weapon crates go off with a small bang.
      s.objects.splice(s.objects.indexOf(o), 1);
      if (o.contents !== 'health') explode(s, o.x, o.y, 18, 15, events);
      continue;
    }
    if (o.kind === 'drum') {
      o.hp -= Math.round(damage * (0.25 + 0.75 * f));
      if (o.hp <= 0) {
        burstDrum(s, o, events);
        continue;
      }
    }
    if (o.kind === 'mine' && o.fuse === -1 && !o.dud) {
      o.fuse = 1; // chain reaction: blast sets mines off at once
    }
    const imp = f * damage * 0.1;
    o.vx += (d < 1 ? 0 : dx / d) * imp;
    o.vy += (d < 1 ? -1 : dy / d) * imp - imp * 0.35;
    o.airborne = true;
  }
  for (const p of s.projectiles) {
    const dx = p.x - x;
    const dy = p.y - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= reach || d < 1) continue;
    const imp = (1 - d / reach) * damage * 0.08;
    p.vx += (dx / d) * imp;
    p.vy += (dy / d) * imp;
  }
}

// ---------------------------------------------------------------- tardi physics

function updateTardi(s: WorldState, t: Tardi, events: SimEvent[]): void {
  const terrain = s.terrain;
  if (!t.airborne && !circleCollides(terrain, t.x, t.y + 1, TARDI_R)) {
    t.airborne = true;
    t.knocked = false;
    t.vx = 0;
    t.vy = 0;
    t.fallStartY = t.y;
  }
  if (!t.airborne) {
    checkOutOfBounds(s, t, events); // rising water reaches grounded tardis too
    return;
  }

  // Anchor blown away: a wrapped rope falls back to its previous corner, otherwise it's cut.
  while (t.rope && !circleCollides(terrain, t.rope.x, t.rope.y, 2)) {
    const prev = t.rope.bends.pop();
    if (!prev) {
      releaseRope(t);
      break;
    }
    const dx = t.rope.x - prev.x;
    const dy = t.rope.y - prev.y;
    t.rope.len = Math.min(ROPE_MAX, t.rope.len + Math.sqrt(dx * dx + dy * dy));
    t.rope.x = prev.x;
    t.rope.y = prev.y;
  }
  if (t.rope) {
    updateRope(s, t);
    checkOutOfBounds(s, t, events);
    return;
  }

  if (t.chute) {
    // Drift gently with the wind; never builds up fall damage.
    t.vy = Math.min(CHUTE_FALL, t.vy + GRAVITY * 0.3);
    t.vx = Math.max(-2, Math.min(2, t.vx + s.wind * 0.02));
    t.fallStartY = t.y;
  } else {
    t.vy = Math.min(MAX_FALL_SPEED, t.vy + GRAVITY);
  }
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(t.vx), Math.abs(t.vy))));
  const sx = t.vx / steps;
  const sy = t.vy / steps;
  for (let i = 0; i < steps; i++) {
    const nx = t.x + sx;
    const ny = t.y + sy;
    if (!circleCollides(terrain, nx, ny, TARDI_R)) {
      t.x = nx;
      t.y = ny;
      if (t.y < t.fallStartY) t.fallStartY = t.y;
      continue;
    }
    if (circleCollides(terrain, t.x, t.y, TARDI_R)) {
      // Embedded (e.g. terrain appeared around us): pop upwards.
      t.y -= 1;
      break;
    }
    const n = normalAt(terrain, nx, ny, TARDI_R + 2);
    const speed = Math.sqrt(t.vx * t.vx + t.vy * t.vy);
    const floor = n.ny < -0.55;
    // Slow contact with anything that isn't a ceiling also counts as resting,
    // so tardis wedged in steep crevices don't jitter forever.
    if ((floor && (!t.knocked || speed < 2.2)) || (speed < 1.2 && n.ny < 0.3)) {
      land(s, t);
      break;
    }
    const dot = t.vx * n.nx + t.vy * n.ny;
    if (dot < 0) {
      t.vx = (t.vx - 2 * dot * n.nx) * 0.35;
      t.vy = (t.vy - 2 * dot * n.ny) * 0.35;
    }
    if (floor) t.vx *= 0.7;
    break;
  }

  checkOutOfBounds(s, t, events);
}

function checkOutOfBounds(s: WorldState, t: Tardi, events: SimEvent[]): void {
  if (s.race && (t.y > s.waterY + 4 || t.x < -60 || t.x > s.terrain.w + 60)) {
    // Rope Race: a dunking just ends the attempt.
    events.push({ t: 'drown', id: t.id });
    placeAtStart(s, t);
    if (t.id === s.turn.activeTardi && inControl(s)) endTurnNow(s);
    return;
  }
  if (t.y > s.waterY + 4 || t.x < -60 || t.x > s.terrain.w + 60) {
    t.alive = false;
    t.rope = null;
    t.chute = false;
    t.hp = 0;
    t.pendingDmg = 0;
    events.push({ t: 'drown', id: t.id });
    if (t.id === s.turn.activeTardi) endTurnNow(s);
  }
}

/** A sensible weapon when the team's last one has run out (or isn't allowed). */
function firstUsable(team: Team): string {
  if (team.ammo.bazooka !== 0) return 'bazooka';
  return PANEL_WEAPONS.find((w) => w.id !== 'skip' && team.ammo[w.id] !== 0)?.id ?? 'skip';
}

/** Rope Race: put a tardi back on the start line. */
function placeAtStart(s: WorldState, t: Tardi): void {
  const r = s.race!;
  t.x = r.startX;
  t.y = r.startY;
  t.vx = 0;
  t.vy = 0;
  t.rope = null;
  t.chute = false;
  t.airborne = true;
  t.knocked = false;
  t.fallStartY = r.startY;
}

/** Rope Race: has the active tardi reached the flag? */
function checkFinish(s: WorldState, events: SimEvent[]): void {
  const r = s.race!;
  const t = activeTardi(s);
  if (!t || s.turn.phase !== 'aim') return;
  const dx = t.x - r.goalX;
  const dy = t.y - r.goalY;
  if (dx * dx + dy * dy > RACE_GOAL_R * RACE_GOAL_R) return;
  const ticks = s.scheme.turnTime * TICK_RATE - s.turn.timer;
  const prev = r.best[t.team];
  const best = prev < 0 || ticks < prev;
  if (best) r.best[t.team] = ticks;
  events.push({ t: 'finish', team: t.team, ticks, best });
  endTurnNow(s);
}

// ---------------------------------------------------------------- map objects

// ---------------------------------------------------------------- fire

function spillFlames(s: WorldState, x: number, y: number, count: number, acid: boolean): void {
  for (let i = 0; i < count; i++) {
    s.flames.push({
      id: s.nextId++,
      x,
      y: y - 3,
      vx: (rngFloat(s.rng) - 0.5) * 5,
      vy: -1 - rngFloat(s.rng) * 3,
      life: FLAME_LIFE - rngInt(s.rng, 0, 60),
      resting: false,
      acid,
    });
  }
}

/** Flames fall, settle, scorch the ground and hurt tardis standing in them. */
function updateFlames(s: WorldState, events: SimEvent[]): void {
  const terrain = s.terrain;
  for (const f of s.flames.slice()) {
    f.life--;
    if (!f.resting || !circleCollides(terrain, f.x, f.y + 2, 1)) {
      f.resting = false;
      f.vy = Math.min(8, f.vy + GRAVITY);
      f.vx += s.wind * WIND_ACCEL * 0.5;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(f.vx), Math.abs(f.vy))));
      for (let i = 0; i < steps; i++) {
        const nx = f.x + f.vx / steps;
        const ny = f.y + f.vy / steps;
        if (circleCollides(terrain, nx, ny, 1)) {
          f.resting = true;
          f.vx = 0;
          f.vy = 0;
          break;
        }
        f.x = nx;
        f.y = ny;
      }
    }
    if (f.y >= s.waterY || f.x < -50 || f.x > terrain.w + 50) f.life = 0; // doused
    if (f.resting && f.life > 0 && f.life % FLAME_CARVE_EVERY === 0) {
      const rect = carveCircle(terrain, f.x, f.y + 2, 2.5);
      events.push({ t: 'burn', x: f.x, y: f.y + 2, rect });
    }
    if (f.life > 0 && f.life % FLAME_BURN_EVERY === 0) {
      // Singe nearby tardis.
      for (const t of s.tardis) {
        if (!t.alive) continue;
        const dx = t.x - f.x;
        const dy = t.y - f.y;
        if (dx * dx + dy * dy < (FLAME_REACH + TARDI_R) * (FLAME_REACH + TARDI_R)) {
          t.pendingDmg += FLAME_DMG;
          if (t.id === s.turn.activeTardi && inControl(s)) endTurnNow(s);
        }
      }
    }
    if (f.life <= 0) s.flames.splice(s.flames.indexOf(f), 1);
  }
}

/** Poison gas: every tardi within the radius (with no wall check) gets poisoned. */
function poisonCloud(s: WorldState, x: number, y: number, r: number, events: SimEvent[]): void {
  for (const t of s.tardis) {
    if (!t.alive) continue;
    const dx = t.x - x;
    const dy = t.y - y;
    if (dx * dx + dy * dy < r * r) t.poison = true;
  }
  events.push({ t: 'gas', x, y, r });
}

function burstDrum(s: WorldState, o: MapObject, events: SimEvent[]): void {
  s.objects.splice(s.objects.indexOf(o), 1);
  explode(s, o.x, o.y, 36, 40, events);
  // Spray salty brine blobs that pop where they land.
  for (let i = 0; i < 6; i++) {
    const vx = (rngFloat(s.rng) - 0.5) * 7;
    const vy = -3 - rngFloat(s.rng) * 4;
    spawnProjectile(s, 'brine', o.x, o.y - 6, vx, vy, -1, -1);
  }
}

function dropCrate(s: WorldState, events: SimEvent[]): void {
  if (s.objects.filter((o) => o.kind === 'crate').length >= Math.round((5 * s.terrain.w) / 2000)) return;
  for (let tries = 0; tries < 50; tries++) {
    const x = rngInt(s.rng, 60, s.terrain.w - 60);
    const sy = surfaceBelow(s.terrain, x, 0);
    if (sy < 40 || sy > s.waterY - 30) continue;
    const o = newObject(s, 'crate', x, -20);
    o.airborne = true;
    o.chute = true;
    // Weapon crates only hold weapons this scheme allows.
    const allowed = CRATE_WEAPONS.filter((w) => !s.scheme.weapons || w in s.scheme.weapons);
    if (allowed.length === 0 || rngInt(s.rng, 0, 2) === 0) {
      o.contents = 'health';
      o.amount = 25;
    } else {
      o.contents = allowed[rngInt(s.rng, 0, allowed.length - 1)];
      o.amount = 1;
    }
    events.push({ t: 'crateDrop', id: o.id });
    return;
  }
}

function updateObjects(s: WorldState, events: SimEvent[]): void {
  for (const o of s.objects.slice()) {
    if (!s.objects.includes(o)) continue;
    const r = objectRadius(o);

    // Mines: arm when a tardi comes close, then count down.
    if (o.kind === 'mine') {
      if (o.fuse === -1 && !o.airborne) {
        for (const t of s.tardis) {
          if (!t.alive) continue;
          const dx = t.x - o.x;
          const dy = t.y - o.y;
          if (dx * dx + dy * dy < MINE_TRIGGER * MINE_TRIGGER) {
            o.fuse = s.scheme.mineFuse * TICK_RATE;
            events.push({ t: 'mineArmed', id: o.id });
            break;
          }
        }
      }
      if (o.fuse > 0 && --o.fuse === 0) {
        if (o.dud) {
          o.fuse = -2;
          events.push({ t: 'dud', id: o.id });
        } else {
          s.objects.splice(s.objects.indexOf(o), 1);
          explode(s, o.x, o.y, 30, 45, events);
          continue;
        }
      }
    }

    // Crates: collected by whoever walks into them.
    if (o.kind === 'crate' && !o.chute) {
      const taker = s.tardis.find((t) => {
        if (!t.alive) return false;
        const dx = t.x - o.x;
        const dy = t.y - o.y;
        return dx * dx + dy * dy < (TARDI_R + CRATE_R + 2) * (TARDI_R + CRATE_R + 2);
      });
      if (taker) {
        s.objects.splice(s.objects.indexOf(o), 1);
        if (o.contents === 'health') {
          taker.hp += o.amount;
          taker.poison = false; // health crates cure poison
        }
        else {
          const ammo = s.teams[taker.team].ammo;
          if (ammo[o.contents] >= 0) ammo[o.contents] += o.amount;
        }
        events.push({ t: 'collect', id: o.id, tardi: taker.id, contents: o.contents, amount: o.amount });
        continue;
      }
    }

    // Physics
    if (!o.airborne && !circleCollides(s.terrain, o.x, o.y + 1, r)) o.airborne = true;
    if (o.airborne) {
      if (o.chute) {
        o.vy = CRATE_FALL;
        o.vx = s.wind * 0.6;
      } else {
        o.vy = Math.min(MAX_FALL_SPEED, o.vy + GRAVITY);
      }
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(o.vx), Math.abs(o.vy))));
      for (let i = 0; i < steps; i++) {
        const nx = o.x + o.vx / steps;
        const ny = o.y + o.vy / steps;
        if (!circleCollides(s.terrain, nx, ny, r)) {
          o.x = nx;
          o.y = ny;
          continue;
        }
        const n = normalAt(s.terrain, nx, ny, r + 2);
        const speed = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
        if ((n.ny < -0.5 && speed < 2.5) || speed < 1.2 || o.chute) {
          o.airborne = false;
          o.chute = false;
          o.vx = 0;
          o.vy = 0;
        } else {
          const dot = o.vx * n.nx + o.vy * n.ny;
          if (dot < 0) {
            o.vx = (o.vx - 2 * dot * n.nx) * 0.3;
            o.vy = (o.vy - 2 * dot * n.ny) * 0.3;
          }
        }
        break;
      }
    }
    if (o.y > s.waterY + 2 || o.x < -60 || o.x > s.terrain.w + 60) {
      s.objects.splice(s.objects.indexOf(o), 1);
      events.push({ t: 'splash', x: o.x });
    }
  }
}

function updateRope(s: WorldState, t: Tardi): void {
  const terrain = s.terrain;
  const rope = t.rope!;
  t.vy += GRAVITY;
  t.vx *= 0.996;
  t.vy *= 0.996;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(t.vx), Math.abs(t.vy))));
  const sx = t.vx / steps;
  const sy = t.vy / steps;
  for (let i = 0; i < steps; i++) {
    const nx = t.x + sx;
    const ny = t.y + sy;
    if (!circleCollides(terrain, nx, ny, TARDI_R)) {
      t.x = nx;
      t.y = ny;
      continue;
    }
    // Bump off walls while swinging.
    const n = normalAt(terrain, nx, ny, TARDI_R + 2);
    const dot = t.vx * n.nx + t.vy * n.ny;
    if (dot < 0) {
      t.vx = (t.vx - 2 * dot * n.nx) * 0.4;
      t.vy = (t.vy - 2 * dot * n.ny) * 0.4;
    }
    break;
  }
  wrapRope(terrain, t, rope);
  // Keep within rope length: pull back onto the circle and remove outward speed.
  const dx = t.x - rope.x;
  const dy = t.y - rope.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > rope.len && d > 0) {
    const ux = dx / d;
    const uy = dy / d;
    const px = rope.x + ux * rope.len;
    const py = rope.y + uy * rope.len;
    if (!circleCollides(terrain, px, py, TARDI_R)) {
      t.x = px;
      t.y = py;
    } else {
      rope.len = Math.min(ROPE_MAX, d); // blocked: let the rope pay out instead
    }
    const vr = t.vx * ux + t.vy * uy;
    if (vr > 0) {
      t.vx -= vr * ux;
      t.vy -= vr * uy;
    }
  }
}

/** First solid point on the line a→b (skipping the ends), or null if clear. */
function lineBlocked(terrain: Terrain, ax: number, ay: number, bx: number, by: number): { x: number; y: number; fx: number; fy: number } | null {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 6) return null;
  const ux = dx / d;
  const uy = dy / d;
  for (let k = 3; k < d - 3; k++) {
    const x = ax + ux * k;
    const y = ay + uy * k;
    if (isSolid(terrain, x, y)) return { x, y, fx: x - ux, fy: y - uy };
  }
  return null;
}

/** Wrap the Silk Rope round corners it swings into, and unwrap when it swings back. */
function wrapRope(terrain: Terrain, t: Tardi, rope: NonNullable<Tardi['rope']>): void {
  for (let n = 0; n < 3; n++) {
    // Unwrap: the rope has swung back past the last corner and can see the pivot before it.
    const prev = rope.bends[rope.bends.length - 1];
    if (prev) {
      const cross = (rope.x - prev.x) * (t.y - rope.y) - (rope.y - prev.y) * (t.x - rope.x);
      if (cross * prev.side <= 0 && !lineBlocked(terrain, prev.x, prev.y, t.x, t.y)) {
        const sx = rope.x - prev.x;
        const sy = rope.y - prev.y;
        rope.len = Math.min(ROPE_MAX, rope.len + Math.sqrt(sx * sx + sy * sy));
        rope.x = prev.x;
        rope.y = prev.y;
        rope.bends.pop();
        continue;
      }
    }
    // Wrap: something is between the pivot and the tardi; the rope catches on it.
    const hit = lineBlocked(terrain, rope.x, rope.y, t.x, t.y);
    if (!hit || rope.bends.length >= ROPE_BENDS_MAX) return;
    const sx = hit.fx - rope.x;
    const sy = hit.fy - rope.y;
    const used = Math.sqrt(sx * sx + sy * sy);
    if (used < 2) return;
    const side = (hit.fx - rope.x) * (t.y - hit.fy) - (hit.fy - rope.y) * (t.x - hit.fx);
    rope.bends.push({ x: rope.x, y: rope.y, side: side < 0 ? -1 : 1 });
    rope.x = hit.fx;
    rope.y = hit.fy;
    rope.len = Math.max(ROPE_MIN, rope.len - used);
  }
}

function land(s: WorldState, t: Tardi): void {
  t.chute = false;
  if (!t.knocked && s.scheme.fallDamage) {
    const fall = t.y - t.fallStartY;
    if (fall > SAFE_FALL) {
      t.pendingDmg += Math.min(50, Math.round((fall - SAFE_FALL) / 3));
      if (t.id === s.turn.activeTardi) endTurnNow(s);
    }
  }
  t.airborne = false;
  t.knocked = false;
  t.vx = 0;
  t.vy = 0;
}

// ---------------------------------------------------------------- turn flow

function updateSettle(s: WorldState, events: SimEvent[]): void {
  const turn = s.turn;
  if (++turn.settleTotal > SETTLE_MAX) {
    s.projectiles.length = 0;
    s.flames.length = 0;
    for (const t of s.tardis) if (t.alive && t.airborne) land(s, t);
  }
  const moving =
    s.projectiles.length > 0 ||
    s.tardis.some((t) => t.alive && t.airborne) ||
    s.objects.some((o) => (o.airborne && !o.chute) || o.fuse > 0) ||
    s.flames.length > 0;
  if (moving) {
    turn.settleTimer = 0;
    return;
  }
  if (++turn.settleTimer < SETTLE_DELAY) return;

  const hurt = s.tardis.filter((t) => t.alive && t.pendingDmg > 0);
  if (hurt.length > 0) {
    for (const t of hurt) {
      t.hp = Math.max(0, t.hp - t.pendingDmg);
      events.push({ t: 'damage', id: t.id, amount: t.pendingDmg });
      t.pendingDmg = 0;
    }
    for (const t of hurt) {
      if (t.hp <= 0) {
        t.alive = false;
        events.push({ t: 'death', id: t.id });
        explode(s, t.x, t.y, 20, 10, events);
      }
    }
    turn.settleTimer = 0;
    return;
  }

  if (s.race && turn.turnNumber >= s.teams.length * s.scheme.raceRounds) {
    // Rope Race over: the fastest best time wins; a tie for fastest is a draw.
    const times = s.race.best.filter((b) => b >= 0);
    const fastest = times.length > 0 ? Math.min(...times) : -1;
    const leaders = s.race.best.filter((b) => b === fastest && b >= 0).length;
    const winner = leaders === 1 ? s.race.best.indexOf(fastest) : -1;
    turn.phase = 'gameover';
    turn.winner = winner;
    events.push({ t: 'gameover', winner });
    return;
  }
  const alive = s.teams.filter((tm) => s.tardis.some((t) => t.alive && t.team === tm.id));
  if (alive.length <= 1) {
    turn.phase = 'gameover';
    turn.winner = alive.length === 1 ? alive[0].id : -1;
    events.push({ t: 'gameover', winner: turn.winner });
    return;
  }
  let next = turn.teamIdx;
  do {
    next = (next + 1) % s.teams.length;
  } while (!alive.includes(s.teams[next]));
  beginTurn(s, next, events);
}

function beginTurn(s: WorldState, teamIdx: number, events: SimEvent[]): void {
  const team = s.teams[teamIdx];
  const ids = team.tardiIds;
  let tardiId = -1;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[(team.nextIdx + i) % ids.length];
    if (getTardi(s, id)?.alive) {
      tardiId = id;
      team.nextIdx = (team.nextIdx + i + 1) % ids.length;
      break;
    }
  }
  const turn = s.turn;
  turn.teamIdx = teamIdx;
  turn.activeTardi = tardiId;
  turn.phase = 'start';
  turn.timer = START_TICKS;
  turn.turnNumber++;
  turn.weapon = team.ammo[team.weapon] !== 0 ? team.weapon : firstUsable(team);
  turn.shotsLeft = WEAPONS[turn.weapon].shots;
  turn.power = 0;
  turn.charging = false;
  turn.jumpTimer = 0;
  turn.target = null;
  turn.settleTimer = 0;
  turn.aim = 256;
  turn.aimHeld = 0;
  if (s.race) {
    // Every attempt starts from the start line.
    const t = getTardi(s, tardiId);
    if (t) placeAtStart(s, t);
  }
  s.wind = (rngInt(s.rng, -100, 100) / 100) * s.scheme.windMax;
  events.push({ t: 'turnStart', team: team.id, tardi: tardiId });

  // Poison bites at the start of every turn, but never kills on its own.
  for (const t of s.tardis) {
    if (!t.alive || !t.poison) continue;
    const dmg = Math.min(POISON_DMG, t.hp - 1);
    if (dmg > 0) {
      t.hp -= dmg;
      events.push({ t: 'damage', id: t.id, amount: dmg });
    }
  }

  if (!s.suddenDeath && s.roundTicks >= s.scheme.roundTime * 60 * TICK_RATE) {
    s.suddenDeath = true;
    for (const t of s.tardis) if (t.alive) t.hp = 1;
    events.push({ t: 'suddenDeath' });
  } else if (s.suddenDeath) {
    s.waterY = Math.max(60, s.waterY - s.scheme.waterRise);
    events.push({ t: 'waterRise', y: s.waterY });
  }
  if (turn.turnNumber > 1 && rngFloat(s.rng) < s.scheme.crateChance) dropCrate(s, events);
}

// ---------------------------------------------------------------- hashing

/** FNV-1a hash of the whole simulation state, for determinism checks. */
export function hashWorld(s: WorldState): number {
  let h = 0x811c9dc5;
  const f64 = new Float64Array(1);
  const u32 = new Uint32Array(f64.buffer);
  const mixInt = (v: number) => {
    h ^= v >>> 0;
    h = Math.imul(h, 0x01000193);
  };
  const mix = (v: number) => {
    f64[0] = v;
    mixInt(u32[0]);
    mixInt(u32[1]);
  };
  const mixStr = (v: string) => {
    mixInt(v.length);
    for (let i = 0; i < v.length; i++) mixInt(v.charCodeAt(i));
  };
  mix(s.tick);
  mixInt(s.rng.a);
  mix(s.wind);
  for (const t of s.tardis) {
    mix(t.x); mix(t.y); mix(t.vx); mix(t.vy); mix(t.hp); mix(t.pendingDmg);
    mix(t.alive ? 1 : 0); mix(t.facing); mix(t.airborne ? 1 : 0); mix(t.chute ? 1 : 0);
    mix(t.knocked ? 1 : 0); mix(t.fallStartY); mix(t.poison ? 1 : 0);
    if (t.rope) {
      mix(t.rope.x); mix(t.rope.y); mix(t.rope.len);
      for (const b of t.rope.bends) { mix(b.x); mix(b.y); mix(b.side); }
    }
  }
  for (const p of s.projectiles) {
    mix(p.x); mix(p.y); mix(p.vx); mix(p.vy); mix(p.fuse); mix(p.tx); mix(p.ty); mix(p.dir); mix(p.hits);
  }
  for (const o of s.objects) {
    mix(o.id); mix(o.x); mix(o.y); mix(o.vx); mix(o.vy); mix(o.fuse); mix(o.hp);
    mixStr(o.kind); mix(o.dud ? 1 : 0); mix(o.airborne ? 1 : 0); mix(o.chute ? 1 : 0);
    mixStr(o.contents); mix(o.amount);
  }
  for (const f of s.flames) {
    mix(f.x); mix(f.y); mix(f.vx); mix(f.vy); mix(f.life); mix(f.resting ? 1 : 0); mix(f.acid ? 1 : 0);
  }
  mix(s.waterY); mix(s.roundTicks); mix(s.suddenDeath ? 1 : 0); mix(s.nextId);
  if (s.race) for (const b of s.race.best) mix(b);
  const tr = s.turn;
  mix(tr.timer); mix(tr.teamIdx); mix(tr.activeTardi); mix(tr.aim); mix(tr.power);
  const m = s.terrain.mask;
  for (let i = 0; i < m.length; i += 4) {
    mixInt(m[i] | (m[i + 1] << 8) | (m[i + 2] << 16) | (m[i + 3] << 24));
  }
  return h >>> 0;
}
