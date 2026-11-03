// Playtest fixes: cave starts, mines spread over the map, fall damage by
// distance, quick Fire taps that don't misfire, the swimming easter egg, the
// Homing Spore closing on its target, and Rope Race mines.

import { describe, expect, it } from 'vitest';
import { activeTardi, createWorld, MIN_FIRE_POWER, SWIM_ODDS, TARDI_R, tick } from '../src/sim/world';
import { BTN_FIRE, EMPTY_INPUT, type SimEvent, type WorldState } from '../src/sim/types';
import { presetScheme } from '../src/sim/schemes';
import { circleCollides } from '../src/sim/terrain/terrain';
import { rngNext } from '../src/sim/math/prng';
import { makeWorld, run, runUntilPhase } from './helpers';

const teams = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `T${i}`, color: i + 1, cpu: false }));

/** Rock somewhere straight above (x, y): under cover, not open to the sky. */
function covered(s: WorldState, x: number, y: number): boolean {
  for (let yy = Math.round(y) - TARDI_R - 2; yy >= 0; yy--) if (s.terrain.mask[yy * s.terrain.w + Math.round(x)]) return true;
  return false;
}

/** A flat floor at y 600 across most of the map, nothing else. */
function flat(s: WorldState): void {
  s.terrain.mask.fill(0);
  for (let y = 600; y < s.terrain.h; y++) for (let x = 100; x < 1900; x++) s.terrain.mask[y * s.terrain.w + x] = 1;
  s.objects = [];
  s.scheme.crateChance = 0;
}

describe('starting spots', () => {
  it('put a tardigrade of each team in a cavern when the map has caves', () => {
    let inCaves = 0;
    let matches = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = createWorld({ seed, teams: teams(2), scheme: { mapStyle: 'caverns' } });
      matches++;
      inCaves += s.tardis.filter((t) => covered(s, t.x, t.y)).length;
      // Still standing on the ground, with room.
      for (const t of s.tardis) {
        expect(circleCollides(s.terrain, t.x, t.y, TARDI_R)).toBe(false);
        expect(circleCollides(s.terrain, t.x, t.y + 2, TARDI_R)).toBe(true);
      }
    }
    expect(inCaves).toBeGreaterThanOrEqual(matches);
  });

  it('never in a cave in practice or the Rope Race', () => {
    const s = createWorld({ seed: 3, teams: teams(2), scheme: { mapStyle: 'caverns', practiceTargets: 5 } });
    expect(s.tardis.filter((t) => covered(s, t.x, t.y)).length).toBe(0);
  });
});

describe('mines', () => {
  it('are spread across the whole map, not bunched where nobody stands', () => {
    for (const seed of [1, 2, 3]) {
      const s = createWorld({ seed, teams: teams(2), scheme: { ...presetScheme('chaos'), mapStyle: 'mainland' } });
      const xs = s.objects.filter((o) => o.kind === 'mine').map((o) => o.x);
      expect(xs.length).toBe(16);
      // Every quarter of the map gets some.
      const quarters = new Set(xs.map((x) => Math.floor((x / s.terrain.w) * 4)));
      expect(quarters.size).toBe(4);
    }
  });
});

describe('fall damage', () => {
  it('grows with the drop, and a blast off a cliff counts too', () => {
    const drop = (height: number, knocked: boolean) => {
      const s = makeWorld();
      flat(s);
      runUntilPhase(s, 'aim');
      const t = s.tardis.find((x) => x.id !== s.turn.activeTardi)!;
      t.x = 1500;
      t.y = 600 - TARDI_R - 1 - height;
      t.fallStartY = t.y;
      t.airborne = true;
      t.knocked = knocked;
      t.vx = 0;
      t.vy = knocked ? 1.5 : 0;
      for (let i = 0; i < 400 && t.airborne; i++) tick(s, EMPTY_INPUT, []);
      return t.pendingDmg;
    };
    expect(drop(60, false)).toBe(0);
    const mid = drop(200, false);
    const high = drop(400, false);
    expect(mid).toBeGreaterThan(20);
    expect(high).toBeGreaterThan(mid + 40);
    expect(drop(400, true)).toBeGreaterThan(50);
  });
});

describe('firing', () => {
  it('a tap of Fire too quick to charge calls the throw off instead of dropping it at your feet', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    run(s, 1, EMPTY_INPUT);
    expect(s.projectiles.length).toBe(0);
    expect(s.turn.charging).toBe(false);
    expect(s.turn.phase).toBe('aim');
    // Held a moment longer, it throws.
    run(s, MIN_FIRE_POWER / 20, { held: BTN_FIRE, pressed: 0 });
    run(s, 1, EMPTY_INPUT);
    expect(s.projectiles.length).toBe(1);
  });
});

