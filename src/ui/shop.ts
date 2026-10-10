// The Shop tab of the account panel: a wallet strip (coins and Slime), a
// preview stage, category pills and item cards. Coins are bought in packs
// (the only thing paid for with money) and spent on looks; Slime is earned by
// playing and unlocks weapons and some looks.

import { mascotSvg } from './mascot';
import { loadProfiles } from './teams';
import { WEAPONS } from '../sim/weapons';
import { COIN_PACKS, SHOP_ITEMS, formatNumber, formatPrice, type ShopItem } from '../shop/catalog';
import { buyCoins, managePurchases, unlock, wearHat, wearSkin, type MeResponse } from '../account/session';

type Category = 'all' | 'hat' | 'skin' | 'weapon' | 'coins';

export interface ShopState {
  category: Category;
  /** Item shown on the preview stage. */
  preview: ShopItem | null;
  /** Coin pack chosen, waiting for the consent tick. */
  pack: string | null;
}

export const newShopState = (): ShopState => ({ category: 'all', preview: null, pack: null });

export interface ShopContext {
  state: ShopState;
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
  rerender: () => void;
  legalLink: (slug: string, text: string) => HTMLAnchorElement;
}

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
function itemArt(item: ShopItem): string {
  const team = loadProfiles()[0];
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

export function renderShop(me: MeResponse, ctx: ShopContext): HTMLElement {
  const { state } = ctx;
  const wrap = el('div', 'shop');
  const { coins, slime } = me.wallet;

  // Wallet strip
  const wallet = el('div', 'shop-wallet');
  const coinBox = el('div', 'wallet-chip');
  coinBox.append(el('b', '', `🪙 ${formatNumber(coins)}`), el('span', '', 'coins'));
  const slimeBox = el('div', 'wallet-chip');
  slimeBox.append(el('b', '', `🟢 ${formatNumber(slime)}`), el('span', '', 'Slime'));
  wallet.append(coinBox, slimeBox);
  if (me.shop) {
    const get = el('button', 'hud-btn wallet-get', '+ Get coins');
    get.onclick = () => {
      state.category = 'coins';
      ctx.rerender();
    };
    wallet.append(get);
  }
  wrap.append(wallet);
  wrap.append(el('p', 'shop-fair', '✅ Fair play: coins only buy looks. Weapons are unlocked with Slime, which you earn by playing.'));

  // Category pills
  const pills = el('div', 'shop-pills');
  for (const [c, label] of CATEGORIES) {
    if (c === 'coins' && !me.shop) continue;
    const b = el('button', 'shop-pill' + (state.category === c ? ' on' : ''), label);
    b.onclick = () => {
      state.category = c;
      state.pack = null;
      ctx.rerender();
    };
    pills.append(b);
  }
  wrap.append(pills);

  if (state.category === 'coins') {
    wrap.append(coinPacks(ctx));
  } else {
    // Preview stage: what the selected item looks like on your own team.
    const items = SHOP_ITEMS.filter((i) => state.category === 'all' || i.kind === state.category);
    const preview = state.preview && items.includes(state.preview) ? state.preview : null;
    if (preview) {
      const stage = el('div', 'shop-stage');
      const art = el('div', 'shop-stage-art');
      art.innerHTML = itemArt(preview);
      const info = el('div', 'shop-stage-info');
      info.append(el('span', `rarity rarity-${preview.rarity}`, preview.rarity), el('b', '', preview.name), el('span', '', preview.blurb));
      stage.append(art, info);
      wrap.append(stage);
    }
    const grid = el('div', 'shop-grid');
    for (const item of items) grid.append(card(item, me, ctx));
    wrap.append(grid);
    wrap.append(
      el('p', 'account-note', 'Earn Slime in every online game and in one-on-one games against the CPU (up to 200 Slime a day from CPU games). Wear hats and skins from the ✎ team editor; unlocked weapons appear in the matches you start.'),
    );
  }

  const manage = el('button', 'hud-btn shop-manage', '🧾 Manage purchases & receipts');
  manage.disabled = ctx.busy;
  manage.onclick = () => ctx.run(managePurchases);
  if (me.shop) wrap.append(manage);
  return wrap;
}

function card(item: ShopItem, me: MeResponse, ctx: ShopContext): HTMLElement {
  const has = me.owned.includes(item.id);
  const c = el('div', 'shop-card' + (has ? ' owned' : '') + (ctx.state.preview === item ? ' previewing' : ''));
  const top = el('div', 'shop-card-top');
  top.append(el('span', `rarity rarity-${item.rarity}`, item.rarity));
  const art = el('button', 'shop-card-art');
  art.setAttribute('aria-label', `Preview ${item.name}`);
  art.innerHTML = itemArt(item);
  art.onclick = () => {
    ctx.state.preview = item;
    ctx.rerender();
    // The stage is at the top of the shop: bring it into view.
    document.querySelector('.shop-stage')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  c.append(top, art, el('b', 'shop-card-name', item.name));
  const foot = el('div', 'shop-card-foot');
  if (has) foot.append(el('span', 'shop-owned', 'Owned ✓'));
  else {
    const affordable = item.coins !== undefined ? me.wallet.coins >= item.coins : me.wallet.slime >= (item.slime ?? 0);
    const b = el('button', 'hud-btn shop-buy' + (affordable ? ' can' : ''), priceLabel(item));
    b.title = item.coins !== undefined ? `${formatNumber(item.coins)} coins (about ${formatPrice(item.coins)})` : `${formatNumber(item.slime ?? 0)} Slime`;
    b.disabled = ctx.busy;
    b.onclick = () => {
      if (!affordable) {
        ctx.state.preview = item;
        if (item.coins !== undefined && me.shop) ctx.state.category = 'coins';
        ctx.run(async () => {
          throw new Error(item.coins !== undefined ? `You need ${formatNumber(item.coins! - me.wallet.coins)} more coins.` : `You need ${formatNumber(item.slime! - me.wallet.slime)} more Slime: keep playing!`);
        });
        return;
      }
      if (!confirm(`Unlock the ${item.name} for ${b.title}?`)) return;
      ctx.run(() => unlock(item.id));
    };
    foot.append(b);
  }
  c.append(foot);
  return c;
}

function coinPacks(ctx: ShopContext): HTMLElement {
  const box = el('div', 'shop-coins');
  box.append(el('p', 'account-note', 'Coins are about 1p each in every pack, VAT included. They only buy looks, have no cash value, and stay with your account. Under 18? Please ask a parent or carer first.'));
  const grid = el('div', 'coin-grid');
  for (const p of COIN_PACKS) {
    const b = el('button', 'coin-pack' + (ctx.state.pack === p.id ? ' on' : ''));
    b.append(el('b', '', `🪙 ${formatNumber(p.coins)}`), el('span', '', formatPrice(p.price)));
    b.onclick = () => {
      ctx.state.pack = p.id;
      ctx.rerender();
    };
    grid.append(b);
  }
  box.append(grid);
  const pack = COIN_PACKS.find((p) => p.id === ctx.state.pack);
  if (pack) {
    const consent = el('label', 'account-check');
    const tick = el('input');
    tick.type = 'checkbox';
    const text = el('span');
    text.append(
      `I want my ${formatNumber(pack.coins)} coins straight away, and I understand that once they're delivered I lose my 14-day right to cancel. My other rights, such as if something doesn't work, aren't affected (`,
      ctx.legalLink('terms-of-service', 'Terms'),
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
