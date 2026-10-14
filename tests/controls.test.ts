import { describe, expect, it } from 'vitest';
import { ACTIONS, actionFor, bind, defaultControls, keyLabel, sanitiseControls, unbind } from '../src/input/controls';

describe('control settings', () => {
  it('standard keys use each key once', () => {
    const all = ACTIONS.flatMap((a) => defaultControls().keys[a.id]);
    expect(new Set(all).size).toBe(all.length);
    expect(actionFor(defaultControls(), 'Space')).toBe('fire');
    expect(actionFor(defaultControls(), 'Mouse2')).toBe('weapons');
  });

  it('binding a key takes it off the action that had it', () => {
    let c = bind(defaultControls(), 'fire', 1, 'Mouse0');
    expect(c.keys.fire).toEqual(['Space', 'Mouse0']);
    c = bind(c, 'jump', 0, 'Space');
    expect(c.keys.fire).toEqual(['Mouse0']);
    expect(c.keys.jump).toEqual(['Space', 'NumpadEnter']);
    expect(unbind(c, 'jump', 0).keys.jump).toEqual(['NumpadEnter']);
  });

  it('cleans settings from storage or the network', () => {
    expect(sanitiseControls(null)).toBeNull();
    expect(sanitiseControls('x')).toBeNull();
    const c = sanitiseControls({
      keys: { fire: ['Mouse0', 'Mouse0', 'KeyF', 'KeyG'], jump: ['Escape', '<script>', 42, 'KeyF'], bogus: ['KeyZ'] },
      touchSize: 'huge',
      touchSwap: 'yes',
    })!;
    expect(c.keys.fire).toEqual(['Mouse0', 'KeyF']); // no repeats, at most two
    expect(c.keys.jump).toEqual([]); // Escape, junk and a key already used are dropped
    expect(c.keys.left).toEqual(['ArrowLeft', 'KeyA']); // missing: standard keys
    expect(c.touchSize).toBe('m');
    expect(c.touchSwap).toBe(false);
    expect((c.keys as Record<string, unknown>).bogus).toBeUndefined();
  });

  it('a standard key kept for a missing action never clashes with one moved elsewhere', () => {
    const c = sanitiseControls({ keys: { fire: ['ArrowLeft'] } })!;
    expect(c.keys.fire).toEqual(['ArrowLeft']);
    expect(c.keys.left).toEqual(['KeyA']);
  });

  it('names keys and mouse buttons for people', () => {
    expect(keyLabel('KeyA')).toBe('A');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('Mouse0')).toBe('Left click');
    expect(keyLabel('ArrowUp')).toBe('↑');
  });
});
