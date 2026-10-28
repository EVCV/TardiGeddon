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
| Signed Android build to Google Play internal testing on every merge (once the service account is in: `docs/GOOGLE_PLAY.md` §5) | `.github/workflows/android.yml`, `android/fastlane/` |
| iOS simulator build when the iOS side changes | `.github/workflows/ios.yml` |
| Signed iOS build to TestFlight on every merge (once the keys are in: `docs/IOS.md` §5) | `.github/workflows/ios-testflight.yml`, `ios/fastlane/` |

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
- **Reviews:** now and then, after a win (5+ matches over 3+ days, then not
  again for 60 days), the app asks the store to show its own rating pop-up
  (`src/review.ts`, `ReviewPlugin.java` / `ReviewPlugin.swift`). The store
  decides whether it shows: never in TestFlight or a test APK. No reward for
  reviewing, and no "enjoying it?" question first: both stores forbid them.
- **Coins through Google Play:** Google requires its own billing for digital
  items, so the Android app sells coin packs with Google Play Billing instead of
  Stripe (`docs/GOOGLE_PLAY.md` §7). Coins bought on the website still spend
  in the app.
- **Google and Apple sign-in their own way:** they refuse to show their
  sign-in pages inside an app. Google uses the phone's account picker; Apple
  opens in a browser tab and comes back to the app
  (`SocialSignInPlugin.java`, `src/account/nativeSignIn.ts`). Setup and how it
  works: `docs/ACCOUNTS.md`, "Google and Apple in the Android app".
- **The phone's font size:** a WebView would enlarge only the text (it spilled
  out of FIRE and other buttons), so `MainActivity` turns that off
  (`setTextZoom(100)`) and `DisplayPlugin` tells the game the phone's font
  scale; Settings → Text size "Auto" then scales the whole interface, text and
  buttons together (`src/ui/textSize.ts`, up to what the screen has room for).

## Foldables

Folding phones bring screens the game must handle (`e2e/foldable.spec.ts`
checks each, with the phones' CSS sizes):

| Screen | What happens |
|---|---|
| Outer screen (Galaxy Z Fold, Pixel Fold, iPhone Duo): a tall phone | As any phone: landscape, phone menu; held upright, "Turn your phone sideways" |
| Inner screen, open (near-square, ~780–1100px each way) | Plays either way up. On its side the phone menu is scaled up less than on a tablet (`--ui-zoom` for screens 6:5 or squarer in `style.css`), or it would squeeze into ~490px |
| iPhone Duo's open screen (~626–669 × 890–951, a 4:3-ish book) | Plays either way up: "Turn your phone sideways" only covers windows under 600px wide. The iOS app must be built with the iOS 27.1 SDK to fill it (`docs/IOS.md` §5, §7) |
| A flip phone's cover screen (under 500px either way) | "Open your phone" |
| Split screen (a window well under the screen's width) | "Make the window wider" |
| Opened or closed mid-match | The match carries on and redraws to the new size; the Android activity isn't restarted (`configChanges` in `AndroidManifest.xml` includes the screen sizes) |

**Android 16 and big screens:** for apps targeting API 36, Android ignores an
app's orientation lock on screens 600dp or more across (an unfolded Fold, a
tablet), so the app would turn upright there. Games are exempt, so the app
says it's one: `android:appCategory="game"` in `AndroidManifest.xml`. It
stays landscape (sensor-landscape) on the inner screen too. Google says the
general opt-out ends at API 37, but not the game exemption.

On narrow phones (under 720px wide: iPhone SE, small Androids, the iPhone
Duo's outer screen) the health bars sit next to the timer, not centred, so
the weapon button in the corner doesn't cover them.

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
Still to build: app
links for invites.

iOS, after Android: **see `docs/IOS.md`** (the plan: token sign-in, Apple
in-app purchases, building on GitHub's macOS runners, the App Store listing,
and the order of work).
