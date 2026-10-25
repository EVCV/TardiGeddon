// The player's control settings: which keys and mouse buttons do what, and
// how the touch pads look. Edited on the Settings page (ui/settings.ts).
// Signed in, they're kept on the account (server: /api/settings); signed out,
// only for this visit (sessionStorage). The server checks them with the same
// sanitiseControls, so this file must stay free of DOM-only code at the top level.

import type { ChargeStyle } from '../sim/types';
import { t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

export type Action = 'left' | 'right' | 'up' | 'down' | 'fire' | 'jump' | 'weapons' | 'fuse1' | 'fuse2' | 'fuse3' | 'fuse4' | 'fuse5';

/** In the order the Settings page lists them. Names are English: shown with t(name). */
export const ACTIONS: { id: Action; name: string }[] = [
  { id: 'left', name: tk('Walk left') },
  { id: 'right', name: tk('Walk right') },
  { id: 'up', name: tk('Aim up') },
  { id: 'down', name: tk('Aim down') },
  { id: 'fire', name: tk('Fire (hold to charge)') },
  { id: 'jump', name: tk('Jump (twice: backflip)') },
  { id: 'weapons', name: tk('Weapons') },
  { id: 'fuse1', name: tk('Fuse 1 second') },
  { id: 'fuse2', name: tk('Fuse 2 seconds') },
  { id: 'fuse3', name: tk('Fuse 3 seconds') },
  { id: 'fuse4', name: tk('Fuse 4 seconds') },
  { id: 'fuse5', name: tk('Fuse 5 seconds') },
];

/** Keys or mouse buttons per action, at most this many each. */
export const MAX_BINDINGS = 2;

export type TouchSize = 's' | 'm' | 'l';

export interface Controls {
  /**
   * Bindings per action: KeyboardEvent.code values ("KeyA", "Space") or
   * "Mouse0".."Mouse4" (left, middle, right, back, forward).
   */
  keys: Record<Action, string[]>;
  /** Size of the on-screen buttons. */
  touchSize: TouchSize;
  /** Walk buttons on the right, aim/jump/fire on the left. */
  touchSwap: boolean;
  /** Charging a shot: tap Fire to start and tap again to let go, instead of holding it. */
  tapFire: boolean;
  /** Charging a throw at half speed (easier to judge while learning). */
  slowPower: boolean;
  /** At full power the bar goes back down (and up again) instead of throwing by itself. */
  powerBounce: boolean;
}

/** How this player's throws charge, for their team in a match (Team.charge in the sim). */
export function chargeStyle(c: Controls): ChargeStyle {
  return c.slowPower ? (c.powerBounce ? 'slowbounce' : 'slow') : c.powerBounce ? 'bounce' : 'normal';
}

export function defaultControls(): Controls {
  return {
    keys: {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
      fire: ['Space'],
      jump: ['Enter', 'NumpadEnter'],
      weapons: ['Tab', 'Mouse2'],
      fuse1: ['Digit1'],
      fuse2: ['Digit2'],
      fuse3: ['Digit3'],
      fuse4: ['Digit4'],
      fuse5: ['Digit5'],
    },
    touchSize: 'm',
    touchSwap: false,
    tapFire: false,
    slowPower: false,
    powerBounce: false,
  };
}

/** Escape always closes things, so it can't be bound. */
export function bindable(code: string): boolean {
  return /^[A-Za-z0-9]{1,24}$/.test(code) && code !== 'Escape';
}

/**
 * Settings from storage or the network, made safe: unknown actions and junk
 * dropped, at most MAX_BINDINGS per action, a key used once. Null if it isn't
 * settings at all.
 */
export function sanitiseControls(v: unknown): Controls | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!o.keys || typeof o.keys !== 'object') return null;
  const keys = o.keys as Record<string, unknown>;
  const out = defaultControls();
  const used = new Set<string>();
  for (const { id } of ACTIONS) {
    const list = keys[id];
    if (!Array.isArray(list)) continue; // missing (e.g. an action added later): keep the default
    out.keys[id] = [];
    for (const code of list) {
      if (typeof code !== 'string' || !bindable(code) || used.has(code) || out.keys[id].length >= MAX_BINDINGS) continue;
      used.add(code);
      out.keys[id].push(code);
    }
  }
  // A default kept for a missing action mustn't clash with a key moved elsewhere.
  for (const { id } of ACTIONS) {
    if (Array.isArray(keys[id])) continue;
    out.keys[id] = out.keys[id].filter((c) => !used.has(c));
    for (const c of out.keys[id]) used.add(c);
  }
  out.touchSize = o.touchSize === 's' || o.touchSize === 'l' ? o.touchSize : 'm';
  out.touchSwap = o.touchSwap === true;
  out.tapFire = o.tapFire === true;
  out.slowPower = o.slowPower === true;
  out.powerBounce = o.powerBounce === true;
  return out;
}

