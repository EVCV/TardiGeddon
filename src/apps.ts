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
 * certificate" (test builds). Empty: no assetlinks.json, so Android opens
 * links in the browser as before.
 */
export const ANDROID_CERT_SHA256: string[] = [];

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

/** /.well-known/assetlinks.json: which links open the Android app; null until the fingerprints are in. */
export function assetLinks(): object[] | null {
  if (!ANDROID_CERT_SHA256.length) return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: 'com.tardigeddon.app', sha256_cert_fingerprints: ANDROID_CERT_SHA256 },
    },
  ];
}
