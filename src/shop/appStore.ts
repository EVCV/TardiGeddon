// Apple's in-app purchase in the iOS app: the JavaScript half of
// ios/App/App/AppStorePlugin.swift (StoreKit 2). The app only starts
// purchases; the game server checks Apple's signature on each one and grants
// the coins (server/appStore.ts, POST /api/shop/apple). Only then is the
// purchase finished with Apple, so one the server never heard about (no
// signal, the app closed) comes back next time.

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { storeProducts } from './catalog';
import { appStoreAccountTokenWeb } from './appStoreAccount';

/** A purchase as Apple signed it, with its id (to finish it once the server has it). */
export interface AppStorePurchase {
  transaction: string;
  transactionId: string;
}

interface AppStorePlugin {
  products(o: { ids: string[] }): Promise<{ products: { id: string; price: string }[] }>;
  buy(o: { id: string; account: string }): Promise<Partial<AppStorePurchase> & { status: 'purchased' | 'pending' | 'cancelled' }>;
  unfinished(): Promise<{ purchases: (AppStorePurchase & { id: string })[] }>;
  finish(o: { transactionId: string }): Promise<void>;
  /** Supporter packs this Apple ID owns (Transaction.currentEntitlements); with `sync`, asks Apple first (Restore purchases). */
  owned(o: { sync: boolean }): Promise<{ purchases: (AppStorePurchase & { id: string })[] }>;
  addListener(event: 'purchasesUpdated', fn: () => void): Promise<PluginListenerHandle>;
}

const AppStore = registerPlugin<AppStorePlugin>('AppStore');

/** In the iOS app, with the purchase plugin built in. */
export function appStoreAvailable(): boolean {
  return Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('AppStore');
}

let prices: Promise<Record<string, string>> | null = null;

/**
 * Each pack's price as the App Store shows it to this player (their currency,
 * their country's tax), by our pack id. Apple's own price must be shown, not
 * the website's.
 */
export function appStorePrices(): Promise<Record<string, string>> {
  prices ??= AppStore.products({ ids: storeProducts().map((p) => p.storeId) })
    .then(({ products }) => {
      const byPack: Record<string, string> = {};
      for (const p of storeProducts()) {
        const found = products.find((x) => x.id === p.storeId);
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

export type AppStoreBuyResult = ({ status: 'purchased' } & AppStorePurchase) | { status: 'pending' | 'cancelled' };

/** Show Apple's payment sheet for a pack. */
export async function appStoreBuy(packId: string, userId: string): Promise<AppStoreBuyResult> {
  const pack = storeProducts().find((p) => p.id === packId);
  if (!pack) throw new Error('No such coin pack.');
  const r = await AppStore.buy({ id: pack.storeId, account: await appStoreAccountTokenWeb(userId) });
  if (r.status === 'purchased' && r.transaction && r.transactionId) return { status: 'purchased', transaction: r.transaction, transactionId: r.transactionId };
  return { status: r.status === 'purchased' ? 'pending' : r.status };
}

/** Purchases not finished yet: the server may not have granted them (a crash, no signal, Ask to Buy approved later). */
export async function appStoreUnfinished(): Promise<AppStorePurchase[]> {
  const { purchases } = await AppStore.unfinished();
  return purchases.map(({ transaction, transactionId }) => ({ transaction, transactionId }));
}

/** Tell Apple a purchase is done with: only once the server has granted it. */
export function appStoreFinish(transactionId: string): Promise<void> {
  return AppStore.finish({ transactionId });
}

/**
 * Restore purchases (Apple requires the button for non-consumables): the
 * supporter packs this Apple ID owns, as Apple signed them. With `sync`, Apple
 * checks its servers first (it may ask the player to sign in to their Apple ID).
 */
export async function appStoreOwned(sync: boolean): Promise<AppStorePurchase[]> {
  const { purchases } = await AppStore.owned({ sync });
  return purchases.map(({ transaction, transactionId }) => ({ transaction, transactionId }));
}

/** Called when a purchase completes outside a buy() (e.g. a parent approved it with Ask to Buy). */
export function onAppStorePurchasesUpdated(fn: () => void): void {
  if (appStoreAvailable()) void AppStore.addListener('purchasesUpdated', fn);
}
