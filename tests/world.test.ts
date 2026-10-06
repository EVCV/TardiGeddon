import { describe, expect, it } from 'vitest';
import { activeTardi, cloneWorld, explode, hashWorld, tick } from '../src/sim/world';
import { BTN_FIRE, BTN_RIGHT, BTN_UP, EMPTY_INPUT, PRESS_JUMP, type InputFrame } from '../src/sim/types';
import { makeWorld, run, runUntilPhase } from './helpers';

describe('world setup', () => {
  it('places every tardi on solid ground above water', () => {
    const s = makeWorld();
    expect(s.tardis).toHaveLength(8);
    for (const t of s.tardis) {
      expect(t.alive).toBe(true);
      expect(t.y).toBeLessThan(s.waterY);
    }
    run(s, 10);
    for (const t of s.tardis) expect(t.airborne).toBe(false);
  });
});

describe('turns', () => {
  it('ends the turn when the timer runs out and moves to the other team', () => {
    const s = makeWorld();
    const firstTeam = s.turn.teamIdx;
    runUntilPhase(s, 'aim');
    const events = runUntilPhase(s, 'start', s.scheme.turnTime * 50 + 500);
    expect(events.some((e) => e.t === 'turnStart')).toBe(true);
    expect(s.turn.teamIdx).not.toBe(firstTeam);
  });

  it('walks and jumps', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    const t = activeTardi(s)!;
    const x0 = t.x;
    run(s, 20, { held: BTN_RIGHT, pressed: 0 });
    expect(t.x).not.toBe(x0);
    tick(s, { held: 0, pressed: PRESS_JUMP }, []);
    run(s, 12);
    expect(t.airborne || t.y !== 0).toBe(true);
  });

  it('fires a bazooka, enters retreat, then settles into the next turn', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    run(s, 10, { held: BTN_UP, pressed: 0 });
    run(s, 30, { held: BTN_FIRE, pressed: 0 });
    const events = run(s, 1);
    expect(events.some((e) => e.t === 'fire')).toBe(true);
    expect(s.turn.phase).toBe('retreat');
    const later = runUntilPhase(s, 'start', 3000);
    expect(later.some((e) => e.t === 'explosion' || e.t === 'splash')).toBe(true);
  });
});

describe('damage', () => {
  it('applies explosion damage at end of turn and kills at 0 hp', () => {
    const s = makeWorld();
    const victim = s.tardis[1];
    victim.hp = 20;
    explode(s, victim.x, victim.y, 30, 50, []);
    expect(victim.pendingDmg).toBeGreaterThan(20);
    s.turn.phase = 'settle';
    const events = run(s, 600);
    expect(events.some((e) => e.t === 'damage' && e.id === victim.id)).toBe(true);
    expect(victim.alive).toBe(false);
  });

  it('declares a winner when one team is left', () => {
    const s = makeWorld();
    for (const t of s.tardis) if (t.team === 1) { t.alive = false; t.hp = 0; }
    s.turn.phase = 'settle';
    const events = run(s, 100);
    expect(s.turn.phase).toBe('gameover');
    expect(s.turn.winner).toBe(0);
    expect(events.some((e) => e.t === 'gameover')).toBe(true);
  });
});

describe('determinism', () => {
  function script(i: number): InputFrame {
    // A fixed, varied input script: walk, aim, jump, charge and fire.
    const phase = i % 400;
    if (phase < 60) return { held: BTN_RIGHT, pressed: 0 };
    if (phase === 70) return { held: 0, pressed: PRESS_JUMP };
    if (phase < 120) return { held: BTN_UP, pressed: 0 };
    if (phase < 150) return { held: BTN_FIRE, pressed: 0 };
    return EMPTY_INPUT;
  }

  it('produces identical state from identical inputs', () => {
    const a = makeWorld(77);
    const b = makeWorld(77);
    for (let i = 0; i < 4000; i++) {
      tick(a, script(i), []);
      tick(b, script(i), []);
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.turn.turnNumber).toBeGreaterThan(1);
  });

  it('clones are independent and replay identically', () => {
    const a = makeWorld(5);
    run(a, 100);
    const b = cloneWorld(a);
    for (let i = 0; i < 2000; i++) {
      tick(a, script(i), []);
      tick(b, script(i), []);
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});

describe('weapons', () => {
  it('teleports to a free spot and ends the turn', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    const t = activeTardi(s)!;
    tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'teleport' } }, []);
    tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x: 1000, y: 50 } }, []);
    const events = run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(events.some((e) => e.t === 'teleport')).toBe(true);
    expect(t.x).toBe(1000);
    expect(s.turn.phase).toBe('settle');
    expect(s.teams[t.team].ammo.teleport).toBe(1);
  });

  it('refuses to teleport into solid ground', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    const t = activeTardi(s)!;
    tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'teleport' } }, []);
    tick(s, { held: 0, pressed: 0, cmd: { t: 'target', x: Math.round(t.x), y: s.waterY - 5 } }, []);
    run(s, 1, { held: BTN_FIRE, pressed: 0 });
    expect(s.turn.phase).toBe('aim');
  });

  it('gives the shotgun two shots before retreat', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'shotgun' } }, []);
    let shots = run(s, 1, { held: BTN_FIRE, pressed: 0 }).filter((e) => e.t === 'shot').length;
    expect(s.turn.phase).toBe('aim');
    run(s, 1);
    shots += run(s, 1, { held: BTN_FIRE, pressed: 0 }).filter((e) => e.t === 'shot').length;
    expect(shots).toBe(2);
    expect(['retreat', 'settle']).toContain(s.turn.phase);
  });

  it('remembers each team’s weapon choice separately', () => {
    const s = makeWorld();
    runUntilPhase(s, 'aim');
    const first = s.turn.teamIdx;
    tick(s, { held: 0, pressed: 0, cmd: { t: 'weapon', id: 'grenade' } }, []);
    tick(s, { held: 0, pressed: 0, cmd: { t: 'skip' } }, []);
    runUntilPhase(s, 'aim');
    expect(s.turn.teamIdx).not.toBe(first);
    expect(s.turn.weapon).toBe('bazooka');
  });
});
