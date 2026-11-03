// The CPU in a Rope Race. It works out its whole run on copies of the world
// before setting off (a few milliseconds a tick, like the shot planning in
// cpu.ts): from where it is, it tries casting the Silk Rope at a spread of
// angles, swinging forward for longer or shorter, reeling in or not, and
// letting go near the top of the swing; it keeps the few runs that got
// furthest without a dunking, and goes on from each. Then it presses exactly
// those buttons, which (the sim being deterministic) do exactly that.

import { AIM_MAX, activeTardi, ropeTrace, tick } from '../sim/world';
import { BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, EMPTY_INPUT, PRESS_JUMP, type InputFrame, type SimEvent, type WorldState } from '../sim/types';

/** Rope casts it tries: forward at these aims (fractions of straight up)... */
const AIMS = [0.42, 0.52, 0.62, 0.72, 0.82, 0.92];
/** ...and these back the way it came, for getting out of a pit or from under a ledge. */
const BACK_AIMS = [0.8, 0.95];
/** Lets go after swinging this many ticks (whichever gets furthest). */
const SWINGS = [18, 32, 48, 66, 90];
/** Reels in for this many ticks at the start of the swing (for height). */
const REELS = [0, 24];
/** Runs kept at each step (the rest are dropped). */
const BEAM = 3;
/** Most steps (casts) in one plan. */
const MAX_STEPS = 40;

/**
 * A copy of the world to rehearse on. The terrain is shared, not copied:
 * nothing in a Rope Race changes it (its blasts don't dig: sim explode()), and
 * copying it for every try would be most of the work.
 */
function raceClone(s: WorldState): WorldState {
  const { terrain, ...rest } = s;
  const c = structuredClone(rest) as WorldState;
  c.terrain = terrain;
  return c;
}

interface Run {
  s: WorldState;
  frames: InputFrame[];
  finished: boolean;
  score: number;
}

/** Press `f` on `s`. False if that went wrong: a dunking (back to the start), or the go is over without finishing. */
function press(s: WorldState, f: InputFrame, frames: InputFrame[], ev: SimEvent[]): 'ok' | 'finished' | 'failed' {
  const me = s.turn.activeTardi;
  ev.length = 0;
  tick(s, f, ev);
  frames.push(f);
  for (const e of ev) {
    if (e.t === 'finish') return 'finished';
    if (e.t === 'drown' && e.id === me) return 'failed';
  }
  return s.turn.phase === 'aim' ? 'ok' : 'failed';
}

/** How good a place to have got to: far along, not about to fall in, with something to rope onto next. */
function score(s: WorldState, frames: number, finished: boolean): number {
  const me = activeTardi(s)!;
  const r = s.race!;
  if (finished) return 1e9 - frames;
  let v = me.x - Math.abs(me.y - r.goalY) * 0.15 - frames * 0.25;
  if (me.y > s.waterY - 90 && me.airborne) v -= 200;
  if (me.airborne && !catchable(s)) v -= 600;
  return v;
}

/** Is there something to rope onto from here? */
function catchable(s: WorldState): boolean {
  const me = activeTardi(s)!;
  for (const f of [1, -1]) for (const a of [0.55, 0.75, 0.95]) if (ropeTrace(s.terrain, me.x, me.y, f, Math.round(AIM_MAX * a)).hit) return true;
  return false;
}

