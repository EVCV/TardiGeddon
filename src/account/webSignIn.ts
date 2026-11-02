// Google sign-in in the iOS app: the JavaScript half of
// ios/App/App/WebSignInPlugin.swift. Google's page won't open inside the app,
// so iOS's own sign-in sheet opens the server's /api/app/social instead, and
// the sign-in comes back as com.tardigeddon.app://signin?token=… — the same
// hand-off as Apple's in the Android app (docs/ACCOUNTS.md).

import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_SIGNIN_RETURN } from './appSignIn';

type SheetResult = { status: 'ok'; url: string } | { status: 'cancelled' } | { status: 'error'; message?: string };

interface WebSignInPlugin {
  open(o: { url: string; scheme: string }): Promise<SheetResult>;
}

const WebSignIn = registerPlugin<WebSignInPlugin>('WebSignIn');

/** In the iOS app, with the plugin built in. */
export function webSignInAvailable(): boolean {
  return Capacitor.getPlatform() === 'ios' && Capacitor.isPluginAvailable('WebSignIn');
}

/** Opens `url` in iOS's sign-in sheet; resolves with the link it came back on. */
export function signInSheet(url: string): Promise<SheetResult> {
  return WebSignIn.open({ url, scheme: APP_SIGNIN_RETURN.split(':')[0] });
}
