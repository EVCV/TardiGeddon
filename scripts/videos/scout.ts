// The match scout: plays lots of CPU-only matches without drawing them, scores
// every turn for how watchable it is, and keeps the best matches as replays
// with their best moments marked. `render.mjs` then films those moments in the
// real game for long videos (docs/social/VIDEOS.md §3.6).
//
//   npx tsx scripts/videos/scout.ts [--matches 200] [--jobs 4] [--teams 2-10] [--seed 1] [--keep 40] [--out store/videos/scout]
//   npx tsx scripts/videos/scout.ts --remark store/video-batches/<batch>/scout-big   (the saved matches' moments again)
//
// The sim is deterministic: a replay is the starting world plus every button
// press, so a match found here plays out exactly the same in the browser.
// Nothing here goes into the game; the results are files on this computer.

import { fork } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, tick } from '../../src/sim/world';
import { CpuPlayer } from '../../src/ai/cpu';
import { MAP_STYLES } from '../../src/sim/terrain/generate';
import { presetScheme } from '../../src/sim/schemes';
import { WEAPONS } from '../../src/sim/weapons';
import { decodeWorld, encodeWorld } from '../../src/net/snapshot';
import { cleanFrame } from '../../src/net/protocol';
import { MAX_FRAMES, packFrames, unpackFrames } from '../../src/challenge/daily';
import { presetTeamName } from '../../src/names';
import { HATS } from '../../src/render/hats';
import { SKINS } from '../../src/render/skins';
import { TEAM_COLORS } from '../../src/render/palette';
import type { CpuSkill } from '../../src/ai/skills';
import type { InputFrame, SimEvent, WorldState } from '../../src/sim/types';

const TICKS_PER_SECOND = 50;
/** Game styles worth filming (Rope Race is its own thing). */
const STYLES = ['standard', 'quick', 'pro', 'chaos', 'armoured', 'bng', 'artillery'];
const SKILLS: CpuSkill[] = ['normal', 'hard', 'perfect'];

export interface Moment {
  /** First and last tick to film (from just before the shot to the dust settling). */
  from: number;
  to: number;
  score: number;
  /** "Concrete Tun: 3 popped" (English: these are for the video's own captions). */
  label: string;
  weapon: string;
  pops: number;
  /** The big moment (the blast that hurt someone, or the first blast): the slow-motion replay and the thumbnail. */
  peak: number;
  /** When the shot was fired. */
  fire?: number;
  /** When the damage was counted (the numbers and the pops, after the retreat time). */
  tally?: number;
  drowned: number;
  damage: number;
  ownGoal: boolean;
}

export interface ScoutedMatch {
  seed: number;
  teams: number;
  style: string;
  map: string;
  ticks: number;
  /** Played to the end (not cut off at the replay limit). */
  finished: boolean;
  winner: string | null;
  score: number;
  moments: Moment[];
  /** A MatchReplay (src/stats/matchReplay.ts), ready for the game's replay viewer. */
  replay: { v: 1; at: number; title: string; summary: string; start: string; frames: unknown[]; ticks: number };
}

/** A small seeded random, so match n is the same match every run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const sumPending = (s: WorldState): number => s.tardis.reduce((n, t) => n + (t.alive ? t.pendingDmg : 0), 0);

/**
 * Scores every turn of a match as it plays, tick by tick. A moment runs from
 * just before the shot to when it has all played out: everything has landed,
 * the damage has been counted and anyone popped has finished popping (in this
 * game the damage shows after the shooter's retreat time, so the pops come
 * seconds after the blast).
 */
