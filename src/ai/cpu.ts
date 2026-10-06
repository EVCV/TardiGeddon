// CPU opponent. Picks a shot by simulating candidate throws against the
// current state, then "presses buttons" through the normal input path.
// Runs only on one machine (host) — its inputs are what get replayed.

import { cloneWorld, launchVelocity, stepProjectile, activeTardi, traceHitscan, TARDI_R, AIM_STEP } from '../sim/world';
import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, EMPTY_INPUT, TICK_RATE, type InputFrame, type Projectile, type WorldState } from '../sim/types';
import { WEAPONS } from '../sim/weapons';

interface Plan {
  weapon: string;
  facing: 1 | -1;
  aim: number;
  power: number;
  fuse: number;
  /** Map target for targeted weapons (Concrete Tun). */
  target?: { x: number; y: number };
}

export class CpuPlayer {
  private plan: Plan | null = null;
  private planTurn = -1;
  private think = 0;
  private step: 'face' | 'weapon' | 'aim' | 'charge' | 'done' = 'face';
  private tapped = false;

  constructor(private readonly accuracy = 0.85) {}

  next(s: WorldState): InputFrame {
    const turn = s.turn;
    if (turn.phase !== 'aim') return EMPTY_INPUT;
    const t = activeTardi(s);
    if (!t || t.airborne) return EMPTY_INPUT;

    if (this.planTurn !== turn.turnNumber) {
      this.planTurn = turn.turnNumber;
      this.plan = choosePlan(s, this.accuracy);
      this.think = 40;
      this.step = 'face';
    }
    if (this.think > 0) {
      this.think--;
      return EMPTY_INPUT;
    }
    const p = this.plan;
    if (!p) return { held: 0, pressed: 0, cmd: { t: 'skip' } };

    switch (this.step) {
      case 'face':
        this.step = 'weapon';
        if (t.facing !== p.facing) return { held: p.facing === 1 ? BTN_RIGHT : BTN_LEFT, pressed: 0 };
        return EMPTY_INPUT;
      case 'weapon':
        this.step = 'aim';
        if (turn.weapon !== p.weapon) return { held: 0, pressed: 0, cmd: { t: 'weapon', id: p.weapon } };
        return { held: 0, pressed: 0, cmd: { t: 'fuse', s: p.fuse } };
      case 'aim': {
        const diff = p.aim - turn.aim;
        if (Math.abs(diff) >= AIM_STEP) return { held: diff > 0 ? BTN_UP : BTN_DOWN, pressed: 0 };
        this.step = 'charge';
        return { held: 0, pressed: 0, cmd: { t: 'fuse', s: p.fuse } };
      }
      case 'charge':
        if (WEAPONS[p.weapon].kind === 'hitscan') {
          // Tap fire for each shot (the shotgun has two), releasing in between.
          this.tapped = !this.tapped;
          return this.tapped ? { held: BTN_FIRE, pressed: 0 } : EMPTY_INPUT;
        }
        if (WEAPONS[p.weapon].kind === 'target' && p.target) {
          if (!turn.target) return { held: 0, pressed: 0, cmd: { t: 'target', x: p.target.x, y: p.target.y } };
          this.step = 'done';
          return { held: BTN_FIRE, pressed: 0 };
        }
        if (WEAPONS[p.weapon].kind === 'instant') {
          this.step = 'done';
          return { held: BTN_FIRE, pressed: 0 };
        }
        if (turn.charging && turn.power >= p.power) {
          this.step = 'done';
          return EMPTY_INPUT; // release
        }
        return { held: BTN_FIRE, pressed: 0 };
      case 'done':
        return EMPTY_INPUT;
    }
  }
}

