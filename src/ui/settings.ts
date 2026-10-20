// The Settings page of the menu hub: sound (music and effects, on/off and
// volume, which track and sound pack), controls (keys and mouse buttons for
// every action, the touch pads) and the tutorial. Signed in, the controls
// are saved to the account; signed out, they last for this visit. Sound
// settings are kept on this device.

import { ACTIONS, MAX_BINDINGS, bind, bindable, controls, defaultControls, keyLabel, unbind, type Action, type Controls, type TouchSize } from '../input/controls';
import { account, chooseMusic, chooseSounds, ownedItems, saveControls, wearMusic, wearSounds } from '../account/session';
import { audioSettings, saveAudioSettings, unlockAudio, type AudioSettings } from '../audio/mixer';
import { TRACKS } from '../audio/music';
import { SOUND_PACKS, sfx, useSoundPack } from '../audio/sfx';
import { blockedPlayers, unblock } from '../net/blocked';
import { TEXT_SIZES, deviceTextScale, maxScaleHere, setTextSize, textSize, uiScale } from './textSize';
import { canUse, shopItem } from '../shop/catalog';
import type { HubContext } from './hub';
import { LEGAL } from './account';

declare const __APP_VERSION__: string;

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
  /** Phones: the section showing (they show one at a time). */
  section: Section | null;
}

type Section = 'text' | 'sound' | 'touch' | 'keys' | 'blocked' | 'learn' | 'about';
const SECTIONS: [Section, string][] = [
  ['text', '🔤 Text size'],
  ['sound', '🔊 Sound'],
  ['touch', '👆 Touch controls'],
  ['keys', '⌨️ Keyboard & mouse'],
  ['blocked', '🚫 Blocked players'],
  ['learn', '🎓 How to play'],
  ['about', 'ℹ️ About & legal'],
];

export function newSettingsState(): SettingsState {
  return { listening: null, note: '', saved: '', section: null };
}

/** Stops listening for a key (the page is being redrawn or left). */
let stopListening: (() => void) | null = null;

export function renderSettingsPage(ctx: HubContext, state: SettingsState, onTutorial: () => void, onPractice: () => void = () => {}): HTMLElement {
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
  keysCard.dataset.section = 'keys';
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
  touchCard.dataset.section = 'touch';
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

  // ---- Sound ----
  const soundCard = soundSettings(ctx);

  // ---- Tutorial ----
  const learnCard = el('section', 'card settings-learn');
  learnCard.dataset.section = 'learn';
  learnCard.append(el('h2', 'card-title', '🎓 Learn to play'));
  learnCard.append(el('p', 'account-note', 'A short practice match against a target dummy that walks you through moving, aiming, firing and targeting.'));
  const tut = el('button', 'big-btn', 'Start the tutorial');
  tut.onclick = onTutorial;
  const more = el('div', 'guide-buttons');
  const prac = el('button', 'hud-btn', '🎯 Practice');
  prac.onclick = onPractice;
  const guide = el('button', 'hud-btn', '📖 Guide: wind, weapons, online play');
  guide.onclick = () => ctx.go('guide');
  more.append(prac, guide);
  learnCard.append(tut, more);

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
        : 'Your controls last until you close the game.');
  if (!signedIn && me) {
    const link = el('button', 'link-btn', 'Sign in to keep them.');
    link.onclick = () => ctx.go('account');
    status.append(' ', link);
  }

  // Two columns of about the same height: the long controls list with Learn to
  // play under it, and the shorter settings stacked beside them.
  const main = el('div', 'settings-main');
  main.append(keysCard, learnCard);
  const side = el('div', 'settings-side');
  side.append(textSettings(ctx), soundCard, touchCard, blockedSettings(ctx));
  // On a touch screen the touch settings come first.
  const touchFirst = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  root.append(status, ...(touchFirst ? [side, main] : [main, side]));

  // Phones: a list of sections beside the one showing, instead of one long page.
  state.section ??= touchFirst ? 'touch' : 'keys';
  root.dataset.section = state.section;
  const menu = el('nav', 'settings-menu phone-only');
  menu.setAttribute('aria-label', 'Settings sections');
  for (const [id, label] of SECTIONS) {
    const b = el('button', 'settings-menu-btn' + (state.section === id ? ' on' : ''), label);
    if (state.section === id) b.setAttribute('aria-current', 'true');
    b.onclick = () => {
      state.section = id;
      ctx.rerender();
    };
    menu.append(b);
  }
  const about = el('section', 'card settings-about phone-only');
  about.dataset.section = 'about';
  about.append(el('h2', 'card-title', 'ℹ️ About & legal'));
  const links = el('div', 'settings-links');
  for (const [href, text] of [
    ['https://tardigeddon.com/', 'tardigeddon.com'],
    [LEGAL + 'terms-of-service', 'Terms'],
    [LEGAL + 'privacy-policy', 'Privacy'],
    [LEGAL + 'cookie-policy', 'Cookies'],
    [LEGAL + 'childrens-privacy', "Children's privacy"],
    [LEGAL + 'community-guidelines', 'Community'],
    ['mailto:support@tardigeddon.com', 'Support'],
  ]) {
    const a = el('a', 'hud-btn', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    links.append(a);
  }
  about.append(links, el('p', 'account-note', `Version ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'}`));
  root.prepend(menu);
  root.append(about);
  return root;
}

