# iOS app: the plan

The plan for TardiGeddon on the App Store (iPhone and iPad). It reuses the
Android app (`docs/APPS.md`): the same web game inside Capacitor, with
`src/native.ts` holding what differs. This page lists what's still to decide,
what to build, and what to do in App Store Connect, in order.
`docs/GOOGLE_PLAY.md` is the Android version of this page. Turn this page
into the same kind of step-by-step guide as each part gets built.

## 0. What carries over, and what doesn't

| Already works on iOS as it is | Needs iOS work |
|---|---|
| The game, menus, touch controls, online play | **Sign-in** (the cookie doesn't work: §2) |
| Safe areas (`viewport-fit=cover`, `env(safe-area-inset-*)` in `style.css`) | **Buying coins**: Apple's in-app purchases instead of Google Play Billing (§3) |
| Pause and sound off in the background (`@capacitor/app` events) | The Xcode project, landscape, status bar, sound settings (§1) |
| Coins bought on the website or in the Android app spending in the iOS app | The age check: Apple's equivalent of Google's age signals (§4) |
| Account → Delete account (Apple requires it in the app) | Building and signing without a Mac (§5) |
| | Store listing, App Privacy answers, age rating, legal pages (§6) |

There is no back button on iOS, so `attachNative`'s back-button handler never
runs. That's fine: the phone menu already has a Back button on every page.

## 1. Owner tasks to start now (they take the longest)

These need the owner (EVCV Limited) and can run alongside the Android launch.

1. **Apple Developer Program, as an organisation.** At developer.apple.com →
   Enrol, as **EVCV Limited**, with the D-U-N-S number Google already
   verified. $99 a year. Apple phones to check the company; allow one to
   two weeks.
2. **Agreements, tax and banking** (App Store Connect → Business): sign the
   **Paid Apps Agreement**, fill in the tax forms (the US W-8BEN-E for a UK
   company) and add the bank account. In-app purchases don't work, even
   for testing, until this is done.
3. **App Store Small Business Program**: apply once enrolled. Apple then
   takes 15% instead of 30% (on up to $1M a year). It isn't automatic,
   unlike Google's 15% tier.
4. **EU trader status** (App Store Connect → Business): the EU's Digital
   Services Act makes Apple ask whether we're a trader. We are, so the
   address, phone and email are shown on the EU store page. Use
   support@tardigeddon.com.
5. **Test devices:** at least one iPhone, ideally on the latest iOS, plus an
   iPad if we support iPad (§7). There's no Mac and no simulator to work
   with (§5), so all testing happens on real devices through TestFlight.

## 2. Sign-in: tokens instead of the cookie

**Why:** the Android app's pages live at `https://app.tardigeddon.com` inside
the phone, so the game server's sign-in cookie is same-site. iOS doesn't let
an app serve its pages from an `https` address (WebKit reserves it), so
Capacitor uses `capacitor://app.tardigeddon.com`. The server's cookie is then
cross-site, and WebKit blocks cross-site cookies. Sign-in "works", then the
next request comes back signed out.

**The fix** (already planned in `docs/SECURITY.md`): in the app, sign in
with a **bearer token** instead of the cookie.

- **Server:** turn on Better Auth's `bearer()` plugin. Sign-in replies then
  carry the session token in a `set-auth-token` header, and requests with
  `Authorization: Bearer …` count as signed in. CORS has to allow the
  `Authorization` header and expose `set-auth-token` for the app's origin.
  Add `capacitor://app.tardigeddon.com` to `TRUSTED_ORIGINS`. Check that
  `userFrom(headers)` in `server/accounts.ts` reads the header too.
- **Online play:** the WebSocket can't send headers from a WebView, and the
  token mustn't go in the URL (it would end up in logs: `SECURITY.md` says
  logs never hold tokens). Instead the app asks `POST /api/ws-ticket` (with
  the bearer token) for a single-use ticket that lasts 30 seconds, and joins
  with `?ticket=…`. `playerFor` in `server/main.ts` accepts either the
  cookie or a ticket.
- **App:** keep the token in the **iOS Keychain**, never `localStorage`. A
  small Swift plugin of our own (`KeychainPlugin.swift`, ~50 lines, like
  the Android plugins) saves us a dependency. `src/account/session.ts` adds
  the header to every request when it has a token, and stops sending
  `credentials: 'include'`. Signing out deletes the token.
