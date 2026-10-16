// The Shop page of the menu hub: a preview stage with the wallet on one side,
// category pills and the catalogue on the other. Coins are bought in packs
// (the only thing paid for with money) and spent on looks; Slime is earned by
// playing and unlocks weapons and some looks. Picking a card shows it on the
// stage, which is where it's unlocked (no pop-ups).

import { mascotSvg } from './mascot';
import { aimSvg, arenaSvg, fxSvg } from './cosmeticArt';
import { coinIcon, packArt } from './coinArt';
import { giftsTab, newGiftsState, openGiftDialog, type GiftsState } from './gifts';
import { loadProfiles, saveProfiles, updateProfile } from './teams';
import { legalLink } from './account';
import { WEAPONS } from '../sim/weapons';
import { BUNDLES, COIN_PACKS, SHOP_ITEMS, giftable, bundlePrice, bundleValue, shopItem, coinValue, formatNumber, formatPrice, packTotal, pencePerCoin, type Bundle, type CoinPack, type ShopItem } from '../shop/catalog';
import { isNativeApp } from '../native';
import { playPrices } from '../shop/playBilling';
import { buyCoins, buyCoinsInApp, chooseArena, chosenArena, managePurchases, unlock, wearHat, wearSkin, type MeResponse } from '../account/session';
import type { TeamProfile } from './teams';
import type { HubContext } from './hub';

type Category = 'all' | 'hat' | 'skin' | 'aim' | 'fx' | 'arena' | 'bundle' | 'weapon' | 'gift' | 'coins';

export interface ShopState {
  category: Category;
  /** Item shown on the preview stage... */
  preview: ShopItem | null;
  /** ...or a bundle. */
  bundle: Bundle | null;
  /** Where the catalogue was scrolled to, on which tab. */
  scroll: { key: Category; top: number };
  gifts: GiftsState;
}

export const newShopState = (): ShopState => ({ category: 'all', preview: null, bundle: null, scroll: { key: 'all', top: 0 }, gifts: newGiftsState() });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** "🪙 200" or "🟢 300". Where coins are shown, so is their value in pounds (coinValue). */
export function priceLabel(item: ShopItem): string {
  return item.coins !== undefined ? `🪙 ${formatNumber(item.coins)}` : `🟢 ${formatNumber(item.slime ?? 0)}`;
}

/** The picture for an item: your team's tardi wearing it, or the weapon's icon. */
export function itemArt(item: ShopItem | null): string {
  const team = loadProfiles()[0];
  if (!item) return mascotSvg(team.color, wearHat(team.hat), wearSkin(team.skin));
  if (item.kind === 'hat') return mascotSvg(team.color, item.ref, wearSkin(team.skin));
  if (item.kind === 'skin') return mascotSvg(team.color, wearHat(team.hat), item.ref);
  if (item.kind === 'aim') return aimSvg(item.ref, team.color);
  if (item.kind === 'fx') return fxSvg(item.ref);
  if (item.kind === 'arena') return arenaSvg(item.ref);
  return `<span class="shop-weapon-icon">${WEAPONS[item.ref]?.icon ?? '💥'}</span>`;
}

