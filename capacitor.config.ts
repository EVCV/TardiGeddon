// Capacitor wraps the game's web build (dist/) as the Android and iOS apps.
// See docs/APPS.md. Build with `npm run app:build`, not plain `npm run build`.
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
    // origin: TRUSTED_ORIGINS (docs/APPS.md).
    hostname: 'app.tardigeddon.com',
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#7fd3f7',
  },
};

export default config;
