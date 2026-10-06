// One online room: a lobby of up to 10 teams, then a match that the server
// simulates and streams to every player as lockstep input frames.
// Transport-agnostic (members just have a send function), so it can be
// unit-tested without sockets.

import { createWorld, DEFAULT_NAMES, MAX_TEAMS, tick, type TeamConfig } from '../src/sim/world';
import { DEFAULT_SCHEME, EMPTY_INPUT, type InputFrame, type Scheme, type WorldState } from '../src/sim/types';
import { WEAPONS } from '../src/sim/weapons';
import { TEAM_COLORS, TEAM_NAMES } from '../src/render/palette';
import { CpuPlayer } from '../src/ai/cpu';
import { encodeWorld, syncHash } from '../src/net/snapshot';
import { fromWire, toWire, type ClientMsg, type LobbySlot, type LobbyTeam, type ServerMsg, type WireFrame } from '../src/net/protocol';

/** Frames are sent in small batches to cut message count. */
const FLUSH_EVERY = 2;
/** A hash goes out this often so clients can spot a desync. */
const HASH_EVERY = 100;
/** Most queued input frames kept for the active player. */
const QUEUE_MAX = 50;

export interface Member {
  send(msg: ServerMsg): void;
}

interface Slot {
  team: LobbyTeam;
  cpu: boolean;
  member: Member | null;
  token: string;
  queue: InputFrame[];
  held: number;
}

const DEFAULT_TARDI_NAMES = ['Waddles', 'Tun', 'Mossy', 'Pudge'];

