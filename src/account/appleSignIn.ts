// Sign in with Apple in the iOS app: the JavaScript half of
// ios/App/App/AppleSignInPlugin.swift. iOS's own Apple sheet gives an ID
// token for the app's bundle ID, which the server checks with Apple's public
// keys (Better Auth, /api/auth/sign-in/social with idToken; docs/IOS.md §2b).
// A fresh nonce goes with each sign-in: Apple puts its SHA-256 in the token,
// and the server checks it against the nonce itself, so a token can't be reused.
// Only the email is asked for, not the name: new accounts get a made-up player
// name (server/accounts.ts).

import { Capacitor, registerPlugin } from "@capacitor/core";

type AppleResult =
  | { status: "ok"; idToken: string }
  | { status: "cancelled" }
  | { status: "error"; message?: string };

interface AppleSignInPlugin {
  signIn(o: { nonce: string }): Promise<AppleResult>;
}

const AppleSignIn = registerPlugin<AppleSignInPlugin>("AppleSignIn");

/** In the iOS app, with the plugin built in. */
export function appleSignInAvailable(): boolean {
  return (
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("AppleSignIn")
  );
}

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Apple's sheet. Resolves to the token and the nonce to send with it, or the reason there isn't one. */
export async function appleSheet(): Promise<
  | { status: "ok"; idToken: string; nonce: string }
  | { status: "cancelled" | "error" }
> {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const hashed = hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce)),
  );
  const r = await AppleSignIn.signIn({ nonce: hashed });
  if (r.status !== "ok") return { status: r.status };
  return { status: "ok", idToken: r.idToken, nonce };
}
