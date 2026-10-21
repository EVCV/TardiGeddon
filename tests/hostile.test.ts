import { describe, expect, it } from 'vitest';
import { tick } from '../src/sim/world';
import { WEAPONS } from '../src/sim/weapons';
import { cleanFrame, cleanScheme } from '../server/room';
import type { SimEvent } from '../src/sim/types';
import { makeWorld, runUntilPhase } from './helpers';

// Online, input frames come from other players: whatever they send must
// never crash the simulation (it runs on the server for every match).
const SNEAKY = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype'];

describe('hostile input', () => {
  it('ignores weapon ids that are only object built-ins', () => {
    for (const id of SNEAKY) {
      const s = makeWorld();
      runUntilPhase(s, 'aim');
      const before = s.turn.weapon;
      const events: SimEvent[] = [];
      expect(() => {
        tick(s, cleanFrame([0, 0, { t: 'weapon', id }]), events);
        for (let i = 0; i < 200; i++) tick(s, { held: 0, pressed: 0 }, events);
      }).not.toThrow();
      expect(s.turn.weapon === before || WEAPONS[s.turn.weapon] !== undefined).toBe(true);
    }
  });

  it('never hands the sim a weapon id that is not a real weapon', () => {
    for (const id of SNEAKY) {
      const f = cleanFrame([0, 0, { t: 'weapon', id }]);
      expect(f.cmd).toBeUndefined();
    }
    expect(cleanFrame([0, 0, { t: 'weapon', id: 'bazooka' }]).cmd).toEqual({ t: 'weapon', id: 'bazooka' });
  });

  it('drops built-in names from a game style weapon list', () => {
    const sc = cleanScheme({ weapons: Object.fromEntries(SNEAKY.map((k) => [k, 3]).concat([['bazooka', 2]])) });
    expect(Object.keys(sc.weapons ?? {})).toEqual(['bazooka']);
  });

  it('only takes known map styles, a clamped whole armour and a true/false weather', () => {
    for (const k of [...SNEAKY, 'random', 'lava']) expect(cleanScheme({ mapStyle: k }).mapStyle).toBeUndefined();
    expect(cleanScheme({ mapStyle: 'sky' }).mapStyle).toBe('sky');
    expect(cleanScheme({ armour: 1e9 }).armour).toBe(100);
    expect(cleanScheme({ armour: 12.7 }).armour).toBe(13);
    expect(cleanScheme({ weather: 'yes' }).weather).toBeUndefined();
    expect(cleanScheme({ weather: false }).weather).toBe(false);
  });

  it('has no inherited names in the weapon list', () => {
    for (const id of SNEAKY) expect(WEAPONS[id]).toBeUndefined();
  });
});