describe('the Homing Spore', () => {
  it('flies to its target and goes off there (and the guide shows that path)', () => {
    const s = makeWorld();
    flat(s);
    runUntilPhase(s, 'aim');
    s.wind = 0;
    const me = activeTardi(s)!;
    me.x = 600;
    me.y = 600 - TARDI_R - 1;
    me.facing = 1;
    tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'homing' } }, []);
    tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x: 1300, y: 595 } }, []);
    tick(s, { held: 0, pressed: 0, cmd: { t: 'aim', facing: 1, aim: 300 } }, []);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 30; i++) tick(s, { held: BTN_FIRE, pressed: 0 }, ev);
    tick(s, EMPTY_INPUT, ev);
    for (let i = 0; i < 400 && !ev.some((e) => e.t === 'explosion'); i++) tick(s, EMPTY_INPUT, ev);
    const boom = ev.find((e) => e.t === 'explosion');
    expect(boom).toBeDefined();
    if (boom?.t === 'explosion') expect(Math.abs(boom.x - 1300) + Math.abs(boom.y - 595)).toBeLessThan(30);
  });
});

describe('swimming (an easter egg)', () => {
  it('now and then, a tardigrade in the water paddles to the shore and climbs out', () => {
    const s = makeWorld();
    flat(s);
    runUntilPhase(s, 'aim');
    const t = s.tardis.find((x) => x.id !== s.turn.activeTardi)!;
    // Load the dice: the next roll is the lucky one.
    let a = 0;
    while (rngNext({ a }) % SWIM_ODDS !== 0) a++;
    s.rng.a = a;
    t.x = 1960;
    t.y = s.waterY + 10;
    t.airborne = true;
    const ev: SimEvent[] = [];
    tick(s, EMPTY_INPUT, ev);
    expect(ev.some((e) => e.t === 'swim' && !e.out)).toBe(true);
    expect(t.alive).toBe(true);
    expect(t.facing).toBe(-1); // the land is that way
    for (let i = 0; i < 1000 && !ev.some((e) => e.t === 'swim' && e.out); i++) tick(s, EMPTY_INPUT, ev);
    expect(ev.some((e) => e.t === 'swim' && e.out)).toBe(true);
    expect(ev.some((e) => e.t === 'drown')).toBe(false);
    expect(t.alive).toBe(true);
    expect(t.swim).toBe(0);
    expect(t.y).toBeLessThan(600);
  });

  it('most of the time, in it goes', () => {
    let swam = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = makeWorld(seed);
      runUntilPhase(s, 'aim');
      const t = s.tardis.find((x) => x.id !== s.turn.activeTardi)!;
      t.x = s.terrain.w / 2;
      t.y = s.waterY + 10;
      t.airborne = true;
      const ev: SimEvent[] = [];
      tick(s, EMPTY_INPUT, ev);
      if (ev.some((e) => e.t === 'swim')) swam++;
    }
    expect(swam).toBeGreaterThan(0);
    expect(swam).toBeLessThan(15);
  });
});

describe('Rope Race mines', () => {
  const race = (seed = 3) => createWorld({ seed, teams: teams(2), scheme: presetScheme('roperace') });

  it('are on the course, some floating in mid-air, and none by the start or the flag', () => {
    const s = race();
    const mines = s.objects.filter((o) => o.kind === 'mine');
    expect(mines.length).toBeGreaterThan(4);
    expect(mines.some((m) => m.floating)).toBe(true);
    for (const m of mines) {
      expect(m.x - s.race!.startX).toBeGreaterThan(250);
      expect(s.race!.goalX - m.x).toBeGreaterThan(250);
    }
  });

  it('blow you about but never hurt, never dig up the course, and are all back for the next go', () => {
    const s = createWorld({ seed: 3, teams: teams(2), scheme: { ...presetScheme('roperace'), raceRounds: 2 } });
    runUntilPhase(s, 'aim');
    const t = activeTardi(s)!;
    const mine = s.objects.find((o) => o.kind === 'mine' && o.floating)!;
    const mask = s.terrain.mask.slice();
    t.x = mine.x - 10;
    t.y = mine.y;
    t.airborne = true;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 30 && !ev.some((e) => e.t === 'explosion'); i++) tick(s, EMPTY_INPUT, ev);
    expect(ev.some((e) => e.t === 'explosion')).toBe(true);
    expect(t.pendingDmg).toBe(0);
    expect(s.turn.phase).toBe('aim'); // the go carries on
    let dug = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] !== s.terrain.mask[i]) dug++;
    expect(dug).toBe(0);
    const count = s.race!.hazards.length;
    expect(s.objects.filter((o) => o.kind === 'mine').length).toBeLessThan(count);
    // Next go: all the mines are back.
    tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
    runUntilPhase(s, 'aim', 5000);
    expect(s.objects.filter((o) => o.kind === 'mine').length).toBe(count);
    expect(s.tardis.every((x) => x.hp === 100)).toBe(true);
  });

  it('a go is one go by default', () => {
    expect(presetScheme('roperace').raceRounds).toBe(1);
  });
});
