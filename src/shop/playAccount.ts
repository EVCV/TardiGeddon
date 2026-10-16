// The tag the Android app attaches to a Google Play purchase (Google's
// "obfuscated account id"), so the server can check the purchase belongs to
// the signed-in player. A hash: Google never sees our account ids. Must match
// server/googlePlay.ts playAccountTag (tests/googleplay.test.ts checks).

export async function playAccountTagWeb(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`tardigeddon:${userId}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 64);
}