/** Text size: everything (text and buttons) scales together. */
function textSettings(ctx: HubContext): HTMLElement {
  const card = el('section', 'card settings-text');
  card.dataset.section = 'text';
  card.append(el('h2', 'card-title', '🔤 Text size'));
  const now = textSize();
  const seg = el('div', 'seg text-size-seg');
  for (const [id, label] of TEXT_SIZES) {
    const b = el('button', 'seg-btn' + (now === id ? ' on' : ''), label);
    b.setAttribute('aria-pressed', String(now === id));
    b.onclick = () => {
      setTextSize(id);
      ctx.rerender();
    };
    seg.append(b);
  }
  const dev = deviceTextScale();
  card.append(
    seg,
    el(
      'p',
      'account-note',
      `Makes all the writing bigger, with the buttons around it, in the menus and in matches. Auto follows your device${dev > 1 ? ` (${Math.round(dev * 100)}% now)` : ''}. Now: ${Math.round(uiScale() * 100)}%${maxScaleHere() < 1.5 ? ` (this screen has room for up to ${Math.round(maxScaleHere() * 100)}%; more on a bigger screen)` : ''}. Kept on this device.`,
    ),
  );
  return card;
}

/** Players you've blocked in online play, to unblock. */
function blockedSettings(ctx: HubContext): HTMLElement {
  const card = el('section', 'card settings-blocked');
  card.dataset.section = 'blocked';
  card.append(el('h2', 'card-title', '🚫 Blocked players'));
  const list = blockedPlayers();
  if (!list.length) card.append(el('p', 'account-note', 'Nobody. In an online game, use 🚫 next to a player (or the 👥 button in a match) to block them.'));
  for (const b of [...list].reverse()) {
    const row = el('div', 'blocked-row');
    const un = el('button', 'hud-btn', 'Unblock');
    un.onclick = () => {
      unblock(b.pid);
      ctx.rerender();
    };
    row.append(el('span', 'blocked-name', b.name), el('span', 'blocked-when', new Date(b.at).toLocaleDateString()), un);
    card.append(row);
  }
  card.append(el('p', 'account-note', 'Blocked players never join your quick-play games, and their names are hidden from you. Players who aren\u2019t signed in get a new identity each visit, so blocking them lasts for that visit. Kept on this device.'));
  return card;
}

/** Music and sound effects: on/off, volume, and which track and sound pack (from those owned). */
function soundSettings(ctx: HubContext): HTMLElement {
  const card = el('section', 'card settings-sound');
  card.dataset.section = 'sound';
  card.append(el('h2', 'card-title', '🔊 Sound'));
  const a = audioSettings();
  const row = (label: string, on: keyof AudioSettings, vol: keyof AudioSettings, test?: () => void) => {
    const box = el('div', 'sound-row');
    const check = el('label', 'account-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = a[on] as boolean;
    input.onchange = () => {
      unlockAudio();
      saveAudioSettings({ ...audioSettings(), [on]: input.checked });
      slider.disabled = !input.checked;
      if (input.checked) test?.();
    };
    check.append(input, el('span', '', label));
    const slider = el('input', 'sound-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '5';
    slider.value = String(a[vol]);
    slider.disabled = !a[on];
    slider.setAttribute('aria-label', `${label} volume`);
    const pct = el('span', 'sound-pct', `${a[vol]}%`);
    slider.oninput = () => {
      unlockAudio();
      saveAudioSettings({ ...audioSettings(), [vol]: Number(slider.value) });
      pct.textContent = `${slider.value}%`;
    };
    if (test) slider.onchange = test;
    box.append(check, slider, pct);
    return box;
  };
  card.append(row('Music', 'music', 'musicVol'), row('Sound effects', 'effects', 'effectsVol', () => sfx.jump()));

  // Which track plays in matches, and which sound pack: the free ones and those owned.
  const owned = ownedItems();
  const picker = (label: string, options: { id: string; name: string }[], current: string, pick: (id: string) => void) => {
    const box = el('label', 'sound-pick');
    box.append(el('span', 'settings-label', label));
    const select = el('select', 'sound-select');
    for (const o of options) {
      const opt = el('option', '', o.name);
      opt.value = o.id;
      opt.selected = o.id === current;
      select.append(opt);
    }
    select.onchange = () => {
      unlockAudio();
      pick(select.value);
    };
    box.append(select);
    return box;
  };
  const tracks = TRACKS.filter((t) => t.id !== 'menu' && canUse('music', t.id, owned));
  const packs = SOUND_PACKS.filter((p) => canUse('sound', p.id, owned)).map((p) => ({ id: p.id, name: shopItem(`sound:${p.id}`)?.name ?? 'Standard' }));
  card.append(
    picker('Match music', tracks, wearMusic(), chooseMusic),
    picker('Sound pack', packs, wearSounds(), (id) => {
      chooseSounds(id);
      useSoundPack(id);
      sfx.explosion(30);
    }),
  );
  const more = el('p', 'account-note');
  // The shop is only there when the server has accounts.
  if (account().me) {
    const shop = el('button', 'link-btn', 'Shop');
    shop.onclick = () => ctx.go('shop');
    more.append('More tracks and sound packs in the ', shop, '. Only you hear them. ');
  }
  more.append('Sound settings are kept on this device.');
  card.append(more);
  return card;
}

/** Wait for the next key or mouse button and bind it to the listening slot. */
function listen(state: SettingsState, save: (c: Controls, note?: string) => void, redraw: () => void): void {
  const target = state.listening!;
  // Only buttons pressed from now on: not the click that opened this box.
  // (Event times and performance.now() share a clock; a timer wouldn't do,
  // as the browser can handle a quick second click before any timer runs.)
  const since = performance.now();
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
    if (e.timeStamp < since) return;
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
