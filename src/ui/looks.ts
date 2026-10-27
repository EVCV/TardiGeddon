// Looks: the world you see (arena), the music and the sound pack you hear,
// picked straight from the lobby rather than hunted for in the Shop. Only
// this player sees or hears them. Free looks and owned ones can be chosen;
// shop ones show their price and open the Shop.

import { ARENAS, SURPRISE_ARENA, arenaTheme } from '../render/arenas';
import { currentSeason, seasonArenaOpen } from '../render/seasons';
import { TRACKS } from '../audio/music';
import { SOUND_PACKS } from '../audio/sfx';
import { canUse, itemFor, promoItem, type ItemKind } from '../shop/catalog';
import { account, chooseArena, chooseMusic, chooseSounds, chosenArena, chosenMusic, chosenSounds, ownedItems } from '../account/session';
import { arenaSvg, musicSvg, soundSvg } from './cosmeticArt';
import { priceLabel } from './shop';
import { t } from '../i18n/i18n';
import { tk } from '../i18n/tk';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface Option {
  id: string;
  name: string;
  art: string;
}

/** A die over the free looks: "Surprise me". */
const SURPRISE_ART = `<svg viewBox="-40 -30 80 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="-40" y="-30" width="80" height="60" fill="#d9f3ff"/>
  <rect x="-15" y="-17" width="30" height="30" rx="7" fill="#fff" stroke="#2b1b24" stroke-width="2.5" transform="rotate(-12)"/>
  <g fill="#2b1b24" transform="rotate(-12)"><circle cx="-7" cy="-9" r="2.6"/><circle cx="0" cy="-2" r="2.6"/><circle cx="7" cy="5" r="2.6"/></g>
</svg>`;

/** What the lobby button says: the arena now chosen. */
export function arenaLabel(): string {
  const id = chosenArena();
  return id === SURPRISE_ARENA ? t('Surprise me') : t(arenaTheme(id).name);
}

/** Open the picker. `onShop` leaves for the Shop; `onChange` redraws the lobby. */
export function openLooks(host: HTMLElement, onShop: () => void, onChange: () => void): void {
  const overlay = el('div', 'editor-overlay');
  const box = el('div', 'editor looks');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('World, music and sounds'));
  const note = el('p', 'account-note');
  const options = el('div', 'editor-options');

  const section = (title: string, hint: string, kind: ItemKind, list: Option[], current: () => string, choose: (id: string) => void) => {
    const grid = el('div', 'editor-hats');
    const draw = () => {
      // Redrawn after every pick: the row stays scrolled where it was, not back at the start.
      const { scrollLeft, scrollTop } = grid;
      queueMicrotask(() => grid.scrollTo(scrollLeft, scrollTop));
      grid.innerHTML = '';
      const owned = ownedItems();
      // Shop looks are only advertised when accounts are on.
      const shopOn = account().me !== null;
      for (const o of list) {
        const locked = o.id !== SURPRISE_ARENA && !canUse(kind, o.id, owned);
        const item = itemFor(kind, o.id);
        // Looks only given away (promo codes, the Early bird and Founder packs) aren't in the shop: they only show once you have them.
        if (locked && (!shopOn || promoItem(item?.id ?? ''))) continue;
        const b = el('button', 'hat-btn' + (o.id === current() ? ' on' : '') + (locked ? ' locked' : ''));
        b.innerHTML = o.art;
        b.append(el('span', '', locked && item ? `🔒 ${priceLabel(item)}` : o.name));
        b.setAttribute('aria-label', locked ? t('{name} (in the shop)', { name: o.name }) : o.name);
        b.setAttribute('aria-pressed', String(o.id === current()));
        b.onclick = () => {
          if (locked) {
            overlay.remove();
            onShop();
            return;
          }
          choose(o.id);
          draw();
          onChange();
        };
        grid.append(b);
      }
    };
    draw();
    options.append(el('h3', '', title), el('p', 'looks-hint', hint), grid);
  };

  section(
    `🏞️ ${t('World')}`,
    t('The sky, hills, water and ground. Surprise me picks a different look every match.'),
    'arena',
    [
      { id: SURPRISE_ARENA, name: t('Surprise me'), art: SURPRISE_ART },
      // Seasonal worlds show (free) only while their event is on.
      ...ARENAS.filter((a) => seasonArenaOpen(a.id)).map((a) => ({ id: a.id, name: a.season ? `${currentSeason()?.emoji ?? ''} ${t(a.name)}` : t(a.name), art: arenaSvg(a.id) })),
    ],
    chosenArena,
    chooseArena,
  );
  section(
    `🎵 ${t('Match music')}`,
    t('What plays during your matches.'),
    'music',
    TRACKS.filter((tr) => tr.id !== 'menu').map((tr) => ({ id: tr.id, name: t(tr.name), art: musicSvg(tr.id) })),
    chosenMusic,
    chooseMusic,
  );
  section(
    `🔊 ${t('Sounds')}`,
    t('How your blasts, shots and squeaks sound.'),
    'sound',
    SOUND_PACKS.map((p) => ({ id: p.id, name: t(itemFor('sound', p.id)?.name ?? tk('Standard')), art: soundSvg(p.id) })),
    chosenSounds,
    chooseSounds,
  );
  note.textContent = t('Only you see and hear these, online too. More in the 🛍️ Shop.');
  options.append(note);

  const close = () => overlay.remove();
  const actions = el('div', 'editor-actions');
  if (account().me) {
    const shop = el('button', 'hud-btn', `🛍️ ${t('Shop')}`);
    shop.onclick = () => {
      close();
      onShop();
    };
    actions.append(shop);
  }
  const done = el('button', 'big-btn', t('Done'));
  done.onclick = close;
  actions.append(done);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  const side = el('div', 'editor-side');
  side.append(el('h2', 'editor-title', t('Looks')));
  box.append(side, options, actions);
  overlay.append(box);
  host.append(overlay);
  done.focus();
}
