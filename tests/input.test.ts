import { describe, expect, it } from 'vitest';
import { InputCollector } from '../src/input/input';
import { BTN_FIRE, BTN_LEFT } from '../src/sim/types';
import { defaultControls, sanitiseControls, setControls } from '../src/input/controls';

describe('InputCollector', () => {
  it('keeps a tap shorter than one tick for exactly one frame', () => {
    const input = new InputCollector();
    input.hold('Space', BTN_FIRE, true);
    input.hold('Space', BTN_FIRE, false);
    expect(input.frame().held & BTN_FIRE).toBe(BTN_FIRE);
    expect(input.frame().held & BTN_FIRE).toBe(0);
  });

  it('combines sources and delivers one command per frame', () => {
    const input = new InputCollector();
    input.hold('a', BTN_LEFT, true);
    input.hold('b', BTN_FIRE, true);
    input.command({ t: 'skip' });
    input.command({ t: 'fuse', s: 2 });
    const f1 = input.frame();
    expect(f1.held).toBe(BTN_LEFT | BTN_FIRE);
    expect(f1.cmd).toEqual({ t: 'skip' });
    expect(input.frame().cmd).toEqual({ t: 'fuse', s: 2 });
    expect(input.frame().cmd).toBeUndefined();
  });

  it('keeps only the latest drag-aim so a fast drag does not lag behind', () => {
    const input = new InputCollector();
    input.command({ t: 'fuse', s: 2 });
    for (let a = 0; a < 10; a++) input.command({ t: 'aim', facing: 1, aim: a * 50 });
    expect(input.frame().cmd).toEqual({ t: 'fuse', s: 2 });
    expect(input.frame().cmd).toEqual({ t: 'aim', facing: 1, aim: 450 });
    expect(input.frame().cmd).toBeUndefined();
  });
});

describe('tap to fire', () => {
  it('holds Fire from one tap to the next, for weapons you charge only', () => {
    setControls({ ...defaultControls(), tapFire: true });
    try {
      const input = new InputCollector();
      input.chargeWeapon = true;
      input.hold('Space', BTN_FIRE, true);
      input.hold('Space', BTN_FIRE, false);
      for (let i = 0; i < 5; i++) expect(input.frame().held & BTN_FIRE).toBe(BTN_FIRE);
      input.hold('Space', BTN_FIRE, true);
      expect(input.frame().held & BTN_FIRE).toBe(0); // let go: the shot goes
      input.hold('Space', BTN_FIRE, false);
      expect(input.frame().held & BTN_FIRE).toBe(0);
      // Not a charging weapon: a tap is a plain press.
      input.chargeWeapon = false;
      input.hold('Space', BTN_FIRE, true);
      input.hold('Space', BTN_FIRE, false);
      expect(input.frame().held & BTN_FIRE).toBe(BTN_FIRE);
      expect(input.frame().held & BTN_FIRE).toBe(0);
    } finally {
      setControls(defaultControls());
    }
  });

  it('is off unless chosen, and kept by the settings check', () => {
    expect(defaultControls().tapFire).toBe(false);
    expect(sanitiseControls({ ...defaultControls(), tapFire: true })?.tapFire).toBe(true);
    expect(sanitiseControls({ ...defaultControls(), tapFire: 'yes' })?.tapFire).toBe(false);
  });
});
