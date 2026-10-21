// One online room: a lobby of up to 10 teams, then a match that the server
// simulates and streams to every player as lockstep input frames.
// Transport-agnostic (members just have a send function), so it can be
// unit-tested without sockets.

import { createWorld, DEFAULT_NAMES, MAX_TEAMS, tick, type TeamConfig } from '../src/sim/world';
import { BTN_FIRE, DEFAULT_SCHEME, EMPTY_INPUT, type InputFrame, type Scheme, type SimEvent, type WorldState } from '../src/sim/types';
import { randomBytes } from 'node:crypto';
import { WEAPONS, isWeaponId } from '../src/sim/weapons';
import { TEAM_COLORS, TEAM_NAMES } from '../src/render/palette';
import { isMapStyle } from '../src/sim/terrain/generate';
import { defaultEmblem, isEmblem } from '../src/render/emblems';
import { ARENAS } from '../src/render/arenas';
import { seasonArenaOpen } from '../src/render/seasons';
import { presetTeamName, safeTeamNames } from '../src/names';
import { CpuPlayer } from '../src/ai/cpu';
import { canUse } from '../src/shop/catalog';
import { MatchTally } from '../src/stats/tally';
import type { MatchResult } from './store';
import { encodeWorld, syncHash } from '../src/net/snapshot';
import { cleanFrame, toWire, type ClientMsg, type LobbySlot, type LobbyTeam, type ServerMsg, type WireFrame } from '../src/net/protocol';

/** Frames are sent in small batches to cut message count. */
const FLUSH_EVERY = 2;
/** A hash goes out this often so clients can spot a desync. */
const HASH_EVERY = 100;
/** Most queued input frames kept for the active player. */
const QUEUE_MAX = 50;
/** Fire pressed this long (ticks) after a player's turn ran out gets a "too late" message. */
const LATE_TICKS = 150;
export const TOO_LATE = 'Too late: your turn had run out before your shot reached the game.';

export interface Member {
  send(msg: ServerMsg): void;
  /**
   * A player id others can block and report: from the account when signed in
   * (stable, but never the account id itself), else made up per connection.
   */
  pid?: string;
  /** The player's account, if they're signed in. */
  userId?: string;
  /** Season weapons they've unlocked (switched on in matches they host). */
  unlocked?: string[];
  /** Everything they own (the world look they pick for a room they host must be theirs). */
  owned?: string[];
}

export type { MatchResult };
export { cleanFrame };