/** The action a key or mouse button does, if any. */
export function actionFor(c: Controls, code: string): Action | null {
  for (const { id } of ACTIONS) if (c.keys[id].includes(code)) return id;
  return null;
}

/** Bind `code` to `action` in slot `slot`, taking it off any other action. */
export function bind(c: Controls, action: Action, slot: number, code: string): Controls {
  const next: Controls = { ...c, keys: { ...c.keys } };
  for (const { id } of ACTIONS) next.keys[id] = next.keys[id].filter((k) => k !== code);
  const list = [...next.keys[action]];
  if (slot < list.length) list[slot] = code;
  else list.push(code);
  next.keys[action] = list.slice(0, MAX_BINDINGS);
  return next;
}

export function unbind(c: Controls, action: Action, slot: number): Controls {
  const next: Controls = { ...c, keys: { ...c.keys } };
  next.keys[action] = next.keys[action].filter((_, i) => i !== slot);
  return next;
}

const NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: tk('Space'),
  Enter: tk('Enter'),
  NumpadEnter: tk('Num Enter'),
  Mouse0: tk('Left click'),
  Mouse1: tk('Middle click'),
  Mouse2: tk('Right click'),
  Mouse3: tk('Mouse back'),
  Mouse4: tk('Mouse forward'),
  ShiftLeft: tk('Left Shift'),
  ShiftRight: tk('Right Shift'),
  ControlLeft: tk('Left Ctrl'),
  ControlRight: tk('Right Ctrl'),
  AltLeft: tk('Left Alt'),
  AltRight: tk('Right Alt'),
  MetaLeft: tk('Left ⌘'),
  MetaRight: tk('Right ⌘'),
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** How a binding is shown, in the player's language: "A", "Space", "Left click". */
export function keyLabel(code: string): string {
  if (NAMES[code]) return t(NAMES[code]);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return t('Num {key}', { key: code.slice(6) });
  return code;
}

/** "A or ←", or "(not set)": for hints and the tutorial. */
export function bindingText(c: Controls, action: Action): string {
  const k = c.keys[action].map(keyLabel);
  if (!k.length) return t('(not set)');
  // At most MAX_BINDINGS (2) keys each.
  return k.reduce((a, b) => t('{a} or {b}', { a, b }));
}

// ---- The current settings, for this page ----

const SESSION_KEY = 'tardigeddon.controls';
let current: Controls | null = null;
const listeners = new Set<() => void>();

export function controls(): Controls {
  if (!current) {
    let stored: unknown = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    } catch {
      /* storage blocked */
    }
    current = sanitiseControls(stored) ?? defaultControls();
  }
  return current;
}

/** Use these settings from now on (kept for this visit; the account copy is saved by account/session.ts). */
export function setControls(c: Controls): void {
  current = c;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(c));
  } catch {
    /* storage blocked: they last until the page closes */
  }
  for (const fn of listeners) fn();
}

export function onControlsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
