// Sign-in with a token instead of the cookie, for the iOS app. Its pages are
// served from capacitor://app.tardigeddon.com, so the game server's sign-in
// cookie is cross-site there and WebKit drops it (docs/IOS.md §2a). Instead
// the server hands the app a token (Better Auth's bearer plugin), which the
// app sends back as "Authorization: Bearer …" and keeps in the iOS Keychain,
// through the app's AuthToken plugin. The website and the Android app keep
// using the cookie.

import { Capacitor, registerPlugin } from '@capacitor/core';

interface AuthTokenPlugin {
  get(): Promise<{ value?: string | null }>;
  set(o: { value: string }): Promise<void>;
  remove(): Promise<void>;
}

const AuthToken = registerPlugin<AuthTokenPlugin>('AuthToken');

/** The iOS app: signs in with a token. */
export function signsInWithToken(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

/** Kept in the Keychain when the app has the plugin; else only until the app closes. */
const stored = (): boolean => Capacitor.isPluginAvailable('AuthToken');

let token: Promise<string | null> | null = null;

/** The saved token, if signed in. */
export function authToken(): Promise<string | null> {
  token ??= stored()
    ? AuthToken.get()
        .then((r) => r.value || null)
        .catch(() => null)
    : Promise.resolve(null);
  return token;
}

/** Save the token the server sent (null: signed out, forget it). */
export async function saveAuthToken(value: string | null): Promise<void> {
  if (value === (await authToken())) return;
  token = Promise.resolve(value);
  if (!stored()) return;
  try {
    await (value ? AuthToken.set({ value }) : AuthToken.remove());
  } catch {
    // Still signed in for this visit; the next sign-in saves it again.
  }
}
