// The Shop page of the menu hub: a preview stage with the wallet on one side,
// category pills and the catalogue on the other. Coins are bought in packs
// (the only thing paid for with money) and spent on looks; Slime is earned by
// playing and unlocks weapons and some looks. Picking a card shows it on the
// stage, which is where it's unlocked (no pop-ups).

import { mascotSvg } from './mascot';
import { loadProfiles, saveProfiles, updateProfile } from './teams';
import { legalLink } from './account';
import { WEAPONS } from '../sim/weapons';
import { COIN_PACKS, SHOP_ITEMS, formatNumber, formatPrice, type ShopItem } from '../shop/catalog';
import { buyCoins, managePurchases, unlock, wearHat, wearSkin, type MeResponse } from '../account/session';
import type { HubContext } from './hub';

type Category = 'all' | 'hat' | 'skin' | 'weapon' | 'coins';

export interface ShopState {
  category: Category;
  /** Item shown on the preview stage. */
  preview: ShopItem | null;
  /** Coin pack chosen, waiting for the consent tick. */
  pack: string | null;
  /** Where the catalogue was scrolled to, on which tab. */
  scroll: { key: Category; top: number };
}

export const newShopState = (): ShopState => ({ category: 'all', preview: null, pack: null, scroll: { key: 'all', top: 0 } });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** "🪙 200" or "🟢 300". Coins are about 1p each, so the £ value is shown alongside. */
export function priceLabel(item: ShopItem): string {
  return item.coins !== undefined ? `🪙 ${formatNumber(item.coins)}` : `🟢 ${formatNumber(item.slime ?? 0)}`;
}

/** The picture for an item: your team's tardi wearing it, or the weapon's icon. */
function itemArt(item: ShopItem | null): string {
  const team = loadProfiles()[0];
  if (!item) return mascotSvg(team.color, wearHat(team.hat), wearSkin(team.skin));
  if (item.kind === 'hat') return mascotSvg(team.color, item.ref, wearSkin(team.skin));
  if (item.kind === 'skin') return mascotSvg(team.color, wearHat(team.hat), item.ref);
  return `<span class="shop-weapon-icon">${WEAPONS[item.ref]?.icon ?? '💥'}</span>`;
}

const CATEGORIES: [Category, string][] = [
  ['all', 'All'],
  ['hat', '🎩 Hats'],
  ['skin', '🎨 Skins'],
  ['weapon', '💥 Weapons'],
  ['coins', '🪙 Get coins'],
];

const affordable = (item: ShopItem, me: MeResponse) =>
  item.coins !== undefined ? me.wallet.coins >= item.coins : me.wallet.slime >= (item.slime ?? 0);

export function renderShop(me: MeResponse, ctx: HubContext, state: ShopState): HTMLElement {
  const page = el('div', 'page page-shop');
  const side = el('aside', 'card shop-side');
  const main = el('section', 'card shop-main');
  page.append(side, main);

  // Side: wallet, stage, fair-play promise, receipts.
  if (me.user) {
    const wallet = el('div', 'shop-wallet');
    const coinBox = el('div', 'wallet-chip');
    coinBox.append(el('b', '', `🪙 ${formatNumber(me.wallet.coins)}`), el('span', '', 'coins'));
    const slimeBox = el('div', 'wallet-chip slime');
    slimeBox.append(el('b', '', `🟢 ${formatNumber(me.wallet.slime)}`), el('span', '', 'Slime'));
    wallet.append(coinBox, slimeBox);
    side.append(wallet);
  }
  side.append(stage(me, ctx, state));
  if (!me.user) {
    const cta = el('div', 'shop-cta');
    const b = el('button', 'big-btn', 'Sign in to start collecting');
    b.onclick = () => ctx.go('account');
    cta.append(el('p', '', 'Earn Slime every game you play, unlock weapons and looks, and keep them on every device.'), b);
    side.append(cta);
  }
  side.append(el('p', 'shop-fair', '✅ Fair play: coins only buy looks. Weapons are unlocked with Slime, which you earn by playing.'));
  if (me.shop && me.user) {
    const manage = el('button', 'hud-btn shop-manage', '🧾 Purchases & receipts');
    manage.disabled = ctx.busy;
    manage.onclick = () => ctx.run(managePurchases);
    side.append(manage);
  }

  // Main: category pills, then the catalogue or the coin packs.
  const pills = el('div', 'seg shop-pills');
  for (const [c, label] of CATEGORIES) {
    if (c === 'coins' && !me.shop) continue;
    const b = el('button', 'seg-btn' + (state.category === c ? ' on' : ''), label);
    b.onclick = () => {
      state.category = c;
      state.pack = null;
      ctx.rerender();
    };
    pills.append(b);
  }
  main.append(pills);

  // The catalogue scrolls inside the box, so the box is the same size on every tab.
  const body = el('div', 'shop-body');
  main.append(body);
  if (state.category === 'coins') body.append(coinPacks(me, ctx, state));
  else {
    const items = SHOP_ITEMS.filter((i) => state.category === 'all' || i.kind === state.category);
    const grid = el('div', 'shop-grid');
    for (const item of items) grid.append(card(item, me, ctx, state));
    body.append(
      grid,
      el('p', 'account-note', 'Earn Slime in every online game and in one-on-one games against the CPU (up to 200 Slime a day from CPU games). Unlocked weapons appear in the matches you start.'),
    );
  }
  // Redraws (picking an item, unlocking) keep the scroll position; a new tab starts at the top.
  const key = state.category;
  body.onscroll = () => (state.scroll = { key, top: body.scrollTop });
  queueMicrotask(() => {
    if (state.scroll.key === key) body.scrollTop = state.scroll.top;
  });
  return page;
}