function choosePlan(s: WorldState, accuracy: number): Plan | null {
  const me = activeTardi(s);
  if (!me) return null;
  const sim = cloneWorld(s);
  let best: Plan | null = null;
  let bestScore = 0;

  const ammo = s.teams[me.team].ammo;
  const usable = (w: string) => ammo[w] !== 0;
  // Thrown weapons the CPU can plan: simulate each candidate throw.
  for (const weapon of ['bazooka', 'grenade', 'cluster', 'mortar', 'holywater'].filter(usable)) {
    const spec = WEAPONS[weapon].projectile!;
    for (const facing of [1, -1] as const) {
      // Aim is reached in AIM_STEP increments from the turn's start aim.
      for (let aim = s.turn.aim - AIM_STEP * 80; aim <= s.turn.aim + AIM_STEP * 50; aim += AIM_STEP * 6) {
        if (aim < -1024 || aim > 1024) continue;
        for (let power = 300; power <= 1000; power += 100) {
          const fuse = 3;
          const hit = predict(sim, weapon, me.x, me.y, facing, aim, power, fuse * TICK_RATE, me.id);
          if (!hit) continue;
          const score = scoreHit(s, hit.x, hit.y, spec.radius, spec.damage, me.team);
          if (score > bestScore) {
            bestScore = score;
            best = { weapon, facing, aim, power, fuse };
          }
        }
      }
    }
  }
  // Instant-shot weapons: trace the line for each aim.
  for (const weapon of ['shotgun'].filter(usable)) {
    const hs = WEAPONS[weapon].hitscan!;
    for (const facing of [1, -1] as const) {
      for (let aim = s.turn.aim - AIM_STEP * 80; aim <= s.turn.aim + AIM_STEP * 50; aim += AIM_STEP * 2) {
        if (aim < -1024 || aim > 1024) continue;
        const shot = traceHitscan(sim, me, facing, aim, hs.range);
        if (!shot.hit) continue;
        const score = scoreHit(s, shot.x, shot.y, hs.radius, hs.damage, me.team) * WEAPONS[weapon].shots;
        if (score > bestScore) {
          bestScore = score;
          best = { weapon, facing, aim, power: 0, fuse: 3 };
        }
      }
    }
  }
  // Concrete Tun: dropped straight onto an enemy, slamming it several times.
  if (usable('tun')) {
    const spec = WEAPONS.tun.projectile!;
    for (const e of s.tardis) {
      if (!e.alive || e.team === me.team) continue;
      const score = scoreHit(s, e.x, e.y, spec.radius, spec.damage * 2, me.team);
      if (score > bestScore) {
        bestScore = score;
        best = { weapon: 'tun', facing: me.facing === 1 ? 1 : -1, aim: s.turn.aim, power: 0, fuse: 3, target: { x: Math.round(e.x), y: Math.round(e.y) } };
      }
    }
  }
  // Microscope Slide Slam: worth it when there are lots of enemies to rain on.
  if (usable('slideslam')) {
    let score = 0;
    for (const t of s.tardis) if (t.alive) score += t.team === me.team ? -15 : 12;
    if (score > bestScore) {
      bestScore = score;
      best = { weapon: 'slideslam', facing: me.facing === 1 ? 1 : -1, aim: s.turn.aim, power: 0, fuse: 3 };
    }
  }
  if (best && accuracy < 1 && WEAPONS[best.weapon].kind === 'charge') {
    // Humanise: wobble the power a little.
    const wobble = Math.round((1 - accuracy) * 200 * (Math.random() - 0.5));
    best.power = Math.max(100, Math.min(1000, best.power + wobble));
  }
  return best;
}

function predict(
  s: WorldState,
  weapon: string,
  x: number,
  y: number,
  facing: number,
  aim: number,
  power: number,
  fuseTicks: number,
  owner: number,
): { x: number; y: number } | null {
  const spec = WEAPONS[weapon].projectile!;
  const { vx, vy } = launchVelocity(spec, facing, aim, power);
  const p: Projectile = { id: -1, weapon, x, y, vx, vy, fuse: spec.playerFuse ? fuseTicks : (spec.fuseTicks ?? -1), owner, age: 0, tx: 0, ty: 0, dir: 0, hits: 0 };
  for (let i = 0; i < 400; i++) {
    const r = stepProjectile(s, p, null);
    if (r.k === 'gone') return null;
    if (r.k === 'explode') return r;
  }
  return null;
}

function scoreHit(s: WorldState, x: number, y: number, radius: number, damage: number, myTeam: number): number {
  let score = 0;
  const reach = radius + TARDI_R;
  for (const t of s.tardis) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d >= reach) continue;
    const dmg = damage * (0.25 + 0.75 * (1 - d / reach));
    const lethal = dmg >= t.hp ? 30 : 0;
    score += t.team === myTeam ? -(dmg + lethal) * 1.5 : dmg + lethal;
  }
  return score;
}
