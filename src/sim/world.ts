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
import { carveCircle, circleCollides, isSolid, normalAt, surfaceBelow } from './terrain/terrain';
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
  type Projectile,
  type Scheme,
  type SimEvent,
  type Tardi,
  type Team,
  type WorldState,
} from './types';
import { WEAPONS, type ProjectileSpec, type WeaponDef } from './weapons';

export const GRAVITY = 0.22;
export const TARDI_R = 7;
export const WALK_SPEED = 0.75;
export const AIM_STEP = 12;
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
/** Hard cap on end-of-turn settling so a turn can never soft-lock. */
const SETTLE_MAX = 20 * TICK_RATE;

export interface TeamConfig {
  name: string;
  color: number;
  cpu: boolean;
  names?: string[];
}

export interface WorldConfig {
  seed: number;
  teams: TeamConfig[];
  scheme?: Partial<Scheme>;
  mapW?: number;
  mapH?: number;
}

const DEFAULT_NAMES = [
  'Waddles', 'Tun', 'Mossy', 'Pudge', 'Cuticle', 'Stylet', 'Bubbles', 'Nibs',
  'Squish', 'Clawdia', 'Dewdrop', 'Gristle', 'Puddles', 'Lichen', 'Bramble', 'Pip',
];

// ---------------------------------------------------------------- creation

export function createWorld(cfg: WorldConfig): WorldState {
  const scheme: Scheme = { ...DEFAULT_SCHEME, ...cfg.scheme };
  const w = cfg.mapW ?? 2000;
  const h = cfg.mapH ?? 1000;
  const waterY = h - 70;
  const needed = cfg.teams.length * scheme.tardisPerTeam;

  // Retry seeds until the map has room for every tardi.
  for (let attempt = 0; attempt < 50; attempt++) {
    const seed = (cfg.seed + attempt * 7919) | 0;
    const terrain = generateMap({ w, h, waterY, seed });
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
      teams: [],
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
      },
      nextId: 1,
      prevHeld: 0,
      scheme,
    };

    cfg.teams.forEach((tc, ti) => {
      const ammo: Record<string, number> = {};
      for (const def of Object.values(WEAPONS)) ammo[def.id] = def.ammo;
      const team: Team = { id: ti, name: tc.name, color: tc.color, cpu: tc.cpu, tardiIds: [], nextIdx: 0, weapon: 'bazooka', ammo };
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
        };
        s.tardis.push(t);
        team.tardiIds.push(t.id);
      }
    }
    s.turn.teamIdx = rngInt(rng, 0, s.teams.length - 1);
    beginTurn(s, s.turn.teamIdx, []);
    return s;
  }
  throw new Error('Could not generate a map with enough room');
}

function findSpawns(
  terrain: WorldState['terrain'],
  waterY: number,
  count: number,
  rng: WorldState['rng'],
): { x: number; y: number }[] | null {
  const spots: { x: number; y: number }[] = [];
  for (let tries = 0; tries < 2000 && spots.length < count; tries++) {
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

  updateProjectiles(s, events);
  for (const t of s.tardis) if (t.alive) updateTardi(s, t, events);

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
      if (def.kind === 'target') turn.target = { x: cmd.x, y: cmd.y };
    } else if (cmd.t === 'skip') {
      endTurnNow(s);
      return;
    }
  }

  // Jump / backflip: a second press within the delay turns a jump into a backflip.
  if ((input.pressed & PRESS_JUMP) !== 0 && !t.airborne && !turn.charging) {
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
    walk(s, t, dir);
  }

  if (!aiming) return;

  // Aiming
  if ((held & BTN_UP) !== 0) turn.aim = Math.min(AIM_MAX, turn.aim + AIM_STEP);
  if ((held & BTN_DOWN) !== 0) turn.aim = Math.max(-AIM_MAX, turn.aim - AIM_STEP);

  // Firing
  if (t.airborne || turn.shotsLeft <= 0 || team.ammo[def.id] === 0) return;
  switch (def.kind) {
    case 'charge':
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
    case 'instant':
      if (fireEdge) afterShot(s, def);
      break;
  }
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
    turn.timer = s.scheme.retreatTime * TICK_RATE;
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
  const p: Projectile = { id: s.nextId++, weapon, x, y, vx, vy, fuse, owner, age: 0 };
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
  const fuse = spec.playerFuse ? s.turn.fuseSeconds * TICK_RATE : -1;
  spawnProjectile(s, def.id, t.x, t.y, vx, vy, fuse, t.id);
  events.push({ t: 'fire', weapon: def.id, x: t.x, y: t.y });
}

