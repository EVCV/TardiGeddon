// App Store in-app purchases, server side: coin packs bought in the iOS app.
// The app hands us each purchase as Apple signed it (a JWS). Apple's own
// library checks the signature up to Apple's root certificate (server/apple/),
// that it's for our app, and whether it was made in the live App Store or the
// sandbox (TestFlight, App Review). We grant the coins once (store.ts
// recordPurchase); only then does the app tell Apple it's finished. Refunds
// come as App Store Server Notifications (v2). docs/IOS.md §3 has the setup.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  Environment,
  NotificationTypeV2,
  SignedDataVerifier,
  Type,
  VerificationException,
  VerificationStatus,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import { uuidFromHash } from '../src/shop/appStoreAccount';
import { countryFromStorefront } from './storefronts';

export interface AppStoreEnv {
  /** The app's Apple ID, the number in App Store Connect → the app → App Information. Turns App Store purchases on. */
  APPLE_APP_ID?: string;
  /** The app's bundle id (default com.tardigeddon.app). */
  APPLE_BUNDLE_ID?: string;
}

/** An App Store purchase, as Apple signed it. */
export interface AppStorePurchase {
  transactionId: string;
  productId: string;
  /** Coin packs are consumables. */
  consumable: boolean;
  /** What the app set when it started the purchase: appStoreAccountToken(userId). */
  appAccountToken: string | null;
  /** Refunded, or taken back by Apple. */
  revoked: boolean;
  /** Made in the sandbox (TestFlight, sandbox testers, App Review): costs nothing. */
  sandbox: boolean;
  /** The buyer's App Store country, as two letters. */
  region: string | null;
}

export interface AppStoreApi {
  /** A purchase the app sent, checked; null if it isn't a genuine one for our app. */
  purchase(signed: string): Promise<AppStorePurchase | null>;
  /** A notification Apple sent us, checked; null if it isn't a genuine one for our app. */
  notification(signed: string): Promise<{ type: string; purchase: AppStorePurchase | null } | null>;
}

/** Notifications that mean a purchase was refunded or taken back. */
export const REVOKED_NOTIFICATIONS: readonly string[] = [NotificationTypeV2.REFUND, NotificationTypeV2.REVOKE];

/**
 * The account tag the app attaches to a purchase (Apple's appAccountToken),
 * a UUID made from a hash, so Apple never sees our account ids. Must match
 * src/shop/appStoreAccount.ts appStoreAccountTokenWeb.
 */
export function appStoreAccountToken(userId: string): string {
  return uuidFromHash(createHash('sha256').update(`tardigeddon:${userId}`).digest('hex'));
}

/** Apple Root CA - G3, which signs every App Store purchase (from apple.com/certificateauthority). */
const APPLE_ROOT = new URL('./apple/AppleRootCA-G3.cer', import.meta.url);

function toPurchase(t: JWSTransactionDecodedPayload): AppStorePurchase | null {
  if (!t.transactionId || !t.productId) return null;
  return {
    transactionId: t.transactionId,
    productId: t.productId,
    consumable: t.type === Type.CONSUMABLE,
    appAccountToken: t.appAccountToken?.toLowerCase() ?? null,
    revoked: t.revocationDate !== undefined,
    sandbox: t.environment === Environment.SANDBOX,
    region: countryFromStorefront(t.storefront),
  };
}

/**
 * Null when App Store purchases aren't set up on this server (no APPLE_APP_ID).
 * `roots` and `onlineChecks` are for tests: a test certificate instead of
 * Apple's, and no certificate revocation checks over the network.
 */
export function appStoreApi(env: AppStoreEnv, opts: { roots?: Buffer[]; onlineChecks?: boolean } = {}): AppStoreApi | null {
  const appId = Number(env.APPLE_APP_ID);
  if (!env.APPLE_APP_ID || !Number.isInteger(appId) || appId <= 0) return null;
  const bundleId = env.APPLE_BUNDLE_ID || 'com.tardigeddon.app';
  const roots = opts.roots ?? [readFileSync(APPLE_ROOT)];
  const online = opts.onlineChecks ?? true;
  // The live store first, then the sandbox: each only accepts its own.
  const verifiers = [
    new SignedDataVerifier(roots, online, Environment.PRODUCTION, bundleId, appId),
    new SignedDataVerifier(roots, online, Environment.SANDBOX, bundleId),
  ];

  /** The first environment that accepts it. Null if none does; throws if Apple couldn't be asked (try again later). */
  async function check<T>(fn: (v: SignedDataVerifier) => Promise<T>): Promise<{ result: T; verifier: SignedDataVerifier } | null> {
    for (const verifier of verifiers) {
      try {
        return { result: await fn(verifier), verifier };
      } catch (e) {
        if (e instanceof VerificationException && e.status === VerificationStatus.INVALID_ENVIRONMENT) continue;
        if (e instanceof VerificationException && e.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) throw e;
        return null;
      }
    }
    return null;
  }

  return {
    async purchase(signed) {
      const r = await check((v) => v.verifyAndDecodeTransaction(signed));
      return r ? toPurchase(r.result) : null;
    },
    async notification(signed) {
      const r = await check((v) => v.verifyAndDecodeNotification(signed));
      if (!r) return null;
      const info = r.result.data?.signedTransactionInfo;
      let purchase: AppStorePurchase | null = null;
      if (info) {
        try {
          purchase = toPurchase(await r.verifier.verifyAndDecodeTransaction(info));
        } catch {
          purchase = null;
        }
      }
      return { type: String(r.result.notificationType ?? ''), purchase };
    },
  };
}
