import { describe, expect, it } from 'vitest';
import { activeTardi, tick, TARDI_R, AIM_MAX } from '../src/sim/world';
import { BTN_FIRE, BTN_RIGHT, BTN_UP, PRESS_JUMP, type WorldState } from '../src/sim/types';
import { makeWorld, run, runUntilPhase } from './helpers';

/**
 * A hand-built arena: flat floor at y=600 and a ceiling slab over x 900..1100
 * at y 300..320. The active tardi stands at x=1000 on the floor; the others
 * are parked far away.
 */
function arena(): WorldState {
  const s = makeWorld();
  const t = s.terrain;
  t.mask.fill(0);
  for (let y = 600; y < t.h; y++) for (let x = 100; x < 1900; x++) t.mask[y * t.w + x] = 1;
  for (let y = 300; y < 320; y++) for (let x = 900; x < 1100; x++) t.mask[y * t.w + x] = 1;
  // Place everyone on the new floor before any ticks run.
  const me = activeTardi(s)!;
  s.tardis.forEach((o, i) => {
    o.x = o === me ? 1000 : 200 + i * 40;
    o.y = 600 - TARDI_R - 1;
    o.airborne = false;
    o.vx = o.vy = 0;
  });
  me.facing = 1;
  runUntilPhase(s, 'aim');
  for (const o of s.tardis) expect(o.hp).toBe(100);
  return s;
}

const select = (s: WorldState, id: string) => tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id } }, []);

describe('Silk Rope', () => {
  it('attaches to a ceiling, reels in, swings and lets go', () => {
    const s = arena();
    const me = activeTardi(s)!;
    select(s, 'rope');
    s.turn.aim = AIM_MAX; // straight up
    const ev = run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(ev.some((e) => e.t === 'rope')).toBe(true);
    expect(me.rope).not.toBeNull();
    expect(me.rope!.y).toBeGreaterThan(318);
    expect(me.rope!.y).toBeLessThan(322);
    const y0 = me.y;
    run(s, 60, { held: BTN_UP, pressed: 0 });
    expect(me.y).toBeLessThan(y0 - 50); // climbed
    run(s, 80, { held: BTN_RIGHT, pressed: 0 });
    const d = Math.hypot(me.x - me.rope!.x, me.y - me.rope!.y);
    expect(d).toBeLessThanOrEqual(me.rope!.len + 0.5);
    expect(me.x).toBeGreaterThan(1000); // swung right
    tick(s, { held: 0, pressed: PRESS_JUMP }, []);
    expect(me.rope).toBeNull();
    expect(me.airborne).toBe(true);
    expect(s.turn.phase).toBe('aim'); // roping doesn't use up the turn
  });

  it('misses when nothing is in reach', () => {
    const s = arena();
    const me = activeTardi(s)!;
    me.x = 1500; // no ceiling here
    select(s, 'rope');
    s.turn.aim = AIM_MAX;
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(me.rope).toBeNull();
  });

  it('drops when the anchor is blown away', () => {
    const s = arena();
    const me = activeTardi(s)!;
    select(s, 'rope');
    s.turn.aim = AIM_MAX;
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    const t = s.terrain;
    for (let y = 300; y < 320; y++) for (let x = 900; x < 1100; x++) t.mask[y * t.w + x] = 0;
    run(s, 2);
    expect(me.rope).toBeNull();
  });
});

describe('Leaf Parachute', () => {
  it('slows a long fall so it causes no damage', () => {
    const s = arena();
    const me = activeTardi(s)!;
    me.x = 1500; // clear of the ceiling slab
    me.y = 100;
    me.airborne = true;
    me.fallStartY = 100;
    select(s, 'parachute');
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(me.chute).toBe(true);
    s.wind = 0;
    run(s, 1000);
    expect(me.airborne).toBe(false);
    expect(me.chute).toBe(false);
    expect(me.pendingDmg).toBe(0);
    expect(me.hp).toBe(100);
    expect(s.teams[me.team].ammo.parachute).toBe(2);
  });

  it('without it the same fall hurts', () => {
    const s = arena();
    const me = activeTardi(s)!;
    me.x = 1500; // clear of the ceiling slab
    me.y = 100;
    me.airborne = true;
    me.fallStartY = 100;
    run(s, 300);
    expect(me.hp).toBeLessThan(100); // applied at end of turn
  });
});

describe('Twig Girder', () => {
  it('builds a solid bar at the target', () => {
    const s = arena();
    select(s, 'girder');
    s.turn.aim = 0; // horizontal
    tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x: 1300, y: 500 } }, []);
    const ev = run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(ev.some((e) => e.t === 'terrain')).toBe(true);
    expect(s.terrain.mask[500 * s.terrain.w + 1300]).toBe(2);
    expect(s.terrain.mask[500 * s.terrain.w + 1330]).toBe(2);
    expect(s.terrain.mask[510 * s.terrain.w + 1300]).toBe(0);
    expect(s.turn.phase).toBe('retreat');
  });

  it('refuses to build through a tardi or into ground', () => {
    const s = arena();
    const me = activeTardi(s)!;
    select(s, 'girder');
    s.turn.aim = 0;
    tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x: Math.round(me.x), y: Math.round(me.y) } }, []);
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(s.turn.phase).toBe('aim');
    tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x: 1300, y: 602 } }, []);
    run(s, 2, { held: BTN_FIRE, pressed: 0 });
    expect(s.turn.phase).toBe('aim');
  });
});

describe('Fire Punch', () => {
  it('launches and damages the tardi in front', () => {
    const s = arena();
    const me = activeTardi(s)!;
    const victim = s.tardis.find((o) => o !== me)!;
    victim.x = me.x + 14;
    select(s, 'firepunch');
    const ev = run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(ev.some((e) => e.t === 'punch')).toBe(true);
    expect(victim.pendingDmg).toBe(30);
    expect(victim.airborne).toBe(true);
    expect(victim.vy).toBeLessThan(0);
  });
});
