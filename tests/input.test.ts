import { describe, expect, it } from 'vitest';
import { InputCollector } from '../src/input/input';
import { BTN_FIRE, BTN_LEFT } from '../src/sim/types';

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
});
