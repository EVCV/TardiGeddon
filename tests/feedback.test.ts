// Fixes from the first round of player feedback: practice mode, friendly fire,
// strikes and the wind, and the Twig Girder resting on the ground.
import { describe, expect, it } from 'vitest';
import { activeTardi, createWorld, explode, tick, TARDI_R } from '../src/sim/world';
import { BTN_FIRE, EMPTY_INPUT, type SimEvent, type WorldState } from '../src/sim/types';
import { WEAPONS } from '../src/sim/weapons';
import { practiceWorld, PRACTICE_TARGETS } from '../src/ui/tutorial';
import { makeWorld, run, runUntilPhase } from './helpers';

const you = { name: 'Moss Mob', color: 0xe04848, cpu: false, names: ['Waddles'] };
const select = (s: WorldState, id: string) => tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id } }, []);
const target = (s: WorldState, x: number, y: number) => tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x, y } }, []);

/** Flat floor at y=600 across the map; everyone on it, the active tardigrade at x=1000. */
function flat(s: WorldState): WorldState {
  const t = s.terrain;
  t.mask.fill(0);
  for (let y = 600; y < t.h; y++) for (let x = 0; x < t.w; x++) t.mask[y * t.w + x] = 1;
  s.objects = [];
  const me = activeTardi(s)!;
  s.tardis.forEach((o, i) => {
    o.x = o === me ? 1000 : 200 + i * 40;
    o.y = 600 - TARDI_R - 1;
    o.airborne = false;
    o.vx = o.vy = 0;
  });
  me.facing = 1;
  runUntilPhase(s, 'aim');
  return s;
}

describe('Practice', () => {
  const world = () => createWorld(practiceWorld(you, [], 4242));

  it('has one tardigrade for you and targets all over the map', () => {
    const s = world();
    expect(s.tardis.filter((t) => t.team === 0)).toHaveLength(1);
    const targets = s.tardis.filter((t) => t.team === 1);
    expect(targets).toHaveLength(PRACTICE_TARGETS);
    const xs = targets.map((t) => t.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(s.terrain.w / 2);
  });

  it('gives you every weapon with unlimited ammo (season weapons only if unlocked)', () => {
    const s = world();
    for (const w of Object.values(WEAPONS)) {
      if (w.hidden) continue;
      expect(s.teams[0].ammo[w.id], w.id).toBe(w.locked ? 0 : -1);
    }
  });

  it("your tardigrade can't be hurt, and climbs back out of the water", () => {
    const s = world();
    const me = s.tardis.find((t) => t.team === 0)!;
    const events: SimEvent[] = [];
    explode(s, me.x, me.y, 40, 80, events);
    me.poison = true;
    for (let i = 0; i < 3000 && s.turn.phase !== 'aim'; i++) tick(s, EMPTY_INPUT, events);
    expect(me.hp).toBe(100);
    expect(me.alive).toBe(true);
    me.y = s.waterY + 50;
    run(s, 2);
    expect(me.alive).toBe(true);
    expect(me.y).toBeLessThan(s.waterY);
  });

  it('ends when every target is popped, and you win', () => {
    const s = world();
    for (const t of s.tardis) if (t.team === 1) t.pendingDmg = 500;
    runUntilPhase(s, 'gameover', 20000);
    expect(s.turn.phase).toBe('gameover');
    expect(s.turn.winner).toBe(0);
  });
});

describe('Friendly fire', () => {
  function pair(friendlyFire: boolean) {
    const s = flat(
      createWorld({
        seed: 77,
        teams: [
          { name: 'Red', color: 0xe04848, cpu: false },
          { name: 'Blue', color: 0x3a7be0, cpu: false },
        ],
        scheme: { friendlyFire, tardisPerTeam: 2, mines: 0, drums: 0 },
      }),
    );
    const me = activeTardi(s)!;
    const mate = s.tardis.find((t) => t.team === me.team && t !== me)!;
    const foe = s.tardis.find((t) => t.team !== me.team)!;
    mate.x = 1100;
    foe.x = 1130;
    explode(s, 1115, 600 - TARDI_R - 1, 40, 50, []);
    return { mate, foe };
  }

  it('on (the default): your blasts hurt your own team too', () => {
    const { mate, foe } = pair(true);
    expect(mate.pendingDmg).toBeGreaterThan(0);
    expect(foe.pendingDmg).toBeGreaterThan(0);
  });

  it("off: your blasts don't hurt or push your own team, only the others", () => {
    const { mate, foe } = pair(false);
    expect(mate.pendingDmg).toBe(0);
    expect(mate.vx).toBe(0);
    expect(foe.pendingDmg).toBeGreaterThan(0);
  });
});

describe('Strikes and the wind', () => {
  /** Where the raindrop strike's drops land, with this wind. */
  function landing(wind: number): number {
    const s = flat(makeWorld(9));
    select(s, 'airstrike');
    target(s, 1400, 500);
    s.wind = wind;
    const events = run(s, 1, { held: BTN_FIRE, pressed: 0 });
    // Keep the wind steady while they fall.
    for (let i = 0; i < 300 && s.projectiles.length > 0; i++) {
      s.wind = wind;
      tick(s, EMPTY_INPUT, events);
    }
    const booms = events.filter((e): e is Extract<SimEvent, { t: 'explosion' }> => e.t === 'explosion');
    expect(booms.length).toBeGreaterThan(0);
    return booms.reduce((a, e) => a + e.x, 0) / booms.length;
  }

  it('fall on the target with no wind, and drift with the wind either way', () => {
    const calm = landing(0);
    expect(Math.abs(calm - 1400)).toBeLessThan(15);
    expect(landing(1) - calm).toBeGreaterThan(40);
    expect(calm - landing(-1)).toBeGreaterThan(40);
  });

  it("don't depend on which side the thrower stands", () => {
    const left = flat(makeWorld(9));
    const right = flat(makeWorld(9));
    activeTardi(right)!.x = 1800;
    for (const s of [left, right]) {
      select(s, 'airstrike');
      target(s, 1400, 500);
      s.wind = 0;
      run(s, 1, { held: BTN_FIRE, pressed: 0 });
    }
    expect(left.projectiles.map((p) => [p.x, p.vx])).toEqual(right.projectiles.map((p) => [p.x, p.vx]));
  });
});

describe('Twig Girder', () => {
  it('can rest on the ground (a ramp or a bridge end)', () => {
    const s = flat(makeWorld(5));
    select(s, 'girder');
    s.turn.aim = 0; // flat
    // Its bottom edge dips 2px into the floor at y=600.
    target(s, 1300, 600 - 2);
    const ev = run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(ev.some((e) => e.t === 'terrain')).toBe(true);
    expect(s.terrain.mask[597 * s.terrain.w + 1300]).toBe(2);
    expect(s.terrain.mask[601 * s.terrain.w + 1300]).toBe(1); // the ground under it is untouched
  });

  it('is refused when mostly buried', () => {
    const s = flat(makeWorld(5));
    select(s, 'girder');
    s.turn.aim = 0;
    target(s, 1300, 603);
    run(s, 2, { held: BTN_FIRE, pressed: 0 });
    expect(s.turn.phase).toBe('aim');
  });
});
