import { describe, expect, it } from 'vitest';
import { cleanFrame, cleanScheme, cleanTeam, Room, type Member } from '../server/room';
import { Lockstep } from '../src/net/lockstep';
import { decodeWorld, encodeWorld, syncHash } from '../src/net/snapshot';
import { hashWorld, tick } from '../src/sim/world';
import { BTN_FIRE, BTN_RIGHT } from '../src/sim/types';
import { toWire, type ServerMsg } from '../src/net/protocol';
import { makeWorld, run } from './helpers';

/** A fake connection that records what the server sends and keeps a lockstep copy. */
class Client implements Member {
  userId?: string;
  unlocked?: string[];
  msgs: ServerMsg[] = [];
  ls: Lockstep | null = null;
  send(msg: ServerMsg): void {
    // Through JSON, like the real wire.
    const m = JSON.parse(JSON.stringify(msg)) as ServerMsg;
    this.msgs.push(m);
    if (m.t === 'start') this.ls = Lockstep.start(m.seed, m.scheme, m.teams, m.you);
    if (m.t === 'frames') this.ls?.onFrames(m.from, m.f);
    if (m.t === 'hash') this.ls?.onHash(m.tick, m.h);
    if (m.t === 'snapshot') {
      if (this.ls) this.ls.onSnapshot(m.state, m.you);
      else this.ls = Lockstep.fromSnapshot(m.state, m.you);
    }
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return [...this.msgs].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined;
  }
  /** Play everything buffered. */
  catchUp(): void {
    while (this.ls && this.ls.step([]));
  }
}

const team = (name: string) => ({ name, color: 0xe04848, hat: 'tophat', names: ['A', 'B', '', ''] });

function lobby() {
  // Fixed map seed so the tests are repeatable.
  const room = new Room('ABCDE', Date.now, () => 0.42);
  const a = new Client();
  const b = new Client();
  room.join(a, team('Alpha'));
  room.join(b, team('Bravo'));
  return { room, a, b };
}

