// CPU opponent. Picks a shot by simulating candidate throws against the
// current state, then "presses buttons" through the normal input path.
// Runs only on one machine (host) — its inputs are what get replayed.
//
// Working out a shot takes a few hundred milliseconds, so it's done in
// slices of a few milliseconds per tick while the CPU "thinks", never all at
// once: on the game server one CPU turn must not stall every other match.

import { cloneWorld, launchVelocity, stepProjectile, activeTardi, tick, traceHitscan, TARDI_R, AIM_STEP, POWER_STEP } from '../sim/world';
import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, EMPTY_INPUT, PRESS_JUMP, TICK_RATE, type InputFrame, type Projectile, type SimEvent, type Tardi, type WorldState } from '../sim/types';
import { WEAPONS } from '../sim/weapons';

export type CpuSkill = 'easy' | 'normal' | 'hard' | 'perfect';

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
  /** Chance of a wild, hopeful shot instead of an aimed one. */
  wild: number;
  /** Chance it walks somewhere better when it has no good shot from where it is. */
  moves: number;
}

const SKILL_DEFS: Record<CpuSkill, SkillDef> = {
  easy: { spread: 200, windSense: 0.3, powerErr: 30, aimErr: 1, wild: 0.15, moves: 0.4 },
  normal: { spread: 45, windSense: 0.85, powerErr: 0, aimErr: 0, wild: 0.03, moves: 0.8 },
  hard: { spread: 25, windSense: 0.95, powerErr: 0, aimErr: 0, wild: 0, moves: 1 },
  perfect: { spread: 0, windSense: 1, powerErr: 0, aimErr: 0, wild: 0, moves: 1 },
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

/** Most time (ms) the CPU spends working out its shot in one tick. */
export const SLICE_MS = 4;

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
    cands.push({ plan, x, y, score: scoreHit(s, x, y, radius, damage, me.team), ownGoal: hurtsTeam(s, x, y, radius, me.team) });
  };

  const ammo = s.teams[me.team].ammo;
  const usable = (w: string) => ammo[w] !== 0;
  // Thrown weapons the CPU can plan: simulate each candidate throw. Weapons
  // that fly alike (bazooka and mortar, grenade and cluster) land in the same
  // place, so each throw is worked out once for both.
  const landed = new Map<string, { x: number; y: number } | null>();
  const thrown = coarse ? ['bazooka', 'grenade'] : ['bazooka', 'grenade', 'cluster', 'mortar', 'holywater'];
  for (const weapon of thrown.filter(usable)) {
    const spec = WEAPONS[weapon].projectile!;
    const flight = flightKey(weapon);
    for (const facing of [1, -1] as const) {
      // Aim is reached in AIM_STEP increments from the turn's start aim.
      for (let aim = s.turn.aim - AIM_STEP * 80; aim <= s.turn.aim + AIM_STEP * 50; aim += AIM_STEP * (coarse ? 12 : 6)) {
        if (aim < -1024 || aim > 1024) continue;
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
      for (let aim = s.turn.aim - AIM_STEP * 80; aim <= s.turn.aim + AIM_STEP * 50; aim += AIM_STEP * (coarse ? 6 : 2)) {
        if (aim < -1024 || aim > 1024) continue;
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
  const { cands, bestAt } = found;
  let { best, bestScore } = found;
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
  // Nothing in reach (walled off in a cave, or behind a spire): rather than
  // skip, lob one as close to the nearest enemy as it can, blasting a way through.
  if (!best) {
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

/** Don't set off walking with less than this much of the turn left. */
const MOVE_MIN_TICKS = 25 * TICK_RATE;
/** A shot scoring at least this from where it stands is good enough: no need to move. */
const GOOD_SHOT = 25;
/** How far it considers walking each way (ticks of holding ◀ or ▶). */
const WALKS = [45, 100, 170];

/**
 * Should the tardi walk before shooting? When there's no good shot from
 * where it stands, try walking each way for a few distances on a copy of the
 * world (hopping over steps), and see what shots it would have from there,
 * and whether it would pick up a crate or get hurt on the way. Returns the
 * frames to press to get to the best spot, or null to stay put.
 */
function* planMove(live: WorldState, skill: SkillDef): Generator<void, InputFrame[] | null> {
  const s = cloneWorld(live);
  yield;
  const here = yield* searchShots(s, skill, true);
  if (here.bestScore >= GOOD_SHOT) return null;
  let best: InputFrame[] | null = null;
  let bestScore = here.bestScore + 8; // moving has to be clearly worth it
  for (const dir of [-1, 1] as const) {
    for (const ticks of WALKS) {
      const w = walkTo(s, dir, ticks);
      yield;
      if (!w) continue;
      const there = yield* searchShots(w.end, skill, true);
      const score = there.bestScore + w.crates * 15 - w.hurt * 2;
      if (score > bestScore) {
        bestScore = score;
        best = w.frames;
      }
    }
  }
  return best;
}

/**
 * Walk the active tardi one way for `ticks` on a copy of the world, jumping
 * when stuck against a step, then let it land. Null if it would drown, fall
 * off the map, end its turn, or end up next to a ticking mine.
 */
export function walkTo(s0: WorldState, dir: 1 | -1, ticks: number): { frames: InputFrame[]; end: WorldState; crates: number; hurt: number } | null {
  const s = cloneWorld(s0);
  const me = activeTardi(s);
  if (!me) return null;
  const hp = me.hp - me.pendingDmg;
  const frames: InputFrame[] = [];
  const events: SimEvent[] = [];
  let stuck = 0;
  let lastX = me.x;
  let crates = 0;
  const step = (f: InputFrame): boolean => {
    tick(s, f, events);
    frames.push(f);
    for (const e of events) if (e.t === 'collect' && e.tardi === me.id) crates++;
    events.length = 0;
    return me.alive && s.turn.phase === 'aim' && me.y < s.waterY - 12 && me.x > 20 && me.x < s.terrain.w - 20;
  };
  const fwd = dir === 1 ? BTN_RIGHT : BTN_LEFT;
  const back = dir === 1 ? BTN_LEFT : BTN_RIGHT;
  for (let i = 0; i < ticks; i++) {
    if (stuck >= 6 && !me.airborne) {
      // Against a step: back off a little for a run-up, face forward again, then jump.
      // (Then wait for the jump: a second press straight away would be a backflip.)
      for (let k = 0; k < 10; k++) if (!step({ held: back, pressed: 0 })) return null;
      if (!step({ held: fwd, pressed: 0 })) return null;
      if (!step({ held: 0, pressed: PRESS_JUMP })) return null;
      for (let k = 0; k < 12; k++) if (!step({ held: fwd, pressed: 0 })) return null;
      stuck = -10;
      lastX = me.x;
      continue;
    }
    if (!step({ held: fwd, pressed: 0 })) return null;
    if (!me.airborne && Math.abs(me.x - lastX) < 0.2) stuck++;
    else stuck = 0;
    lastX = me.x;
  }
  // Let go and land.
  for (let i = 0; i < 80 && me.airborne; i++) if (!step(EMPTY_INPUT)) return null;
  if (me.airborne) return null;
  // Not somewhere it has barely moved from, or beside a mine that's about to go off.
  if (Math.abs(me.x - s0.tardis.find((t) => t.id === me.id)!.x) < 20) return null;
  if (s.objects.some((o) => o.kind === 'mine' && o.fuse > 0 && Math.abs(o.x - me.x) < 60 && Math.abs(o.y - me.y) < 60)) return null;
  return { frames, end: s, crates, hurt: Math.max(0, hp - (me.hp - me.pendingDmg)) };
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
