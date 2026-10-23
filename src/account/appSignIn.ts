// Signing in to the Android app with a provider that only works in a browser
// (Apple): the app opens the server's /api/app/social in a browser tab, and
// the server sends the sign-in back to the app at this address (a link only
// the app opens; AndroidManifest.xml). See docs/ACCOUNTS.md, "Google and Apple
// in the Android app".

/** Where the browser tab hands the sign-in back: `?token=` or `?error=`. */
export const APP_SIGNIN_RETURN = 'com.tardigeddon.app://signin';

/** A challenge or verifier: 43 characters of base64url (32 random bytes, or a SHA-256). */
export const isChallenge = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