/** The preview stage: the picked item on your own tardi, and what you can do with it. */
function stage(me: MeResponse, ctx: HubContext, state: ShopState): HTMLElement {
  const item = state.preview;
  const box = el('div', 'shop-stage');
  const art = el('div', 'shop-stage-art');
  art.innerHTML = itemArt(item);
  box.append(art);
  const info = el('div', 'shop-stage-info');
  box.append(info);
  if (!item) {
    info.append(el('b', '', 'Dress-up stage'), el('span', '', 'Pick anything in the shop to try it on your team.'));
    return box;
  }
  info.append(el('span', `rarity rarity-${item.rarity}`, item.rarity), el('b', '', item.name), el('span', '', item.blurb));

  const action = el('div', 'shop-stage-action');
  info.append(action);
  const owned = me.owned.includes(item.id);
  if (owned) {
    action.append(el('span', 'shop-owned', 'Owned ✓'));
    if (item.kind !== 'weapon') {
      const team = loadProfiles()[0];
      const wearing = item.kind === 'hat' ? team.hat === item.ref : team.skin === item.ref;
      const wear = el('button', 'hud-btn', wearing ? 'Wearing ✓' : `Wear on ${team.name}`);
      wear.disabled = wearing;
      wear.onclick = () => {
        const next = item.kind === 'hat' ? { ...team, hat: item.ref } : { ...team, skin: item.ref };
        saveProfiles(updateProfile(loadProfiles(), 0, next));
        ctx.rerender();
      };
      action.append(wear);
    }
    return box;
  }
  if (!me.user) {
    const b = el('button', 'big-btn', 'Sign in to unlock');
    b.onclick = () => ctx.go('account');
    action.append(el('span', 'shop-price', priceLabel(item)), b);
    return box;
  }
  if (!affordable(item, me)) {
    if (item.coins !== undefined) {
      action.append(el('span', 'shop-short', `${priceLabel(item)} · you need ${formatNumber(item.coins - me.wallet.coins)} more coins`));
      if (me.shop) {
        const get = el('button', 'big-btn', 'Get coins');
        get.onclick = () => {
          state.category = 'coins';
          ctx.rerender();
        };
        action.append(get);
      }
    } else {
      action.append(el('span', 'shop-short', `${priceLabel(item)} · ${formatNumber((item.slime ?? 0) - me.wallet.slime)} more Slime to go: keep playing!`));
    }
    return box;
  }
  const b = el('button', 'big-btn', `Unlock for ${priceLabel(item)}`);
  b.title = item.coins !== undefined ? `${formatNumber(item.coins)} coins (about ${formatPrice(item.coins)})` : `${formatNumber(item.slime ?? 0)} Slime`;
  b.disabled = ctx.busy;
  b.onclick = () => ctx.run(() => unlock(item.id));
  action.append(b);
  return box;
}

function card(item: ShopItem, me: MeResponse, ctx: HubContext, state: ShopState): HTMLElement {
  const has = me.owned.includes(item.id);
  const c = el('button', 'shop-card' + (has ? ' owned' : '') + (state.preview === item ? ' previewing' : ''));
  c.setAttribute('aria-label', `${item.name}, ${has ? 'owned' : priceLabel(item)}`);
  c.onclick = () => {
    state.preview = item;
    ctx.rerender();
    // On narrow screens the stage is above the grid: bring it into view.
    document.querySelector('.shop-stage')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const top = el('span', 'shop-card-top');
  top.append(el('span', `rarity rarity-${item.rarity}`, item.rarity));
  const art = el('span', 'shop-card-art');
  art.innerHTML = itemArt(item);
  const foot = el('span', 'shop-card-foot');
  if (has) foot.append(el('span', 'shop-owned', 'Owned ✓'));
  else foot.append(el('span', 'shop-price' + (me.user && affordable(item, me) ? ' can' : ''), priceLabel(item)));
  c.append(top, art, el('b', 'shop-card-name', item.name), foot);
  return c;
}

function coinPacks(me: MeResponse, ctx: HubContext, state: ShopState): HTMLElement {
  const box = el('div', 'shop-coins');
  box.append(el('p', 'account-note', 'Coins are about 1p each in every pack, VAT included. They only buy looks, have no cash value, and stay with your account. Under 18? Please ask a parent or carer first.'));
  const grid = el('div', 'coin-grid');
  for (const p of COIN_PACKS) {
    const b = el('button', 'coin-pack' + (state.pack === p.id ? ' on' : ''));
    b.append(el('b', '', `🪙 ${formatNumber(p.coins)}`), el('span', '', formatPrice(p.price)));
    b.onclick = () => {
      state.pack = p.id;
      ctx.rerender();
    };
    grid.append(b);
  }
  box.append(grid);
  const pack = COIN_PACKS.find((p) => p.id === state.pack);
  if (pack && !me.user) {
    const b = el('button', 'big-btn', 'Sign in to buy coins');
    b.onclick = () => ctx.go('account');
    box.append(b);
  } else if (pack) {
    const consent = el('label', 'account-check');
    const tick = el('input');
    tick.type = 'checkbox';
    const text = el('span');
    text.append(
      `I want my ${formatNumber(pack.coins)} coins straight away, and I understand that once they're delivered I lose my 14-day right to cancel. My other rights, such as if something doesn't work, aren't affected (`,
      legalLink('terms-of-service', 'Terms'),
      ' §5).',
    );
    consent.append(tick, text);
    const pay = el('button', 'big-btn', `Pay ${formatPrice(pack.price)}`);
    pay.disabled = true;
    tick.onchange = () => (pay.disabled = !tick.checked || ctx.busy);
    pay.onclick = () => ctx.run(() => buyCoins(pack.id, tick.checked));
    box.append(consent, pay);
  }
  return box;
}
