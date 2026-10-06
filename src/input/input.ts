// Collects keyboard, mouse and touch input into one InputFrame per sim tick.

import { BTN_DOWN, BTN_FIRE, BTN_LEFT, BTN_RIGHT, BTN_UP, PRESS_JUMP, type Command, type InputFrame } from '../sim/types';

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

const KEY_BITS: Record<string, number> = {
  ArrowLeft: BTN_LEFT,
  ArrowRight: BTN_RIGHT,
  ArrowUp: BTN_UP,
  ArrowDown: BTN_DOWN,
  KeyA: BTN_LEFT,
  KeyD: BTN_RIGHT,
  KeyW: BTN_UP,
  KeyS: BTN_DOWN,
  Space: BTN_FIRE,
};

export interface KeyboardHooks {
  onWeaponPanel: () => void;
  onEscape: () => void;
}

export function attachKeyboard(input: InputCollector, hooks: KeyboardHooks): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    const bit = KEY_BITS[e.code];
    if (bit) {
      input.hold(e.code, bit, true);
      e.preventDefault();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      input.press(PRESS_JUMP);
      e.preventDefault();
    } else if (/^Digit[1-5]$/.test(e.code)) {
      input.command({ t: 'fuse', s: Number(e.code.slice(5)) });
    } else if (e.code === 'Tab' || e.code === 'KeyQ') {
      hooks.onWeaponPanel();
      e.preventDefault();
    } else if (e.code === 'Escape') {
      hooks.onEscape();
    }
  };
  const up = (e: KeyboardEvent) => {
    if (KEY_BITS[e.code]) input.hold(e.code, KEY_BITS[e.code], false);
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
