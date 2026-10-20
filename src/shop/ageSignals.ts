// The player's age band from Google Play, in the Android app: the JavaScript
// half of android/app/src/main/java/com/tardigeddon/app/AgeSignalsPlugin.java.
// Brazil's Digital ECA asks apps that children and teenagers are likely to
// use to read it. The only thing it changes is buying coins: everything else
// in the game is already the same for everyone (no chat, no ads, no loot
// boxes, preset names with strangers).
//
// The answer is kept in memory for this visit only: it isn't saved on the
// phone or sent to our server.

import { Capacitor, registerPlugin } from '@capacitor/core';

/** What Google Play said. Ages are inclusive; no `upper` means "and over" (18+). */
export type AgeSignal =
  | { status: 'shared'; lower?: number; upper?: number; change?: 'approved' | 'pending' | 'declined' }
  | { status: 'not_shared' | 'verification_required' }
  | { status: 'error'; message?: string };

interface AgeSignalsPlugin {
  check(): Promise<AgeSignal>;
}

const AgeSignals = registerPlugin<AgeSignalsPlugin>('AgeSignals');

/** How the coin shop should treat this player. */
export interface CoinRules {
  /** Buying coins is off, with the reason to show. */
  blocked?: string;
  /** A line to show above the coin packs. */
  note?: string;
}

/** The coin shop's rules for a player, from their age signal. */
export function coinRules(signal: AgeSignal | null): CoinRules {
  if (!signal) return {};
  if (signal.status === 'verification_required') {
    return { blocked: 'Google Play needs to confirm your age before you can buy coins. Open the Play Store app and follow its steps, then come back.' };
  }
  if (signal.status !== 'shared') return {};
  // A parent manages this account (Family Link) and hasn't approved this version of the game yet.
  if (signal.change === 'declined') {
    return { blocked: 'Buying coins is switched off: a parent or carer hasn’t approved the latest version of TardiGeddon in Family Link.' };
  }
  if (signal.change === 'pending') {
    return { blocked: 'Buying coins is switched off until a parent or carer approves the latest version of TardiGeddon in Family Link.' };
  }
  if (signal.upper !== undefined && signal.upper < 18) {
    return { note: '👪 A parent or carer may need to approve purchases. Google Play will ask them.' };
  }
  return {};
}

let asked: Promise<AgeSignal | null> | null = null;

/**
 * Ask Google Play once per visit (it may show its own "share your age range?"
 * prompt). Null outside the Android app.
 */
export function ageSignal(): Promise<AgeSignal | null> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('AgeSignals')) return Promise.resolve(null);
  asked ??= AgeSignals.check().catch((): AgeSignal => ({ status: 'error' }));
  return asked;
}
