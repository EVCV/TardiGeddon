// Team editor: team name, colour, hat and tardi names, with a live preview.

import { usage } from '../usage/usage';
import { keepPlaceAfter } from './scroll';
import { MAX_NUMBERS, NAME_PROBLEM_TEXT, nameProblem, numbersIn } from '../names';
import { mascotSvg } from './mascot';
import { HATS } from '../render/hats';
import { canUse, itemFor, promoItem } from '../shop/catalog';
import { SKINS } from '../render/skins';
import { AIM_STYLES, FX_STYLES } from '../render/cosmetics';
import { aimSvg, danceSvg, fxSvg, graveSvg } from './cosmeticArt';
import { DANCES, GRAVES } from '../render/finales';
import { renderEmblemBuilder } from './emblemBuilder';
import { priceLabel } from './shop';
import { account, ownedItems } from '../account/session';
import { TEAM_COLORS, hex, shown, teamSymbol } from '../render/palette';
import {
  TARDI_NAME_MAX,
  TEAM_NAME_MAX,
  cleanName,
  defaultProfile,
  defaultTardiNames,
  type TeamProfile,
} from './teams';
import { t } from '../i18n/i18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Open the editor for one slot. `onSave` receives the edited profile;
 * closing without saving changes nothing.
 */
export function openTeamEditor(host: HTMLElement, slot: number, start: TeamProfile, onSave: (p: TeamProfile) => void): void {
  usage('page', { page: 'team' });
  let draft: TeamProfile = { ...start, names: [...start.names] };
  if (!canUse('hat', draft.hat, ownedItems())) draft.hat = 'beanie';
  if (!canUse('skin', draft.skin, ownedItems())) draft.skin = 'classic';
  if (!canUse('aim', draft.aim, ownedItems())) draft.aim = 'classic';
  if (!canUse('fx', draft.fx, ownedItems())) draft.fx = 'classic';
  if (!canUse('dance', draft.dance, ownedItems())) draft.dance = 'classic';
  if (!canUse('grave', draft.grave, ownedItems())) draft.grave = 'classic';

  const overlay = el('div', 'editor-overlay');
  const box = el('div', 'editor');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('Edit team'));
  const preview = el('div', 'editor-preview');
  const title = el('h2', 'editor-title', t('Edit team'));

  const nameInput = el('input', 'editor-name');
  nameInput.maxLength = TEAM_NAME_MAX;
  nameInput.value = draft.name;
  nameInput.setAttribute('aria-label', t('Team name'));
  nameInput.oninput = () => (draft.name = nameInput.value);

  const colours = el('div', 'editor-swatches');
  const hats = el('div', 'editor-hats');
  const skins = el('div', 'editor-hats');
  const aims = el('div', 'editor-hats');
  const effects = el('div', 'editor-hats');
  const dances = el('div', 'editor-hats');
  const graves = el('div', 'editor-hats');
  const emblem = el('div', 'emblem-builder');
  const hatHint = el('p', 'account-note');
  const names = el('div', 'editor-tardis');
  const defaults = defaultTardiNames(slot);
  defaults.forEach((placeholder, i) => {
    const inp = el('input');
    inp.maxLength = TARDI_NAME_MAX;
    inp.placeholder = placeholder;
    inp.value = draft.names[i] ?? '';
    inp.setAttribute('aria-label', t('Tardigrade {n} name', { n: i + 1 }));
    inp.oninput = () => (draft.names[i] = inp.value);
    names.append(inp);
  });

  const refresh = () => {
    // Redrawn after every pick: everything stays scrolled where it was.
    keepPlaceAfter(overlay);
    preview.innerHTML = mascotSvg(shown(draft.color), draft.hat, draft.skin);
    title.style.color = hex(shown(draft.color));
    colours.innerHTML = '';
    for (const c of TEAM_COLORS) {
      const b = el('button', 'swatch' + (c === draft.color ? ' on' : ''), teamSymbol(c).trim());
      b.style.background = hex(shown(c));
      b.setAttribute('aria-label', t('Colour {code}', { code: hex(c) }));
      b.onclick = () => {
        draft.color = c;
        refresh();
      };
      colours.append(b);
    }
    const owned = ownedItems();
    // Shop items are only advertised when accounts are on.
    const shopOn = account().me !== null;
    const pick = (box: HTMLElement, kind: 'hat' | 'skin' | 'aim' | 'fx' | 'dance' | 'grave', list: { id: string; name: string }[], current: string, set: (id: string) => void) => {
      box.innerHTML = '';
      for (const it of list) {
        const locked = !canUse(kind, it.id, owned);
        // Promo-code looks aren't in the shop: they only show once you have them.
        if (locked && (!shopOn || promoItem(itemFor(kind, it.id)?.id ?? ''))) continue;
        const b = el('button', 'hat-btn' + (it.id === current ? ' on' : '') + (locked ? ' locked' : ''));
        b.innerHTML =
          kind === 'hat'
            ? mascotSvg(draft.color, it.id, draft.skin)
            : kind === 'skin'
              ? mascotSvg(draft.color, draft.hat, it.id)
              : kind === 'dance'
                ? danceSvg(it.id, draft.color, draft.hat, draft.skin)
              : kind === 'grave'
                ? graveSvg(it.id, draft.color)
              : kind === 'aim'
                ? aimSvg(it.id, draft.color)
                : fxSvg(it.id);
        const item = itemFor(kind, it.id);
        const name = t(it.name);
        b.append(el('span', '', locked && item ? `🔒 ${priceLabel(item)}` : name));
        b.setAttribute('aria-label', locked ? t('{name} (in the shop)', { name }) : name);
        b.onclick = () => {
          if (locked) {
            hatHint.textContent = t('The {name} is in the Shop: open the 🛍️ Shop tab in the menu.', { name });
            return;
          }
          set(it.id);
          refresh();
        };
        box.append(b);
      }
    };
    pick(hats, 'hat', HATS, draft.hat, (id) => (draft.hat = id));
    pick(skins, 'skin', SKINS, draft.skin, (id) => (draft.skin = id));
    pick(aims, 'aim', AIM_STYLES, draft.aim, (id) => (draft.aim = id));
    pick(effects, 'fx', FX_STYLES, draft.fx, (id) => (draft.fx = id));
    pick(dances, 'dance', DANCES, draft.dance, (id) => (draft.dance = id));
    pick(graves, 'grave', GRAVES, draft.grave, (id) => (draft.grave = id));
    renderEmblemBuilder(emblem, draft.emblem, (e) => {
      draft.emblem = e;
      refresh();
    });
  };

  const close = () => overlay.remove();
  const actions = el('div', 'editor-actions');
  const reset = el('button', 'hud-btn', t('Reset'));
  reset.onclick = () => {
    draft = defaultProfile(slot);
    nameInput.value = draft.name;
    names.querySelectorAll('input').forEach((inp) => (inp.value = ''));
    refresh();
  };
  const cancel = el('button', 'hud-btn', t('Cancel'));
  cancel.onclick = close;
  const save = el('button', 'big-btn', t('Save'));
  save.onclick = () => {
    // Names other players may see: safe for children, and no way to get in touch.
    const inputs = [nameInput, ...names.querySelectorAll('input')];
    const values = [draft.name, ...draft.names];
    inputs.forEach((i) => i.classList.remove('bad'));
    let budget = MAX_NUMBERS;
    for (let i = 0; i < values.length; i++) {
      const v = cleanName(values[i] ?? '', i === 0 ? TEAM_NAME_MAX : TARDI_NAME_MAX);
      let problem = nameProblem(v);
      if (!problem) {
        budget -= numbersIn(v);
        if (budget < 0) problem = 'numbers';
      }
      if (problem) {
        inputs[i].classList.add('bad');
        inputs[i].setAttribute('aria-invalid', 'true');
        nameNote.textContent = `“${v}”: ${t(NAME_PROBLEM_TEXT[problem])}`;
        nameNote.hidden = false;
        inputs[i].focus();
        return;
      }
    }
    onSave({
      name: cleanName(draft.name, TEAM_NAME_MAX) || defaultProfile(slot).name,
      color: draft.color,
      hat: draft.hat,
      skin: draft.skin,
      aim: draft.aim,
      fx: draft.fx,
      dance: draft.dance,
      grave: draft.grave,
      emblem: draft.emblem,
      names: draft.names.map((n) => cleanName(n, TARDI_NAME_MAX)),
    });
    close();
  };
  const nameNote = el('p', 'editor-name-note');
  nameNote.setAttribute('role', 'alert');
  nameNote.hidden = true;
  actions.append(nameNote, reset, cancel, save);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  // Phones (landscape): your tardi, name and buttons on the left, the options
  // scrolling on the right. Elsewhere these boxes don't exist (display: contents).
  const side = el('div', 'editor-side');
  side.append(preview, title, nameInput);
  const options = el('div', 'editor-options');
  options.append(
    el('h3', '', t('Colour')),
    colours,
    el('h3', '', t('Hat')),
    hats,
    el('h3', '', t('Skin')),
    skins,
    el('h3', '', t('Aim style')),
    aims,
    el('h3', '', t('Explosion effect')),
    effects,
    el('h3', '', t('Victory dance')),
    dances,
    el('h3', '', t('Gravestone')),
    graves,
    el('h3', '', t('Team emblem (free)')),
    emblem,
    hatHint,
    el('h3', '', t('Tardigrade names')),
    names,
  );
  box.append(side, options, actions);
  overlay.append(box);
  host.append(overlay);
  refresh();
  // Not on touch screens: the on-screen keyboard would cover the editor straight away.
  if (!matchMedia('(pointer: coarse)').matches) nameInput.focus();
}
