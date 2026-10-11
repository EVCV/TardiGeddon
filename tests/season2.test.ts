import { describe, expect, it } from 'vitest';
import { activeTardi, createWorld, explode, tick, TARDI_R } from '../src/sim/world';
import { BTN_FIRE, type SimEvent, type WorldState } from '../src/sim/types';
import { run, runUntilPhase } from './helpers';

const SEASON2 = ['gloop', 'drill', 'gale', 'leech'];

/** Flat floor 600 px down, the active tardi in the middle, everyone else far away. */
function arena(): WorldState {
  const s = createWorld({
    seed: 91,
    teams: [
      { name: 'Red', color: 0xe04848, cpu: false },
      { name: 'Blue', color: 0x3a7be0, cpu: false },
    ],
    scheme: { unlocked: SEASON2 },
  });
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
  return s;
}

function fire(s: WorldState, id: string, aim = 300): void {
  tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id } }, []);
  expect(s.turn.weapon).toBe(id);
  s.turn.aim = aim;
  run(s, 25, { held: BTN_FIRE, pressed: 0 });
  // Letting go of fire throws it.
  run(s, 1);
}

const blasts = (ev: SimEvent[]) => ev.filter((e): e is Extract<SimEvent, { t: 'explosion' }> => e.t === 'explosion');

describe('Gloop Bomb', () => {
  it('sticks where it lands and goes off on its fuse', () => {
    const s = arena();
    fire(s, 'gloop');
    const g = s.projectiles.find((p) => p.weapon === 'gloop')!;
    let ev: SimEvent[] = [];
    for (let i = 0; i < 150 && g.hits === 0; i++) ev = ev.concat(run(s, 1));
    expect(g.hits).toBe(1);
    expect(blasts(ev)).toEqual([]);
    const at = { x: g.x, y: g.y };
    run(s, 20);
    // Stuck fast: not rolling or bouncing away.
    expect({ x: g.x, y: g.y }).toEqual(at);
    const later = run(s, 150);
    const b = blasts(later).find((e) => e.r === 40)!;
    expect(b).toBeDefined();
    expect(Math.abs(b.x - at.x)).toBeLessThan(1);
  });
});

describe('Earthworm Drill', () => {
  it('burrows into the ground before it explodes', () => {
    const s = arena();
    fire(s, 'drill', 200);
    const ev = run(s, 50 * 6);
    const b = blasts(ev).find((e) => e.r === 38)!;
    expect(b).toBeDefined();
    // Well below the surface (y = 600), not on it.
    expect(b.y).toBeGreaterThan(615);
  });
});

describe('Gale Gourd', () => {
  it('hardly hurts, but blows tardis much further than a normal blast', () => {
    const push = (knock: number) => {
      const s = arena();
      const v = s.tardis.find((t) => t !== activeTardi(s))!;
      v.x = 1400;
      explode(s, 1385, v.y, 45, 12, [], knock);
      return { vx: v.vx, dmg: v.pendingDmg };
    };
    const plain = push(1);
    const gale = push(7);
    expect(gale.vx).toBeGreaterThan(plain.vx * 6);
    expect(gale.vx).toBeGreaterThan(5);
    expect(gale.dmg).toBe(plain.dmg);
    expect(gale.dmg).toBeLessThan(15);
  });

  it('fires and explodes on its fuse', () => {
    const s = arena();
    fire(s, 'gale');
    expect(blasts(run(s, 50 * 6)).some((e) => e.r === 45)).toBe(true);
  });
});

describe('Leech Lobber', () => {
  it('heals the shooter by half the damage it does to the other team', () => {
    const s = arena();
    const me = activeTardi(s)!;
    const foe = s.tardis.find((t) => t.team !== me.team)!;
    const friend = s.tardis.find((t) => t.team === me.team && t !== me);
    foe.x = 1500;
    if (friend) friend.x = 300;
    const hp0 = me.hp;
    s.projectiles.push({ id: 999, weapon: 'leech', x: 1500, y: foe.y, vx: 0, vy: 0, fuse: 1, owner: me.id, age: 0, tx: 0, ty: 0, dir: 0, hits: 0 });
    const ev = run(s, 1);
    const heal = ev.find((e): e is Extract<SimEvent, { t: 'heal' }> => e.t === 'heal')!;
    expect(heal).toBeDefined();
    expect(heal.id).toBe(me.id);
    expect(heal.amount).toBe(Math.round(foe.pendingDmg * 0.5));
    expect(me.hp).toBe(hp0 + heal.amount);
  });

  it('does not heal for hitting your own side', () => {
    const s = arena();
    const me = activeTardi(s)!;
    const friend = s.tardis.find((t) => t.team === me.team && t !== me)!;
    for (const t of s.tardis) if (t !== me && t !== friend) t.x = 150;
    friend.x = 1500;
    s.projectiles.push({ id: 999, weapon: 'leech', x: 1500, y: friend.y, vx: 0, vy: 0, fuse: 1, owner: me.id, age: 0, tx: 0, ty: 0, dir: 0, hits: 0 });
    const ev = run(s, 1);
    expect(friend.pendingDmg).toBeGreaterThan(0);
    expect(ev.some((e) => e.t === 'heal')).toBe(false);
  });
});

describe('season 2 weapons never stall a turn', () => {
  for (const id of SEASON2) {
    it(`${id}: the next turn always starts, whatever the angle`, () => {
      for (const aim of [-900, -400, 0, 250, 600, 1000]) {
        const s = arena();
        const turn = s.turn.turnNumber;
        fire(s, id, aim);
        runUntilPhase(s, 'aim', 50 * 60);
        expect(s.turn.turnNumber, `aim ${aim}`).toBeGreaterThan(turn);
        expect(s.projectiles, `aim ${aim}`).toEqual([]);
      }
    });
  }
});
