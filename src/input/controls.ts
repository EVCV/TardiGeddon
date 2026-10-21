// The player's control settings: which keys and mouse buttons do what, and
// how the touch pads look. Edited on the Settings page (ui/settings.ts).
// Signed in, they're kept on the account (server: /api/settings); signed out,
// only for this visit (sessionStorage). The server checks them with the same
// sanitiseControls, so this file must stay free of DOM-only code at the top level.

export type Action = 'left' | 'right' | 'up' | 'down' | 'fire' | 'jump' | 'weapons' | 'fuse1' | 'fuse2' | 'fuse3' | 'fuse4' | 'fuse5';

/** In the order the Settings page lists them. */
export const ACTIONS: { id: Action; name: string }[] = [
  { id: 'left', name: 'Walk left' },
  { id: 'right', name: 'Walk right' },
  { id: 'up', name: 'Aim up' },
  { id: 'down', name: 'Aim down' },
  { id: 'fire', name: 'Fire (hold to charge)' },
  { id: 'jump', name: 'Jump (twice: backflip)' },
  { id: 'weapons', name: 'Weapons' },
  { id: 'fuse1', name: 'Fuse 1 second' },
  { id: 'fuse2', name: 'Fuse 2 seconds' },
  { id: 'fuse3', name: 'Fuse 3 seconds' },
  { id: 'fuse4', name: 'Fuse 4 seconds' },
  { id: 'fuse5', name: 'Fuse 5 seconds' },
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
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  Mouse0: 'Left click',
  Mouse1: 'Middle click',
  Mouse2: 'Right click',
  Mouse3: 'Mouse back',
  Mouse4: 'Mouse forward',
  ShiftLeft: 'Left Shift',
  ShiftRight: 'Right Shift',
  ControlLeft: 'Left Ctrl',
  ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt',
  AltRight: 'Right Alt',
  MetaLeft: 'Left ⌘',
  MetaRight: 'Right ⌘',
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

/** How a binding is shown: "A", "Space", "Left click". */
export function keyLabel(code: string): string {
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
  return code;
}

/** "A or ←", or "(not set)": for hints and the tutorial. */
export function bindingText(c: Controls, action: Action): string {
  const k = c.keys[action];
  return k.length ? k.map(keyLabel).join(' or ') : '(not set)';
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
