import { describe, expect, it } from 'vitest';
import { createWorld, mapSizeFor, tick, MAX_TEAMS } from '../src/sim/world';
import { CpuPlayer } from '../src/ai/cpu';
import { EMPTY_INPUT, type SimEvent } from '../src/sim/types';

const teams = (n: number, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `T${i}`, color: i, cpu }));

describe('map size', () => {
  it('keeps the classic size for 2 teams of 4 and grows for more tardis', () => {
    expect(mapSizeFor(8)).toEqual({ w: 2000, h: 1000 });
    expect(mapSizeFor(16).w).toBeGreaterThan(2000);
    expect(mapSizeFor(40)).toEqual({ w: 6000, h: 1200 });
    expect(mapSizeFor(400).w).toBe(6000); // capped
  });
});

describe('big matches', () => {
  for (const n of [4, 6, 8, 10]) {
    it(`${n} teams of 4 all get a safe spawn`, () => {
      const s = createWorld({ seed: 100 + n, teams: teams(n) });
      expect(s.teams).toHaveLength(n);
      expect(s.tardis).toHaveLength(n * 4);
      expect(s.terrain.w).toBe(mapSizeFor(n * 4).w);
      for (const t of s.tardis) expect(t.y).toBeLessThan(s.waterY - 10);
      // Everyone starts at least 50px from everyone else.
      for (const a of s.tardis) {
        for (const b of s.tardis) {
          if (a !== b) expect(Math.abs(a.x - b.x) >= 50 || Math.abs(a.y - b.y) >= 50).toBe(true);
        }
      }
      // Names are unique within each team.
      for (const tm of s.teams) {
        const names = s.tardis.filter((t) => t.team === tm.id).map((t) => t.name);
        expect(new Set(names).size).toBe(names.length);
      }
    });
  }

  it('scales mines with map width', () => {
    const small = createWorld({ seed: 7, teams: teams(2) });
    const big = createWorld({ seed: 7, teams: teams(10) });
    const mines = (w: typeof small) => w.objects.filter((o) => o.kind === 'mine').length;
    expect(mines(big)).toBeGreaterThan(mines(small));
  });

  it('rejects too many teams', () => {
    expect(() => createWorld({ seed: 1, teams: teams(MAX_TEAMS + 1) })).toThrow();
  });

  it('gives every team a turn in order', () => {
    const s = createWorld({ seed: 3, teams: teams(6), scheme: { tardisPerTeam: 2 } });
    const seen: number[] = [];
    const ev: SimEvent[] = [];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 400 && s.turn.phase !== 'aim'; j++) tick(s, EMPTY_INPUT, ev);
      seen.push(s.turn.teamIdx);
      tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, ev);
      for (let j = 0; j < 400 && s.turn.phase !== 'start'; j++) tick(s, EMPTY_INPUT, ev);
    }
    expect(new Set(seen).size).toBe(6);
  });

  it('8 CPU teams play without stalling', () => {
    const s = createWorld({ seed: 11, teams: teams(8, true), scheme: { tardisPerTeam: 2, turnTime: 20 } });
    const cpus = s.teams.map(() => new CpuPlayer('perfect'));
    let lastTurn = s.turn.turnNumber;
    let since = 0;
    for (let i = 0; i < 50 * 60 * 6 && s.turn.phase !== 'gameover'; i++) {
      tick(s, cpus[s.turn.teamIdx].next(s), []);
      if (s.turn.turnNumber !== lastTurn) {
        lastTurn = s.turn.turnNumber;
        since = 0;
      }
      expect(++since).toBeLessThan(50 * 50);
    }
    expect(s.turn.turnNumber).toBeGreaterThan(8);
  }, 120_000);
});
