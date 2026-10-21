// Play Integrity in the Android app: the JavaScript half of
// android/app/src/main/java/com/tardigeddon/app/PlayIntegrityPlugin.java.
// Before coins are bought and before they're granted, the app asks Google
// for a sealed verdict about this copy of the game, this phone and this Play
// account; only the game server can open it (server/googlePlay.ts
// integrityProblem), so a modified app can't fake it.

import { Capacitor, registerPlugin } from '@capacitor/core';

interface PlayIntegrityPlugin {
  token(o: { nonce: string }): Promise<{ token: string }>;
}

const PlayIntegrity = registerPlugin<PlayIntegrityPlugin>('PlayIntegrity');

/** Must match server/googlePlay.ts integrityNonce (tests/googleplay.test.ts checks). */
export async function integrityNonceWeb(what: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tardigeddon:${what}`)));
  return btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Google's sealed verdict for a request about `what`, or '' if there's none
 * (not the Android app, no Play Store, no connection): the server then says
 * what's wrong.
 */
export async function playIntegrityToken(what: string): Promise<string> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('PlayIntegrity')) return '';
  try {
    return (await PlayIntegrity.token({ nonce: await integrityNonceWeb(what) })).token;
  } catch {
    return '';
  }
}