- **Android:** build it platform-neutral but switch it on for iOS only at
  first. Android keeps the cookie that's known to work through its launch,
  and moves over in a later update (one path is easier to look after than two).
- **Tests:** the server tests (with `TEST_DATABASE_URL`) sign in with a
  token, use it, join online with a ticket, refuse a reused or expired
  ticket, and check the token stops working after sign-out.

**Sign in with Apple:** not needed while the app has email sign-in only.
Apple requires it (or a similar private sign-in) once an app offers
another company's sign-in. So if we add native Google sign-in to the apps
(`docs/GOOGLE_PLAY.md` §8), Sign in with Apple has to arrive in the iOS app at
the same time, as a native sheet (the web redirect won't open inside the
app). The server already supports Apple (`APPLE_CLIENT_ID`, …).

## 3. Coins: Apple in-app purchases (StoreKit 2)

Apple requires its own payments for coins bought in the app, as Google
does. It's the same shape as Google Play Billing: the app only starts
purchases, and **the server alone grants coins**.

**App side** (`ios/App/App/AppStorePlugin.swift` + `src/shop/appStore.ts`),
with StoreKit 2:

- `products(ids)` → localised prices. Show Apple's price, never the website's.
- `buy(id, appAccountToken)` → Apple's payment sheet. `appAccountToken` is
  Apple's version of Google's obfuscated account id, but it must be a
  UUID: take the first 16 bytes of `sha256("tardigeddon:" + userId)` and
  format them as a UUID (a shared helper beside `playAccountTag`, with a
  test that the app and server agree).
- Send the purchase's **signed transaction (JWS)** to the server, and call
  `transaction.finish()` **only after the server says it has granted it**.
- `unfinished()` → `Transaction.unfinished`, sent again at startup like
  `playUnfinished()`. Listen to `Transaction.updates` for purchases that
  finish later ("Ask to Buy", slow payments).

**Shared app code:** `playBilling.ts` and Google-specific names leak into
`session.ts` and the shop. Put one small interface in front of both stores
(`products / buy / unfinished / onUpdated`) and pick Google or Apple by
platform. `MeResponse.playBilling` becomes a per-store flag the server sets
when it's configured for that store.

**Product ids:** use exactly the same ids as Google Play (`coins_200_1`,
`coins_500`, …, from `playProductId` in `src/shop/catalog.ts`, renamed to
`storeProductId`). Apple ids also can't be reused once deleted, but sharing
them keeps one table. Type **Consumable**. Prices: pick the GBP price points
£1.99 … £99.99 with the **United Kingdom as the base country**, and let Apple
set the other countries' prices. Each needs a 1024×1024 review screenshot
(the shop with the packs shown).

**Server side** (`server/appStore.ts`, `POST /api/shop/apple`):

- Use Apple's own **`@apple/app-store-server-library`** (Node). It checks
  the JWS certificate chain up to Apple's root and talks to the App Store
  Server API. Checking those signatures by hand is easy to get wrong.
- Check: signed by Apple, our bundle id, a known coin pack, not revoked,
  `appAccountToken` matches this player. Then `recordPurchase` with id
  `apple:<transactionId>` (granted once, like `gplay:`). `region` comes from
  `storefront`, which is **3-letter** (`JPN`), so convert it to the 2-letter
  code the Japan figure uses (`JP`, `src/shop/japan.ts`).
- **Sandbox** purchases (TestFlight, sandbox testers: `environment:
  "Sandbox"`) grant coins but count as £0, like Google's licence testers.
- **Refunds:** set up **App Store Server Notifications v2** to
  `POST /api/shop/apple/notifications`. On `REFUND` / `REVOKE`, run
  `revokePurchase` to take the coins back, as with Stripe and Google. Check
  each notification's signature with the same library.
  `CONSUMPTION_REQUEST` (Apple asking whether the coins were used before it
  decides a refund) can be ignored at first.
- Server secrets: `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`,
  `APPLE_IAP_PRIVATE_KEY` (an In-App Purchase key from App Store Connect →
  Users and Access → Integrations), `APPLE_BUNDLE_ID` (`com.tardigeddon.app`).