const CATEGORIES: [Category, string][] = [
  ['all', 'All'],
  ['hat', '🎩 Hats'],
  ['skin', '🎨 Skins'],
  ['aim', '🎯 Aim'],
  ['fx', '✨ Effects'],
  ['arena', '🏞️ Arenas'],
  ['bundle', '🎁 Bundles'],
  ['weapon', '💥 Weapons'],
  ['gift', '🎀 Gifts'],
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
  if (me.shop && me.user && me.receipts !== false) {
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
      ctx.rerender();
    };
    pills.append(b);
  }
  main.append(pills);

  // The catalogue scrolls inside the box, so the box is the same size on every tab.
  const body = el('div', 'shop-body');
  main.append(body);
  if (state.category === 'coins') body.append(coinPacks(me, ctx, state));
  else if (state.category === 'gift') body.append(giftsTab(me, ctx, state.gifts, (id) => giftable(id)?.name ?? id));
  else if (state.category === 'bundle') {
    body.append(bundleGrid(me, ctx, state), el('p', 'account-note', 'A bundle costs less than its looks one by one. Already own some of it? You only pay for the rest, at the same discount.'));
  } else {
    const items = SHOP_ITEMS.filter((i) => state.category === 'all' || i.kind === state.category);
    const grid = el('div', 'shop-grid');
    for (const item of items) grid.append(card(item, me, ctx, state));
    if (state.category === 'all') body.append(featureBanner(me, ctx, state), el('h3', 'shop-section', '🎁 Bundles'), bundleGrid(me, ctx, state), el('h3', 'shop-section', 'Everything'));
    body.append(
      grid,
      el('p', 'account-note', 'Earn Slime in every online game and in one-on-one games against the CPU (up to 200 Slime a day from CPU games). Unlocked weapons appear in the matches you start.'),
    );
  }
  // Redraws (picking an item, unlocking) keep the scroll position; a new tab starts at the top.
  const key = state.category;
  if (state.scroll.key !== key) state.scroll = { key, top: 0 };
  body.onscroll = () => (state.scroll = { key, top: body.scrollTop });
  queueMicrotask(() => {
    if (state.scroll.key === key) body.scrollTop = state.scroll.top;
  });
  return page;
}

