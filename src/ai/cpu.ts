// CPU opponent. Picks a shot by simulating candidate throws against the
// current state, then "presses buttons" through the normal input path.
// Runs only on one machine (host) — its inputs are what get replayed.

import { cloneWorld, launchVelocity, stepProjectile, activeTardi, traceHitscan, TARDI_R, AIM_STEP, POWER_STEP } from '../sim/world';
import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, EMPTY_INPUT, TICK_RATE, type InputFrame, type Projectile, type Tardi, type WorldState } from '../sim/types';
import { WEAPONS } from '../sim/weapons';

export type CpuSkill = 'easy' | 'normal' | 'hard' | 'perfect';

/**
 * How a CPU of each skill gets it wrong, like a person would. It picks a
 * victim, then aims for a spot near them: the lower the skill, the further
 * off that spot tends to be. It also only half-reads the wind, has shaky
 * hands, and now and then just lets rip at nothing in particular.
 */
export interface SkillDef {
  /** Typical miss distance (px) from the tardi it is aiming at. */
  spread: number;
  /** How much of the real wind it allows for (0 = ignores wind). */
  windSense: number;
  /** Shaky hands: typical power error (power runs 0..1000) and aim error (aim steps). */
  powerErr: number;
  aimErr: number;
  /** Chance of a wild, hopeful shot instead of an aimed one. */
  wild: number;
}

export const SKILL_DEFS: Record<CpuSkill, SkillDef> = {
  easy: { spread: 200, windSense: 0.3, powerErr: 30, aimErr: 1, wild: 0.15 },
  normal: { spread: 45, windSense: 0.85, powerErr: 0, aimErr: 0, wild: 0.03 },
  hard: { spread: 25, windSense: 0.95, powerErr: 0, aimErr: 0, wild: 0 },
  perfect: { spread: 0, windSense: 1, powerErr: 0, aimErr: 0, wild: 0 },
};

/** The skill levels offered in the menu. */
export const CPU_SKILLS: { id: CpuSkill; name: string }[] = [
  { id: 'easy', name: 'Easy' },
  { id: 'normal', name: 'Normal' },
  { id: 'hard', name: 'Hard' },
  { id: 'perfect', name: 'Expert' },
];

/** Bell-curve noise with a standard deviation of 1. */
function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

export interface Plan {
  weapon: string;
  facing: 1 | -1;
  aim: number;
  power: number;
  fuse: number;
  /** Map target for targeted weapons (Concrete Tun). */
  target?: { x: number; y: number };
}

/**
 * Works out a plan somewhere else (e.g. a Web Worker), so the page doesn't
 * stall while the CPU thinks. Only for display-only matches: a plan that
 * arrives later than usual changes when the CPU acts.
 */
export type Planner = (s: WorldState, skill: CpuSkill) => Promise<Plan | null>;

export class CpuPlayer {
  private plan: Plan | null = null;
  private planTurn = -1;
  private think = 0;
  /** Waiting for the planner's answer. */
  private pending = false;
  private step: 'face' | 'weapon' | 'aim' | 'fuse' | 'charge' | 'done' = 'face';
  private tapped = false;

  private readonly skill: SkillDef;

  constructor(
    private readonly skillId: CpuSkill = 'normal',
    private readonly planner?: Planner,
  ) {
    this.skill = SKILL_DEFS[skillId] ?? SKILL_DEFS.normal;
  }

