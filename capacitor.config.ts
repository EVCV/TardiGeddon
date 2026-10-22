// Capacitor wraps the game's web build (dist/) as the Android and iOS apps.
// See docs/APPS.md and docs/IOS.md. Build with `npm run app:build`, not plain `npm run build`.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Permanent once the app is on Google Play / the App Store.
  appId: 'com.tardigeddon.app',
  appName: 'TardiGeddon',
  webDir: 'dist',
  server: {
    // The app's own pages are served from https://app.tardigeddon.com inside the
    // phone (nothing is fetched from that address). Being on tardigeddon.com
    // keeps the game server (server.tardigeddon.com) same-site, so its sign-in
    // cookie works as it does on the website. The server must trust this
    // origin: TRUSTED_ORIGINS (docs/APPS.md). iOS keeps https for itself, so
    // there the pages are capacitor://app.tardigeddon.com, which signs in with
    // a token instead (src/account/token.ts) and must be trusted too (docs/IOS.md).
    hostname: 'app.tardigeddon.com',
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#7fd3f7',
  },
  ios: {
    backgroundColor: '#7fd3f7',
    // The page lays itself out around the notch and home bar (viewport-fit=cover, safe-area insets).
    contentInset: 'never',
    // No rubber-band bounce, and no link previews on a long press (it aims and drags).
    scrollEnabled: false,
    allowsLinkPreview: false,
    // iPads get the touch version of the game, not a desktop page.
    preferredContentMode: 'mobile',
  },
};

export default config;
