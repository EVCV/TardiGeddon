import { describe, expect, it } from 'vitest';
import { activeTardi, createWorld, tick, TARDI_R } from '../src/sim/world';
import { BTN_FIRE, type WorldState } from '../src/sim/types';
import { WEAPONS } from '../src/sim/weapons';
import { SHOP_ITEMS, unlockedWeapons } from '../src/shop/catalog';
import { run, runUntilPhase } from './helpers';

const SEASON = Object.values(WEAPONS).filter((w) => w.locked).map((w) => w.id);

function world(unlocked?: string[]): WorldState {
  return createWorld({
    seed: 77,
    teams: [
      { name: 'Red', color: 0xe04848, cpu: false },
      { name: 'Blue', color: 0x3a7be0, cpu: false },
    ],
    scheme: unlocked ? { unlocked } : undefined,
  });
}

/** Flat floor, the active tardi in the middle, everyone else far away. */
function arena(unlocked: string[]): WorldState {
  const s = world(unlocked);
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

describe('season weapons', () => {
  it('are sold for Slime only, never for coins', () => {
    const weapons = SHOP_ITEMS.filter((i) => i.kind === 'weapon');
    expect(weapons.map((w) => w.ref).sort()).toEqual([...SEASON].sort());
    for (const w of weapons) {
      expect(w.coins).toBeUndefined();
      expect(w.slime).toBeGreaterThan(0);
    }
    expect(unlockedWeapons(['weapon:pinball', 'hat:wizard'])).toEqual(['pinball']);
  });

  it('are off unless the match rules switch them on, and then every team gets them', () => {
    const off = world();
    for (const id of SEASON) for (const tm of off.teams) expect(tm.ammo[id]).toBe(0);
    const on = world(['megaspore']);
    for (const tm of on.teams) {
      expect(tm.ammo.megaspore).toBe(WEAPONS.megaspore.ammo);
      expect(tm.ammo.pinball).toBe(0);
    }
  });

  it('cannot be selected when locked', () => {
    const s = arena([]);
    tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'balloon' } }, []);
    expect(s.turn.weapon).not.toBe('balloon');
  });

  for (const id of SEASON) {
    it(`${WEAPONS[id].name} fires and explodes`, () => {
      const s = arena(SEASON);
      tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id } }, []);
      expect(s.turn.weapon).toBe(id);
      s.turn.aim = 300;
      run(s, 25, { held: BTN_FIRE, pressed: 0 });
      const ev = run(s, 50 * 12);
      expect(ev.some((e) => e.t === 'explosion')).toBe(true);
      expect(s.teams[s.tardis.find((t) => t.alive)!.team].ammo[id]).toBeLessThan(WEAPONS[id].ammo);
    });
  }

  it('Spore Swarm splits into eight bomblets', () => {
    const s = arena(['swarm']);
    tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'swarm' } }, []);
    s.turn.aim = 400;
    run(s, 25, { held: BTN_FIRE, pressed: 0 });
    run(s, 3 * 50 + 5);
    expect(s.projectiles.filter((p) => p.weapon === 'clusterlet').length).toBe(8);
  });
});