function fireHitscan(s: WorldState, t: Tardi, def: WeaponDef, events: SimEvent[]): void {
  const hs = def.hitscan!;
  const { dx, dy } = aimVector(t.facing, s.turn.aim);
  let x = t.x;
  let y = t.y;
  let hit = false;
  for (let i = 0; i < hs.range && !hit; i++) {
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

// ---------------------------------------------------------------- projectiles

export type StepResult = { k: 'alive' } | { k: 'gone' } | { k: 'explode'; x: number; y: number };

/** Advance one projectile one tick. Pure apart from mutating `p` (and events). */
export function stepProjectile(s: WorldState, p: Projectile, events: SimEvent[] | null): StepResult {
  const spec = WEAPONS[p.weapon].projectile!;
  p.age++;
  if (p.fuse > 0 && --p.fuse === 0) return { k: 'explode', x: p.x, y: p.y };
  p.vy += GRAVITY;
  p.vx += s.wind * WIND_ACCEL * spec.windFactor;
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
        if (dx * dx + dy * dy < (TARDI_R + 2) * (TARDI_R + 2)) return { k: 'explode', x: nx, y: ny };
      }
    }
    if (circleCollides(s.terrain, nx, ny, 2)) {
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
    s.projectiles.splice(s.projectiles.indexOf(p), 1);
    if (r.k === 'explode') {
      const spec = WEAPONS[p.weapon].projectile!;
      explode(s, r.x, r.y, spec.radius, spec.damage, events);
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
    t.pendingDmg += dmg;
    if (t.id === s.turn.activeTardi && inControl(s)) endTurnNow(s);
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
  if (!t.airborne) return;

  t.vy = Math.min(MAX_FALL_SPEED, t.vy + GRAVITY);
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

  if (t.y > s.waterY + 4 || t.x < -60 || t.x > terrain.w + 60) {
    t.alive = false;
    t.hp = 0;
    t.pendingDmg = 0;
    events.push({ t: 'drown', id: t.id });
    if (t.id === s.turn.activeTardi) endTurnNow(s);
  }
}

function land(s: WorldState, t: Tardi): void {
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
    for (const t of s.tardis) if (t.alive && t.airborne) land(s, t);
  }
  const moving = s.projectiles.length > 0 || s.tardis.some((t) => t.alive && t.airborne);
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
  turn.weapon = team.ammo[team.weapon] === 0 ? 'bazooka' : team.weapon;
  turn.shotsLeft = WEAPONS[turn.weapon].shots;
  turn.power = 0;
  turn.charging = false;
  turn.jumpTimer = 0;
  turn.target = null;
  turn.settleTimer = 0;
  turn.aim = 256;
  s.wind = (rngInt(s.rng, -100, 100) / 100) * s.scheme.windMax;
  events.push({ t: 'turnStart', team: team.id, tardi: tardiId });
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
  mix(s.tick);
  mixInt(s.rng.a);
  mix(s.wind);
  for (const t of s.tardis) {
    mix(t.x); mix(t.y); mix(t.vx); mix(t.vy); mix(t.hp); mix(t.pendingDmg);
    mix(t.alive ? 1 : 0); mix(t.facing); mix(t.airborne ? 1 : 0);
  }
  for (const p of s.projectiles) {
    mix(p.x); mix(p.y); mix(p.vx); mix(p.vy); mix(p.fuse);
  }
  const tr = s.turn;
  mix(tr.timer); mix(tr.teamIdx); mix(tr.activeTardi); mix(tr.aim); mix(tr.power);
  const m = s.terrain.mask;
  for (let i = 0; i < m.length; i += 4) {
    mixInt(m[i] | (m[i + 1] << 8) | (m[i + 2] << 16) | (m[i + 3] << 24));
  }
  return h >>> 0;
}
