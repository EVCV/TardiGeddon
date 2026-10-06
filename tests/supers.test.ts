import { describe, expect, it } from 'vitest';
import { activeTardi, activeTeam, createWorld, tick, TARDI_R } from '../src/sim/world';
import { BTN_FIRE, type SimEvent, type WorldState } from '../src/sim/types';
import { presetScheme } from '../src/sim/schemes';
import { makeWorld, run, runUntilPhase } from './helpers';

function arena(): WorldState {
  const s = makeWorld();
  const t = s.terrain;
  t.mask.fill(0);
  for (let y = 600; y < t.h; y++) for (let x = 100; x < 1900; x++) t.mask[y * t.w + x] = 1;
  s.objects = [];
  s.scheme.crateChance = 0;
  const me = activeTardi(s)!;
  s.tardis.forEach((o, i) => {
    o.x = o === me ? 1000 : 200 + i * 60;
    o.y = 600 - TARDI_R - 1;
    o.airborne = false;
  });
  me.facing = 1;
  runUntilPhase(s, 'aim');
  s.wind = 0;
  for (const id of ['holywater', 'tun', 'slideslam']) activeTeam(s).ammo[id] = 1;
  return s;
}
const select = (s: WorldState, id: string) => tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id } }, []);
const target = (s: WorldState, x: number, y: number) => tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x, y } }, []);

describe('superweapon ammo', () => {
  it('is crate-only by default and one each in Chaos', () => {
    const teams = [
      { name: 'A', color: 1, cpu: false },
      { name: 'B', color: 2, cpu: false },
    ];
    const std = createWorld({ seed: 1, teams, scheme: presetScheme('standard') });
    const chaos = createWorld({ seed: 1, teams, scheme: presetScheme('chaos') });
    for (const id of ['holywater', 'tun', 'slideslam']) {
      expect(std.teams[0].ammo[id]).toBe(0);
      expect(chaos.teams[0].ammo[id]).toBe(1);
    }
  });
});

describe('Holy Water Droplet', () => {
  it('goes off after a fixed 3 s fuse with a huge blast', () => {
    const s = arena();
    select(s, 'holywater');
    s.turn.aim = 400;
    run(s, 20, { held: BTN_FIRE, pressed: 0 });
    run(s, 1);
    const p = s.projectiles.find((x) => x.weapon === 'holywater')!;
    expect(p).toBeDefined();
    const early = run(s, 100);
    expect(early.some((e) => e.t === 'explosion')).toBe(false);
    const ev = run(s, 60);
    expect(ev.some((e) => e.t === 'explosion' && e.r === 90)).toBe(true);
    expect(activeTeam(s).ammo.holywater).toBe(0);
  });
});

describe('Concrete Tun', () => {
  it('smashes down through the ground, exploding several times', () => {
    const s = arena();
    const victim = s.tardis.find((t) => t !== activeTardi(s))!;
    victim.x = 1500;
    select(s, 'tun');
    target(s, 1500, 580);
    run(s, 1, { held: 0, pressed: 0 });
    tick(s, { held: BTN_FIRE, pressed: 0 }, []);
    expect(s.projectiles.some((p) => p.weapon === 'tun')).toBe(true);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 600 && s.projectiles.length > 0; i++) tick(s, { held: 0, pressed: 0 }, ev);
    const blasts = ev.filter((e) => e.t === 'explosion' && e.r === 36);
    expect(blasts.length).toBe(6);
    // Each slam is deeper than the last.
    const ys = blasts.map((e) => (e.t === 'explosion' ? e.y : 0));
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    expect(victim.pendingDmg + (100 - victim.hp)).toBeGreaterThan(30);
  });
});

describe('Microscope Slide Slam', () => {
  it('rains shards across the whole map and the turn still finishes', () => {
    const s = arena();
    const turnTeam = s.turn.teamIdx;
    select(s, 'slideslam');
    tick(s, { held: BTN_FIRE, pressed: 0 }, []);
    const shards = s.projectiles.filter((p) => p.weapon === 'shard');
    expect(shards.length).toBe(16); // 8 per 1000 px on a 2000 px map
    const xs = shards.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(1000);
    const ev = runUntilPhase(s, 'start', 3000);
    expect(ev.filter((e) => e.t === 'explosion').length).toBeGreaterThanOrEqual(10);
    expect(s.turn.teamIdx).not.toBe(turnTeam);
  });
});