export function momentTracker(s: WorldState): { step(s: WorldState, events: readonly SimEvent[]): void; finish(s: WorldState): Moment[] } {
  const moments: Moment[] = [];
  const teamOf = new Map(s.tardis.map((t) => [t.id, t.team]));
  const fresh = (team: number, start: number) => ({ team, start, fire: -1, last: -1, weapon: '', pops: 0, drowned: 0, damage: 0, ownGoal: false, blasts: 0, impact: -1, firstBlast: -1, tally: -1, lastPop: -1 });
  let turn = fresh(-1, 0);
  let pending = sumPending(s);
  const close = (end: number) => {
    if (turn.fire < 0) return;
    const w = WEAPONS[turn.weapon];
    const isSuper = !!(w as { super?: boolean } | undefined)?.super;
    const score = turn.damage + 70 * turn.pops + 60 * turn.drowned + 10 * Math.min(turn.blasts, 10) + (turn.pops >= 2 ? 80 * (turn.pops - 1) : 0) + (isSuper ? 60 : 0) + (turn.ownGoal ? 50 : 0);
    if (score < 40) return;
    const from = Math.max(turn.start, turn.fire - 1.5 * TICKS_PER_SECOND);
    // Past the last thing to happen: a pop needs its curl and burst (about 2 s), anything else a beat to land.
    const tail = turn.lastPop >= 0 && turn.lastPop >= turn.last - 25 ? 2.2 : 1.4;
    const to = Math.min(end, Math.max(turn.last, turn.fire) + tail * TICKS_PER_SECOND, turn.fire + 30 * TICKS_PER_SECOND);
    const what = w?.name ?? turn.weapon;
    const bits = [turn.pops ? `${turn.pops} popped` : '', turn.drowned ? `${turn.drowned} in the water` : '', turn.ownGoal ? 'own goal!' : ''].filter(Boolean);
    const peak = turn.impact >= 0 ? turn.impact : turn.firstBlast >= 0 ? turn.firstBlast : turn.tally >= 0 ? turn.tally : turn.fire;
    moments.push({ from, to, score, label: bits.length ? `${what}: ${bits.join(', ')}` : what, weapon: turn.weapon, peak, fire: turn.fire, tally: turn.tally, pops: turn.pops, drowned: turn.drowned, damage: turn.damage, ownGoal: turn.ownGoal });
  };
  return {
    step(s, events) {
      const now = sumPending(s);
      for (const e of events) {
        if (e.t === 'turnStart') {
          close(s.tick);
          turn = fresh(e.team, s.tick);
        } else if (e.t === 'fire') {
          if (turn.fire < 0) turn.fire = s.tick;
          turn.weapon = e.weapon;
        } else if (e.t === 'damage') {
          turn.damage += e.amount;
          if (turn.tally < 0) turn.tally = s.tick;
          turn.last = s.tick;
        } else if (e.t === 'explosion') {
          turn.blasts++;
          if (turn.fire >= 0 && turn.firstBlast < 0) turn.firstBlast = s.tick;
          // The blast that hurt someone (their damage is counted later): the big moment.
          if (turn.fire >= 0 && turn.impact < 0 && now > pending) turn.impact = s.tick;
          turn.last = s.tick;
        } else if (e.t === 'death' || e.t === 'drown') {
          if (e.t === 'death') {
            turn.pops++;
            turn.lastPop = s.tick;
          } else turn.drowned++;
          if (teamOf.get(e.id) === s.teams[turn.team]?.id || teamOf.get(e.id) === turn.team) turn.ownGoal = true;
          // Knocked into the water: that's the big moment if nothing hurt anyone first.
          if (e.t === 'drown' && turn.fire >= 0 && turn.impact < 0) turn.impact = s.tick;
          turn.last = s.tick;
        }
      }
      // Hurt with no blast (a punch, a fall, a bite): the big moment too.
      if (turn.fire >= 0 && turn.impact < 0 && now > pending) turn.impact = s.tick;
      pending = now;
    },
    finish(s) {
      close(s.tick);
      return moments.sort((a, b) => a.from - b.from);
    },
  };
}

/** The moments of a saved replay, worked out again by playing it (the sim is deterministic). */
export function replayMoments(replay: { start: string; frames: unknown[] }): { moments: Moment[]; ticks: number } {
  const s = decodeWorld(replay.start);
  const frames = unpackFrames(replay.frames, cleanFrame) ?? [];
  const events: SimEvent[] = [];
  const track = momentTracker(s);
  for (const f of frames) {
    if (s.turn.phase === 'gameover') break;
    tick(s, f, events);
    track.step(s, events);
    events.length = 0;
  }
  return { moments: track.finish(s), ticks: s.tick };
}

