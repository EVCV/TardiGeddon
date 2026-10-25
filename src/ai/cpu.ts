// CPU opponent. Picks a shot by simulating candidate throws against the
// current state, then "presses buttons" through the normal input path.
// Runs only on one machine (host) — its inputs are what get replayed.
//
// Working out a shot takes a few hundred milliseconds, so it's done in
// slices of a few milliseconds per tick while the CPU "thinks", never all at
// once: on the game server one CPU turn must not stall every other match.

import { cloneWorld, girderFits, launchVelocity, ropeTrace, stepProjectile, activeTardi, tick, traceHitscan, TARDI_R, AIM_STEP, AIM_MAX, POWER_STEP, STRIKE_WIND_DRIFT } from '../sim/world';
import { circleCollides, surfaceBelow } from '../sim/terrain/terrain';
import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, EMPTY_INPUT, PRESS_JUMP, TICK_RATE, type InputFrame, type Projectile, type SimEvent, type Tardi, type WorldState } from '../sim/types';
import { WEAPONS } from '../sim/weapons';

export { CPU_SKILLS, type CpuSkill } from './skills';
import type { CpuSkill } from './skills';

/**
 * How a CPU of each skill gets it wrong, like a person would. It picks a
 * victim, then aims for a spot near them: the lower the skill, the further
 * off that spot tends to be. It also only half-reads the wind, has shaky
 * hands, and now and then just lets rip at nothing in particular.
 */
interface SkillDef {
  /** Typical miss distance (px) from the tardi it is aiming at. */
  spread: number;
  /** How much of the real wind it allows for (0 = ignores wind). */
  windSense: number;
  /** Shaky hands: typical power error (power runs 0..1000) and aim error (aim steps). */
  powerErr: number;
  aimErr: number;
  /** Chance of a shot that misses by a lot (still aimed at someone). */
  wild: number;
  /** Chance it walks somewhere better when it has no good shot from where it is. */
  moves: number;
  /** Only shots a person would think of: facing the way it lands, never fired steeply into the ground. */
  human: boolean;
}

// Tuned with the damage they do to a team that never moves (tests/cpuskill.test.ts):
// Normal should land roughly one shot in three, like a fair player.
const SKILL_DEFS: Record<CpuSkill, SkillDef> = {
  easy: { spread: 330, windSense: 0.2, powerErr: 70, aimErr: 2, wild: 0.2, moves: 0.4, human: true },
  normal: { spread: 120, windSense: 0.55, powerErr: 35, aimErr: 1, wild: 0.06, moves: 0.8, human: true },
  hard: { spread: 40, windSense: 0.9, powerErr: 12, aimErr: 0, wild: 0, moves: 1, human: true },
  perfect: { spread: 0, windSense: 1, powerErr: 0, aimErr: 0, wild: 0, moves: 1, human: false },
};

/**
 * Would a person fire this? A shot landing behind the tardi it's facing away
 * from, or one aimed steeply down at the ground in front of it (bounced off a
 * wall, or dropped down a pit), looks like the CPU aiming the wrong way.
 */
function humanShot(me: Tardi, plan: Plan, x: number, y: number): boolean {
  const dx = x - me.x;
  if (dx * plan.facing < -40) return false;
  return plan.aim >= -AIM_MAX / 2 || y - me.y > Math.abs(dx);
}

/** Bell-curve noise with a standard deviation of 1. */
function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** Most time (ms) the CPU spends working out its shot in one tick. */
export const SLICE_MS = 4;

interface Plan {
  weapon: string;
  facing: 1 | -1;
  aim: number;
  power: number;
  fuse: number;
  /** Map target for targeted weapons (strikes, Concrete Tun, Teleport) and the Homing Spore. */
  target?: { x: number; y: number };
}

export class CpuPlayer {
  private plan: Plan | null = null;
  /** Deciding whether (and where) to walk first, a slice at a time. */
  private moving: Generator<void, InputFrame[] | null> | null = null;
  /** The walk it settled on: the frames to press, one per tick. */
  private walkFrames: InputFrame[] | null = null;
  /** The shot being worked out, a slice at a time. */
  private planning: Generator<void, Plan | null> | null = null;
  private planTurn = -1;
  private think = 0;
  private step: 'face' | 'weapon' | 'aim' | 'fuse' | 'charge' | 'done' = 'face';
  private tapped = false;

