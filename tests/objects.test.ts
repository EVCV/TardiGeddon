import { describe, expect, it } from 'vitest';
import { activeTardi, explode, tick, TARDI_R } from '../src/sim/world';
import { TICK_RATE, type MapObject, type WorldState } from '../src/sim/types';
import { makeWorld, run, runUntilPhase } from './helpers';

/** Flat floor at y=600, no objects, everyone parked far left. */
function flat(): WorldState {
  const s = makeWorld();
  const t = s.terrain;
  t.mask.fill(0);
  for (let y = 600; y < t.h; y++) for (let x = 100; x < 1900; x++) t.mask[y * t.w + x] = 1;
  s.objects = [];
  s.scheme.crateChance = 0;
  s.tardis.forEach((o, i) => {
    o.x = 200 + i * 40;
    o.y = 600 - TARDI_R - 1;
    o.airborne = false;
  });
  runUntilPhase(s, 'aim');
  return s;
}

function addObject(s: WorldState, o: Partial<MapObject> & Pick<MapObject, 'kind' | 'x' | 'y'>): MapObject {
  const obj: MapObject = {
    id: s.nextId++, vx: 0, vy: 0, airborne: false, fuse: -1, dud: false, hp: 25, chute: false, contents: '', amount: 0, ...o,
  };
  s.objects.push(obj);
  return obj;
}

describe('setup', () => {
  it('scatters mines and drums away from tardis', () => {
    const s = makeWorld();
    expect(s.objects.filter((o) => o.kind === 'mine').length).toBeGreaterThan(0);
    expect(s.objects.filter((o) => o.kind === 'drum').length).toBeGreaterThan(0);
    for (const o of s.objects) {
      for (const t of s.tardis) expect(Math.hypot(o.x - t.x, o.y - t.y)).toBeGreaterThan(40);
    }
  });
});

describe('mines', () => {
  it('arm when a tardi comes close and explode after the fuse', () => {
    const s = flat();
    const me = activeTardi(s)!;
    const mine = addObject(s, { kind: 'mine', x: me.x + 15, y: 595 });
    const armed = run(s, 2);
    expect(armed.some((e) => e.t === 'mineArmed')).toBe(true);
    const ev = run(s, s.scheme.mineFuse * TICK_RATE + 2);
    expect(ev.some((e) => e.t === 'explosion')).toBe(true);
    expect(s.objects.includes(mine)).toBe(false);
    expect(me.pendingDmg + (100 - me.hp)).toBeGreaterThan(0);
  });

  it('duds fizzle and stay put', () => {
    const s = flat();
    const me = activeTardi(s)!;
    const mine = addObject(s, { kind: 'mine', x: me.x + 15, y: 595, dud: true });
    const ev = run(s, s.scheme.mineFuse * TICK_RATE + 5);
    expect(ev.some((e) => e.t === 'dud')).toBe(true);
    expect(ev.some((e) => e.t === 'explosion')).toBe(false);
    expect(s.objects.includes(mine)).toBe(true);
  });

  it('are set off at once by a nearby blast', () => {
    const s = flat();
    addObject(s, { kind: 'mine', x: 1200, y: 595 });
    explode(s, 1215, 590, 30, 40, []);
    const ev = run(s, 3);
    expect(ev.filter((e) => e.t === 'explosion').length).toBe(1);
  });
});

describe('brine drums', () => {
  it('burst after enough damage and spray brine', () => {
    const s = flat();
    const drum = addObject(s, { kind: 'drum', x: 1200, y: 591 });
    const ev: never[] = [];
    explode(s, 1220, 590, 30, 50, ev);
    expect(s.objects.includes(drum)).toBe(false);
    expect(s.projectiles.filter((p) => p.weapon === 'brine').length).toBe(6);
  });
});

describe('crates', () => {
  it('parachute down and give health to whoever walks in', () => {
    const s = flat();
    const me = activeTardi(s)!;
    s.wind = 0;
    const crate = addObject(s, { kind: 'crate', x: 1000, y: 100, airborne: true, chute: true, contents: 'health', amount: 25 });
    run(s, 400);
    expect(crate.airborne).toBe(false);
    expect(crate.y).toBeGreaterThan(580);
    me.x = crate.x - 10;
    const ev = run(s, 1);
    expect(ev.some((e) => e.t === 'collect')).toBe(true);
    expect(me.hp).toBe(125);
    expect(s.objects.includes(crate)).toBe(false);
  });

  it('weapon crates add ammo to the collector’s team', () => {
    const s = flat();
    const me = activeTardi(s)!;
    const before = s.teams[me.team].ammo.airstrike;
    addObject(s, { kind: 'crate', x: me.x + 5, y: me.y, contents: 'airstrike', amount: 1 });
    run(s, 1);
    expect(s.teams[me.team].ammo.airstrike).toBe(before + 1);
  });

  it('drop between turns when the scheme allows', () => {
    const s = flat();
    s.scheme.crateChance = 1;
    tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
    const ev = runUntilPhase(s, 'start');
    expect(ev.some((e) => e.t === 'crateDrop')).toBe(true);
    expect(s.objects.some((o) => o.kind === 'crate')).toBe(true);
  });
});

describe('sudden death', () => {
  it('drops everyone to 1 hp, then raises the water each turn', () => {
    const s = flat();
    s.roundTicks = s.scheme.roundTime * 60 * TICK_RATE;
    tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
    const ev = runUntilPhase(s, 'start');
    expect(ev.some((e) => e.t === 'suddenDeath')).toBe(true);
    expect(s.suddenDeath).toBe(true);
    for (const t of s.tardis) if (t.alive) expect(t.hp).toBe(1);
    const water = s.waterY;
    runUntilPhase(s, 'aim');
    tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
    const ev2 = runUntilPhase(s, 'start');
    expect(ev2.some((e) => e.t === 'waterRise')).toBe(true);
    expect(s.waterY).toBe(water - s.scheme.waterRise);
  });
});
