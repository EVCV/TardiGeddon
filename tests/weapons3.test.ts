import { describe, expect, it } from 'vitest';
import { activeTardi, explode, tick, TARDI_R } from '../src/sim/world';
import { BTN_FIRE, type MapObject, type WorldState } from '../src/sim/types';
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
  return s;
}
const select = (s: WorldState, id: string) => tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id } }, []);
const skipTurn = (s: WorldState) => {
  runUntilPhase(s, 'aim');
  tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
  return runUntilPhase(s, 'start');
};

describe('Bacteria Bomb', () => {
  it('splits into five bomblets', () => {
    const s = arena();
    select(s, 'bacteria');
    s.turn.aim = 400;
    run(s, 25, { held: BTN_FIRE, pressed: 0 });
    const ev = run(s, 3 * 50 + 5);
    expect(ev.filter((e) => e.t === 'explosion').length).toBeGreaterThanOrEqual(1);
    expect(s.projectiles.filter((p) => p.weapon === 'bacterlet').length).toBe(5);
  });
});

describe('Sticky Dynamite', () => {
  it('is dropped at your feet, sticks, and goes off after 5 seconds', () => {
    const s = arena();
    const me = activeTardi(s)!;
    select(s, 'dynamite');
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    const d = s.projectiles.find((p) => p.weapon === 'dynamite')!;
    expect(d).toBeDefined();
    expect(s.turn.phase).toBe('retreat');
    run(s, 100);
    expect(Math.abs(d.x - me.x)).toBeLessThan(15); // stuck near where it was dropped
    expect(d.y).toBeLessThan(600);
    const ev = run(s, 160);
    expect(ev.some((e) => e.t === 'explosion' && e.r === 52)).toBe(true);
  });
});

describe('Cyanobloom Cloud', () => {
  it('poisons tardis nearby; poison bites each turn but never below 1 hp', () => {
    const s = arena();
    const victim = s.tardis.find((t) => t !== activeTardi(s))!;
    victim.x = 1500;
    victim.hp = 12;
    const far = s.tardis.find((t) => t !== victim && t !== activeTardi(s))!;
    // Simulate the cloud's explosion right next to the victim.
    s.projectiles.push({ id: 999, weapon: 'cyanobloom', x: 1500, y: 580, vx: 0, vy: 0, fuse: 1, owner: -1, age: 0, tx: 0, ty: 0, dir: 0 });
    const ev = run(s, 1);
    expect(ev.some((e) => e.t === 'gas')).toBe(true);
    expect(victim.poison).toBe(true);
    expect(far.poison).toBe(false);
    const hp0 = victim.hp + 0;
    skipTurn(s);
    // Small blast damage (if any) lands at end of turn; poison then bites at turn start.
    expect(victim.hp).toBeLessThan(hp0);
    for (let i = 0; i < 4; i++) skipTurn(s);
    expect(victim.alive).toBe(true);
    expect(victim.hp).toBe(1);
  });

  it('is cured by a health crate', () => {
    const s = arena();
    const me = activeTardi(s)!;
    me.poison = true;
    const crate: MapObject = {
      id: 998, kind: 'crate', x: me.x + 5, y: me.y, vx: 0, vy: 0, airborne: false,
      fuse: -1, dud: false, hp: 25, chute: false, contents: 'health', amount: 25,
    };
    s.objects.push(crate);
    run(s, 1);
    expect(me.poison).toBe(false);
  });

  it('does not poison through a direct explosion of other weapons', () => {
    const s = arena();
    const victim = s.tardis.find((t) => t !== activeTardi(s))!;
    explode(s, victim.x, victim.y, 30, 20, []);
    expect(victim.poison).toBe(false);
  });
});