  private readonly skill: SkillDef;

  constructor(
    skill: CpuSkill = 'normal',
    /** Time per tick for working out the shot (Infinity: all at once). */
    private sliceMs = SLICE_MS,
  ) {
    this.skill = SKILL_DEFS[skill] ?? SKILL_DEFS.normal;
  }

  next(s: WorldState): InputFrame {
    const turn = s.turn;
    if (turn.phase !== 'aim') return EMPTY_INPUT;
    // Walking: the worked-out frames play on even mid-hop, exactly as simulated.
    if (this.walkFrames && this.planTurn === turn.turnNumber && this.walkFrames.length) return this.walkFrames.shift()!;
    const t = activeTardi(s);
    if (!t || t.airborne) return EMPTY_INPUT;

    if (this.planTurn !== turn.turnNumber) {
      this.planTurn = turn.turnNumber;
      this.plan = null;
      this.planning = null;
      this.walkFrames = null;
      // First: is there a better place to shoot from? (Only with time to get there.)
      const mayMove = s.scheme.movement && turn.timer > MOVE_MIN_TICKS && Math.random() < this.skill.moves;
      this.moving = mayMove ? planMove(s, this.skill) : null;
      if (!this.moving) this.planning = choosePlan(s, this.skill);
      this.think = 40;
      this.step = 'face';
    }
    if (this.moving) {
      const end = performance.now() + this.sliceMs;
      for (;;) {
        const r = this.moving.next();
        if (r.done) {
          this.moving = null;
          this.walkFrames = r.value;
          // Nowhere better: work out the shot from here.
          if (!this.walkFrames) this.planning = choosePlan(s, this.skill);
          break;
        }
        if (performance.now() >= end) break;
      }
      if (this.moving) return EMPTY_INPUT;
    }
    if (this.walkFrames) {
      // Walk (and hop) there, exactly as worked out; then aim from the new spot.
      const f = this.walkFrames.shift();
      if (f) return f;
      this.walkFrames = null;
      this.planning = choosePlan(s, this.skill);
      this.think = 15;
    }
    if (this.planning) {
      const end = performance.now() + this.sliceMs;
      for (;;) {
        const r = this.planning.next();
        if (r.done) {
          this.plan = r.value;
          this.planning = null;
          break;
        }
        if (performance.now() >= end) break;
      }
    }
    if (this.think > 0) {
      this.think--;
      return EMPTY_INPUT;
    }
    if (this.planning) return EMPTY_INPUT; // still working it out
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
        // The Homing Spore needs its target picked before it's launched.
        if (WEAPONS[p.weapon].projectile?.homing && p.target && !turn.target) {
          return { held: 0, pressed: 0, cmd: { t: 'target', x: p.target.x, y: p.target.y } };
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

/** The best shot found from where the active tardi stands, and every candidate looked at. */
interface ShotSearch {
  cands: Candidate[];
  best: Plan | null;
  bestScore: number;
  bestAt: Candidate | null;
}

/**
 * Thrown weapons the CPU can plan by simulating the throw: every ordinary one
 * in the weapons panel (not the ones that steer, burrow, walk or drop from
 * the sky, which it plans in their own ways or not at all).
 */
const THROWN = Object.values(WEAPONS)
  .filter((d) => d.kind === 'charge' && !d.hidden && d.projectile && !d.projectile.homing && !d.projectile.drill && !d.projectile.walker && !d.projectile.crusher)
  .map((d) => d.id);

/** Aims across the whole range, a `step` apart, on the grid of the turn's start aim (`from`). */
function aims(from: number, step: number): number[] {
  const out: number[] = [];
  for (let a = from - Math.floor((from + AIM_MAX) / step) * step; a <= AIM_MAX; a += step) out.push(a);
  return out;
}

/**
 * Try thrown and instant-shot weapons from where the active tardi stands in
 * `s`, yielding between throws. `coarse` looks at fewer angles and powers
 * (for weighing up places to walk to).
 */
function* searchShots(s: WorldState, skill: SkillDef, coarse = false): Generator<void, ShotSearch> {
  const me = activeTardi(s)!;
  const sim = cloneWorld(s);
  // It plans for the wind it thinks there is.
  sim.wind = s.wind * skill.windSense;
  const cands: Candidate[] = [];
  const add = (plan: Plan, x: number, y: number, radius: number, damage: number) => {
    if (skill.human && !humanShot(me, plan, x, y)) return;
    cands.push({ plan, x, y, score: scoreHit(s, x, y, radius, damage, me.team), ownGoal: hurtsTeam(s, x, y, radius, me.team) });
  };

  const ammo = s.teams[me.team].ammo;
  const usable = (w: string) => ammo[w] !== 0;
  // Thrown weapons the CPU can plan: simulate each candidate throw. Weapons
  // that fly alike (bazooka and mortar, grenade and cluster) land in the same
  // place, so each throw is worked out once for both.
  const landed = new Map<string, { x: number; y: number } | null>();
  const thrown = coarse ? ['bazooka', 'grenade'] : THROWN;
  for (const weapon of thrown.filter(usable)) {
    const spec = WEAPONS[weapon].projectile!;
    const flight = flightKey(weapon);
    for (const facing of [1, -1] as const) {
      // Every angle, from straight down to straight up (high lobs reach over towers and into pits).
      for (const aim of aims(s.turn.aim, AIM_STEP * (coarse ? 12 : 6))) {
        for (let power = 300; power <= 1000; power += coarse ? 175 : 100) {
          const fuse = 3;
          const key = `${flight}|${facing}|${aim}|${power}`;
          let hit = landed.get(key);
          if (hit === undefined) {
            hit = predict(sim, weapon, me.x, me.y, facing, aim, power, fuse * TICK_RATE, me.id);
            landed.set(key, hit);
            yield;
          }
          if (hit) add({ weapon, facing, aim, power, fuse }, hit.x, hit.y, spec.radius, spec.damage);
        }
      }
    }
  }
  // Instant-shot weapons: trace the line for each aim.
  for (const weapon of ['shotgun'].filter(usable)) {
    const hs = WEAPONS[weapon].hitscan!;
    for (const facing of [1, -1] as const) {
      for (const aim of aims(s.turn.aim, AIM_STEP * (coarse ? 6 : 2))) {
        const shot = traceHitscan(sim, me, facing, aim, hs.range);
        if (shot.hit) add({ weapon, facing, aim, power: 0, fuse: 3 }, shot.x, shot.y, hs.radius, hs.damage * WEAPONS[weapon].shots);
        yield;
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
  return { cands, best, bestScore, bestAt };
}

/** Work out a shot, yielding between candidate throws so it can be spread over ticks. */
function* choosePlan(live: WorldState, skill: SkillDef): Generator<void, Plan | null> {
  // The world as it was when the turn began: the live one moves on while we think.
  const s = cloneWorld(live);
  const me = activeTardi(s);
  if (!me) return null;
  yield;
  const sim = cloneWorld(s);
  sim.wind = s.wind * skill.windSense;
  const found = yield* searchShots(s, skill);
  const { cands } = found;
  let { best, bestScore, bestAt } = found;
  // Below Expert it doesn't always reach for the same weapon: any that would
  // do nearly as well might get picked, the better ones more often.
  if (skill.spread > 0 && bestAt) {
    const byWeapon = new Map<string, Candidate>();
    for (const c of cands) {
      const was = byWeapon.get(c.plan.weapon);
      if (!c.ownGoal && c.score > 0 && (!was || c.score > was.score)) byWeapon.set(c.plan.weapon, c);
    }
    const good = [...byWeapon.values()].filter((c) => c.score >= bestScore * 0.6);
    let roll = Math.random() * good.reduce((sum, c) => sum + c.score, 0);
    for (const c of good) {
      roll -= c.score;
      if (roll > 0) continue;
      best = c.plan;
      bestAt = c;
      break;
    }
  }
  const ammo = s.teams[me.team].ammo;
  const usable = (w: string) => ammo[w] !== 0;
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
  const enemies = s.tardis
    .filter((t) => t.alive && t.team !== me.team)
    .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
  // Raindrop Strike and Acid Rain: rain on an enemy from the sky (open sky above them, or none of it lands).
  for (const weapon of ['airstrike', 'acidrain'].filter(usable)) {
    for (const e of enemies) {
      const st = yield* strikeAt(sim, s, weapon, e.x, me.team);
      yield;
      // Kept for when they're clearly better: there's one of each.
      if (st && st.score * 0.85 > bestScore) {
        bestScore = st.score * 0.85;
        best = { weapon, facing: me.facing === 1 ? 1 : -1, aim: s.turn.aim, power: 0, fuse: 3, target: { x: st.x, y: Math.round(e.y) } };
      }
    }
  }
  // Homing Spore: picks an enemy and steers to it, round corners a throw can't take.
  if (usable('homing')) {
    const spec = WEAPONS.homing.projectile!;
    for (const e of enemies.slice(0, 3)) {
      const target = { x: Math.round(e.x), y: Math.round(e.y) };
      for (const facing of [1, -1] as const) {
        for (const aim of aims(s.turn.aim, AIM_STEP * 12)) {
          for (const power of [400, 600, 800, 1000]) {
            const hit = predict(sim, 'homing', me.x, me.y, facing, aim, power, 0, me.id, target);
            yield;
            if (!hit) continue;
            const score = scoreHit(s, hit.x, hit.y, spec.radius, spec.damage, me.team) * 0.9;
            if (score > bestScore) {
              bestScore = score;
              best = { weapon: 'homing', facing, aim, power, fuse: 3, target };
            }
          }
        }
      }
    }
  }
  // Still nothing worth firing: teleport somewhere it has a shot from next turn.
  if (bestScore < 10 && usable('teleport')) {
    const tp = yield* teleportSpot(s, skill, enemies);
    if (tp) return { weapon: 'teleport', facing: me.facing === 1 ? 1 : -1, aim: s.turn.aim, power: 0, fuse: 3, target: tp };
  }
  // Targets picked by a CPU that isn't perfect are a little off, like its throws.
  if (best?.target && skill.spread > 0 && best.weapon !== 'teleport') {
    best = { ...best, target: { x: Math.round(best.target.x + gauss() * skill.spread * 0.4), y: best.target.y } };
  }
  // Nothing in reach (walled off in a cave, or behind a spire): rather than
  // skip, lob one as close to the nearest enemy as it can, blasting a way through.
  if (!best) {
    // Sometimes it builds a Twig Girder wall to hide behind instead.
    if (usable('girder') && enemies.length && Math.random() < 0.5) {
      const wall = shieldPlan(s, me, enemies[0]);
      if (wall) return wall;
    }
    let bestD = Infinity;
    for (const c of cands) {
      if (c.ownGoal) continue;
      for (const e of s.tardis) {
        if (!e.alive || e.team === me.team) continue;
        const d = (c.x - e.x) * (c.x - e.x) + (c.y - e.y) * (c.y - e.y);
        if (d < bestD) {
          bestD = d;
          best = c.plan;
        }
      }
    }
    return best;
  }
  // Perfect play, and superweapon plans, go as chosen.
  if (skill.spread === 0 || best.target || WEAPONS[best.weapon].kind === 'instant') return best;

  const safe = cands.filter((c) => !c.ownGoal);
  let pick: Candidate | undefined;
  if (bestAt) {
    // Pick the victim its best shot was going for, then aim for a spot
    // near them; how near depends on skill. It always looks like it's trying:
    // now and then (`wild`) it just misses by a lot.
    const at = bestAt;
    const victim = s.tardis
      .filter((t) => t.alive && t.team !== me.team)
      .sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
    if (victim) {
      const spread = skill.spread * (Math.random() < skill.wild ? 3 : 1);
      const tx = victim.x + gauss() * spread;
      const ty = victim.y + gauss() * spread * 0.3;
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
      if (pick) pick = (yield* refine(sim, s, me, pick, tx, ty)) ?? pick;
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

/** A Twig Girder stood upright beside the tardi, between it and the enemy, if one fits there. */
function shieldPlan(s: WorldState, me: Tardi, enemy: Tardi): Plan | null {
  const facing: 1 | -1 = enemy.x >= me.x ? 1 : -1;
  for (const gap of [14, 24, 34]) {
    const target = { x: Math.round(me.x + facing * (TARDI_R + gap)), y: Math.round(me.y - 22) };
    const sim = cloneWorld(s);
    const t = activeTardi(sim)!;
    t.facing = facing;
    sim.turn.weapon = 'girder';
    sim.turn.aim = AIM_MAX;
    sim.turn.target = target;
    if (girderFits(sim)) return { weapon: 'girder', facing, aim: AIM_MAX, power: 0, fuse: 3, target };
  }
  return null;
}

/**
 * Nudge a thrown shot's aim and power around the grid point it came from, to
 * land as close as possible to (tx, ty) without hurting our own side.
 */
function* refine(sim: WorldState, s: WorldState, me: Tardi, c: Candidate, tx: number, ty: number): Generator<void, Candidate | null> {
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
      yield;
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

/**
 * A strike aimed to land on `x`: where to point it (allowing for the wind, which
 * blows the drops sideways as they fall) and what it would do there.
 */
function* strikeAt(sim: WorldState, s: WorldState, weapon: string, x: number, myTeam: number): Generator<void, { x: number; score: number } | null> {
  const st = WEAPONS[weapon].strike!;
  const drop = WEAPONS[st.weapon].projectile!;
  // Fire and acid splash on after the drop: count them as a bit more damage.
  const damage = drop.damage + (drop.fire ? drop.fire.count * 3 : 0);
  const fall = (tx: number) => {
    const hits: { x: number; y: number }[] = [];
    for (let i = 0; i < st.count; i++) {
      const p: Projectile = { id: -1, weapon: st.weapon, x: tx + (i - (st.count - 1) / 2) * st.spacing, y: -30 - i * 4, vx: sim.wind * STRIKE_WIND_DRIFT, vy: 5, fuse: -1, owner: -1, age: 0, tx: 0, ty: 0, dir: 0, hits: 0 };
      const r = fly(sim, p);
      if (r) hits.push(r);
    }
    return hits;
  };
  // Where the middle drop lands when aimed straight at it, then aim off by the drift.
  const first = fall(x);
  yield;
  const mid = first[Math.floor(first.length / 2)];
  const tx = Math.round(Math.max(20, Math.min(s.terrain.w - 20, mid ? x - (mid.x - x) : x)));
  const hits = tx === Math.round(x) ? first : fall(tx);
  let score = 0;
  for (const h of hits) score += scoreHit(s, h.x, h.y, drop.radius, damage, myTeam);
  return score > 0 ? { x: tx, score } : null;
}

/** Most places it weighs up teleporting to. */
const TELEPORT_SPOTS = 12;

/**
 * Somewhere to teleport to with a good shot from next turn: on the ground a
 * little way either side of the nearest enemies, not by a mine or the water.
 */
function* teleportSpot(s: WorldState, skill: SkillDef, enemies: Tardi[]): Generator<void, { x: number; y: number } | null> {
  const me = activeTardi(s)!;
  const spots: { x: number; y: number }[] = [];
  for (const e of enemies.slice(0, 3)) {
    for (const dx of [-220, 220, -140, 140]) {
      const x = Math.round(e.x + dx);
      if (x < 30 || x > s.terrain.w - 30) continue;
      // The ground below a point above the enemy's level (a ledge beside them, not the cave roof).
      const ground = surfaceBelow(s.terrain, x, Math.max(0, e.y - 160));
      if (ground < 0) continue;
      const y = ground - TARDI_R - 2;
      if (y < TARDI_R + 4 || y > s.waterY - 40 || circleCollides(s.terrain, x, y, TARDI_R)) continue;
      if (s.objects.some((o) => o.kind === 'mine' && Math.abs(o.x - x) < 50 && Math.abs(o.y - y) < 50)) continue;
      if (s.tardis.some((t) => t.alive && t.id !== me.id && Math.abs(t.x - x) < 50 && Math.abs(t.y - y) < 40)) continue;
      spots.push({ x, y });
      if (spots.length >= TELEPORT_SPOTS) break;
    }
    if (spots.length >= TELEPORT_SPOTS) break;
  }
  let best: { x: number; y: number } | null = null;
  let bestScore = GOOD_SHOT;
  for (const spot of spots) {
    const there = cloneWorld(s);
    const t = activeTardi(there)!;
    t.x = spot.x;
    t.y = spot.y + 1;
    t.airborne = false;
    const found = yield* searchShots(there, skill, true);
    if (found.bestScore > bestScore) {
      bestScore = found.bestScore;
      best = spot;
    }
  }
  return best;
}

/** Don't set off walking with less than this much of the turn left. */
const MOVE_MIN_TICKS = 25 * TICK_RATE;
/** A shot scoring at least this from where it stands is good enough: no need to move. */
const GOOD_SHOT = 25;
/** How far it considers walking each way (ticks of holding ◀ or ▶). */
const WALKS = [45, 100, 170];
/** How many hops forward it considers. */
const HOPS = [2, 4];
/** A drop further than this hurts (as in the sim, less a little to be safe). */
const SAFE_FALL = 80;
/** Silk Rope swings it considers: up and ahead at these aims (low ones catch the hillside ahead), swinging for up to this many ticks. */
const ROPE_AIMS = [AIM_MAX * 0.25, AIM_MAX * 0.45, AIM_MAX * 0.7, AIM_MAX * 0.88];
const ROPE_SWINGS = [40, 90];
/** Chance (times its skill's `moves`) it strolls somewhere else even with a good shot, so it doesn't stand like a statue. */
const WANDER = 0.35;

/** A way of getting somewhere: the frames to press, and how things stand afterwards. */
interface Move {
  frames: InputFrame[];
  end: WorldState;
  crates: number;
  hurt: number;
}

/**
 * Should the tardi move before shooting? On a copy of the world it tries
 * walking each way for a few distances (hopping over steps), hopping along,
 * and swinging on the Silk Rope, and sees what shots it would have from
 * there, and whether it would pick up a crate or get hurt on the way. With no
 * good shot where it stands it goes for the best spot; with one, now and then
 * it wanders to a spot about as good, like a person would. Returns the frames
 * to press, or null to stay put.
 */
function* planMove(live: WorldState, skill: SkillDef): Generator<void, InputFrame[] | null> {
  const s = cloneWorld(live);
  yield;
  const here = yield* searchShots(s, skill, true);
  const wander = here.bestScore >= GOOD_SHOT;
  if (wander && Math.random() >= WANDER) return null;
  let best: InputFrame[] | null = null;
  // Moving has to be clearly worth it, or (wandering) cost little of the shot.
  let bestScore = wander ? here.bestScore * 0.85 : here.bestScore + 8;
  const consider = function* (m: Move | null): Generator<void, void> {
    yield;
    if (!m) return;
    const there = yield* searchShots(m.end, skill, true);
    const score = there.bestScore + m.crates * 15 - m.hurt * 2;
    if (score > bestScore) {
      bestScore = score;
      best = m.frames;
    }
  };
  const dirs: (1 | -1)[] = Math.random() < 0.5 ? [-1, 1] : [1, -1];
  for (const dir of dirs) {
    for (const ticks of wander ? [WALKS[0]] : WALKS) yield* consider(walkTo(s, dir, ticks));
    for (const hops of wander ? [HOPS[0]] : HOPS) yield* consider(hopTo(s, dir, hops));
  }
  // The rope: when walking won't do, or sometimes just because it's fun.
  const me = activeTardi(s)!;
  if (s.teams[me.team].ammo.rope !== 0 && (bestScore < GOOD_SHOT || Math.random() < 0.3)) {
    for (const dir of dirs) {
      for (const aim of ROPE_AIMS) {
        if (!ropeTrace(s.terrain, me.x, me.y, dir, Math.round(aim)).hit) continue;
        for (const swing of ROPE_SWINGS) yield* consider(ropeTo(s, dir, Math.round(aim), swing));
      }
    }
  }
  return best;
}

/**
 * Presses buttons on a copy of the world, one tick at a time, counting crates
 * picked up. `step` is false once things have gone wrong (drowned, turn over,
 * off the edge).
 */
class Rehearsal {
  readonly s: WorldState;
  readonly me: Tardi;
  readonly frames: InputFrame[] = [];
  crates = 0;
  private readonly hp: number;
  private readonly x0: number;
  private readonly events: SimEvent[] = [];

  constructor(s0: WorldState) {
    this.s = cloneWorld(s0);
    this.me = activeTardi(this.s)!;
    this.hp = this.me.hp - this.me.pendingDmg;
    this.x0 = this.me.x;
  }

  step(f: InputFrame): boolean {
    const { s, me } = this;
    tick(s, f, this.events);
    this.frames.push(f);
    for (const e of this.events) if (e.t === 'collect' && e.tardi === me.id) this.crates++;
    this.events.length = 0;
    return me.alive && s.turn.phase === 'aim' && me.y < s.waterY - 12 && me.x > 20 && me.x < s.terrain.w - 20;
  }

  /** Come down and land, opening the Leaf Parachute if it's a long way down. */
  land(): boolean {
    const { s, me } = this;
    for (let i = 0; i < 500 && me.airborne; i++) {
      // On the way down, and the whole drop (from the top of the jump or swing) would hurt.
      const falling = me.vy > 1 && !me.chute && !me.knocked && !me.rope;
      const drop = groundBelow(s, me) - TARDI_R - me.fallStartY;
      if (falling && drop > SAFE_FALL && s.teams[me.team].ammo.parachute !== 0 && s.scheme.fallDamage) {
        if (!this.step({ held: 0, pressed: 0, cmd: { t: 'weapon', id: 'parachute' } })) return false;
        if (!this.step({ held: BTN_FIRE, pressed: 0 })) return false;
        continue;
      }
      if (!this.step(EMPTY_INPUT)) return false;
    }
    return !me.airborne;
  }

  /** Where it ended up, unless that's nowhere much or beside a mine that's about to go off. */
  result(): Move | null {
    const { s, me } = this;
    if (Math.abs(me.x - this.x0) < 20) return null;
    if (s.objects.some((o) => o.kind === 'mine' && o.fuse > 0 && Math.abs(o.x - me.x) < 60 && Math.abs(o.y - me.y) < 60)) return null;
    return { frames: this.frames, end: s, crates: this.crates, hurt: Math.max(0, this.hp - (me.hp - me.pendingDmg)) };
  }
}

/** How far below the tardi the ground is (a long way when there's none). */
function groundBelow(s: WorldState, t: Tardi): number {
  const y = surfaceBelow(s.terrain, Math.round(t.x), Math.max(0, Math.round(t.y + TARDI_R + 1)));
  return y < 0 ? s.terrain.h : y;
}

/**
 * Walk the active tardi one way for `ticks` on a copy of the world, jumping
 * when stuck against a step, then let it land. Null if it would drown, fall
 * off the map, end its turn, or end up next to a ticking mine.
 */
export function walkTo(s0: WorldState, dir: 1 | -1, ticks: number): Move | null {
  if (!activeTardi(s0)) return null;
  const r = new Rehearsal(s0);
  const me = r.me;
  let stuck = 0;
  let lastX = me.x;
  const fwd = dir === 1 ? BTN_RIGHT : BTN_LEFT;
  const back = dir === 1 ? BTN_LEFT : BTN_RIGHT;
  for (let i = 0; i < ticks; i++) {
    if (stuck >= 6 && !me.airborne) {
      // Against a step: back off a little for a run-up, face forward again, then jump.
      // (Then wait for the jump: a second press straight away would be a backflip.)
      for (let k = 0; k < 10; k++) if (!r.step({ held: back, pressed: 0 })) return null;
      if (!r.step({ held: fwd, pressed: 0 })) return null;
      if (!r.step({ held: 0, pressed: PRESS_JUMP })) return null;
      for (let k = 0; k < 12; k++) if (!r.step({ held: fwd, pressed: 0 })) return null;
      stuck = -10;
      lastX = me.x;
      continue;
    }
    if (!r.step({ held: fwd, pressed: 0 })) return null;
    if (!me.airborne && Math.abs(me.x - lastX) < 0.2) stuck++;
    else stuck = 0;
    lastX = me.x;
  }
  return r.land() ? r.result() : null;
}

/** Hop `hops` times one way (a jump, then landing before the next). */
export function hopTo(s0: WorldState, dir: 1 | -1, hops: number): Move | null {
  if (!activeTardi(s0)) return null;
  const r = new Rehearsal(s0);
  const fwd = dir === 1 ? BTN_RIGHT : BTN_LEFT;
  for (let h = 0; h < hops; h++) {
    if (!r.step({ held: fwd, pressed: 0 })) return null; // face the way
    if (!r.step({ held: 0, pressed: PRESS_JUMP })) return null;
    // The jump goes off after a moment; then wait to land (a press meanwhile would be a backflip).
    for (let k = 0; k < 14 && !r.me.airborne; k++) if (!r.step(EMPTY_INPUT)) return null;
    if (!r.land()) return null;
  }
  return r.result();
}

/** Shoot the Silk Rope up and ahead at `aim`, swing that way (for `swing` ticks at most), let go and land. */
export function ropeTo(s0: WorldState, dir: 1 | -1, aim: number, swing: number): Move | null {
  if (!activeTardi(s0)) return null;
  const r = new Rehearsal(s0);
  const me = r.me;
  const fwd = dir === 1 ? BTN_RIGHT : BTN_LEFT;
  if (!r.step({ held: 0, pressed: 0, cmd: { t: 'weapon', id: 'rope' } })) return null;
  if (!r.step({ held: 0, pressed: 0, cmd: { t: 'aim', facing: dir, aim } })) return null;
  if (!r.step({ held: BTN_FIRE, pressed: 0 })) return null;
  if (!me.rope) return null;
  if (!r.step(EMPTY_INPUT)) return null;
  // Reel in a little as it swings, for height; let go swinging forward and up
  // (after `swing` ticks at most), as a player would.
  for (let k = 0; k < swing; k++) {
    if (k > 15 && me.vx * dir > 1.5 && me.vy < -0.5) break;
    if (!r.step({ held: fwd | (k < swing / 3 ? BTN_UP : 0), pressed: 0 })) return null;
  }
  if (!r.step({ held: 0, pressed: PRESS_JUMP })) return null;
  if (!r.land()) return null;
  // Not left hanging: it has to have let go and be standing.
  return me.rope ? null : r.result();
}

/** Everything about a weapon that decides where its shot flies (not what it does when it lands). */
export function flightKey(weapon: string): string {
  const p = WEAPONS[weapon].projectile!;
  return JSON.stringify([p.windFactor, p.bounce, p.speed, p.playerFuse, p.fuseTicks, p.sticky, p.drill, p.homing, p.crusher, p.walker]);
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
  /** Where a homing shot steers to. */
  target?: { x: number; y: number },
): { x: number; y: number } | null {
  const spec = WEAPONS[weapon].projectile!;
  const { vx, vy } = launchVelocity(spec, facing, aim, power);
  const p: Projectile = { id: -1, weapon, x, y, vx, vy, fuse: spec.playerFuse ? fuseTicks : (spec.fuseTicks ?? -1), owner, age: 0, tx: target?.x ?? 0, ty: target?.y ?? 0, dir: 0, hits: 0 };
  return fly(s, p);
}

/** Where a projectile goes off, or null if it never does (in the water, off the map). */
function fly(s: WorldState, p: Projectile): { x: number; y: number } | null {
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
