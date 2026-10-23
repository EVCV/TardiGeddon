// Google and Apple sign-in in the Android app: the JavaScript half of
// android/app/src/main/java/com/tardigeddon/app/SocialSignInPlugin.java.
// Their sign-in pages refuse to open inside the app, so Google uses Android's
// account picker, and Apple's page opens in a browser tab that hands the
// sign-in back (server: /api/app/*; docs/ACCOUNTS.md).

import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_SIGNIN_RETURN } from './appSignIn';

interface SocialSignInPlugin {
  google(o: { clientId: string }): Promise<{ status: 'ok'; idToken: string } | { status: 'cancelled' | 'no_account' } | { status: 'error'; message?: string }>;
  openBrowser(o: { url: string }): Promise<void>;
}

const SocialSignIn = registerPlugin<SocialSignInPlugin>('SocialSignIn');

/** In the Android app, with the sign-in plugin built in. */
export function nativeSignInAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('SocialSignIn');
}

export const googleAccountPicker = (clientId: string) => SocialSignIn.google({ clientId });
export const openBrowserTab = (url: string) => SocialSignIn.openBrowser({ url });

/** The app's secret for one browser-tab sign-in, kept until the sign-in comes back (even if Android closes the app meanwhile). */
const VERIFIER_KEY = 'tardigeddon.appSignIn';
/** A sign-in left unfinished for longer than this is forgotten. */
const VERIFIER_MAX_MS = 15 * 60_000;

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A new verifier (kept on the phone) and its challenge (sent to the server), as in OAuth's PKCE. */
export async function newChallenge(): Promise<string> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  try {
    localStorage.setItem(VERIFIER_KEY, JSON.stringify({ verifier, at: Date.now() }));
  } catch {
    /* without storage the sign-in can't finish; the server just never sees the verifier */
  }
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/** The verifier for the sign-in under way, used up. */
export function takeVerifier(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(VERIFIER_KEY) ?? 'null') as { verifier?: string; at?: number } | null;
    localStorage.removeItem(VERIFIER_KEY);
    return saved?.verifier && Date.now() - (saved.at ?? 0) < VERIFIER_MAX_MS ? saved.verifier : null;
  } catch {
    return null;
  }
}

/** What a link back from the browser tab says, or null if it isn't one. */
export function parseSignInLink(url: string): { token: string } | { error: string } | null {
  if (!url.startsWith(APP_SIGNIN_RETURN + '?')) return null;
  const q = new URLSearchParams(url.slice(APP_SIGNIN_RETURN.length + 1));
  const token = q.get('token');
  return token ? { token } : { error: q.get('error') ?? 'cancelled' };
}