export function cleanText(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function cleanTeam(t: unknown, slot: number): LobbyTeam {
  const v = (t && typeof t === 'object' ? t : {}) as Partial<LobbyTeam>;
  const names = Array.from({ length: 4 }, (_, i) => cleanText(Array.isArray(v.names) ? v.names[i] : '', 14) || DEFAULT_TARDI_NAMES[i]);
  return {
    name: cleanText(v.name, 18) || TEAM_NAMES[slot % TEAM_NAMES.length],
    color: typeof v.color === 'number' && TEAM_COLORS.includes(v.color) ? v.color : TEAM_COLORS[slot % TEAM_COLORS.length],
    hat: typeof v.hat === 'string' && /^[a-z]{1,16}$/.test(v.hat) ? v.hat : 'beanie',
    names,
  };
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
  for (const k of ['turnTime', 'retreatTime', 'startHp', 'tardisPerTeam', 'mines', 'mineFuse', 'drums', 'roundTime', 'waterRise', 'supers'] as const) {
    if (out[k] !== undefined) out[k] = Math.round(out[k]);
  }
  if (typeof v.fallDamage === 'boolean') out.fallDamage = v.fallDamage;
  if (typeof v.movement === 'boolean') out.movement = v.movement;
  if (v.weapons && typeof v.weapons === 'object') {
    const w: Record<string, number> = {};
    for (const [id, n] of Object.entries(v.weapons as Record<string, unknown>)) {
      if (WEAPONS[id] && !WEAPONS[id].hidden && typeof n === 'number' && Number.isInteger(n) && n >= -1 && n <= 99) w[id] = n;
    }
    out.weapons = w;
  }
  return out;
}

/** Rebuild an input frame from untrusted data: known button bits and command shapes only. */
export function cleanFrame(raw: unknown): InputFrame {
  if (!Array.isArray(raw)) return { held: 0, pressed: 0 };
  const f = fromWire([Number(raw[0]) & 0xff, Number(raw[1]) & 0xff]);
  const c = raw[2] as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object') return f;
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (c.t === 'weapon' && typeof c.id === 'string' && c.id.length <= 20) f.cmd = { t: 'weapon', id: c.id };
  else if (c.t === 'fuse' && finite(c.s)) f.cmd = { t: 'fuse', s: c.s as number };
  else if (c.t === 'target' && finite(c.x) && finite(c.y)) f.cmd = { t: 'target', x: Math.round(c.x as number), y: Math.round(c.y as number) };
  else if (c.t === 'aim' && finite(c.aim) && (c.facing === 1 || c.facing === -1)) f.cmd = { t: 'aim', facing: c.facing, aim: c.aim as number };
  else if (c.t === 'skip') f.cmd = { t: 'skip' };
  return f;
}

function randomToken(): string {
  return Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
}

export class Room {
  private slots: Slot[] = [];
  private host = 0;
  private state: WorldState | null = null;
  private teams: TeamConfig[] = [];
  private scheme: Partial<Scheme> = {};
  private cpus = new Map<number, CpuPlayer>();
  private outbox: WireFrame[] = [];
  private outFrom = 0;
  private lastTeam = -1;
  /** Tick (ms clock) when the last connected human left; used to close empty rooms. */
  emptySince = 0;

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

  get humansConnected(): number {
    return this.slots.filter((s) => s.member).length;
  }

  /** Add a new human (or reclaim a slot with its token). Returns false if the room is full. */
  join(member: Member, team: unknown, token?: string): boolean {
    const back = token ? this.slots.find((s) => s.token === token && !s.member && !s.cpu) : undefined;
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
        if (isHost && !this.state && this.slots.length < MAX_TEAMS) {
          this.newSlot(cleanTeam({}, this.slots.length), true);
          this.broadcastRoom();
        }
        break;
      case 'removeSlot':
        if (isHost && !this.state && this.slots[msg.idx]?.cpu) {
          this.slots.splice(msg.idx, 1);
          this.pickHost();
          this.broadcastRoom();
        }
        break;
      case 'start':
        if (isHost && !this.state && this.slots.length >= 2) this.startMatch(msg.scheme);
        break;
      case 'input':
        if (this.state && this.state.turn.teamIdx === idx && slot.queue.length < QUEUE_MAX) {
          slot.queue.push(cleanFrame(msg.f));
        }
        break;
      case 'resync':
        if (this.state) this.sendSnapshot(slot);
        break;
      case 'leave':
        this.leave(member);
        break;
    }
  }

  /** Advance the match by one tick (call at 50 Hz). */
  step(): void {
    const s = this.state;
    if (!s) return;
    const ti = s.turn.teamIdx;
    if (ti !== this.lastTeam) {
      // New turn: forget anything queued during the previous one.
      for (const sl of this.slots) {
        sl.queue = [];
        sl.held = 0;
      }
      this.lastTeam = ti;
    }
    const slot = this.slots[ti];
    let frame: InputFrame = EMPTY_INPUT;
    if (slot && (slot.cpu || !slot.member)) {
      // CPU teams, and players who dropped out, are played by the computer.
      let cpu = this.cpus.get(ti);
      if (!cpu) this.cpus.set(ti, (cpu = new CpuPlayer()));
      frame = cpu.next(s);
    } else if (slot) {
      const q = slot.queue.shift();
      if (q) slot.held = q.held;
      frame = q ?? { held: slot.held, pressed: 0 };
    }
    tick(s, frame, []);
    this.outbox.push(toWire(frame));
    if (this.outbox.length >= FLUSH_EVERY) this.flush();
    if (s.tick % HASH_EVERY === 0) {
      this.flush();
      this.broadcast({ t: 'hash', tick: s.tick, h: syncHash(s) });
    }
    if (s.turn.phase === 'gameover') {
      this.flush();
      // Back to the lobby for a rematch; disconnected players' slots are freed.
      this.state = null;
      this.slots = this.slots.filter((sl) => sl.cpu || sl.member);
      this.pickHost();
      this.broadcastRoom();
    }
  }

  private newSlot(team: LobbyTeam, cpu: boolean): Slot {
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
    const slot: Slot = { team, cpu, member: null, token: randomToken(), queue: [], held: 0 };
    this.slots.push(slot);
    return slot;
  }

  private pickHost(): void {
    if (this.slots[this.host]?.member) return;
    const h = this.slots.findIndex((s) => s.member);
    this.host = h < 0 ? 0 : h;
  }

  private startMatch(rawScheme: unknown): void {
    this.scheme = cleanScheme(rawScheme);
    this.teams = this.slots.map((s) => ({ name: s.team.name, color: s.team.color, hat: s.team.hat, names: s.team.names, cpu: s.cpu }));
    const seed = (this.random() * 1e9) | 0;
    this.state = createWorld({ seed, teams: this.teams, scheme: { ...DEFAULT_SCHEME, ...this.scheme } });
    this.cpus.clear();
    this.outbox = [];
    this.outFrom = 0;
    this.lastTeam = -1;
    this.broadcastRoom();
    this.slots.forEach((s, i) => s.member?.send({ t: 'start', seed, scheme: this.scheme, teams: this.teams, you: i }));
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
    const slots: LobbySlot[] = this.slots.map((s, i) => ({ team: s.team, cpu: s.cpu, host: i === this.host, connected: s.cpu || s.member !== null }));
    this.slots.forEach((s, i) => s.member?.send({ t: 'room', code: this.code, slots, you: i, token: s.token, started: this.started }));
  }

  private broadcast(msg: ServerMsg): void {
    for (const s of this.slots) s.member?.send(msg);
  }
}
