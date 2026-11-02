// The phone apps in their stores: where they are, and whether each is out yet.
// Read by the game (the "get the app" reminder, src/ui/getApp.ts) and the
// website (its app badges and Play buttons), so both change together.
// Plain constants only: the menu and the website import this.
//
// When an app goes live in its store, set its `live` to true. Until then the
// website says "Coming soon" and nothing sends players to an empty store page.

export type AppOs = 'ios' | 'android';

export const APPS: Record<AppOs, { live: boolean; store: string; url: string }> = {
  ios: { live: false, store: 'App Store', url: 'https://apps.apple.com/app/id6826841030' },
  android: { live: false, store: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.tardigeddon.app' },
};

/** The App Store's number for the app (Safari's "Open in the app" banner). */
export const APP_STORE_ID = '6826841030';

/** Where shared links point: they open the app when it's installed (docs/APPS.md, "App links"). */
export const WEB_GAME = 'https://tardigeddon.com/play/';

/** The phone or tablet this browser is on, if it has one of the apps; null on computers. */
export function mobileOs(nav: { userAgent: string; maxTouchPoints?: number } = navigator): AppOs | null {
  const ua = nav.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPads ask for the desktop site, so they say "Macintosh": a Mac with a touch screen is an iPad.
  if (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return 'ios';
  return null;
}

/** Which app the web game should suggest, or null: not a phone or tablet, its app isn't out yet, or they've said no (ui/getApp.ts). */
export function appToSuggest(o: { native: boolean; os: AppOs | null; never: boolean; shownThisVisit: boolean; apps?: typeof APPS }): AppOs | null {
  const apps = o.apps ?? APPS;
  if (o.native || !o.os || o.never || o.shownThisVisit || !apps[o.os].live) return null;
  return o.os;
}

/**
 * On Android, an address that opens the installed app at this page, or
 * `fallback` in the browser when it isn't installed (Chrome's intent: links).
 * `page` is a tardigeddon.com address.
 */
export function androidOpenLink(page: string, fallback: string): string {
  const u = new URL(page);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.tardigeddon.app;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

// ---- App links: tardigeddon.com/play links open the app when it's installed ----
// The website publishes these two files at /.well-known/ (site/vite.config.ts),
// and the apps claim the links (ios/App/App/App.entitlements,
// android/app/src/main/AndroidManifest.xml). See docs/APPS.md, "App links".

/** The Apple developer team (developer.apple.com → Membership). */
export const APPLE_TEAM_ID = 'R3TQ7LC3G6';

/**
 * The SHA-256 fingerprints of the certificates the Android app is signed with,
 * as "AB:CD:…": Play Console → Test and release → App integrity → App signing
 * → "App signing key certificate" (installs from Google Play), and "Upload key
 * certificate" (test builds), plus any more that Play Console's own
 * assetlinks.json lists (Grow users → Deep links). Empty: no assetlinks.json,
 * so Android opens links in the browser.
 */
export const ANDROID_CERT_SHA256: string[] = [
  'DE:CC:64:50:A7:E1:70:27:BF:13:51:6C:29:6E:6C:BF:4C:F2:95:3C:95:9E:24:3A:2B:6A:4D:15:96:4C:D9:E4',
  'B1:EB:94:DB:0D:ED:CA:38:AB:CF:67:8E:F8:8B:74:A2:61:0F:72:B0:B1:9B:CA:9A:F0:F0:58:D7:48:21:8B:5C',
  // Two more Google signs with (e.g. internal app sharing), from Play Console's own
  // file: Grow users → Deep links → Domains → Credential sharing.
  '0E:CA:14:B2:CF:87:92:1F:CD:27:A0:3D:A1:7A:68:02:70:65:CE:A0:88:FB:14:F9:90:07:0D:46:5A:29:D2:42',
  '45:33:44:48:B7:EF:29:D1:79:9F:F9:7A:26:44:2A:C8:35:DD:18:3F:FC:9C:3D:4C:99:98:B3:B9:E6:37:55:6F',
];

/** /.well-known/apple-app-site-association: which links open the iOS app. */
export function appleAppSiteAssociation(): object {
  return {
    applinks: {
      details: [
        {
          appIDs: [`${APPLE_TEAM_ID}.com.tardigeddon.app`],
          components: [
            // Back from paying on the website, and test links: stay in the browser.
            { '/': '/play/', '?': { shop: '*' }, exclude: true },
            { '/': '/play/', '?': { autostart: '*' }, exclude: true },
            // The game and its shared links: rooms, friends, invites, and our emails.
            { '/': '/play' },
            { '/': '/play/' },
            { '/': '/play/index.html' },
          ],
        },
      ],
    },
  };
}

/**
 * /.well-known/assetlinks.json: which links open the Android app, and that the
 * app and the website share sign-ins (credential sharing: an email and password
 * saved for tardigeddon.com in Google Password Manager is offered in the app,
 * and the other way round). Null until the fingerprints are in.
 */
export function assetLinks(): object[] | null {
  if (!ANDROID_CERT_SHA256.length) return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
      target: { namespace: 'android_app', package_name: 'com.tardigeddon.app', sha256_cert_fingerprints: ANDROID_CERT_SHA256 },
    },
  ];
}
