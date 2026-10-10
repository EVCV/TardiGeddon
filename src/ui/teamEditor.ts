// Team editor: team name, colour, hat and tardi names, with a live preview.

import { mascotSvg } from './mascot';
import { HATS } from '../render/hats';
import { canUse, itemFor } from '../shop/catalog';
import { SKINS } from '../render/skins';
import { priceLabel } from './shop';
import { account, ownedItems } from '../account/session';
import { TEAM_COLORS, hex } from '../render/palette';
import {
  TARDI_NAME_MAX,
  TEAM_NAME_MAX,
  cleanName,
  defaultProfile,
  defaultTardiNames,
  type TeamProfile,
} from './teams';

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
  let draft: TeamProfile = { ...start, names: [...start.names] };
  if (!canUse('hat', draft.hat, ownedItems())) draft.hat = 'beanie';
  if (!canUse('skin', draft.skin, ownedItems())) draft.skin = 'classic';

  const overlay = el('div', 'editor-overlay');
  const box = el('div', 'editor');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Edit team');
  const preview = el('div', 'editor-preview');
  const title = el('h2', 'editor-title', 'Edit team');

  const nameInput = el('input', 'editor-name');
  nameInput.maxLength = TEAM_NAME_MAX;
  nameInput.value = draft.name;
  nameInput.setAttribute('aria-label', 'Team name');
  nameInput.oninput = () => (draft.name = nameInput.value);

  const colours = el('div', 'editor-swatches');
  const hats = el('div', 'editor-hats');
  const skins = el('div', 'editor-hats');
  const hatHint = el('p', 'account-note');
  const names = el('div', 'editor-tardis');
  const defaults = defaultTardiNames(slot);
  defaults.forEach((placeholder, i) => {
    const inp = el('input');
    inp.maxLength = TARDI_NAME_MAX;
    inp.placeholder = placeholder;
    inp.value = draft.names[i] ?? '';
    inp.setAttribute('aria-label', `Tardi ${i + 1} name`);
    inp.oninput = () => (draft.names[i] = inp.value);
    names.append(inp);
  });

  const refresh = () => {
    preview.innerHTML = mascotSvg(draft.color, draft.hat, draft.skin);
    title.style.color = hex(draft.color);
    colours.innerHTML = '';
    for (const c of TEAM_COLORS) {
      const b = el('button', 'swatch' + (c === draft.color ? ' on' : ''));
      b.style.background = hex(c);
      b.setAttribute('aria-label', `Colour ${hex(c)}`);
      b.onclick = () => {
        draft.color = c;
        refresh();
      };
      colours.append(b);
    }
    const owned = ownedItems();
    // Shop items are only advertised when accounts are on.
    const shopOn = account().me !== null;
    const pick = (box: HTMLElement, kind: 'hat' | 'skin', list: { id: string; name: string }[], current: string, set: (id: string) => void) => {
      box.innerHTML = '';
      for (const it of list) {
        const locked = !canUse(kind, it.id, owned);
        if (locked && !shopOn) continue;
        const b = el('button', 'hat-btn' + (it.id === current ? ' on' : '') + (locked ? ' locked' : ''));
        b.innerHTML = kind === 'hat' ? mascotSvg(draft.color, it.id, draft.skin) : mascotSvg(draft.color, draft.hat, it.id);
        const item = itemFor(kind, it.id);
        b.append(el('span', '', locked && item ? `🔒 ${priceLabel(item)}` : it.name));
        b.setAttribute('aria-label', locked ? `${it.name} (in the shop)` : it.name);
        b.onclick = () => {
          if (locked) {
            hatHint.textContent = `The ${it.name} is in the shop: tap 👤 on the main menu.`;
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
  };

  const close = () => overlay.remove();
  const actions = el('div', 'editor-actions');
  const reset = el('button', 'hud-btn', 'Reset');
  reset.onclick = () => {
    draft = defaultProfile(slot);
    nameInput.value = draft.name;
    names.querySelectorAll('input').forEach((inp) => (inp.value = ''));
    refresh();
  };
  const cancel = el('button', 'hud-btn', 'Cancel');
  cancel.onclick = close;
  const save = el('button', 'big-btn', 'Save');
  save.onclick = () => {
    onSave({
      name: cleanName(draft.name, TEAM_NAME_MAX) || defaultProfile(slot).name,
      color: draft.color,
      hat: draft.hat,
      skin: draft.skin,
      names: draft.names.map((n) => cleanName(n, TARDI_NAME_MAX)),
    });
    close();
  };
  actions.append(reset, cancel, save);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  box.append(
    preview,
    title,
    nameInput,
    el('h3', '', 'Colour'),
    colours,
    el('h3', '', 'Hat'),
    hats,
    el('h3', '', 'Skin'),
    skins,
    hatHint,
    el('h3', '', 'Tardi names'),
    names,
    actions,
  );
  overlay.append(box);
  host.append(overlay);
  refresh();
  nameInput.focus();
}
