# Phone apps (Android first, then iOS)

The apps are the web game (`dist/`) inside a native shell made with
**Capacitor**. Same code, same game; `src/native.ts` holds what differs.

| Piece | Where |
|---|---|
| Capacitor settings (app id, name, address inside the phone) | `capacitor.config.ts` |
| App-only build settings (game server, invite links) | `.env.app` |
| Android project (open in Android Studio) | `android/` |
| Icon and splash sources, and the script that draws them | `assets/`, `scripts/app-icons.mjs` |
| APK built on every push | `.github/workflows/android.yml` |

## Building

```sh
npm run app:build        # web build in "app" mode, copied into android/
npm run app:android      # opens Android Studio (Run ▶ starts the emulator)
```

Always use `app:build`, not `npm run build`: the app needs `.env.app`
(`VITE_SERVER_URL`), because it can't work out the game server from its own
address the way the website does.

**No Android Studio?** Each push builds a debug APK on GitHub: open the
**Actions** tab → **Android app** → the latest run → **Artifacts** →
`tardigeddon-debug-apk`. Unzip it and:

- drag `app-debug.apk` onto a running Android emulator, or
- upload it to an online emulator such as appetize.io, or
- copy it to an Android phone and open it (allow "install unknown apps").

New icons: edit `public/icon.svg`, then
`PW_CHROMIUM_PATH=… node scripts/app-icons.mjs` and
`npx @capacitor/assets generate --android --iconBackgroundColor '#7fd3f7' --splashBackgroundColor '#7fd3f7'`.

## One server setting

The app's pages live at `https://app.tardigeddon.com` *inside the phone*
(Capacitor serves them from the app; nothing is hosted there). The game
server must trust that origin for sign-in to work:

```sh
fly secrets set TRUSTED_ORIGINS=https://app.tardigeddon.com
```

(If `TRUSTED_ORIGINS` already has values, keep them: comma-separated.)

Because that address is on `tardigeddon.com`, the server's sign-in cookie is
"same-site" and works exactly as on the website. Online play needs no change.

## What's different in the app

- **Landscape and full screen** (`AndroidManifest.xml`, `MainActivity.java`);
  the screen stays on.
- **Back button:** closes a dialog or the weapon panel, steps back to the
  lobby, asks before quitting a match; from the lobby it puts the app in the
  background.
- **Pausing:** sound stops when the app goes to the background.
- **Invite links** point at the web game (`VITE_WEB_URL`), which anyone can open.
- **Coins through Google Play:** Google requires its own billing for digital
  items, so the Android app sells coin packs with Google Play Billing instead of
  Stripe (`docs/GOOGLE_PLAY.md` §7). Coins bought on the website still spend
  in the app.
- **Email sign-in only:** Google and Apple refuse to show their sign-in pages
  inside an app.
- **The phone's font size:** a WebView would enlarge only the text (it spilled
  out of FIRE and other buttons), so `MainActivity` turns that off
  (`setTextZoom(100)`) and `DisplayPlugin` tells the game the phone's font
  scale; Settings → Text size "Auto" then scales the whole interface, text and
  buttons together (`src/ui/textSize.ts`, up to what the screen has room for).

## Still to do

Android, before Google Play: **see `docs/GOOGLE_PLAY.md`**: the upload key
and GitHub secrets (signed `.aab` builds on every merge), the store listing
text and images (`store/google-play/`, `scripts/store-images.mjs`), and the
answers for Google's content rating, target audience and Data safety forms.
Still to build: Google
sign-in with the native account picker, and app links for invites.

iOS, after Android:

- Building needs a Mac with Xcode, or a macOS cloud build (GitHub Actions
  macOS runners, Codemagic, Ionic Appflow). An Apple Developer account costs
  $99 a year. `npx cap add ios` creates the project.
- **Sign-in needs work first:** iOS apps can't use an `https` address inside
  the phone, so the cookie becomes cross-site and Safari's rules block it.
  The fix is the token sign-in already planned in `SECURITY.md` (a Better
  Auth bearer token kept in the phone's secure storage, also sent when
  joining an online game).
- Sign in with Apple is required once Google sign-in is offered; buying coins
  goes through Apple's in-app purchases.