- Tests like `tests/googleplay.test.ts`: granted once, wrong account
  refused, sandbox counts as £0, refund takes coins back, unknown product
  refused, and a forged or tampered JWS refused.

**Later option, US only:** US App Store rules now let apps link out to the
website to buy, without Apple's fee. The website's Stripe shop could be
offered alongside Apple's in the US. That's a business decision; leave it
until the app is out.

## 4. Age and children

- **Age rating:** answer Apple's age-rating questionnaire the same way as
  Google's (`docs/GOOGLE_PLAY.md` §4): cartoon violence, in-app purchases,
  online play with no chat, with blocking and reporting. Expect 9+ or
  12+/13+. Don't put the app in the **Kids** category: accounts and online
  play are 13+.
- **Brazil's Digital ECA / US state app-store age laws:** Apple's version of
  Google's age signals is the **Declared Age Range** API. Mirror
  `src/shop/ageSignals.ts`: ask when the coin packs open, and only adjust
  buying coins (a note for under-18s; off when a parent hasn't approved).
  Keep it in memory only, as on Android, so App Privacy doesn't change.
  **Check the current rules when we build this:** what Apple requires and
  which US states' laws are in force has been changing.
- Apple's "Ask to Buy" already makes children ask a parent for every
  purchase in Family Sharing. Those purchases arrive later through
  `Transaction.updates` (§3).

## 5. Building without a Mac

iOS apps can only be built with Xcode on macOS. Instead of buying a Mac,
build in **GitHub Actions on a macOS runner**, like `android.yml`:

- `.github/workflows/ios.yml`: `npm ci`, `npm run app:build`,
  `xcodebuild archive`, sign, export the `.ipa`, upload to **TestFlight**.
  Run it on every merge to `main` and by hand ("Run workflow").
- Signing with **fastlane** (`match` keeps the certificate and profile
  encrypted in a private git repo or storage bucket) or plain `xcodebuild`
  with an **App Store Connect API key**. Fastlane is easier to keep working.
  Either way the secrets are the API key (`.p8`, key id, issuer id) and the
  signing certificate's password. Like the Android keystore, they go only into
  GitHub secrets, never into the repo.
- Build number = the run number (rises by itself, as on Android); version
  from `package.json`.
- macOS minutes cost 10× Linux minutes on GitHub's free allowance. Build iOS
  only on merges to `main`, not on every push.
- Testing: install **TestFlight** on the iPhone and use internal testing
  (up to 100 testers, no review needed). External testers need a short
  beta review.

If the owner gets a Mac later, `npm run app:ios` (`cap open ios`) opens the
project in Xcode, the same as `app:android`.

## 6. Store listing, privacy and legal

- **Listing:** reuse Google Play's text (§3 there). Apple has a 30-character
  **subtitle** (e.g. "Tiny tardigrade artillery") and a 100-character
  **keywords** field instead of a short description. Category: **Games →
  Strategy** (secondary: Games → Action or Casual).
- **Screenshots:** the iPhone 6.9" set (landscape 2868×1320, or 2796×1290
  for 6.7") is required; if iPad is supported, the 13" iPad set (landscape
  2752×2064) too. Add these sizes to `scripts/store-images.mjs`, output
  in `store/app-store/`.
- **App Privacy** ("nutrition label"): the same facts as Google's Data
  safety answers: email, name, user id, gameplay data, purchase history, and
  user content (team names). All **linked to the user**, **not used for
  tracking**, purpose App Functionality. No tracking, so no App Tracking
  Transparency prompt. Keep it in step with `site/legal/` and the Data
  safety answers (`CLAUDE.md`).
- **Privacy manifest** (`ios/App/App/PrivacyInfo.xcprivacy`): no tracking,
  and the reasons for any "required reason" APIs we use (e.g. UserDefaults
  through Capacitor Preferences, if used). Apple rejects uploads without one.
- **Export compliance:** only standard HTTPS/TLS, so set
  `ITSAppUsesNonExemptEncryption = NO` in `Info.plist`. Then no question at
  each upload.
- **Legal pages:** Privacy Policy 11.0.1 still says apps are coming: update
  it for both apps, add the iOS age check if we build it (as 2.0.4 does for
  Android), and add Apple as the seller in the app (as Terms 5.1.3/5.7 do for
  Google), including how to ask Apple for a refund (reportaproblem.apple.com).
- **App Review notes:** accounts are optional; give a demo account anyway
  (reviewers like to see the shop signed in). Say the coins are cosmetic only
  and that coins bought on the website also spend in the app (allowed for
  apps on several platforms, as long as Apple's own purchase is offered too).
- **Countries:** as Google Play: everywhere except Vietnam. In App Store
  Connect, Pricing and Availability → untick Vietnam.

## 7. The Xcode project

- `npm i @capacitor/ios`, `npx cap add ios`, commit `ios/` (like `android/`).
  `capacitor.config.ts`: `ios: { scheme: 'capacitor' }`, and use the same
  `hostname` (giving `capacitor://app.tardigeddon.com`) and the same background colour.
- **Orientation:** landscape only on iPhone (`UISupportedInterfaceOrientations`).
  iPad: **decision needed.** Supporting iPad is cheap (the game already fits
  tablets, and Google Play has tablet screenshots). But iPad multitasking
  expects every orientation unless the app asks for full screen, so check
  what the current iPadOS allows a landscape-only game to do. Recommendation:
  support iPad, full screen, landscape only.
- **Full screen:** hide the status bar, auto-hide the home indicator
  (`prefersHomeIndicatorAutoHidden`), keep the screen on during matches
  (`isIdleTimerDisabled`), like Android's keep-screen-on.
- **Sound:** set the audio session to **ambient**: the game respects the
  silent switch and doesn't stop the player's own music. Check that sound
  starts after the first tap (WebKit's rule) and comes back after a phone
  call or the app being in the background.
- **Text size:** WebKit doesn't enlarge web text with the phone's text
  size, so nothing spills. Optional later: an iOS version of
  `DisplayPlugin` that passes the Dynamic Type size to Settings → Text
  size "Auto" (`src/ui/textSize.ts` returns early on anything but Android today).
- **Icons and launch screen:** `npx @capacitor/assets generate --ios`
  from the same `assets/` sources (no transparency in the iOS icon).
- **Invite links:** stay web links, as on Android. Later, alongside Android
  app links: **Universal Links** (`/.well-known/apple-app-site-association`
  on the website, served as JSON by Cloudflare: check `site/public/_headers`).

## 8. Order of work

| # | Work | Who | Depends on |
|---|---|---|---|
| 1 | Apple Developer enrolment, agreements, tax, bank, Small Business Program | Owner | — |
| 2 | Token sign-in + WebSocket tickets (server + app, tests), off on Android | Code | — |
| 3 | `ios/` project, landscape, full screen, sound, icons, privacy manifest | Code | — |
| 4 | `ios.yml`: build, sign, upload to TestFlight | Code + owner (API key, secrets) | 1, 3 |
| 5 | First TestFlight build on a real iPhone: play, sign in, online, tutorial | Owner | 2, 4 |
| 6 | One interface for both stores; `AppStorePlugin.swift`, `appStore.ts` | Code | 3 |
| 7 | `server/appStore.ts`, notifications, tests; products in App Store Connect | Code + owner (IAP key, products) | 1, 6 |
| 8 | Sandbox purchase test on TestFlight: pay, refund, app closed mid-purchase, wrong account | Owner | 5, 7 |
| 9 | Age range check (Declared Age Range) | Code | 6 |
| 10 | Screenshots, listing, App Privacy, age rating, legal pages | Code + owner | 5 |
| 11 | Submit for review | Owner | all |

Steps 2–3 can start straight away and don't touch the Android release.
Step 2 is the riskiest and most important, and is useful on Android later
too.

## 9. Decisions for the owner

1. **iPad:** support it (recommended), or iPhone only?
2. **Build route:** GitHub Actions macOS runners (recommended), a paid
   service such as Codemagic, or buying a Mac?
3. **Who manages signing:** fastlane `match` in a private repo (recommended)
   or keys uploaded by hand as secrets?
4. **Timing of Sign in with Apple:** only when native Google sign-in comes
   (required then), or sooner?
5. **US web purchases:** look at linking to the website's shop in the US
   after launch, or keep Apple-only?
