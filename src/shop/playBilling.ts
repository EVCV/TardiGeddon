// Google Play Billing in the Android app: the JavaScript half of
// android/app/src/main/java/com/tardigeddon/app/PlayBillingPlugin.java.
// The app only starts purchases; the game server checks each one with Google
// and grants the coins (server/googlePlay.ts, POST /api/shop/google).

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { COIN_PACKS, playProductId } from './catalog';
import { playAccountTagWeb } from './playAccount';
import { t } from '../i18n/i18n';

interface PlayPurchase {
  id: string;
  token: string;
  pending: boolean;
}

interface PlayBillingPlugin {
  products(o: { ids: string[] }): Promise<{ products: { id: string; price: string }[] }>;
  buy(o: { id: string; account: string }): Promise<Partial<PlayPurchase> & { status: 'purchased' | 'pending' | 'cancelled' | 'owned' }>;
  unfinished(): Promise<{ purchases: PlayPurchase[] }>;
  addListener(event: 'purchasesUpdated', fn: () => void): Promise<PluginListenerHandle>;
}

const PlayBilling = registerPlugin<PlayBillingPlugin>('PlayBilling');

/** In the Android app, with the billing plugin built in. */
export function playBillingAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PlayBilling');
}

let prices: Promise<Record<string, string>> | null = null;

/**
 * Each pack's price as Google Play shows it to this player (their currency,
 * their country's tax), by our pack id. Google's own price must be shown,
 * not the website's.
 */
export function playPrices(): Promise<Record<string, string>> {
  prices ??= PlayBilling.products({ ids: COIN_PACKS.map(playProductId) })
    .then(({ products }) => {
      const byPack: Record<string, string> = {};
      for (const p of COIN_PACKS) {
        const found = products.find((x) => x.id === playProductId(p));
        if (found) byPack[p.id] = found.price;
      }
      return byPack;
    })
    .catch((e: unknown) => {
      prices = null; // try again next time
      throw e;
    });
  return prices;
}

export type PlayBuyResult = { status: 'purchased'; productId: string; token: string } | { status: 'pending' | 'cancelled' | 'owned' };

/** Show Google's payment sheet for a pack. */
export async function playBuy(packId: string, userId: string): Promise<PlayBuyResult> {
  const pack = COIN_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error(t('No such coin pack.'));
  await playPrices(); // the plugin needs the product's details first
  const r = await PlayBilling.buy({ id: playProductId(pack), account: await playAccountTagWeb(userId) });
  if (r.status === 'purchased' && r.id && r.token) return { status: 'purchased', productId: r.id, token: r.token };
  return { status: r.status === 'purchased' ? 'pending' : r.status };
}

/** Completed purchases the server may not have granted yet (a crash, no signal, a pending payment that went through). */
export async function playUnfinished(): Promise<{ productId: string; token: string }[]> {
  const { purchases } = await PlayBilling.unfinished();
  return purchases.filter((p) => !p.pending && p.token).map((p) => ({ productId: p.id, token: p.token }));
}

/** Called when a purchase completes outside a buy() (e.g. a slow payment went through). */
export function onPlayPurchasesUpdated(fn: () => void): void {
  if (playBillingAvailable()) void PlayBilling.addListener('purchasesUpdated', fn);
}
