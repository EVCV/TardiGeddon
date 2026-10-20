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
import { App } from '@capacitor/app';

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

/**
 * An answer that can change while the app is open: the player confirms
 * their age in the Play Store, or a parent approves in Family Link, then
 * comes back. These are asked again when the app returns to the front.
 */
export function mayChange(signal: AgeSignal): boolean {
  return signal.status === 'verification_required' || signal.status === 'error' || (signal.status === 'shared' && (signal.change === 'pending' || signal.change === 'declined'));
}

/**
 * Longest wait for Google Play's answer. The coin packs stay off until it
 * comes, so a Play Store that never answers mustn't keep them off for
 * everyone; long enough for a player to answer Google's own prompt.
 */
export const AGE_SIGNAL_TIMEOUT_MS = 15_000;

/** The answer, or an error if it takes longer than `ms`. */
export function withTimeout(p: Promise<AgeSignal>, ms: number): Promise<AgeSignal> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ status: 'error', message: 'timeout' }), ms);
    p.then(
      (a) => {
        clearTimeout(t);
        resolve(a);
      },
      () => {
        clearTimeout(t);
        resolve({ status: 'error' });
      },
    );
  });
}

let asked: Promise<AgeSignal | null> | null = null;
let last: AgeSignal | null = null;
const staleFns = new Set<() => void>();
let listening = false;

/** Called when an answer that may have changed should be asked for again. */
export function onAgeSignalStale(fn: () => void): () => void {
  staleFns.add(fn);
  return () => staleFns.delete(fn);
}

/**
 * Ask Google Play (it may show its own "share your age range?" prompt).
 * A settled answer is kept for the visit; one that may change is asked
 * again after the app comes back to the front. Null outside the Android app.
 */
export function ageSignal(): Promise<AgeSignal | null> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('AgeSignals')) return Promise.resolve(null);
  if (!listening) {
    listening = true;
    void App.addListener('resume', () => {
      if (!last || !mayChange(last)) return;
      asked = null;
      last = null;
      for (const fn of [...staleFns]) fn();
    });
  }
  // A timeout counts as an error, so it's asked again when the app comes back to the front.
  asked ??= withTimeout(AgeSignals.check(), AGE_SIGNAL_TIMEOUT_MS).then((a) => (last = a));
  return asked;
}