describe('online room', () => {
  it('builds a lobby: host, unique colours, CPU slots, cleaned names', () => {
    const { room, a, b } = lobby();
    room.handle(b, { t: 'addCpu' }); // not host: ignored
    room.handle(a, { t: 'addCpu' });
    const r = b.last('room')!;
    expect(r.slots.map((s) => s.team.name).slice(0, 2)).toEqual(['Alpha', 'Bravo']);
    expect(r.slots.length).toBe(3);
    expect(r.slots[0].host).toBe(true);
    expect(r.slots[2].cpu).toBe(true);
    expect(new Set(r.slots.map((s) => s.team.color)).size).toBe(3);
    expect(r.slots[0].team.names).toEqual(['A', 'B', 'Mossy', 'Pudge']);
    expect(r.you).toBe(1);
    // Same profile twice: the second gets its own team name and tardi names.
    const c = new Client();
    room.join(c, team('Alpha'));
    const r2 = c.last('room')!;
    expect(new Set(r2.slots.map((s) => s.team.name)).size).toBe(4);
    const names = r2.slots.flatMap((s) => s.team.names);
    expect(new Set(names).size).toBe(names.length);
  });

  it('streams frames that keep every client in step with the server', () => {
    const { room, a, b } = lobby();
    room.handle(a, { t: 'start', scheme: { turnTime: 20, tardisPerTeam: 2 } });
    expect(a.ls && b.ls).toBeTruthy();
    expect(a.ls!.you).toBe(0);
    expect(b.ls!.you).toBe(1);
    // Play a few turns: whoever's turn it is walks and fires.
    let turns = 0;
    for (let i = 0; i < 50 * 60; i++) {
      const s = room.world;
      if (!s) break; // someone won
      turns = s.turn.turnNumber;
      const active = s.turn.teamIdx === 0 ? a : b;
      if (i % 7 === 0) room.handle(active, { t: 'input', f: toWire({ held: BTN_RIGHT, pressed: 0 }) });
      if (i % 50 === 0) room.handle(active, { t: 'input', f: toWire({ held: BTN_FIRE, pressed: 0 }) });
      if (i % 50 === 20) room.handle(active, { t: 'input', f: toWire({ held: 0, pressed: 0 }) });
      room.step();
      a.catchUp();
      b.catchUp();
    }
    expect(turns).toBeGreaterThan(2);
    expect(a.ls!.desynced || b.ls!.desynced).toBe(false);
    expect(a.msgs.some((m) => m.t === 'hash')).toBe(true);
    // Both clients sit where the server is (minus any unflushed frame).
    if (room.world) {
      expect(room.world.tick - a.ls!.state.tick).toBeLessThanOrEqual(1);
    } else {
      expect(a.ls!.state.turn.phase).toBe('gameover');
    }
    expect(hashWorld(a.ls!.state)).toBe(hashWorld(b.ls!.state));
  });

  it('ignores input from a player whose turn it is not', () => {
    const { room, a, b } = lobby();
    room.handle(a, { t: 'start', scheme: {} });
    const s = room.world!;
    const idle = s.turn.teamIdx === 0 ? b : a;
    for (let i = 0; i < 200; i++) {
      room.handle(idle, { t: 'input', f: toWire({ held: BTN_RIGHT, pressed: 0 }) });
      room.step();
    }
    const frames = idle.msgs.filter((m) => m.t === 'frames').flatMap((m) => (m.t === 'frames' ? m.f : []));
    expect(frames.every((f) => f === 0)).toBe(true);
  });

  it('lets a dropped player rejoin with a snapshot, and plays their turns meanwhile', () => {
    const { room, a, b } = lobby();
    room.handle(a, { t: 'start', scheme: { turnTime: 10 } });
    const token = b.last('room')!.token;
    room.leave(b);
    for (let i = 0; i < 50 * 40; i++) room.step(); // b's turns are played by the computer
    expect(room.world!.turn.turnNumber).toBeGreaterThan(1);
    const b2 = new Client();
    expect(room.join(b2, team('Bravo'), token)).toBe(true);
    // b2 has no lockstep yet: build one from the snapshot.
    const snap = b2.last('snapshot')!;
    expect(snap.you).toBe(1);
    const st = decodeWorld(snap.state);
    expect(hashWorld(st)).toBe(hashWorld(room.world!));
    // ...and stays in step afterwards.
    for (let i = 0; i < 300 && room.started; i++) {
      room.step();
      b2.catchUp();
    }
    expect(b2.ls!.desynced).toBe(false);
    if (room.world) expect(room.world.tick - b2.ls!.state.tick).toBeLessThanOrEqual(1);
  });

  it('sends a snapshot that fixes a desynced client', () => {
    const { room, a, b } = lobby();
    room.handle(a, { t: 'start', scheme: {} });
    for (let i = 0; i < 120; i++) room.step();
    b.catchUp();
    b.ls!.state.tardis[0].hp = 1; // corrupt b's copy
    for (let i = 0; i < 100; i++) {
      room.step();
      b.catchUp();
    }
    expect(b.ls!.desynced).toBe(true);
    room.handle(b, { t: 'resync' });
    expect(b.ls!.desynced).toBe(false);
    expect(hashWorld(b.ls!.state)).toBe(hashWorld(room.world!));
  });

  it('spots a desync in non-physics state too (ammo)', () => {
    const { room, a, b } = lobby();
    room.handle(a, { t: 'start', scheme: {} });
    for (let i = 0; i < 20; i++) room.step();
    b.catchUp();
    b.ls!.state.teams[0].ammo.bazooka = 5; // physics untouched, ammo differs
    for (let i = 0; i < 100; i++) {
      room.step();
      b.catchUp();
    }
    expect(b.ls!.desynced).toBe(true);
    room.handle(b, { t: 'resync' });
    expect(b.ls!.state.teams[0].ammo.bazooka).toBe(-1);
    expect(b.ls!.desynced).toBe(false);
  });

  it('returns to the lobby when the match ends', () => {
    const { room, a } = lobby();
    room.handle(a, { t: 'start', scheme: { tardisPerTeam: 1, turnTime: 10 } });
    const s = room.world!;
    for (const t of s.tardis) if (t.team === 1) t.hp = 0, t.alive = false;
    for (let i = 0; i < 50 * 60 && room.started; i++) room.step();
    expect(room.started).toBe(false);
    expect(a.last('room')!.started).toBe(false);
  });

  it("switches on the host's unlocked season weapons for everyone; quick play stays standard", () => {
    const room = new Room('KLMNO', Date.now, () => 0.42);
    const host = new Client();
    host.unlocked = ['megaspore', 'notaweapon'];
    const guest = new Client(); // unlocked nothing
    room.join(host, team('Alpha'));
    room.join(guest, team('Bravo'));
    room.handle(host, { t: 'start', scheme: { unlocked: ['balloon'] } as never }); // a client can't add its own
    for (const tm of room.world!.teams) {
      expect(tm.ammo.megaspore).toBe(1);
      expect(tm.ammo.balloon).toBe(0);
    }
    expect(guest.ls!.state.scheme.unlocked).toEqual(['megaspore']);

    const quick = new Room('PQRST', Date.now, () => 0.42);
    const a = new Client();
    a.unlocked = ['megaspore'];
    quick.join(a, team('Alpha'));
    quick.addCpu();
    quick.start({});
    expect(quick.world!.teams[0].ammo.megaspore).toBe(0);
  });

  it("reports signed-in players' results when the match ends", () => {
    const room = new Room('FGHIJ', Date.now, () => 0.42);
    const a = new Client();
    a.userId = 'user-a';
    const b = new Client(); // signed out: not reported
    room.join(a, team('Alpha'));
    room.join(b, team('Bravo'));
    const reported: { userId: string; mode: string; won: boolean }[][] = [];
    room.onResult = (r) => reported.push(r);
    room.handle(a, { t: 'start', scheme: { tardisPerTeam: 1, turnTime: 10 } });
    for (const t of room.world!.tardis) if (t.team === 1) t.hp = 0, t.alive = false;
    for (let i = 0; i < 50 * 60 && room.started; i++) room.step();
    expect(reported).toHaveLength(1);
    // A signed-out opponent: stats count it online, but Slime is paid at the capped CPU rate.
    expect(reported[0]).toMatchObject([{ userId: 'user-a', mode: 'online', slime: 'cpu', won: true }]);
  });

  /** Play a 1-tardi match to the end with team 1 popped; returns what was reported. */
  const finish = (room: Room, host: Client): { userId: string; slime?: string }[] => {
    const reported: { userId: string; slime?: string }[][] = [];
    room.onResult = (r) => reported.push(r);
    room.handle(host, { t: 'start', scheme: { tardisPerTeam: 1, turnTime: 10 } });
    for (const t of room.world!.tardis) if (t.team === 1) t.hp = 0, t.alive = false;
    for (let i = 0; i < 50 * 60 && room.started; i++) room.step();
    return reported[0] ?? [];
  };

  it('pays the online Slime rate only when two different accounts play each other', () => {
    const room = new Room('KLMNO', Date.now, () => 0.42);
    const a = new Client();
    a.userId = 'user-a';
    const b = new Client();
    b.userId = 'user-b';
    room.join(a, team('Alpha'));
    room.join(b, team('Bravo'));
    expect(finish(room, a)).toMatchObject([
      { userId: 'user-a', slime: 'online' },
      { userId: 'user-b', slime: 'online' },
    ]);
  });

  it('pays one account once, at the CPU rate, however many tabs it plays from', () => {
    const room = new Room('UVWXY', Date.now, () => 0.42);
    const a = new Client();
    a.userId = 'user-a';
    const a2 = new Client();
    a2.userId = 'user-a';
    room.join(a, team('Alpha'));
    room.join(a2, team('Bravo'));
    expect(finish(room, a)).toEqual([expect.objectContaining({ userId: 'user-a', slime: 'cpu' })]);
  });

  it('pays nothing to a player who rejoins only for the end', () => {
    const room = new Room('EFGHJ', Date.now, () => 0.42);
    const a = new Client();
    a.userId = 'user-a';
    const b = new Client();
    b.userId = 'user-b';
    room.join(a, team('Alpha'));
    room.join(b, team('Bravo'));
    room.handle(a, { t: 'start', scheme: { tardisPerTeam: 1, turnTime: 10 } });
    const token = (room as unknown as { slots: { token: string }[] }).slots[0].token;
    room.leave(a);
    for (let i = 0; i < 50 * 20; i++) room.step(); // away for 20 s while the CPU plays
    const back = new Client();
    back.userId = 'user-a';
    expect(room.join(back, team('Alpha'), token)).toBe(true);
    const reported: { userId: string; slime?: string }[][] = [];
    room.onResult = (r) => reported.push(r);
    for (const t of room.world!.tardis) if (t.team === 1) t.hp = 0, t.alive = false;
    for (let i = 0; i < 50 * 60 && room.started; i++) room.step();
    // Only b is paid, and alone that's the CPU rate.
    expect(reported[0]).toEqual([expect.objectContaining({ userId: 'user-b', slime: 'cpu' })]);
  });

  it('pays nothing to a player who left before the end (the CPU played on for them)', () => {
    const room = new Room('ZABCD', Date.now, () => 0.42);
    const a = new Client();
    a.userId = 'user-a';
    const b = new Client();
    b.userId = 'user-b';
    room.join(a, team('Alpha'));
    room.join(b, team('Bravo'));
    room.handle(a, { t: 'start', scheme: { tardisPerTeam: 1, turnTime: 10 } });
    room.leave(a);
    const reported: { userId: string; slime?: string }[][] = [];
    room.onResult = (r) => reported.push(r);
    for (const t of room.world!.tardis) if (t.team === 1) t.hp = 0, t.alive = false;
    for (let i = 0; i < 50 * 60 && room.started; i++) room.step();
    expect(reported[0]).toEqual([expect.objectContaining({ userId: 'user-b', slime: 'cpu' })]);
  });
});

