// Collects keyboard, mouse and touch input into one InputFrame per sim tick.

import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, PRESS_JUMP, type Command, type InputFrame } from '../sim/types';
import { actionFor, controls, type Action } from './controls';

export class InputCollector {
  // Each source (key code or touch button id) holds a bit while down.
  private sources = new Map<string, number>();
  private pressed = 0;
  // Buttons pressed since the last frame, so a tap shorter than one tick
  // still registers as held for a tick.
  private latched = 0;
  private cmds: Command[] = [];

  hold(source: string, bit: number, down: boolean): void {
    if (down) {
      this.sources.set(source, bit);
      this.latched |= bit;
    } else {
      this.sources.delete(source);
    }
  }

  press(bit: number): void {
    this.pressed |= bit;
  }

  command(cmd: Command): void {
    // Only the latest drag-aim matters: don't let a fast drag queue up a backlog.
    if (cmd.t === 'aim') this.cmds = this.cmds.filter((c) => c.t !== 'aim');
    this.cmds.push(cmd);
  }

  releaseAll(): void {
    this.sources.clear();
    this.latched = 0;
  }

  /** Build the frame for the next tick and clear one-shot inputs. */
  frame(): InputFrame {
    let held = this.latched;
    for (const bit of this.sources.values()) held |= bit;
    this.latched = 0;
    const f: InputFrame = { held, pressed: this.pressed };
    const cmd = this.cmds.shift();
    if (cmd) f.cmd = cmd;
    this.pressed = 0;
    return f;
  }
}

/** Actions held down like buttons (the rest happen once per press). */
const HOLD_BITS: Partial<Record<Action, number>> = {
  left: BTN_LEFT,
  right: BTN_RIGHT,
  up: BTN_UP,
  down: BTN_DOWN,
  fire: BTN_FIRE,
};

export interface KeyboardHooks {
  onWeaponPanel: () => void;
  onEscape: () => void;
}

/**
 * A key or mouse button bound to `action` went down or up. `source` names
 * it (its code), so holding two keys for one action works.
 */
export function doAction(input: InputCollector, hooks: KeyboardHooks, action: Action, source: string, down: boolean, repeat = false): void {
  const bit = HOLD_BITS[action];
  if (bit !== undefined) {
    input.hold(source, bit, down);
    return;
  }
  if (!down || repeat) return;
  if (action === 'jump') input.press(PRESS_JUMP);
  else if (action === 'weapons') hooks.onWeaponPanel();
  else input.command({ t: 'fuse', s: Number(action.slice(4)) });
}

export function attachKeyboard(input: InputCollector, hooks: KeyboardHooks): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Escape') {
      if (!e.repeat) hooks.onEscape();
      return;
    }
    const action = actionFor(controls(), e.code);
    if (!action) return;
    e.preventDefault();
    doAction(input, hooks, action, e.code, true, e.repeat);
  };
  const up = (e: KeyboardEvent) => {
    // Released whatever it does now (the settings may have changed while it was held).
    input.hold(e.code, 0, false);
  };
  const blur = () => input.releaseAll();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
  };
}