/** Why a player can be reported (the game offers these; anything else is "other"). */
export const REPORT_REASONS = ['name', 'contact', 'cheating', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export interface ReportedPlayer {
  pid?: string;
  userId?: string;
  /** The names they typed, and (quick play) the made-up ones others saw. */
  typed: LobbyTeam;
  shown: LobbyTeam;
}

export interface PlayerReport {
  room: string;
  quick: boolean;
  reason: ReportReason;
  reporter: ReportedPlayer;
  reported: ReportedPlayer;
}

interface Slot {
  team: LobbyTeam;
  /** The names the player typed (quick play shows made-up ones instead): for reports. */
  typed: LobbyTeam;
  pid?: string;
  /** Who this player has reported in this room (their slot tokens), so one report each. */
  reported: Set<string>;
  cpu: boolean;
  member: Member | null;
  /** Account of the player who took this slot (kept if they drop out). */
  userId?: string;
  unlocked?: string[];
  owned?: string[];
  token: string;
  queue: InputFrame[];
  held: number;
  /** Ticks of the current match this human spent disconnected (the CPU played for them). */
  absent: number;
  /** Tick their last turn ran out with no shot, or -1: a late Fire then gets told why nothing happened. */
  timedOutAt: number;
}

/** Players away for more than this share of a match earn nothing from it, even if they rejoin. */
const MAX_ABSENT_SHARE = 0.25;

const DEFAULT_TARDI_NAMES = ['Waddles', 'Tun', 'Mossy', 'Pudge'];

/** A team from untrusted data: known looks only, and names safe to show (src/names.ts). */
export function cleanTeam(t: unknown, slot: number): LobbyTeam {
  const v = (t && typeof t === 'object' ? t : {}) as Partial<LobbyTeam>;
  const { name, names } = safeTeamNames(v.name, Array.isArray(v.names) ? v.names : [], { team: 18, tardi: 14 }, { team: TEAM_NAMES[slot % TEAM_NAMES.length], tardi: DEFAULT_TARDI_NAMES });
  return {
    name,
    color: typeof v.color === 'number' && TEAM_COLORS.includes(v.color) ? v.color : TEAM_COLORS[slot % TEAM_COLORS.length],
    hat: typeof v.hat === 'string' && /^[a-z]{1,16}$/.test(v.hat) ? v.hat : 'beanie',
    skin: typeof v.skin === 'string' && /^[a-z]{1,16}$/.test(v.skin) ? v.skin : 'classic',
    aim: typeof v.aim === 'string' && /^[a-z]{1,16}$/.test(v.aim) ? v.aim : 'classic',
    fx: typeof v.fx === 'string' && /^[a-z]{1,16}$/.test(v.fx) ? v.fx : 'classic',
    dance: typeof v.dance === 'string' && /^[a-z]{1,16}$/.test(v.dance) ? v.dance : 'classic',
    grave: typeof v.grave === 'string' && /^[a-z]{1,16}$/.test(v.grave) ? v.grave : 'classic',
    emblem: isEmblem(v.emblem) ? v.emblem : defaultEmblem(slot),
    names,
  };
}

/**
 * The team as sent, but with a shop hat its player doesn't own swapped for
 * the default one. Leaves anything else for cleanTeam to tidy.
 */
export function wearableTeam<T>(t: T, owned: readonly string[]): T {
  if (!t || typeof t !== 'object') return t;
  const { hat, skin, aim, fx, dance, grave } = t as { hat?: unknown; skin?: unknown; aim?: unknown; fx?: unknown; dance?: unknown; grave?: unknown };
  let out = t;
  if (typeof hat === 'string' && !canUse('hat', hat, owned)) out = { ...out, hat: 'beanie' };
  if (typeof skin === 'string' && !canUse('skin', skin, owned)) out = { ...out, skin: 'classic' };
  if (typeof aim === 'string' && !canUse('aim', aim, owned)) out = { ...out, aim: 'classic' };
  if (typeof fx === 'string' && !canUse('fx', fx, owned)) out = { ...out, fx: 'classic' };
  if (typeof dance === 'string' && !canUse('dance', dance, owned)) out = { ...out, dance: 'classic' };
  if (typeof grave === 'string' && !canUse('grave', grave, owned)) out = { ...out, grave: 'classic' };
  return out;
}

/** Only known scheme fields, clamped to sane ranges. */
export function cleanScheme(raw: unknown): Partial<Scheme> {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Partial<Scheme> = {};
  const num = (k: keyof Scheme, lo: number, hi: number) => {
    const x = v[k];
    if (typeof x === 'number' && Number.isFinite(x)) (out as Record<string, number>)[k] = Math.max(lo, Math.min(hi, x));
  };
  num('turnTime', 10, 120);
  num('retreatTime', 0, 10);
  num('startHp', 10, 300);
  num('tardisPerTeam', 1, 4);
  num('windMax', 0, 1);
  num('mines', 0, 30);
  num('mineFuse', 1, 5);
  num('drums', 0, 20);
  num('crateChance', 0, 1);
  num('roundTime', 1, 60);
  num('waterRise', 0, 100);
  num('supers', 0, 5);
  num('armour', 0, 100);
  num('aimGuide', 0, 2);
  for (const k of ['turnTime', 'retreatTime', 'startHp', 'tardisPerTeam', 'mines', 'mineFuse', 'drums', 'roundTime', 'waterRise', 'supers', 'armour', 'aimGuide'] as const) {
    if (out[k] !== undefined) out[k] = Math.round(out[k]);
  }
  if (typeof v.fallDamage === 'boolean') out.fallDamage = v.fallDamage;
  if (typeof v.friendlyFire === 'boolean') out.friendlyFire = v.friendlyFire;
  if (typeof v.movement === 'boolean') out.movement = v.movement;
  if (typeof v.race === 'boolean') out.race = v.race;
  if (typeof v.weather === 'boolean') out.weather = v.weather;
  if (isMapStyle(v.mapStyle)) out.mapStyle = v.mapStyle;
  if (typeof v.arena === 'string' && ARENAS.some((a) => a.id === v.arena) && seasonArenaOpen(v.arena)) out.arena = v.arena;
  num('raceRounds', 1, 10);
  if (out.raceRounds !== undefined) out.raceRounds = Math.round(out.raceRounds);
  if (v.weapons && typeof v.weapons === 'object') {
    const w: Record<string, number> = {};
    for (const [id, n] of Object.entries(v.weapons as Record<string, unknown>)) {
      if (isWeaponId(id) && !WEAPONS[id].hidden && typeof n === 'number' && Number.isInteger(n) && n >= -1 && n <= 99) w[id] = n;
    }
    out.weapons = w;
  }
  return out;
}

/** A rejoin token: secret, so nobody can take over a dropped player's slot. */
function randomToken(): string {
  return randomBytes(16).toString('base64url');
}

export class Room {
  private slots: Slot[] = [];
  private host = 0;
  private state: WorldState | null = null;
  private teams: TeamConfig[] = [];
  private scheme: Partial<Scheme> = {};
  private cpus = new Map<number, CpuPlayer>();
  private tally: MatchTally | null = null;
  private outbox: WireFrame[] = [];
  private outFrom = 0;
  private lastTeam = -1;
  /** Tick (ms clock) when the last connected human left; used to close empty rooms. */
  emptySince = 0;
  /** Called when a match finishes, with the signed-in players' results (for account stats). */
  onResult: ((results: MatchResult[]) => void) | null = null;
  /** Called when a player reports another one. */
  onReport: ((r: PlayerReport) => void) | null = null;
  /** Quick play with strangers: every team gets a made-up name instead of what its player typed. */
  quick = false;

  constructor(
    readonly code: string,
    private now: () => number = Date.now,
    private random: () => number = Math.random,
  ) {}

  get started(): boolean {
    return this.state !== null;
  }

  get world(): WorldState | null {
    return this.state;
  }

  /** Everyone connected to this room. */
  get members(): Member[] {
    return this.slots.flatMap((s) => (s.member ? [s.member] : []));
  }

  get humansConnected(): number {
    return this.slots.filter((s) => s.member).length;
  }

  /** Add a new human (or reclaim a slot with its token). Returns false if the room is full. */
  join(member: Member, team: unknown, token?: string): boolean {
    // The token is secret, so it's the same player: they may take the slot back
    // even while their old connection still looks open (it went quiet, and
    // their game gave up on it before our heartbeat did).
    const back = token ? this.slots.find((s) => s.token === token && !s.cpu) : undefined;
    if (back) {
      back.member = member;
      this.emptySince = 0;
      if (!this.slots[this.host]?.member) this.host = this.slots.indexOf(back);
      this.broadcastRoom();
      if (this.state) this.sendSnapshot(back);
      return true;
    }
    if (this.state || this.slots.length >= MAX_TEAMS) return false;
    const slot = this.newSlot(cleanTeam(team, this.slots.length), false);
    slot.member = member;
    slot.pid = member.pid;
    slot.userId = member.userId;
    slot.unlocked = member.unlocked;
    slot.owned = member.owned;
    if (this.slots.length === 1 || !this.slots[this.host]?.member) this.host = this.slots.length - 1;
    this.emptySince = 0;
    this.broadcastRoom();
    return true;
  }

  leave(member: Member): void {
    const slot = this.slots.find((s) => s.member === member);
    if (!slot) return;
    slot.member = null;
    slot.queue = [];
    slot.held = 0;
    if (!this.state) {
      // In the lobby a leaver's slot goes away.
      this.slots.splice(this.slots.indexOf(slot), 1);
    }
    this.pickHost();
    if (this.humansConnected === 0) this.emptySince = this.now();
    this.broadcastRoom();
  }

  handle(member: Member, msg: ClientMsg): void {
    const idx = this.slots.findIndex((s) => s.member === member);
    if (idx < 0) return;
    const slot = this.slots[idx];
    const isHost = idx === this.host;
    switch (msg.t) {
      case 'addCpu':
        if (isHost) this.addCpu();
        break;
      case 'removeSlot':
        if (isHost && !this.state && this.slots[msg.idx]?.cpu) {
          this.slots.splice(msg.idx, 1);
          this.pickHost();
          this.broadcastRoom();
        }
        break;
      case 'start':
        // The host's unlocked season weapons are switched on for everyone in the room.
        if (isHost && !this.state && this.slots.length >= 2) this.startMatch(msg.scheme, slot.unlocked ?? [], slot.owned ?? []);
        break;
      case 'input': {
        if (!this.state) break;
        const f = cleanFrame(msg.f);
        if (slot.timedOutAt >= 0 && (f.held & BTN_FIRE) !== 0) this.tooLate(slot);
        else if (this.state.turn.teamIdx === idx && slot.queue.length < QUEUE_MAX) slot.queue.push(f);
        break;
      }
      case 'resync':
        if (this.state) this.sendSnapshot(slot);
        break;
      case 'leave':
        this.leave(member);
        break;
      case 'report': {
        const target = this.slots[msg.idx];
        if (!target || target === slot || target.cpu || slot.reported.has(target.token)) break;
        slot.reported.add(target.token);
        const who = (x: Slot): ReportedPlayer => ({ pid: x.pid, userId: x.userId, typed: x.typed, shown: x.team });
        const reason = (REPORT_REASONS as readonly string[]).includes(msg.reason) ? (msg.reason as ReportReason) : 'other';
        this.onReport?.({ room: this.code, quick: this.quick, reason, reporter: who(slot), reported: who(target) });
        break;
      }
    }
  }

  /** Add a CPU team (lobby only). */
  addCpu(): void {
    if (this.state || this.slots.length >= MAX_TEAMS) return;
    this.newSlot(cleanTeam({}, this.slots.length), true);
    this.broadcastRoom();
  }

  /** Start the match now (used by quick play, which has no host: standard weapons only). */
  start(scheme: unknown): void {
    if (!this.state && this.slots.length >= 2) this.startMatch(scheme, [], []);
  }

  /** Advance the match by one tick (call at 50 Hz). */
  step(): void {
    const s = this.state;
    if (!s) return;
    for (const sl of this.slots) if (!sl.cpu && !sl.member) sl.absent++;
    const ti = s.turn.teamIdx;
    if (ti !== this.lastTeam) {
      // New turn: forget anything queued during the previous one.
      for (const sl of this.slots) {
        sl.queue = [];
        sl.held = 0;
      }
      if (this.slots[ti]) this.slots[ti].timedOutAt = -1;
      this.lastTeam = ti;
    }
    const slot = this.slots[ti];
    let frame: InputFrame = EMPTY_INPUT;
    if (slot && (slot.cpu || !slot.member)) {
      // CPU teams, and players who dropped out, are played by the computer.
      let cpu = this.cpus.get(ti);
      if (!cpu) this.cpus.set(ti, (cpu = new CpuPlayer('normal')));
      frame = cpu.next(s);
    } else if (slot) {
      const q = slot.queue.shift();
      if (q) slot.held = q.held;
      frame = q ?? { held: slot.held, pressed: 0 };
    }
    const was = { phase: s.turn.phase, timer: s.turn.timer };
    const events: SimEvent[] = [];
    tick(s, frame, events);
    if (slot && !slot.cpu) {
      if (was.phase === 'aim' && was.timer <= 1 && s.turn.phase !== 'aim' && s.turn.phase !== 'retreat') {
        // The clock ran out before they fired. A Fire still on its way (or
        // waiting in the queue) will do nothing, so they get told why.
        slot.timedOutAt = s.tick;
        if (slot.queue.some((q) => (q.held & BTN_FIRE) !== 0)) this.tooLate(slot);
      }
    }
    for (const sl of this.slots) if (sl.timedOutAt >= 0 && s.tick - sl.timedOutAt > LATE_TICKS) sl.timedOutAt = -1;
    this.tally?.add(s, events);
    this.outbox.push(toWire(frame));
    if (this.outbox.length >= FLUSH_EVERY) this.flush();
    if (s.tick % HASH_EVERY === 0) {
      this.flush();
      this.broadcast({ t: 'hash', tick: s.tick, h: syncHash(s) });
    }
    if (s.turn.phase === 'gameover') {
      this.flush();
      // Signed-in players here at the end who played most of the match, each account
      // once (two tabs don't pay twice; leaving, or rejoining just for the end, pays nothing).
      const seen = new Set<string>();
      const paid = this.slots.flatMap((sl, i) => {
        if (!sl.userId || sl.cpu || !sl.member || sl.absent > s.tick * MAX_ABSENT_SHARE || seen.has(sl.userId)) return [];
        seen.add(sl.userId);
        return [{ i, userId: sl.userId }];
      });
      // The online Slime rate needs two or more different accounts playing each
      // other; against the CPU or guests it pays the CPU rate, under its daily cap.
      const slime = paid.length >= 2 ? ('online' as const) : ('cpu' as const);
      const results: MatchResult[] = paid.map(({ i, userId }) => ({ userId, mode: 'online' as const, slime, won: s.turn.winner === i, ...this.tally!.teams[i] }));
      if (results.length) this.onResult?.(results);
      // Back to the lobby for a rematch; disconnected players' slots are freed.
      this.state = null;
      this.slots = this.slots.filter((sl) => sl.cpu || sl.member);
      this.pickHost();
      this.broadcastRoom();
    }
  }

  private newSlot(team: LobbyTeam, cpu: boolean): Slot {
    const typed: LobbyTeam = { ...team, names: [...team.names] };
    if (this.quick) {
      // Strangers never see each other's typed names: made-up ones, kept unique in the room.
      let name = presetTeamName(this.random);
      for (let i = 0; i < 20 && this.slots.some((s) => s.team.name === name); i++) name = presetTeamName(this.random);
      team.name = name;
      team.names = DEFAULT_NAMES.slice(this.slots.length * 4, this.slots.length * 4 + 4);
    }
    // Keep colours, team names and tardi names unique within the room.
    if (this.slots.some((s) => s.team.color === team.color)) {
      team.color = TEAM_COLORS.find((c) => !this.slots.some((s) => s.team.color === c)) ?? team.color;
    }
    if (this.slots.some((s) => s.team.name === team.name)) {
      const free = TEAM_NAMES.find((n) => !this.slots.some((s) => s.team.name === n));
      team.name = free ?? `${team.name.slice(0, 15)} ${this.slots.length + 1}`;
    }
    const used = new Set(this.slots.flatMap((s) => s.team.names));
    team.names = team.names.map((n) => {
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
      const alt = DEFAULT_NAMES.find((d) => !used.has(d)) ?? n;
      used.add(alt);
      return alt;
    });
    const slot: Slot = { team, typed, reported: new Set(), cpu, member: null, token: randomToken(), queue: [], held: 0, absent: 0, timedOutAt: -1 };
    this.slots.push(slot);
    return slot;
  }

  private pickHost(): void {
    if (this.slots[this.host]?.member) return;
    const h = this.slots.findIndex((s) => s.member);
    this.host = h < 0 ? 0 : h;
  }

  private startMatch(rawScheme: unknown, unlocked: string[], owned: string[]): void {
    this.scheme = { ...cleanScheme(rawScheme), unlocked: unlocked.filter((id) => isWeaponId(id) && WEAPONS[id].locked) };
    // The host picks the world everyone sees: a free one, or one they own.
    if (this.scheme.arena && !canUse('arena', this.scheme.arena, owned)) delete this.scheme.arena;
    this.teams = this.slots.map((s) => ({ name: s.team.name, color: s.team.color, hat: s.team.hat, skin: s.team.skin, aim: s.team.aim, fx: s.team.fx, dance: s.team.dance, grave: s.team.grave, emblem: s.team.emblem, names: s.team.names, cpu: s.cpu }));
    const seed = (this.random() * 1e9) | 0;
    this.state = createWorld({ seed, teams: this.teams, scheme: { ...DEFAULT_SCHEME, ...this.scheme } });
    this.cpus.clear();
    this.tally = new MatchTally(this.teams.length);
    for (const sl of this.slots) {
      sl.absent = 0;
      sl.timedOutAt = -1;
    }
    this.outbox = [];
    this.outFrom = 0;
    this.lastTeam = -1;
    this.broadcastRoom();
    this.slots.forEach((s, i) => s.member?.send({ t: 'start', seed, scheme: this.scheme, teams: this.teams, you: i }));
  }

  /** Tell a player their Fire came after their turn had run out (once per turn). */
  private tooLate(slot: Slot): void {
    slot.timedOutAt = -1;
    slot.member?.send({ t: 'error', msg: TOO_LATE });
  }

  private flush(): void {
    if (this.outbox.length === 0) return;
    this.broadcast({ t: 'frames', from: this.outFrom, f: this.outbox });
    this.outFrom += this.outbox.length;
    this.outbox = [];
  }

  private sendSnapshot(slot: Slot): void {
    if (!this.state || !slot.member) return;
    this.flush();
    slot.member.send({ t: 'snapshot', state: encodeWorld(this.state), teams: this.teams, you: this.slots.indexOf(slot) });
  }

  private broadcastRoom(): void {
    const slots: LobbySlot[] = this.slots.map((s, i) => ({ team: s.team, cpu: s.cpu, host: i === this.host, connected: s.cpu || s.member !== null, ...(s.pid ? { pid: s.pid } : {}) }));
    this.slots.forEach((s, i) => s.member?.send({ t: 'room', code: this.code, slots, you: i, token: s.token, started: this.started }));
  }

  private broadcast(msg: ServerMsg): void {
    for (const s of this.slots) s.member?.send(msg);
  }
}