describe('snapshots', () => {
  it('round-trip a world exactly (hash and further play)', () => {
    const s = makeWorld(77);
    run(s, 300, { held: BTN_RIGHT, pressed: 0 });
    const c = decodeWorld(encodeWorld(s));
    expect(hashWorld(c)).toBe(hashWorld(s));
    expect(syncHash(c)).toBe(syncHash(s));
    for (let i = 0; i < 200; i++) {
      tick(s, { held: BTN_FIRE, pressed: 0 }, []);
      tick(c, { held: BTN_FIRE, pressed: 0 }, []);
    }
    expect(syncHash(c)).toBe(syncHash(s));
    expect(encodeWorld(s).length).toBeLessThan(400_000);
  });
});

describe('input sanitising', () => {
  it('cleans team profiles and schemes from the network', () => {
    const t = cleanTeam({ name: '  <b>\u0007Evil</b>   name that is far too long ', color: 123, hat: 'DROP TABLE', names: [42] }, 3);
    expect(t.name.length).toBeLessThanOrEqual(18);
    expect(t.name).not.toContain('\u0007');
    expect(t.color).not.toBe(123);
    expect(t.hat).toBe('beanie');
    expect(t.names[0]).toBe('Waddles');
    const sc = cleanScheme({ turnTime: 9999, startHp: -5, tardisPerTeam: 2.6, weapons: { bazooka: -1, nuke: 5, grenade: 1000 }, evil: 1 });
    expect(sc).toEqual({ turnTime: 120, startHp: 10, tardisPerTeam: 3, weapons: { bazooka: -1 } });
  });

  it('rebuilds input frames from junk without throwing', () => {
    for (const junk of [null, 'abc', 5, {}, [1], ['x', 'y', 'z'], [1, 2, null], [1, 2, { t: 'target', x: 'a', y: 1 }]]) {
      const f = cleanFrame(junk);
      expect(Number.isInteger(f.held) && Number.isInteger(f.pressed)).toBe(true);
      expect(f.cmd).toBeUndefined();
    }
    expect(cleanFrame([0x1ff, 1, { t: 'target', x: 10.6, y: 3, evil: 1 }])).toEqual({ held: 0xff, pressed: 1, cmd: { t: 'target', x: 11, y: 3 } });
    expect(cleanFrame([0, 0, { t: 'aim', facing: -1, aim: 300 }]).cmd).toEqual({ t: 'aim', facing: -1, aim: 300 });
  });
});
