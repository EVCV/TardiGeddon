// The Settings page of the menu hub: text size, sound (music and effects,
// on/off and volume, which track and sound pack), controls (keys and mouse
// buttons for every action, the touch pads) and blocked players, one section
// at a time beside a list of them. Signed in, the controls are saved to the
// account; signed out, they last for this visit. Sound settings are kept on
// this device. (The tutorial, practice and the guide are in the lobby.)

import { ACTIONS, MAX_BINDINGS, bind, bindable, controls, defaultControls, keyLabel, unbind, type Action, type Controls, type TouchSize } from '../input/controls';
import { account, chooseMusic, chooseSounds, ownedItems, saveControls, wearMusic, wearSounds } from '../account/session';
import { audioSettings, hasSilentSwitch, saveAudioSettings, unlockAudio, type AudioSettings } from '../audio/mixer';
import { TRACKS } from '../audio/music';
import { SOUND_PACKS, sfx, useSoundPack } from '../audio/sfx';
import { blockedPlayers, unblock } from '../net/blocked';
import { TEXT_SIZES, deviceTextScale, maxScaleHere, setTextSize, textSize, uiScale } from './textSize';
import { canUse, shopItem } from '../shop/catalog';
import type { HubContext } from './hub';
import { LEGAL } from './account';
import { accessSettings, saveAccessSettings, type AccessSettings } from './access';
import { TEAM_SYMBOLS } from '../render/palette';
import { LANGS, isLang, lang, langSetting, setLangSetting, t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

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
  /** The section showing (one at a time). */
  section: Section | null;
}

type Section = 'language' | 'text' | 'access' | 'sound' | 'touch' | 'keys' | 'blocked' | 'about';
/** Icon and name (English: shown with t()). */
const SECTIONS: [Section, string, string][] = [
  ['language', '🌐', tk('Language')],
  ['keys', '⌨️', tk('Keyboard & mouse')],
  ['touch', '👆', tk('Touch controls')],
  ['sound', '🔊', tk('Sound')],
  ['text', '🔤', tk('Text size')],
  ['access', '👁️', tk('Accessibility')],
  ['blocked', '🚫', tk('Blocked players')],
  // Phones only: on bigger screens the hub's footer has these links.
  ['about', 'ℹ️', tk('About & legal')],
];

export function newSettingsState(): SettingsState {
  return { listening: null, note: '', saved: '', section: null };
}

/** Stops listening for a key (the page is being redrawn or left). */
let stopListening: (() => void) | null = null;

