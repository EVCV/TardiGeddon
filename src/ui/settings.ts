// The Settings page of the menu hub: controls (keys and mouse buttons for
// every action, the touch pads) and the tutorial. Signed in, the controls
// are saved to the account; signed out, they last for this visit.

import { ACTIONS, MAX_BINDINGS, bind, bindable, controls, defaultControls, keyLabel, unbind, type Action, type Controls, type TouchSize } from '../input/controls';
import { account, saveControls } from '../account/session';
import type { HubContext } from './hub';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** What the page remembers between redraws. */
export interface SettingsState {
  /** The slot waiting for a key or click. */
  listening: { action: Action; slot: number } | null;
  /** Last change, e.g. "Space moved here from Jump". */
  note: string;
  /** Where the last save went. */
  saved: 'account' | 'visit' | 'error' | '';
}

export function newSettingsState(): SettingsState {
  return { listening: null, note: '', saved: '' };
}

/** Stops listening for a key (the page is being redrawn or left). */
let stopListening: (() => void) | null = null;

export function renderSettingsPage(ctx: HubContext, state: SettingsState, onTutorial: () => void): HTMLElement {
  stopListening?.();
  const root = el('div', 'page page-settings');
  const { me } = account();
  const signedIn = !!me?.user;

  const save = (next: Controls, note = '') => {
    state.note = note;
    state.saved = '';
    saveControls(next).then(
      (where) => {
        state.saved = where;
        if (root.isConnected) ctx.rerender();
      },
      () => {
        state.saved = 'error';
        if (root.isConnected) ctx.rerender();
      },
    );
    ctx.rerender();
  };

  // ---- Keyboard and mouse ----
  const keysCard = el('section', 'card settings-keys');
  keysCard.append(el('h2', 'card-title', '⌨️ Keyboard & mouse'));
  keysCard.append(
    el('p', 'account-note', 'Click a box, then press a key or click a mouse button (left, right, middle or the side buttons). Backspace clears it, Esc cancels. Mouse buttons you leave free drag the map.'),
  );
  const c = controls();
  const table = el('div', 'bind-table');
  for (const { id, name } of ACTIONS) {
    const row = el('div', 'bind-row');
    row.append(el('span', 'bind-name', name));
    for (let slot = 0; slot < MAX_BINDINGS; slot++) {
      const code = c.keys[id][slot];
      const listening = state.listening?.action === id && state.listening.slot === slot;
      const b = el('button', 'bind-key' + (listening ? ' listening' : '') + (code ? '' : ' empty'));
      b.textContent = listening ? 'Press a key…' : code ? keyLabel(code) : '+';
      b.setAttribute('aria-label', `${name}, ${slot === 0 ? 'main' : 'second'} key: ${code ? keyLabel(code) : 'none'}. Click to change.`);
      // Only the first empty slot is offered, so keys stay in order.
      b.disabled = !code && slot > c.keys[id].length;
      b.onclick = () => {
        if (listening) return;
        state.listening = { action: id, slot };
        state.note = '';
        ctx.rerender();
      };
      row.append(b);
    }
    table.append(row);
  }
  keysCard.append(table);

  if (state.listening) listen(state, save, () => ctx.rerender());

  const actions = el('div', 'settings-actions');
  const reset = el('button', 'hud-btn', '↺ Back to the standard keys');
  reset.onclick = () => {
    const d = defaultControls();
    save({ ...controls(), keys: d.keys }, 'Standard keys are back.');
  };
  actions.append(reset);
  keysCard.append(actions);

  // ---- Touch screen ----
  const touchCard = el('section', 'card settings-touch');
  touchCard.append(el('h2', 'card-title', '👆 Touch screen'));
  const sizeLabel = el('p', 'settings-label', 'Button size');
  const sizes = el('div', 'seg');
  for (const [id, label] of [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']] as [TouchSize, string][]) {
    const b = el('button', 'seg-btn' + (c.touchSize === id ? ' on' : ''), label);
    b.setAttribute('aria-pressed', String(c.touchSize === id));
    b.onclick = () => save({ ...controls(), touchSize: id });
    sizes.append(b);
  }
  const swap = el('label', 'account-check settings-swap');
  const box = el('input');
  box.type = 'checkbox';
  box.checked = c.touchSwap;
  box.onchange = () => save({ ...controls(), touchSwap: box.checked });
  swap.append(box, el('span', '', 'Left-handed: walk buttons on the right, Aim, Jump and Fire on the left'));
  touchCard.append(
    sizeLabel,
    sizes,
    swap,
    el('p', 'account-note', 'In a match: drag the map to look around, pinch to zoom, tap the map to pick a target, and drag from your tardigrade to aim.'),
  );

  // ---- Tutorial ----
  const learnCard = el('section', 'card settings-learn');
  learnCard.append(el('h2', 'card-title', '🎓 Learn to play'));
  learnCard.append(el('p', 'account-note', 'A short practice match against a target dummy that walks you through moving, aiming, firing and targeting.'));
  const tut = el('button', 'big-btn', 'Start the tutorial');
  tut.onclick = onTutorial;
  learnCard.append(tut);

  // ---- Where it's saved ----
  const status = el('p', 'settings-status');
  status.setAttribute('role', 'status');
  status.textContent =
    state.note +
    (state.note ? ' ' : '') +
    (state.saved === 'error'
      ? "Couldn't save to your account just now: these settings last for this visit."
      : signedIn
        ? 'Your controls are saved to your account, on every device.'
        : 'These settings last until you close the game.');
  if (!signedIn && me) {
    const link = el('button', 'link-btn', 'Sign in to keep them.');
    link.onclick = () => ctx.go('account');
    status.append(' ', link);
  }

  const side = el('div', 'settings-side');
  side.append(touchCard, learnCard);
  // On a touch screen the touch settings come first.
  const touchFirst = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  root.append(status, ...(touchFirst ? [side, keysCard] : [keysCard, side]));
  return root;
}

/** Wait for the next key or mouse button and bind it to the listening slot. */
function listen(state: SettingsState, save: (c: Controls, note?: string) => void, redraw: () => void): void {
  const target = state.listening!;
  let armed = false;
  // Ignore the click that started listening.
  const t = setTimeout(() => (armed = true), 0);
  const done = (code: string | null, clear = false) => {
    stop();
    state.listening = null;
    if (clear) {
      save(unbind(controls(), target.action, target.slot));
      return;
    }
    if (!code) return redraw();
    if (!bindable(code)) {
      state.note = `${keyLabel(code)} can't be used.`;
      return redraw();
    }
    const before = ACTIONS.find((a) => a.id !== target.action && controls().keys[a.id].includes(code));
    save(bind(controls(), target.action, target.slot, code), before ? `${keyLabel(code)} moved here from “${before.name}”.` : '');
  };
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') done(null);
    else if (e.code === 'Backspace' || e.code === 'Delete') done(null, true);
    else if (e.code) done(e.code);
  };
  const onPointer = (e: PointerEvent) => {
    if (!armed) return;
    // A tap (touch or pen) just cancels: there's no key to take.
    if (e.pointerType !== 'mouse') return done(null);
    e.preventDefault();
    e.stopPropagation();
    done(`Mouse${e.button}`);
  };
  // The click (and right-click menu) after a mouse button was taken.
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const stop = () => {
    clearTimeout(t);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPointer, true);
    setTimeout(() => {
      window.removeEventListener('click', swallow, true);
      window.removeEventListener('auxclick', swallow, true);
      window.removeEventListener('contextmenu', swallow, true);
      window.removeEventListener('mouseup', swallow, true);
    }, 0);
    stopListening = null;
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onPointer, true);
  window.addEventListener('click', swallow, true);
  window.addEventListener('auxclick', swallow, true);
  window.addEventListener('contextmenu', swallow, true);
  window.addEventListener('mouseup', swallow, true);
  stopListening = stop;
}
