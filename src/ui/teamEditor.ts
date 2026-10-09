// Team editor: team name, colour, hat and tardi names, with a live preview.

import { mascotSvg } from './mascot';
import { HATS } from '../render/hats';
import { canWearHat, formatPrice, hatItem } from '../shop/catalog';
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
  if (!canWearHat(draft.hat, ownedItems())) draft.hat = 'beanie';

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
    preview.innerHTML = mascotSvg(draft.color, draft.hat);
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
    hats.innerHTML = '';
    const owned = ownedItems();
    const shopOpen = account().me?.shop === true;
    for (const h of HATS) {
      const locked = !canWearHat(h.id, owned);
      if (locked && !shopOpen) continue; // shop hats are only advertised while the shop is open
      const b = el('button', 'hat-btn' + (h.id === draft.hat ? ' on' : '') + (locked ? ' locked' : ''));
      b.innerHTML = mascotSvg(draft.color, h.id);
      b.append(el('span', '', locked ? `🔒 ${formatPrice(hatItem(h.id)!.price)}` : h.name));
      b.setAttribute('aria-label', locked ? `${h.name} (in the shop)` : h.name);
      b.onclick = () => {
        if (locked) {
          hatHint.textContent = `The ${h.name} is in the shop: tap 👤 on the main menu.`;
          return;
        }
        draft.hat = h.id;
        refresh();
      };
      hats.append(b);
    }
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