export function renderSettingsPage(ctx: HubContext, state: SettingsState): HTMLElement {
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
  keysCard.append(el('h2', 'card-title', `⌨️ ${t('Keyboard & mouse')}`));
  keysCard.append(
    el('p', 'account-note', t('Click a box, then press a key or click a mouse button (left, right, middle or the side buttons). Backspace clears it, Esc cancels. Mouse buttons you leave free drag the map.')),
  );
  const c = controls();
  const table = el('div', 'bind-table');
  for (const { id, name: english } of ACTIONS) {
    const name = t(english);
    const row = el('div', 'bind-row');
    row.append(el('span', 'bind-name', name));
    for (let slot = 0; slot < MAX_BINDINGS; slot++) {
      const code = c.keys[id][slot];
      const listening = state.listening?.action === id && state.listening.slot === slot;
      const b = el('button', 'bind-key' + (listening ? ' listening' : '') + (code ? '' : ' empty'));
      b.textContent = listening ? t('Press a key…') : code ? keyLabel(code) : '+';
      const vars = { action: name, key: code ? keyLabel(code) : t('none') };
      b.setAttribute('aria-label', slot === 0 ? t('{action}, main key: {key}. Click to change.', vars) : t('{action}, second key: {key}. Click to change.', vars));
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
  const reset = el('button', 'hud-btn', `↺ ${t('Back to the standard keys')}`);
  reset.onclick = () => {
    const d = defaultControls();
    save({ ...controls(), keys: d.keys }, t('Standard keys are back.'));
  };
  actions.append(reset);
  keysCard.append(actions);

  // ---- Touch screen ----
  const touchCard = el('section', 'card settings-touch');
  touchCard.dataset.section = 'touch';
  touchCard.append(el('h2', 'card-title', `👆 ${t('Touch screen')}`));
  const sizeLabel = el('p', 'settings-label', t('Button size'));
  const sizes = el('div', 'seg');
  for (const [id, label] of [['s', t('Small')], ['m', t('Medium')], ['l', t('Large')]] as [TouchSize, string][]) {
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
  swap.append(box, el('span', '', t('Left-handed: walk buttons on the right, Aim, Jump and Fire on the left')));
  touchCard.append(
    sizeLabel,
    sizes,
    swap,
    el('p', 'account-note', t('In a match: drag the map to look around, pinch to zoom, tap the map to pick a target, and drag from your tardigrade to aim.')),
  );

  // ---- Sound ----
  const soundCard = soundSettings(ctx);

  // ---- Where it's saved ----
  const status = el('p', 'settings-status');
  status.setAttribute('role', 'status');
  status.textContent =
    state.note +
    (state.note ? ' ' : '') +
    (state.saved === 'error'
      ? t("Couldn't save to your account just now: these settings last for this visit.")
      : signedIn
        ? t('Your controls are saved to your account, on every device.')
        : t('Your controls last until you close the game.'));
  if (!signedIn && me) {
    const link = el('button', 'link-btn', t('Sign in to keep them.'));
    link.onclick = () => ctx.go('account');
    status.append(' ', link);
  }

  const langCard = languageSettings();
  root.append(status, langCard, keysCard, touchCard, soundCard, textSettings(ctx), accessCard(ctx, save), blockedSettings(ctx));

  // One section at a time, beside the list of them (on a touch screen, touch controls first).
  const touchFirst = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  state.section ??= touchFirst ? 'touch' : 'keys';
  // About & legal is only a section on phones (the same media query as the phone menu in style.css).
  const phoneMenu = typeof matchMedia === 'function' && matchMedia('(max-height: 500px), (pointer: coarse) and (orientation: landscape) and (max-height: 900px)').matches;
  if (state.section === 'about' && !phoneMenu) state.section = 'keys';
  root.dataset.section = state.section;
  const menu = el('nav', 'settings-menu');
  menu.setAttribute('aria-label', t('Settings sections'));
  const order = touchFirst ? [...SECTIONS.filter(([id]) => id === 'touch'), ...SECTIONS.filter(([id]) => id !== 'touch')] : SECTIONS;
  for (const [id, icon, label] of order) {
    const b = el('button', 'settings-menu-btn' + (state.section === id ? ' on' : '') + (id === 'about' ? ' phone-only' : ''), `${icon} ${t(label)}`);
    if (state.section === id) b.setAttribute('aria-current', 'true');
    b.onclick = () => {
      state.section = id;
      ctx.rerender();
    };
    menu.append(b);
  }
  const about = el('section', 'card settings-about phone-only');
  about.dataset.section = 'about';
  about.append(el('h2', 'card-title', `ℹ️ ${t('About & legal')}`));
  const links = el('div', 'settings-links');
  for (const [href, text] of [
    ['https://tardigeddon.com/', 'tardigeddon.com'],
    [LEGAL + 'terms-of-service', t('Terms')],
    [LEGAL + 'privacy-policy', t('Privacy')],
    [LEGAL + 'cookie-policy', t('Cookies')],
    [LEGAL + 'childrens-privacy', t("Children's privacy")],
    [LEGAL + 'community-guidelines', t('Community')],
    ['mailto:support@tardigeddon.com', t('Support')],
  ]) {
    const a = el('a', 'hud-btn', text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    links.append(a);
  }
  about.append(links, el('p', 'account-note', t('Version {v}', { v: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev' })));
  root.prepend(menu);
  root.append(about);
  return root;
}

/** The language the game is shown in: the device's, or one picked here. Changing it reloads the page so every screen redraws in it. */
function languageSettings(): HTMLElement {
  const card = el('section', 'card settings-language');
  card.dataset.section = 'language';
  card.append(el('h2', 'card-title', `🌐 ${t('Language')}`));
  const box = el('label', 'sound-pick');
  box.append(el('span', 'settings-label', t('Language')));
  const select = el('select', 'sound-select');
  select.name = 'language';
  const now = langSetting();
  const options: [string, string][] = [['auto', t('Automatic (this device’s language)')], ...LANGS.map((l): [string, string] => [l.id, l.name])];
  for (const [id, name] of options) {
    const opt = el('option', '', name);
    opt.value = id;
    opt.selected = id === now;
    select.append(opt);
  }
  select.onchange = () => {
    const v = select.value;
    setLangSetting(isLang(v) ? v : 'auto');
    location.reload();
  };
  box.append(select);
  card.append(box);
  return card;
}

/** Text size: everything (text and buttons) scales together. */
function textSettings(ctx: HubContext): HTMLElement {
  const card = el('section', 'card settings-text');
  card.dataset.section = 'text';
  card.append(el('h2', 'card-title', `🔤 ${t('Text size')}`));
  const now = textSize();
  const seg = el('div', 'seg text-size-seg');
  for (const [id, label] of TEXT_SIZES) {
    const b = el('button', 'seg-btn' + (now === id ? ' on' : ''), t(label));
    b.setAttribute('aria-pressed', String(now === id));
    b.onclick = () => {
      setTextSize(id);
      ctx.rerender();
    };
    seg.append(b);
  }
  const dev = deviceTextScale();
  const pct = Math.round(uiScale() * 100);
  const note = [
    t('Makes all the writing bigger, with the buttons around it, in the menus and in matches.'),
    dev > 1 ? t('Auto follows your device ({pct}% now).', { pct: Math.round(dev * 100) }) : t('Auto follows your device.'),
    maxScaleHere() < 1.5
      ? t('Now: {pct}% (this screen has room for up to {max}%; more on a bigger screen).', { pct, max: Math.round(maxScaleHere() * 100) })
      : t('Now: {pct}%.', { pct }),
    t('Kept on this device.'),
  ].join(' ');
  card.append(seg, el('p', 'account-note', note));
  return card;
}

/** Colour-blind friendly colours, high contrast and calmer effects (ui/access.ts). */
function accessCard(ctx: HubContext, save: (next: Controls, note?: string) => void): HTMLElement {
  const card = el('section', 'card settings-access');
  card.dataset.section = 'access';
  card.append(el('h2', 'card-title', `👁️ ${t('Accessibility')}`));
  const a = accessSettings();
  const toggle = (key: keyof AccessSettings, title: string, help: string) => {
    const row = el('div', 'access-row');
    const b = el('button', 'seg-btn' + (a[key] ? ' on' : ''), a[key] ? t('On') : t('Off'));
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(a[key]));
    const label = el('div', 'access-text');
    const id = `access-${key}`;
    const name = el('b', '', title);
    name.id = id;
    b.setAttribute('aria-labelledby', id);
    label.append(name, el('span', 'account-note', help));
    b.onclick = () => {
      saveAccessSettings({ ...accessSettings(), [key]: !a[key] });
      ctx.rerender();
    };
    row.append(label, b);
    card.append(row);
  };
  toggle(
    'colourBlind',
    t('Colour-blind friendly colours'),
    t('Team colours from a palette people with any kind of colour blindness can tell apart, and a symbol for each team ({symbols} …) beside its name and health bar.', {
      symbols: TEAM_SYMBOLS.slice(0, 5).join(' '),
    }),
  );
  toggle('highContrast', t('High contrast'), t('Black and white panels, stronger outlines and bigger name tags in matches.'));
  // Tap to fire: kept with the controls (on the account when signed in).
  {
    const on = controls().tapFire;
    const row = el('div', 'access-row');
    const b = el('button', 'seg-btn' + (on ? ' on' : ''), on ? t('On') : t('Off'));
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(on));
    const name = el('b', '', t('Tap to fire'));
    name.id = 'access-tapfire';
    b.setAttribute('aria-labelledby', name.id);
    const label = el('div', 'access-text');
    label.append(name, el('span', 'account-note', t('No holding: tap Fire once to start charging a shot and again to let go. Works with keys, mouse and touch.')));
    b.onclick = () => save({ ...controls(), tapFire: !on });
    row.append(label, b);
    card.append(row);
  }
  toggle(
    'captions',
    t('Sound captions'),
    t('Short words at the bottom of the screen for what the sounds are saying (“💥 Boom”, “⚠️ Mine ticking”, “🔔 Next turn”), so nothing is missed with the sound off.'),
  );
  toggle('hints', t('Help prompts'), t('A line at the bottom of the screen in a match saying what to do next with the weapon in hand (“Tap the map where it should fall”).'));
  toggle('calm', t('Calmer effects'), t('No lightning flashes or other sudden flashes, and less movement in the menus. On by itself if your device asks for reduced motion.'));
  card.append(el('p', 'account-note', t('Only changes what you see on this device, never the match. Kept on this device.')));
  return card;
}

/** Players you've blocked in online play, to unblock. */
function blockedSettings(ctx: HubContext): HTMLElement {
  const card = el('section', 'card settings-blocked');
  card.dataset.section = 'blocked';
  card.append(el('h2', 'card-title', `🚫 ${t('Blocked players')}`));
  const list = blockedPlayers();
  if (!list.length) card.append(el('p', 'account-note', t('Nobody. In an online game, use 🚫 next to a player (or the 👥 button in a match) to block them.')));
  for (const b of [...list].reverse()) {
    const row = el('div', 'blocked-row');
    const un = el('button', 'hud-btn', t('Unblock'));
    un.onclick = () => {
      unblock(b.pid);
      ctx.rerender();
    };
    row.append(el('span', 'blocked-name', b.name), el('span', 'blocked-when', new Date(b.at).toLocaleDateString(lang())), un);
    card.append(row);
  }
  card.append(el('p', 'account-note', t('Blocked players never join your quick-play games, and their names are hidden from you. Players who aren\u2019t signed in get a new identity each visit, so blocking them lasts for that visit. Kept on this device.')));
  return card;
}

/** Music and sound effects: on/off, volume, and which track and sound pack (from those owned). */
function soundSettings(ctx: HubContext): HTMLElement {
  const card = el('section', 'card settings-sound');
  card.dataset.section = 'sound';
  card.append(el('h2', 'card-title', `🔊 ${t('Sound')}`));
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
    slider.setAttribute('aria-label', t('{name} volume', { name: label }));
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
  card.append(row(t('Music'), 'music', 'musicVol'), row(t('Sound effects'), 'effects', 'effectsVol', () => sfx.jump()));
  // iPhone/iPad: the silent switch mutes the game unless the player says otherwise.
  if (hasSilentSwitch()) {
    const check = el('label', 'account-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = a.onSilent;
    input.onchange = () => {
      saveAudioSettings({ ...audioSettings(), onSilent: input.checked });
      unlockAudio();
      sfx.jump();
    };
    check.append(input, el('span', '', t('Play sound even when the phone is on silent')));
    card.append(check);
  }
  // iPhone/iPad: the silent switch mutes the game unless the player says otherwise.
  if (hasSilentSwitch()) {
    const check = el('label', 'account-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = a.onSilent;
    input.onchange = () => {
      saveAudioSettings({ ...audioSettings(), onSilent: input.checked });
      unlockAudio();
      sfx.jump();
    };
    check.append(input, el('span', '', t('Play sound even when the phone is on silent')));
    card.append(check);
  }

  // Which track plays in matches, and which sound pack: the free ones and those owned.
  const owned = ownedItems();
  const picker = (label: string, options: { id: string; name: string }[], current: string, pick: (id: string) => void) => {
    const box = el('label', 'sound-pick');
    box.append(el('span', 'settings-label', label));
    const select = el('select', 'sound-select');
    for (const o of options) {
      const opt = el('option', '', t(o.name));
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
  const tracks = TRACKS.filter((tr) => tr.id !== 'menu' && canUse('music', tr.id, owned));
  const packs = SOUND_PACKS.filter((p) => canUse('sound', p.id, owned)).map((p) => ({ id: p.id, name: shopItem(`sound:${p.id}`)?.name ?? tk('Standard') }));
  card.append(
    picker(t('Match music'), tracks, wearMusic(), chooseMusic),
    picker(t('Sound pack'), packs, wearSounds(), (id) => {
      chooseSounds(id);
      useSoundPack(id);
      sfx.explosion(30);
    }),
  );
  const more = el('p', 'account-note');
  // The shop is only there when the server has accounts.
  if (account().me) {
    const shop = el('button', 'link-btn', t('Shop'));
    shop.onclick = () => ctx.go('shop');
    // The Shop link sits inside the sentence: split the translation around it.
    const [before, after = ''] = t('More tracks and sound packs in the {shop}. Only you hear them.').split('{shop}');
    more.append(before, shop, after + ' ');
  }
  more.append(t('Sound settings are kept on this device.'));
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
      state.note = t("{key} can't be used.", { key: keyLabel(code) });
      return redraw();
    }
    const before = ACTIONS.find((a) => a.id !== target.action && controls().keys[a.id].includes(code));
    save(bind(controls(), target.action, target.slot, code), before ? t('{key} moved here from “{action}”.', { key: keyLabel(code), action: t(before.name) }) : '');
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
