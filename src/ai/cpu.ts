// CPU opponent. Picks a shot by simulating candidate throws against the
// current state, then "presses buttons" through the normal input path.
// Runs only on one machine (host) — its inputs are what get replayed.

import { cloneWorld, launchVelocity, stepProjectile, activeTardi, TARDI_R, AIM_STEP } from '../sim/world';
import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, EMPTY_INPUT, TICK_RATE, type InputFrame, type Projectile, type WorldState } from '../sim/types';
import { WEAPONS } from '../sim/weapons';

interface Plan {
  weapon: string;
  facing: 1 | -1;
  aim: number;
  power: number;
  fuse: number;
}

export class CpuPlayer {
  private plan: Plan | null = null;
  private planTurn = -1;
  private think = 0;
  private step: 'face' | 'weapon' | 'aim' | 'charge' | 'done' = 'face';

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

  for (const weapon of ['bazooka', 'grenade']) {
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
  if (best && accuracy < 1) {
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
  const p: Projectile = { id: -1, weapon, x, y, vx, vy, fuse: spec.playerFuse ? fuseTicks : -1, owner, age: 0 };
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
