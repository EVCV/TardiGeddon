// The "you got a reward" pop-up, in the game's look (the coin-pack dialog's
// paper card and ink outline): a sunburst behind a big badge, the coins and
// the looks that came with them, and a burst of confetti (none with Calmer
// effects). Used for invite rewards (both sides), and to welcome a player who
// opened a friend's or creator's invite link.

import { coinIcon } from './coinArt';
import { itemArt } from './shop';
import { formatNumber, promoItem, shopItem } from '../shop/catalog';
import { t } from '../i18n/i18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface RewardPop {
  /** The big picture at the top (an emoji). */
  badge: string;
  title: string;
  text: string;
  /** Coins to show (none: no coin tile). */
  coins?: number;
  /** Shop or promo item ids that came with it (shown with their pictures). */
  items?: string[];
  /** The main button (closes the pop-up, then does `go`). */
  button: string;
  go?: () => void;
  /** A second, quieter button. */
  other?: { label: string; go?: () => void };
}

const CONFETTI = ['#ffd84a', '#e04848', '#3a7be0', '#5aa83a', '#b388ff', '#ff8ac0'];

export function showRewardPop(p: RewardPop): void {
  const host = document.getElementById('ui') ?? document.body;
  const overlay = el('div', 'editor-overlay reward-overlay');
  const box = el('div', 'reward-pop');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'reward-pop-title');
  const behind = document.querySelector<HTMLElement>('.hub');
  if (behind) behind.inert = true;
  const before = document.activeElement as HTMLElement | null;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (behind) behind.inert = false;
    before?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  const x = el('button', 'coin-dialog-x', '×');
  x.setAttribute('aria-label', t('Close'));
  x.onclick = close;

  // A big badge on a slowly turning sunburst.
  const hero = el('div', 'reward-hero');
  hero.setAttribute('aria-hidden', 'true');
  hero.append(el('div', 'reward-rays'), el('div', 'reward-badge', p.badge));

  const title = el('h2', 'reward-title', p.title);
  title.id = 'reward-pop-title';
  const text = el('p', 'reward-text', p.text);

  // What it's worth: the coins, then each look.
  const loot = el('div', 'reward-loot');
  if (p.coins) {
    const tile = el('div', 'reward-tile reward-coins');
    const pic = el('div', 'reward-tile-art');
    pic.innerHTML = coinIcon();
    tile.append(pic, el('b', 'reward-amount', `+${formatNumber(p.coins)}`), el('span', 'reward-tile-name', t('coins')));
    loot.append(tile);
  }
  for (const id of p.items ?? []) {
    const item = shopItem(id) ?? promoItem(id);
    if (!item) continue;
    const tile = el('div', 'reward-tile');
    const pic = el('div', 'reward-tile-art');
    pic.innerHTML = itemArt(item);
    tile.append(pic, el('span', 'reward-tile-name', t(item.name)));
    loot.append(tile);
  }

  const buttons = el('div', 'reward-buttons');
  const main = el('button', 'big-btn reward-go', p.button);
  main.onclick = () => {
    close();
    p.go?.();
  };
  buttons.append(main);
  if (p.other) {
    const other = p.other;
    const b = el('button', 'link-btn reward-other', other.label);
    b.onclick = () => {
      close();
      other.go?.();
    };
    buttons.append(b);
  }

  // Confetti (CSS animation; Calmer effects turns animations off, so it just isn't seen).
  const party = el('div', 'reward-confetti');
  party.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 28; i++) {
    const bit = el('i');
    bit.style.left = `${Math.round(Math.random() * 100)}%`;
    bit.style.background = CONFETTI[i % CONFETTI.length];
    bit.style.animationDelay = `${(Math.random() * 0.5).toFixed(2)}s`;
    bit.style.setProperty('--spin', `${Math.round(Math.random() * 720 - 360)}deg`);
    bit.style.setProperty('--drift', `${Math.round(Math.random() * 80 - 40)}px`);
    party.append(bit);
  }

  box.append(party, x, hero, title, text);
  if (loot.childElementCount) box.append(loot);
  box.append(buttons);
  overlay.append(box);
  host.append(overlay);
  main.focus();
}