/** Plays match `seed` to the end and scores it. */
export function playMatch(seed: number, teamRange: [number, number]): ScoutedMatch {
  const r = rng(seed);
  // The CPU rolls dice too; seeded, so the run is the same every time.
  Math.random = rng(seed ^ 0x9e3779b9);
  const teams = teamRange[0] + Math.floor(r() * (teamRange[1] - teamRange[0] + 1));
  const style = pick(r, STYLES);
  const map = pick(r, MAP_STYLES).id;
  const base = presetScheme(style);
  // Big matches: fewer tardis each, so the mayhem doesn't take an hour.
  const tardisPerTeam = teams >= 7 ? 2 : teams >= 4 ? Math.min(3, base.tardisPerTeam) : base.tardisPerTeam;
  const names = new Set<string>();
  while (names.size < teams) names.add(presetTeamName(r));
  const hats = HATS.map((h) => h.id);
  const skins = SKINS.map((s) => s.id);
  const s = createWorld({
    seed,
    teams: [...names].map((name, i) => ({ name, color: TEAM_COLORS[i % TEAM_COLORS.length], cpu: true, hat: pick(r, hats), skin: r() < 0.5 ? pick(r, skins) : undefined })),
    scheme: { ...base, tardisPerTeam, mapStyle: map, armour: map === 'sky' && !base.armour ? 30 : base.armour },
  });
  const start = encodeWorld(s);
  const cpus = s.teams.map(() => new CpuPlayer(pick(r, SKILLS), Infinity));
  const frames: InputFrame[] = [];
  const events: SimEvent[] = [];
  const track = momentTracker(s);
  // The game's replays hold at most 15 minutes (MAX_FRAMES); a longer match couldn't be filmed.
  const maxTicks = MAX_FRAMES;
  while (s.turn.phase !== 'gameover' && s.tick < maxTicks) {
    const f = cpus[s.turn.teamIdx].next(s);
    frames.push(f);
    tick(s, f, events);
    track.step(s, events);
    events.length = 0;
  }
  const moments = track.finish(s);

  const w = s.turn.winner;
  const winner = w >= 0 ? (s.teams.find((t) => t.id === w)?.name ?? null) : null;
  const ranked = [...moments].sort((a, b) => b.score - a.score);
  // A match's score: its best five moments, and a bonus for a finished one.
  const score = ranked.slice(0, 5).reduce((n, m) => n + m.score, 0) + (s.turn.phase === 'gameover' ? 50 : 0);
  const mapName = MAP_STYLES.find((m) => m.id === map)?.name ?? map;
  return {
    seed,
    teams,
    style,
    map,
    ticks: s.tick,
    finished: s.turn.phase === 'gameover',
    winner,
    score,
    moments,
    replay: {
      v: 1,
      at: Date.UTC(2026, 10, 1),
      title: teams > 3 ? `${teams} teams` : s.teams.map((t) => t.name).join(' vs '),
      summary: `${mapName} · ${winner ? `${winner} won` : 'a draw'}`,
      start,
      frames: packFrames(frames),
      ticks: frames.length,
    },
  };
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const [lo, hi = lo] = arg('teams', '2-10').split('-').map(Number);
  const range: [number, number] = [Math.max(2, lo), Math.min(10, hi)];

  // --remark <scout folder>: work out the moments of the matches already saved there
  // again (better start and end points), without playing new matches.
  const remark = arg('remark', '');
  if (remark) {
    const dir = join(remark, 'matches');
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const m = JSON.parse(readFileSync(join(dir, f), 'utf8')) as ScoutedMatch;
      const { moments, ticks } = replayMoments(m.replay);
      if (ticks !== m.ticks) throw new Error(`${f}: the replay now plays out differently (${ticks} ticks, was ${m.ticks}); scout again`);
      m.moments = moments;
      writeFileSync(join(dir, f), JSON.stringify(m));
      console.log(`  ${f}: ${moments.length} moments`);
    }
    return;
  }

  // A worker: plays the seeds it's given and sends each result back.
  if (process.argv.includes('--worker')) {
    for (const seed of arg('seeds', '').split(',').map(Number)) process.send!(playMatch(seed, range));
    return;
  }

  const count = Number(arg('matches', '200'));
  const first = Number(arg('seed', '1'));
  const keep = Number(arg('keep', '40'));
  const jobs = Math.max(1, Math.min(Number(arg('jobs', String(Math.max(1, availableParallelism() - 1)))), count));
  const out = arg('out', 'store/videos/scout');
  mkdirSync(join(out, 'matches'), { recursive: true });

  const seeds = Array.from({ length: count }, (_, i) => first + i);
  const results: ScoutedMatch[] = [];
  const t0 = Date.now();
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: jobs }, (_, j) => {
      const mine = seeds.filter((_, i) => i % jobs === j);
      return new Promise<void>((resolve, reject) => {
        const child = fork(self, ['--worker', '--seeds', mine.join(','), '--teams', `${range[0]}-${range[1]}`]);
        child.on('message', (m: ScoutedMatch) => {
          results.push(m);
          const best = m.moments.reduce((a, b) => Math.max(a, b.score), 0);
          console.log(`  ${String(results.length).padStart(4)}/${count}  seed ${m.seed}: ${m.teams} teams, ${m.style}, ${m.map}, ${Math.round(m.ticks / TICKS_PER_SECOND / 60)} min, score ${m.score} (best moment ${best})`);
        });
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${j} stopped (${code})`))));
      });
    }),
  );

  results.sort((a, b) => b.score - a.score);
  // Only matches that finished inside the replay limit (a match cut off at 15 minutes has no ending to film).
  const kept = results.filter((m) => m.finished).slice(0, keep);
  for (const m of kept) writeFileSync(join(out, 'matches', `${m.seed}.json`), JSON.stringify(m));
  // The best moments of all, for a "best of" video.
  const moments = kept
    .flatMap((m) => m.moments.map((x) => ({ seed: m.seed, teams: m.teams, map: m.map, style: m.style, ...x })))
    .sort((a, b) => b.score - a.score);
  const index = {
    made: new Date().toISOString(),
    matches: results.length,
    minutes: Math.round(((Date.now() - t0) / 60_000) * 10) / 10,
    kept: kept.map(({ replay: _r, moments: ms, ...m }) => ({ ...m, moments: ms.length, best: ms.reduce((a, b) => Math.max(a, b.score), 0) })),
    topMoments: moments.slice(0, 100),
  };
  writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`\n${results.length} matches (${results.filter((m) => m.finished).length} finished) in ${index.minutes} min. Kept the best ${kept.length} in ${out}/matches; the top moments are in ${out}/index.json.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
