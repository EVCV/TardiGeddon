// The phone's own store for coin packs: Google Play in the Android app
// (playBilling.ts), the App Store in the iOS app (appStore.ts). Both stores
// require their own payments for coins bought in an app; on the website it's
// Stripe, and none of this runs.

import { Capacitor } from '@capacitor/core';
import { appStoreAvailable, appStorePrices, onAppStorePurchasesUpdated } from './appStore';
import { onPlayPurchasesUpdated, playBillingAvailable, playPrices } from './playBilling';

/** Which store sells coins here: null on the website (Stripe). */
export function appStoreName(): 'apple' | 'google' | null {
  const p = Capacitor.getPlatform();
  return p === 'ios' ? 'apple' : p === 'android' ? 'google' : null;
}

/** Coin packs can be bought with the phone's store (its plugin is built in). */
export function storeBillingAvailable(): boolean {
  return playBillingAvailable() || appStoreAvailable();
}

/** Each pack's price as the phone's store shows it, by our pack id. */
export function storePrices(): Promise<Record<string, string>> {
  return appStoreAvailable() ? appStorePrices() : playPrices();
}

/** Called when a purchase completes outside a buy (a slow payment, Ask to Buy). */
export function onStorePurchasesUpdated(fn: () => void): void {
  onPlayPurchasesUpdated(fn);
  onAppStorePurchasesUpdated(fn);
}
