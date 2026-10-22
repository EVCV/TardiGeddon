# Phone apps (Android first, then iOS)

The apps are the web game (`dist/`) inside a native shell made with
**Capacitor**. Same code, same game; `src/native.ts` holds what differs.

| Piece | Where |
|---|---|
| Capacitor settings (app id, name, address inside the phone) | `capacitor.config.ts` |
| App-only build settings (game server, invite links) | `.env.app` |
| Android project (open in Android Studio) | `android/` |
| iOS project (open in Xcode on a Mac: `npm run app:ios`; see `docs/IOS.md`) | `ios/` |
| Icon and splash sources, and the script that draws them | `assets/`, `scripts/app-icons.mjs` |
| APK built on every push | `.github/workflows/android.yml` |
| iOS simulator build when the iOS side changes | `.github/workflows/ios.yml` |

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
(Capacitor serves them from the app; nothing is hosted there). On iOS the
address is `capacitor://app.tardigeddon.com` (`docs/IOS.md` §2a). The game
server must trust both for sign-in to work. This is set (October 2026):

```sh
fly secrets set TRUSTED_ORIGINS=https://app.tardigeddon.com,capacitor://app.tardigeddon.com
```

`fly secrets set` replaces the whole value: always list every address,
comma-separated, or one of the apps stops signing in. Setting it restarts the
game server (online games in progress drop for a few seconds).

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

## "It won't install"

The app runs on **Android 7 (API 24) and newer** (`android/variables.gradle`;
Capacitor 8 can't go lower), so Android 14 (API 34) and 15 are fine. When a
phone won't take it, it's almost always one of these:

| What they see | Why | Fix |
|---|---|---|
| Not in Play, or "item not found" | The release is on **internal testing**, and only listed testers can see it | Add their Google account to the testers list (Play Console → Testing → Internal testing → Testers), then they open the **Join on the web** link *with that account* and install from Play |
| "Your device isn't compatible" | Their country isn't in the release's countries, or the device is excluded | Play Console → the release's countries; Reach and devices → Device catalog (look up their model) |
| "App not installed" / "package conflicts" (APK from Actions) | Another copy signed with a different key is already there (e.g. the debug APK, or the Play copy) | Uninstall the old one first. Debug and release APKs can't replace each other |
| "App not installed" (APK) | An older APK than the one installed (a lower versionCode) | Uninstall first, or use the newest build |
| Blocked by Play Protect, or no "Install" button | Installing APKs from files isn't allowed yet | Settings → Apps → the browser or Files app → **Install unknown apps** → allow; "Install anyway" on the Play Protect prompt |
| Installs, then a blank screen | Out-of-date **Android System WebView** | Update "Android System WebView" and Chrome in the Play Store |

Ask for the exact words on the screen: they say which row it is.

## Still to do

Android, before Google Play: **see `docs/GOOGLE_PLAY.md`**: the upload key
and GitHub secrets (signed `.aab` builds on every merge), the store listing
text and images (`store/google-play/`, `scripts/store-images.mjs`), and the
answers for Google's content rating, target audience and Data safety forms.
Still to build: Google
sign-in with the native account picker, and app links for invites.

iOS, after Android: **see `docs/IOS.md`** (the plan: token sign-in, Apple
in-app purchases, building on GitHub's macOS runners, the App Store listing,
and the order of work).