/** Every next step from `from`: rope casts and swings, or (on the ground near the flag) a walk to it. */
function* steps(from: Run, ev: SimEvent[]): Generator<void, Run[]> {
  const out: Run[] = [];
  const me0 = activeTardi(from.s)!;
  const r = from.s.race!;
  if (!me0.airborne && Math.abs(me0.x - r.goalX) < 320 && Math.abs(me0.y - r.goalY) < 60) {
    // Walk to the flag (hopping anything in the way).
    const s = raceClone(from.s);
    const frames = from.frames.slice();
    const dir = r.goalX > me0.x ? BTN_RIGHT : BTN_LEFT;
    let res: ReturnType<typeof press> = 'ok';
    let lastX = me0.x;
    for (let i = 0; i < 500 && res === 'ok'; i++) {
      const me = activeTardi(s)!;
      const stuck = !me.airborne && Math.abs(me.x - lastX) < 0.1 && i > 2;
      lastX = me.x;
      res = press(s, { held: dir, pressed: stuck ? PRESS_JUMP : 0 }, frames, ev);
    }
    if (res === 'finished') return [{ s, frames, finished: true, score: score(s, frames.length, true) }];
  }
  const casts: [1 | -1, number][] = [...AIMS.map((a): [1 | -1, number] => [1, a]), ...BACK_AIMS.map((a): [1 | -1, number] => [-1, a])];
  for (const [facing, a] of casts) {
    const aim = Math.round(AIM_MAX * a);
    if (!ropeTrace(from.s.terrain, me0.x, me0.y, facing, aim).hit) continue;
    for (const reel of REELS) {
      yield;
      const s = raceClone(from.s);
      const frames = from.frames.slice();
      // Aim, then cast (Fire must be up the tick before).
      if (press(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'rope' } }, frames, ev) !== 'ok') continue;
      if (press(s, { held: 0, pressed: 0, cmd: { t: 'aim', facing, aim } }, frames, ev) !== 'ok') continue;
      let res = press(s, { held: BTN_FIRE, pressed: 0 }, frames, ev);
      const me = activeTardi(s)!;
      if (res !== 'ok' || !me.rope) continue;
      const fwd = facing === 1 ? BTN_RIGHT : BTN_LEFT;
      for (let k = 1; k <= SWINGS[SWINGS.length - 1] && res === 'ok' && me.rope; k++) {
        res = press(s, { held: (backwards(facing, k) ? 0 : fwd) | (k <= reel ? BTN_UP : 0), pressed: 0 }, frames, ev);
        if (res === 'finished') {
          out.push({ s: raceClone(s), frames: frames.slice(), finished: true, score: score(s, frames.length, true) });
          break;
        }
        if (res !== 'ok' || !SWINGS.includes(k)) continue;
        // Let go here, and coast to about the top of the flight (or until it lands).
        const c = raceClone(s);
        const cf = frames.slice();
        let cr = press(c, { held: 0, pressed: PRESS_JUMP }, cf, ev);
        const cm = activeTardi(c)!;
        for (let i = 0; i < 40 && cr === 'ok' && cm.airborne && !cm.rope && cm.vy < -0.3; i++) cr = press(c, EMPTY_INPUT, cf, ev);
        if (cr === 'failed') continue;
        out.push({ s: c, frames: cf, finished: cr === 'finished', score: score(c, cf.length, cr === 'finished') });
      }
    }
  }
  return out;
}

/** Casting backwards (out of a pit), it swings that way for a bit, then turns for the flag. */
function backwards(facing: 1 | -1, k: number): boolean {
  return facing === -1 && k > 20;
}

/**
 * The CPU's run from where it stands to the flag: the frames to press, one
 * per tick. If it can't find a way all the way there, the best start it
 * found (it plans again from where that leaves it). Null if nothing works.
 * `sloppy` (0..1): how often it settles for a worse line, like a person would.
 */
export function* planRace(live: WorldState, sloppy: number): Generator<void, InputFrame[] | null> {
  const ev: SimEvent[] = [];
  let beam: Run[] = [{ s: raceClone(live), frames: [], finished: false, score: -Infinity }];
  let best: Run | null = null;
  const budget = live.turn.timer - 10;
  for (let step = 0; step < MAX_STEPS && beam.length; step++) {
    const next: Run[] = [];
    for (const run of beam) next.push(...(yield* steps(run, ev)));
    const done = next.filter((r) => r.finished && r.frames.length < budget).sort((a, b) => a.frames.length - b.frames.length);
    if (done.length) return pick(done, sloppy).frames;
    next.sort((a, b) => b.score - a.score);
    // Keep a few, not all bunched in the same place.
    beam = [];
    for (const r of next) {
      if (r.frames.length >= budget) continue;
      const me = activeTardi(r.s)!;
      if (beam.some((b) => Math.abs(activeTardi(b.s)!.x - me.x) < 25 && Math.abs(activeTardi(b.s)!.y - me.y) < 25)) continue;
      beam.push(r);
      if (beam.length >= BEAM) break;
    }
    if (beam.length && (!best || beam[0].score > best.score)) best = beam[0];
    if (beam.length && sloppy > 0 && Math.random() < sloppy) beam = [pick(beam, 1)];
  }
  return best && best.frames.length ? best.frames : null;
}

/** Usually the best; with `sloppy`, now and then the next one down. */
function pick<T>(sorted: T[], sloppy: number): T {
  return sorted.length > 1 && Math.random() < sloppy * 0.5 ? sorted[1] : sorted[0];
}