/** The preview stage: the picked item on your own tardi, and what you can do with it. */
function stage(me: MeResponse, ctx: HubContext, state: ShopState): HTMLElement {
  if (state.bundle) return bundleStage(state.bundle, me, ctx, state);
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
  if (me.user && giftable(item.id)) info.append(giftButton(me, ctx, state, item.id, itemArt(item)));
  const owned = me.owned.includes(item.id);
  if (owned) {
    action.append(el('span', 'shop-owned', 'Owned ✓'));
    if (item.kind === 'arena') {
      // Not part of a team: it's the world this player sees, in every match.
      const using = chosenArena() === item.ref;
      const use = el('button', 'hud-btn', using ? 'Using ✓' : 'Use in my games');
      use.disabled = using;
      use.onclick = () => {
        chooseArena(item.ref);
        ctx.rerender();
      };
      action.append(use);
      if (using) {
        const back = el('button', 'hud-btn', 'Back to the Meadow');
        back.onclick = () => {
          chooseArena('classic');
          ctx.rerender();
        };
        action.append(back);
      }
      action.append(el('span', 'shop-note', 'Only you see your arena.'));
    } else if (item.kind !== 'weapon') {
      const team = loadProfiles()[0];
      const wearing = team[item.kind] === item.ref;
      const verb = item.kind === 'hat' || item.kind === 'skin' ? 'Wear' : 'Use';
      const wear = el('button', 'hud-btn', wearing ? `${verb === 'Wear' ? 'Wearing' : 'Using'} ✓` : `${verb} on ${team.name}`);
      wear.disabled = wearing;
      wear.onclick = () => {
        saveProfiles(updateProfile(loadProfiles(), 0, { ...team, [item.kind]: item.ref }));
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
  b.title = item.coins !== undefined ? `${formatNumber(item.coins)} coins (${coinValue(item.coins)})` : `${formatNumber(item.slime ?? 0)} Slime`;
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
    state.bundle = null;
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

/** A bundle's picture: your tardi in its hat and skin, with its aim style and effect beside. */
function giftButton(me: MeResponse, ctx: HubContext, state: ShopState, id: string, art: string): HTMLElement {
  const b = el('button', 'hud-btn gift-btn', '🎀 Give as a gift');
  b.onclick = () =>
    openGiftDialog(me, id, art, b, () => {
      state.gifts.sent = null;
      ctx.rerender();
    });
  return b;
}

function bundleArt(b: Bundle): string {
  const team = loadProfiles()[0];
  const ref = (kind: string, fallback: string) => b.items.map(shopItem).find((i) => i?.kind === kind)?.ref ?? fallback;
  const aim = b.items.map(shopItem).find((i) => i?.kind === 'aim');
  const fx = b.items.map(shopItem).find((i) => i?.kind === 'fx');
  const arena = b.items.map(shopItem).find((i) => i?.kind === 'arena');
  return `<span class="bundle-art">${arena ? `<span class="bundle-arena">${arenaSvg(arena.ref)}</span>` : ''}<span class="bundle-main">${mascotSvg(team.color, ref('hat', wearHat(team.hat)), ref('skin', wearSkin(team.skin)))}</span>${
    aim ? `<span class="bundle-chip">${aimSvg(aim.ref, team.color)}</span>` : ''
  }${fx ? `<span class="bundle-chip">${fxSvg(fx.ref)}</span>` : ''}</span>`;
}

function bundleGrid(me: MeResponse, ctx: HubContext, state: ShopState): HTMLElement {
  const grid = el('div', 'shop-grid bundle-grid');
  for (const b of BUNDLES) {
    const price = bundlePrice(b, me.owned);
    const worth = bundleValue(b, me.owned);
    const c = el('button', 'shop-card bundle-card' + (price === 0 ? ' owned' : '') + (state.bundle === b ? ' previewing' : ''));
    c.setAttribute('aria-label', `${b.name} bundle, ${price === 0 ? 'owned' : `${formatNumber(price)} coins`}`);
    c.onclick = () => {
      state.bundle = b;
      state.preview = null;
      ctx.rerender();
      document.querySelector('.shop-stage')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    const top = el('span', 'shop-card-top');
    top.append(el('span', 'rarity rarity-bundle', `${b.items.length} looks`));
    if (price > 0 && worth > price) top.append(el('span', 'bundle-save', `Save ${Math.round((1 - price / worth) * 100)}%`));
    const art = el('span', 'shop-card-art');
    art.innerHTML = bundleArt(b);
    const foot = el('span', 'shop-card-foot');
    if (price === 0) foot.append(el('span', 'shop-owned', 'Owned ✓'));
    else {
      foot.append(el('s', 'bundle-was', formatNumber(worth)), el('span', 'shop-price' + (me.user && me.wallet.coins >= price ? ' can' : ''), `🪙 ${formatNumber(price)}`));
    }
    c.append(top, art, el('b', 'shop-card-name', b.name), foot);
    grid.append(c);
  }
  return grid;
}

/** The stage for a bundle: what's in it, what it costs, and unlocking or wearing the whole set. */
function bundleStage(b: Bundle, me: MeResponse, ctx: HubContext, state: ShopState): HTMLElement {
  const box = el('div', 'shop-stage');
  const art = el('div', 'shop-stage-art');
  art.innerHTML = bundleArt(b);
  const info = el('div', 'shop-stage-info');
  box.append(art, info);
  info.append(el('span', 'rarity rarity-bundle', 'Bundle'), el('b', '', b.name), el('span', '', b.blurb));
  const list = el('ul', 'bundle-list');
  for (const id of b.items) {
    const item = shopItem(id);
    if (!item) continue;
    const owned = me.owned.includes(id);
    list.append(el('li', owned ? 'owned' : '', `${owned ? '✓' : '•'} ${item.name} (${priceLabel(item)})`));
  }
  info.append(list);
  const action = el('div', 'shop-stage-action');
  info.append(action);
  if (me.user) info.append(giftButton(me, ctx, state, b.id, bundleArt(b)));
  const price = bundlePrice(b, me.owned);
  const worth = bundleValue(b, me.owned);
  if (price === 0) {
    action.append(el('span', 'shop-owned', 'Owned ✓'));
    const team = loadProfiles()[0];
    const looks = b.items.map(shopItem).filter((i): i is ShopItem => !!i && i.kind !== 'weapon');
    const wearing = looks.every((i) => (i.kind === 'arena' ? chosenArena() : team[i.kind as 'hat' | 'skin' | 'aim' | 'fx']) === i.ref);
    const wear = el('button', 'hud-btn', wearing ? 'Wearing the set ✓' : `Wear the set on ${team.name}`);
    wear.disabled = wearing;
    wear.onclick = () => {
      const next: TeamProfile = { ...team };
      for (const id of b.items) {
        const item = shopItem(id);
        if (item?.kind === 'arena') chooseArena(item.ref);
        else if (item && item.kind !== 'weapon') next[item.kind] = item.ref;
      }
      saveProfiles(updateProfile(loadProfiles(), 0, next));
      ctx.rerender();
    };
    action.append(wear);
    return box;
  }
  action.append(el('span', 'bundle-deal', `Worth 🪙 ${formatNumber(worth)} · you save 🪙 ${formatNumber(worth - price)}`));
  if (!me.user) {
    const s = el('button', 'big-btn', 'Sign in to unlock');
    s.onclick = () => ctx.go('account');
    action.append(s);
    return box;
  }
  if (me.wallet.coins < price) {
    action.append(el('span', 'shop-short', `🪙 ${formatNumber(price)} · you need ${formatNumber(price - me.wallet.coins)} more coins`));
    if (me.shop) {
      const get = el('button', 'big-btn', 'Get coins');
      get.onclick = () => {
        state.category = 'coins';
        ctx.rerender();
      };
      action.append(get);
    }
    return box;
  }
  const buy = el('button', 'big-btn', `Unlock the set for 🪙 ${formatNumber(price)}`);
  buy.title = `${formatNumber(price)} coins (${coinValue(price)})`;
  buy.disabled = ctx.busy;
  buy.onclick = () => ctx.run(() => unlock(b.id));
  action.append(buy);
  return box;
}

/**
 * How each pack is dressed up. Bigger packs have bonus coins, so "Best value"
 * goes on the one with the lowest price per coin (checked, not assumed), and
 * there's no "most popular" without sales to back it up (CMA: no misleading
 * claims).
 */
const PACK_LOOKS: Record<string, { art: string; name: string }> = {
  'coins:200': { art: 'pouch', name: 'Pocket pouch' },
  'coins:500': { art: 'stack', name: 'Coin stack' },
  'coins:1000': { art: 'chest', name: 'Treasure chest' },
  'coins:2000': { art: 'vault', name: 'Royal hoard' },
  'coins:5000': { art: 'mountain', name: 'Mountain of coins' },
  'coins:10000': { art: 'dragon', name: "Dragon's hoard" },
};

/** The pack with the lowest price per coin. */
const bestValue = (): string => COIN_PACKS.reduce((a, b) => (pencePerCoin(b) < pencePerCoin(a) ? b : a)).id;

/** "0.83p a coin". */
const perCoin = (pence: number): string => `${pence.toFixed(2)}p a coin`;

// In the Android app coin packs are bought with Google Play Billing, at the
// price Google shows the player (their currency): fetched once, then cached.
const inApp = (): boolean => isNativeApp();
let inAppPrices: Record<string, string> | null = null;
let inAppPricesFailed = false;
let loadingPrices = false;
function loadInAppPrices(ctx: HubContext): void {
  if (inAppPrices || loadingPrices) return;
  loadingPrices = true;
  playPrices().then(
    (p) => {
      inAppPrices = p;
      inAppPricesFailed = false;
      loadingPrices = false;
      ctx.rerender();
    },
    () => {
      inAppPricesFailed = true;
      loadingPrices = false;
      ctx.rerender();
    },
  );
}
/** The pack's price as the player will pay it. */
const packPrice = (p: CoinPack): string => (inApp() ? (inAppPrices?.[p.id] ?? '…') : formatPrice(p.price));

/** How many looks (you don't own) these coins could unlock, cheapest first; and whether that's all of them. */
function lookCount(coins: number, owned: string[]): { n: number; all: boolean } {
  const prices = SHOP_ITEMS.filter((i) => i.coins !== undefined && !owned.includes(i.id)).map((i) => i.coins!).sort((a, b) => a - b);
  let n = 0;
  let left = coins;
  for (const c of prices) {
    if (c > left) break;
    left -= c;
    n++;
  }
  return { n, all: n === prices.length && n > 0 };
}

/** Up to three looks a pack could unlock, priciest first, skipping what you own. */
function examples(coins: number, owned: string[]): ShopItem[] {
  const out: ShopItem[] = [];
  let left = coins;
  for (const item of SHOP_ITEMS.filter((i) => i.coins !== undefined && !owned.includes(i.id)).sort((a, b) => b.coins! - a.coins!)) {
    if (out.length === 3) break;
    if (item.coins! <= left && !out.some((o) => o.kind === item.kind && o.coins === item.coins)) {
      out.push(item);
      left -= item.coins!;
    }
  }
  return out;
}

/** Today's featured looks: three epic or legendary coin items, a different set each day. */
function featured(owned: string[]): ShopItem[] {
  const pool = SHOP_ITEMS.filter((i) => i.coins !== undefined && (i.rarity === 'legendary' || i.rarity === 'epic'));
  const fresh = pool.filter((i) => !owned.includes(i.id));
  const list = fresh.length >= 3 ? fresh : pool;
  const day = Math.floor(Date.now() / 86_400_000);
  return [0, 1, 2].map((k) => list[(day * 3 + k) % list.length]);
}

/** A banner of featured looks at the top of the shop. Picking one shows it on the stage. */
function featureBanner(me: MeResponse, ctx: HubContext, state: ShopState): HTMLElement {
  const items = featured(me.owned);
  const banner = el('section', 'shop-banner');
  const hero = el('div', 'banner-hero');
  hero.innerHTML = itemArt(items[0]);
  const text = el('div', 'banner-text');
  text.append(el('span', 'banner-kicker', '✨ Featured looks'), el('b', 'banner-title', items[0].name), el('span', 'banner-sub', items[0].blurb));
  const go = el('button', 'big-btn banner-go', 'Try it on');
  go.onclick = () => {
    state.preview = items[0];
    state.bundle = null;
    if (state.category === 'coins') state.category = 'all';
    ctx.rerender();
  };
  text.append(go);
  const minis = el('div', 'banner-minis');
  for (const item of items) {
    const b = el('button', 'banner-mini');
    b.setAttribute('aria-label', `Show ${item.name}`);
    const art = el('span', 'banner-mini-art');
    art.innerHTML = itemArt(item);
    b.append(el('span', `rarity rarity-${item.rarity}`, item.rarity), art, el('span', 'banner-mini-name', item.name), el('span', 'shop-price', priceLabel(item)));
    b.onclick = () => {
      state.preview = item;
      state.bundle = null;
      ctx.rerender();
    };
    minis.append(b);
  }
  banner.append(hero, text, minis);
  return banner;
}

/**
 * The purchase confirmation, over the whole menu (like the team editor): the
 * pack, what it costs, the ticks the law needs, and Pay. Esc, the ×, or a tap
 * outside closes it; focus goes back to the pack.
 */
function openCheckout(me: MeResponse, ctx: HubContext, pack: CoinPack, from: HTMLElement): void {
  const host = document.getElementById('ui') ?? document.body;
  const look = PACK_LOOKS[pack.id] ?? { art: 'pouch', name: 'Coins' };
  const total = packTotal(pack);
  const overlay = el('div', 'editor-overlay checkout-overlay');
  const box = el('div', 'coin-dialog');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'coin-dialog-title');
  // Everything behind the dialog is out of reach (Tab, clicks, screen readers) until it closes.
  const behind = document.querySelector<HTMLElement>('.hub');
  if (behind) behind.inert = true;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (behind) behind.inert = false;
    from.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  const x = el('button', 'coin-dialog-x', '×');
  x.setAttribute('aria-label', 'Close');
  x.onclick = close;

  const art = el('div', 'coin-dialog-art');
  art.innerHTML = packArt(look.art);
  const title = el('h2', 'coin-dialog-title', look.name);
  title.id = 'coin-dialog-title';
  const coins = el('div', 'coin-dialog-coins', `🪙 ${formatNumber(total)} coins`);
  const rate = inApp() ? '' : perCoin(pencePerCoin(pack));
  const sub = el('div', 'coin-dialog-sub', pack.bonus ? `${formatNumber(pack.coins)} + ${formatNumber(pack.bonus)} bonus${rate ? ` · ${rate}` : ''}` : rate);
  // The pack on top (on the left on short landscape screens), what to do below (or beside).
  const head = el('div', 'coin-dialog-head');
  head.append(art, title, coins, sub);
  const body = el('div', 'coin-dialog-body');
  box.append(x, head, body);

  if (!me.user) {
    const b = el('button', 'big-btn', 'Sign in to buy coins');
    b.onclick = () => {
      close();
      ctx.go('account');
    };
    body.append(el('p', 'account-note', 'Coins are kept on your account, so you need one to buy them. It only takes a moment.'), b);
  } else {
    const consent = el('label', 'account-check');
    const tick = el('input');
    tick.type = 'checkbox';
    const text = el('span');
    text.append(
      `I want my ${formatNumber(total)} coins straight away, and I understand that once they're delivered I lose my 14-day right to cancel. My other rights, such as if something doesn't work, aren't affected (`,
      legalLink('terms-of-service', 'Terms'),
      ' §5).',
    );
    consent.append(tick, text);
    // Every pack also needs a grown-up's say-so (Terms 5.1.1).
    const adult = el('label', 'account-check');
    const adultTick = el('input');
    adultTick.type = 'checkbox';
    adult.append(adultTick, el('span', '', "I'm 18 or over, or a parent or carer has said yes to this purchase."));
    const payLabel = `Pay ${packPrice(pack)}`;
    const pay = el('button', 'big-btn coin-dialog-pay', payLabel);
    const error = el('p', 'coin-dialog-error');
    error.setAttribute('role', 'alert');
    const hint = el('p', 'coin-dialog-hint', 'Tick both boxes to continue');
    let busy = false;
    const update = () => {
      const ready = tick.checked && adultTick.checked;
      pay.disabled = !ready || busy;
      hint.hidden = ready;
    };
    tick.onchange = update;
    adultTick.onchange = update;
    pay.onclick = async () => {
      busy = true;
      pay.textContent = inApp() ? 'Opening Google Play…' : 'Opening secure checkout…';
      update();
      error.textContent = '';
      const again = () => {
        busy = false;
        pay.textContent = payLabel;
        update();
      };
      try {
        if (!inApp()) {
          await buyCoins(pack.id, tick.checked, adultTick.checked);
          return;
        }
        const r = await buyCoinsInApp(pack.id);
        if (r.result === 'cancelled') return again();
        close();
        ctx.notify(
          r.result === 'done'
            ? `Thanks! ${formatNumber(r.coins || total)} coins are in your wallet.`
            : "Thanks! Your payment is still going through: the coins will appear as soon as Google Play confirms it.",
        );
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : String(e);
        again();
      }
    };
    body.append(consent, adult);
    body.append(pay, hint, error, el('p', 'coin-dialog-small', inApp() ? '🔒 You pay with Google Play. Prices include tax.' : '🔒 You pay on Stripe\'s secure page. Prices include VAT.'));
    update();
  }
  overlay.append(box);
  host.append(overlay);
  (box.querySelector<HTMLElement>('input, .big-btn') ?? x).focus();
}

function coinPacks(me: MeResponse, ctx: HubContext, state: ShopState): HTMLElement {
  const box = el('div', 'shop-coins');
  box.append(featureBanner(me, ctx, state));

  const head = el('div', 'coins-head');
  const icon = el('span', 'coins-head-icon');
  icon.innerHTML = coinIcon();
  head.append(icon, el('h3', '', 'Get coins'), el('span', '', `Coins unlock hats, skins, aim styles, effects and bundles. Bigger packs come with bonus coins. Prices include ${inApp() ? 'tax' : 'VAT'}.`));
  box.append(head);
  if (inApp()) {
    loadInAppPrices(ctx);
    if (inAppPricesFailed) box.append(el('p', 'account-note', "Couldn't get prices from Google Play. Check your connection, then open the shop again."));
  }

  const grid = el('div', 'coin-grid');
  const best = bestValue();
  for (const p of COIN_PACKS) {
    const look = PACK_LOOKS[p.id] ?? { art: 'pouch', name: `${formatNumber(p.coins)} coins` };
    const total = packTotal(p);
    const tag = p.id === best ? 'Best value' : p.bonus ? `+${Math.round((p.bonus / p.coins) * 100)}% bonus` : '';
    const b = el('button', 'coin-pack' + (tag ? ' tagged' : '') + (p.id === best ? ' best' : ''));
    b.setAttribute('aria-label', `${formatNumber(total)} coins for ${packPrice(p)}`);
    if (tag) b.append(el('span', 'pack-tag', tag));
    const art = el('span', 'pack-art');
    art.innerHTML = packArt(look.art);
    const ex = examples(total, me.owned);
    const exBox = el('span', 'pack-examples');
    if (ex.length) {
      const count = lookCount(total, me.owned);
      exBox.append(el('span', 'pack-eg', count.all ? 'Enough for every look in the shop!' : count.n > 3 ? `Enough for up to ${count.n} looks, e.g.` : 'Enough for e.g.'));
      const row = el('span', 'pack-eg-row');
      for (const item of ex) {
        const m = el('span', 'pack-eg-item');
        m.title = `${item.name} (${priceLabel(item)})`;
        m.innerHTML = itemArt(item);
        row.append(m);
      }
      exBox.append(row);
    }
    const bonus = el('span', 'pack-bonus' + (p.bonus ? '' : ' none'), p.bonus ? `${formatNumber(p.coins)} + ${formatNumber(p.bonus)} bonus` : 'No bonus');
    b.append(
      art,
      el('span', 'pack-name', look.name),
      el('b', 'pack-coins', `🪙 ${formatNumber(total)}`),
      bonus,
      exBox,
      el('span', 'pack-rate', inApp() ? '' : perCoin(pencePerCoin(p))),
      el('span', 'pack-price', packPrice(p)),
    );
    // In the app, not until Google's price is known (it must be the price shown).
    b.disabled = inApp() && !inAppPrices?.[p.id];
    b.onclick = () => openCheckout(me, ctx, p, b);
    grid.append(b);
  }
  box.append(grid, el('p', 'coins-pick', '👆 Tap a pack to buy it'));

  const trust = el('ul', 'coin-trust');
  const trustLines = inApp()
    ? ['🔒 Secure checkout by Google Play', '🧾 Receipt from Google', '🪙 Coins stay with your account', '✅ Looks only: never pay-to-win']
    : ['🔒 Secure checkout by Stripe', '🧾 Receipt by email', '🪙 Coins stay with your account', '✅ Looks only: never pay-to-win'];
  for (const t of trustLines) trust.append(el('li', '', t));
  box.append(trust, el('p', 'account-note', 'Coins have no cash value. Under 18? Please ask a parent or carer before buying.'));
  return box;
}
