// The tag the iOS app attaches to an App Store purchase (Apple's
// "appAccountToken"), so the server can check the purchase belongs to the
// signed-in player: Apple's version of Google's account tag (playAccount.ts),
// but it must be a UUID. A hash: Apple never sees our account ids. The app
// makes it here; the server the same way (server/appStore.ts), and
// tests/appstore.test.ts checks they agree.

/** A UUID from a SHA-256 hash in hex: its first 128 bits, marked as a version 8 (custom) UUID. */
export function uuidFromHash(hex: string): string {
  const h = hex.slice(0, 32).toLowerCase().split('');
  h[12] = '8';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export async function appStoreAccountTokenWeb(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`tardigeddon:${userId}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return uuidFromHash([...hash].map((b) => b.toString(16).padStart(2, '0')).join(''));
}
