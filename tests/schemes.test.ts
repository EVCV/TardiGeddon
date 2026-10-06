import { describe, expect, it } from 'vitest';
import { activeTardi, createWorld, tick } from '../src/sim/world';
import { SCHEME_PRESETS, presetScheme } from '../src/sim/schemes';
import { CpuPlayer } from '../src/ai/cpu';
import { BTN_LEFT, BTN_RIGHT, PRESS_JUMP, type Scheme, type SimEvent } from '../src/sim/types';
import { run, runUntilPhase } from './helpers';

const teams = [
  { name: 'A', color: 1, cpu: false },
  { name: 'B', color: 2, cpu: false },
];
const world = (scheme: Partial<Scheme>, seed = 31) => createWorld({ seed, teams, scheme });

describe('scheme presets', () => {
  for (const p of SCHEME_PRESETS) {
    it(`${p.name} builds a playable world`, () => {
      const scheme = presetScheme(p.id);
      const s = world(scheme);
      expect(s.tardis).toHaveLength(scheme.tardisPerTeam * 2);
      expect(s.tardis[0].hp).toBe(scheme.startHp);
      expect(s.objects.filter((o) => o.kind === 'mine').length).toBeLessThanOrEqual(scheme.mines);
    });
  }

  it('falls back to Standard for an unknown id', () => {
    expect(presetScheme('nope')).toEqual(presetScheme('standard'));
  });
});

describe('weapon list', () => {
  it('only arms the listed weapons (plus Skip Go)', () => {
    const s = world(presetScheme('bng'));
    const ammo = s.teams[0].ammo;
    expect(ammo.bazooka).toBe(-1);
    expect(ammo.grenade).toBe(-1);
    expect(ammo.skip).toBe(-1);
    expect(ammo.shotgun).toBe(0);
    expect(ammo.rope).toBe(0);
  });

  it('refuses to select an unlisted weapon', () => {
    const s = world(presetScheme('bng'));
    runUntilPhase(s, 'aim');
    tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'shotgun' } }, []);
    expect(s.turn.weapon).toBe('bazooka');
  });

  it('only drops health crates when no listed weapon can be in a crate', () => {
    const s = world({ weapons: { bazooka: -1 }, crateChance: 1 });
    for (let i = 0; i < 6; i++) {
      runUntilPhase(s, 'aim');
      tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
      runUntilPhase(s, 'start');
    }
    const crates = s.objects.filter((o) => o.kind === 'crate');
    expect(crates.length).toBeGreaterThan(0);
    for (const c of crates) expect(c.contents).toBe('health');
  });
});

describe('Artillery (no movement)', () => {
  it('lets you turn round but not walk or jump', () => {
    const s = world(presetScheme('artillery'));
    runUntilPhase(s, 'aim');
    const me = activeTardi(s)!;
    const x = me.x;
    const facing = me.facing;
    run(s, 20, { held: facing === 1 ? BTN_LEFT : BTN_RIGHT, pressed: 0 });
    expect(me.facing).toBe(-facing);
    expect(me.x).toBe(x);
    tick(s, { held: 0, pressed: PRESS_JUMP }, []);
    run(s, 15);
    expect(me.airborne).toBe(false);
    expect(me.x).toBe(x);
  });
});

describe('CPU across styles', () => {
  for (const id of ['quick', 'bng', 'artillery', 'chaos']) {
    it(`${id}: CPU vs CPU plays without stalling`, () => {
      const s = createWorld({
        seed: 5,
        teams: teams.map((t) => ({ ...t, cpu: true })),
        scheme: { ...presetScheme(id), tardisPerTeam: 2 },
      });
      const cpus = [new CpuPlayer(1), new CpuPlayer(1)];
      for (let i = 0; i < 50 * 60 * 4 && s.turn.phase !== 'gameover'; i++) tick(s, cpus[s.turn.teamIdx].next(s), []);
      // Either someone won, or turns kept flowing (no soft-lock).
      expect(s.turn.phase === 'gameover' || s.turn.turnNumber > 3).toBe(true);
      expect(s.turn.turnNumber).toBeGreaterThan(1);
    }, 60_000);
  }
});

describe('CPU with a non-thrown arsenal', () => {
  it('uses the shotgun when that is all the style allows', () => {
    const s = createWorld({
      seed: 9,
      teams: teams.map((t) => ({ ...t, cpu: true })),
      scheme: { weapons: { shotgun: -1 }, mines: 0, drums: 0, crateChance: 0, tardisPerTeam: 1 },
    });
    // Flat arena with the two tardis facing off 120px apart.
    const t = s.terrain;
    t.mask.fill(0);
    for (let y = 600; y < t.h; y++) for (let x = 100; x < 1900; x++) t.mask[y * t.w + x] = 1;
    s.tardis[0].x = 900;
    s.tardis[1].x = 1020;
    for (const td of s.tardis) {
      td.y = 592;
      td.airborne = false;
    }
    const cpus = [new CpuPlayer(1), new CpuPlayer(1)];
    const ev: SimEvent[] = [];
    for (let i = 0; i < 600; i++) tick(s, cpus[s.turn.teamIdx].next(s), ev);
    const shots = ev.filter((e) => e.t === 'shot').length;
    expect(shots).toBeGreaterThanOrEqual(2); // shotgun fired (2 shots per turn), not skipped
    expect(s.tardis.some((td) => td.hp < 100 || td.pendingDmg > 0)).toBe(true);
  });
});
