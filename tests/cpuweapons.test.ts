import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeTardi, tick, TARDI_R } from '../src/sim/world';
import type { InputFrame, WorldState } from '../src/sim/types';
import { CpuPlayer } from '../src/ai/cpu';
import { createRng, rngFloat } from '../src/sim/math/prng';
import { makeWorld, runUntilPhase } from './helpers';

/**
 * A floor at y=600 from x=100 to 1500, cut in two by a wall of rock from the
 * top of the map down to the floor at x=700..800: nothing thrown gets over it.
 * The active tardi's team is left of the wall, the other team right of it.
 */
function walledOff(): WorldState {
  const s = makeWorld();
  const t = s.terrain;
  t.mask.fill(0);
  for (let y = 600; y < t.h; y++) for (let x = 100; x < 1500; x++) t.mask[y * t.w + x] = 1;
  for (let y = 0; y < 600; y++) for (let x = 700; x < 800; x++) t.mask[y * t.w + x] = 1;
  s.objects = [];
  s.scheme.crateChance = 0;
  runUntilPhase(s, 'aim');
  const me = activeTardi(s)!;
  let mine = 0;
  let theirs = 0;
  for (const o of s.tardis) {
    o.x = o.team === me.team ? 250 + 60 * mine++ : 1100 + 60 * theirs++;
    o.y = 600 - TARDI_R - 1;
    o.airborne = false;
    o.vx = o.vy = 0;
  }
  s.wind = 0;
  // Only the weapons each test hands out.
  const ammo = s.teams[me.team].ammo;
  for (const id of Object.keys(ammo)) ammo[id] = 0;
  ammo.bazooka = -1;
  ammo.grenade = -1;
  return s;
}

/** Play the CPU's turn; the weapons it picked, and how much the other team was hurt. */
function playTurn(s: WorldState): { picked: string[]; hurt: number } {
  const me = activeTardi(s)!;
  const team = me.team;
  const hp = () => s.tardis.filter((t) => t.team !== team).reduce((a, t) => a + t.hp - t.pendingDmg, 0);
  const before = hp();
  const cpu = new CpuPlayer('perfect', Infinity);
  const picked: string[] = [];
  const turn = s.turn.turnNumber;
  for (let i = 0; i < 6000 && s.turn.turnNumber === turn && s.turn.phase !== 'gameover'; i++) {
    const f: InputFrame = cpu.next(s);
    if (f.cmd?.t === 'weapon') picked.push(f.cmd.id);
    tick(s, f, []);
  }
  return { picked, hurt: before - hp() };
}

describe('CPU weapons when nothing thrown can reach', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls in a strike on the far side of a wall', () => {
    const rng = createRng(5);
    vi.spyOn(Math, 'random').mockImplementation(() => rngFloat(rng));
    const s = walledOff();
    s.teams[activeTardi(s)!.team].ammo.airstrike = 1;
    const { picked, hurt } = playTurn(s);
    expect(picked).toContain('airstrike');
    expect(hurt).toBeGreaterThan(0);
  });

  it('teleports over the wall when it has nothing to fire', () => {
    const rng = createRng(6);
    vi.spyOn(Math, 'random').mockImplementation(() => rngFloat(rng));
    const s = walledOff();
    const me = activeTardi(s)!;
    s.teams[me.team].ammo.teleport = 2;
    const { picked } = playTurn(s);
    expect(picked).toContain('teleport');
    expect(me.x).toBeGreaterThan(800);
    expect(me.alive).toBe(true);
  });
});