  next(s: WorldState): InputFrame {
    const turn = s.turn;
    if (turn.phase !== 'aim') return EMPTY_INPUT;
    const t = activeTardi(s);
    if (!t || t.airborne) return EMPTY_INPUT;

    if (this.planTurn !== turn.turnNumber) {
      this.planTurn = turn.turnNumber;
      this.think = 40;
      this.step = 'face';
      if (this.planner) {
        const n = turn.turnNumber;
        this.plan = null;
        this.pending = true;
        const done = (p: Plan | null) => {
          if (this.planTurn !== n) return;
          this.plan = p;
          this.pending = false;
        };
        this.planner(s, this.skillId).then(done, () => done(null));
      } else this.plan = choosePlan(s, this.skill);
    }
    if (this.think > 0 || this.pending) {
      if (this.think > 0) this.think--;
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
        // Sweep the crosshair like a player, then settle exactly on the angle.
        const diff = p.aim - turn.aim;
        if (Math.abs(diff) > AIM_STEP * 2) return { held: diff > 0 ? BTN_UP : BTN_DOWN, pressed: 0 };
        this.step = 'fuse';
        return { held: 0, pressed: 0, cmd: { t: 'aim', facing: p.facing, aim: p.aim } };
      }
      case 'fuse':
        this.step = 'charge';
        return { held: 0, pressed: 0, cmd: { t: 'fuse', s: p.fuse } };
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

interface Candidate {
  plan: Plan;
  /** Predicted impact point. */
  x: number;
  y: number;
  score: number;
  /** Would hurt our own side. */
  ownGoal: boolean;
}

export function choosePlan(s: WorldState, skill: SkillDef): Plan | null {
  const me = activeTardi(s);
  if (!me) return null;
  const sim = cloneWorld(s);
  // It plans for the wind it thinks there is.
  sim.wind = s.wind * skill.windSense;
  const cands: Candidate[] = [];
  const add = (plan: Plan, x: number, y: number, radius: number, damage: number) => {
    cands.push({ plan, x, y, score: scoreHit(s, x, y, radius, damage, me.team), ownGoal: hurtsTeam(s, x, y, radius, me.team) });
  };

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
          if (hit) add({ weapon, facing, aim, power, fuse }, hit.x, hit.y, spec.radius, spec.damage);
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
        if (shot.hit) add({ weapon, facing, aim, power: 0, fuse: 3 }, shot.x, shot.y, hs.radius, hs.damage * WEAPONS[weapon].shots);
      }
    }
  }

  let best: Plan | null = null;
  let bestScore = 0;
  let bestAt: Candidate | null = null;
  for (const c of cands) {
    if (c.score > bestScore) {
      bestScore = c.score;
      best = c.plan;
      bestAt = c;
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
  // Perfect play, and superweapon plans, go as chosen.
  if (!best || skill.spread === 0 || best.target || WEAPONS[best.weapon].kind === 'instant') return best;

  const safe = cands.filter((c) => !c.ownGoal);
  let pick: Candidate | undefined;
  if (Math.random() < skill.wild) {
    // "That'll do": a hopeful shot at nothing in particular.
    pick = safe[Math.floor(Math.random() * safe.length)];
  } else if (bestAt) {
    // Pick the victim its best shot was going for, then aim for a spot
    // near them; how near depends on skill.
    const victim = s.tardis
      .filter((t) => t.alive && t.team !== me.team)
      .sort((a, b) => Math.hypot(a.x - bestAt.x, a.y - bestAt.y) - Math.hypot(b.x - bestAt.x, b.y - bestAt.y))[0];
    if (victim) {
      const tx = victim.x + gauss() * skill.spread;
      const ty = victim.y + gauss() * skill.spread * 0.3;
      let bestD = Infinity;
      for (const c of safe) {
        if (c.plan.weapon !== best.weapon) continue; // stick with the weapon it chose
        const d = (c.x - tx) * (c.x - tx) + (c.y - ty) * (c.y - ty);
        if (d < bestD) {
          bestD = d;
          pick = c;
        }
      }
      // The search grid is coarse; fine-tune that shot onto the chosen spot.
      if (pick) pick = refine(sim, s, me, pick, tx, ty) ?? pick;
    }
  }
  const plan: Plan = { ...(pick?.plan ?? best) };
  // Then shaky hands on the aim and power.
  if (WEAPONS[plan.weapon].kind === 'charge') {
    plan.power = Math.max(100, Math.min(1000, Math.round(plan.power + gauss() * skill.powerErr)));
  }
  plan.aim = Math.max(-1024, Math.min(1024, plan.aim + Math.round(gauss() * skill.aimErr) * AIM_STEP));
  return plan;
}

/**
 * Nudge a thrown shot's aim and power around the grid point it came from, to
 * land as close as possible to (tx, ty) without hurting our own side.
 */
function refine(sim: WorldState, s: WorldState, me: Tardi, c: Candidate, tx: number, ty: number): Candidate | null {
  const { weapon, facing, aim, power, fuse } = c.plan;
  if (WEAPONS[weapon].kind !== 'charge') return null;
  const radius = WEAPONS[weapon].projectile!.radius;
  let best: Candidate | null = null;
  let bestD = (c.x - tx) * (c.x - tx) + (c.y - ty) * (c.y - ty);
  for (let a = aim - AIM_STEP * 4; a <= aim + AIM_STEP * 4; a += AIM_STEP) {
    if (a < -1024 || a > 1024) continue;
    // Power charges in POWER_STEP increments, so only those values are reachable.
    for (let pw = power - POWER_STEP * 5; pw <= power + POWER_STEP * 5; pw += POWER_STEP) {
      if (pw < 100 || pw > 1000) continue;
      const hit = predict(sim, weapon, me.x, me.y, facing, a, pw, fuse * TICK_RATE, me.id);
      if (!hit || hurtsTeam(s, hit.x, hit.y, radius, me.team)) continue;
      const d = (hit.x - tx) * (hit.x - tx) + (hit.y - ty) * (hit.y - ty);
      if (d < bestD) {
        bestD = d;
        best = { plan: { ...c.plan, aim: a, power: pw }, x: hit.x, y: hit.y, score: 0, ownGoal: false };
      }
    }
  }
  return best;
}

/** Would a blast here hurt any of our own living tardis? */
function hurtsTeam(s: WorldState, x: number, y: number, radius: number, team: number): boolean {
  const reach = radius + TARDI_R + 6;
  return s.tardis.some((t) => t.alive && t.team === team && Math.hypot(t.x - x, t.y - y) < reach);
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
