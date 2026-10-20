# iOS app: the plan

The plan for TardiGeddon on the App Store, for **iPhone and iPad**. It reuses
the Android app (`docs/APPS.md`): the same web game inside Capacitor, with
`src/native.ts` holding what differs. This page covers what's decided, what
to build, and what to do in App Store Connect, in order. `docs/GOOGLE_PLAY.md`
is the Android version. Turn this page into the same kind of step-by-step
guide as each part gets built.

Apple's rules on this page were checked against Apple's documentation in
**October 2026**. Re-check the parts marked *(changing)* when you get to them.

## Decided

| Question | Decision |
|---|---|
| iPad | **Supported** (iPhone and iPad, one app) |
| Building | **GitHub Actions macOS runners**: no Mac needed |
| Signing | **fastlane `match`** (certificates kept encrypted in a private repo) |
| Paying in the iOS app | **Apple in-app purchase only**, in every country, the US included (§3) |
| Sign-in | Email + **Sign in with Apple** in the iOS app; Google too, later, on every platform (§2) |
| Test devices | The owner's iPhone and iPad, through TestFlight |

## 0. What carries over, and what doesn't

| Already works on iOS as it is | Needs iOS work |
|---|---|
| The game, menus, touch controls, online play | **Sign-in** (the cookie doesn't work: §2) |
| Safe areas (`viewport-fit=cover`, `env(safe-area-inset-*)` in `style.css`) | **Buying coins** with Apple in-app purchases (§3) |
| Pause and sound off in the background (`@capacitor/app` events) | **Age checks** for Texas, Utah, Louisiana and Brazil (§4) |
| Coins bought on the website or in the Android app spending in the iOS app | **iPad portrait and resizable windows** (§7) |
| Account → Delete account (Apple requires it in the app) | The Xcode project, the build on GitHub, the store listing (§5–§7) |

There's no back button on iOS, so `attachNative`'s back-button handler never
runs. That's fine: the phone menu has a Back button on every page.

## 1. Owner tasks to start now (they take the longest)

1. **Apple Developer Program, as an organisation:**
   <https://developer.apple.com/programs/enroll/>. Enrol as **EVCV Limited**,
   with the D-U-N-S number Google already verified, and an Apple Account
   with two-factor authentication. $99 a year. Apple phones to check
   the company. Allow one to two weeks.
2. **Agreements, tax and banking** (App Store Connect → Business): sign the
   **Paid Apps Agreement**, fill in the tax forms (the US W-8BEN-E for a UK
   company) and add the bank account. In-app purchases don't work, even
   in testing, until this is done.
3. **App Store Small Business Program**
   (<https://developer.apple.com/app-store/small-business-program/>): apply
   once enrolled. Apple then takes 15% instead of 30% (on up to $1M a
   year). It isn't automatic, unlike Google's 15% tier.
4. **EU trader status** (App Store Connect → Business): required, or the
   app is removed from the EU stores. We're a trader. The address, phone and
   email are shown on the EU store page: use support@tardigeddon.com.
5. **A private GitHub repo for signing**, e.g. `EVCV/tardigeddon-signing`,
   empty. fastlane `match` keeps the certificate and profiles there,
   encrypted (§5).
6. **TestFlight** from the App Store on the iPhone and the iPad.

## 2. Sign-in

### 2a. Tokens instead of the cookie (needed before anything else)

The Android app's pages live at `https://app.tardigeddon.com` inside the
phone, so the game server's sign-in cookie is same-site. iOS reserves
`https` for itself, so Capacitor serves the iOS app's pages from
`capacitor://app.tardigeddon.com`. The server's cookie is then cross-site,
and iOS's WebKit drops it. Sign-in "works", then the next request comes
back signed out.

The fix (already planned in `docs/SECURITY.md`) is to sign in with a
**bearer token** in the app:

- **Server:** Better Auth's `bearer()` plugin. Sign-in replies carry the
  session token in a `set-auth-token` header, and requests with
  `Authorization: Bearer …` count as signed in. CORS must allow
  `Authorization` and expose `set-auth-token` for the app's origin. Add
  `capacitor://app.tardigeddon.com` to `TRUSTED_ORIGINS`. Check that
  `userFrom(headers)` in `server/accounts.ts` reads the header too.
- **Online play:** the WebSocket can't send headers, and the token mustn't
  go in the URL (it would end up in logs: `SECURITY.md`). The app asks
  `POST /api/ws-ticket` for a single-use ticket that lasts 30 seconds, and
  joins with `?ticket=…`. `playerFor` (`server/main.ts`) accepts the cookie or
  a ticket.
- **App:** keep the token in the **iOS Keychain**, never `localStorage`.
  Write a small Swift plugin of our own (`KeychainPlugin.swift`, like the
  Android plugins). `src/account/session.ts` sends the header when it has a
  token, and doesn't send `credentials: 'include'` then. Signing out deletes
  the token.
- **Android** keeps the cookie through its launch and moves to tokens in a
  later update (one path is easier to look after than two).
- **Tests** (with `TEST_DATABASE_URL`): sign in with a token and use it;
  join online with a ticket; a reused or expired ticket is refused; the
  token stops working after sign-out.

### 2b. Sign in with Apple and Google

**Why:** buying coins needs an account, so every step between "I want that
hat" and paying loses some buyers. A one-tap Apple or Google sign-in is far
quicker than typing an email and password and confirming the email.

**Apple's rule** (App Review Guideline 4.8): an app that offers Google
sign-in must also offer Sign in with Apple, or a sign-in with the same
privacy promises. Email sign-in on its own needs neither.

**Where each one goes:**

| | Email | Apple | Google |
|---|---|---|---|
| Website | ✓ now | ✓ (server already supports it: needs its secrets in production) | ✓ (the same) |
| iOS app, first release | ✓ | ✓ **native sheet** | later |
| Android app, after its launch | ✓ | later | ✓ native account picker |
| Both apps, later | ✓ | ✓ | ✓ |

Natively, both work the same way: the phone's own sheet gives the app an
**ID token**, and the app sends it to the server
(`signIn.social({ provider: 'apple', idToken })`). Better Auth checks it and
replies with the bearer token from 2a. No browser and no redirect.
`appBundleIdentifier` is already in `server/accounts.ts` for Apple's
native tokens. Later, the "other" provider in each app (Google on iOS,
Apple on Android) opens the provider's page in the system browser and
returns to the app. So a player who started on an iPhone with Apple can
carry on on Android.

### 2c. Same email: one account or two?

Better Auth (v1.7, our version) **links them into the same account** when a
player signs in with Apple or Google using the email of an existing
account, but only if both are true:

1. Apple or Google says the email is verified (they always do), **and**
2. the existing account's email has been **confirmed** (the confirmation
   email). This protects players: otherwise someone could make an account
   in a victim's name, unconfirmed, and get the victim's Apple or Google
   sign-in attached to it.

If the existing account isn't confirmed, Better Auth refuses the sign-in
(`account_not_linked`). It **doesn't** make a second account. The game has to
explain this: "An account with this email already exists: sign in with your
password and confirm your email first, then you can use Apple." **This depends
on confirmation emails working in production** (SMTP: `docs/ACCOUNTS.md`
step 7, still listed as "highest priority" in `docs/SECURITY.md`).

Two cases where the emails don't match, so it **would** make a new account:

- **Apple's "Hide My Email":** Apple gives us a made-up
  `…@privaterelay.appleid.com` address instead of the real one.
- A Google or Apple account with a different email from the one the player
  used here.

So we also build, on the Account page: **"Link Apple" / "Link Google"**
(Better Auth `linkSocial`, allowing a different email). A signed-in player
attaches their Apple or Google sign-in to the account they already have, coins
and all. Also: a way for an Apple- or Google-only account to **add a
password**, so it can sign in anywhere. And the Privacy Policy's Apple
section mentions the relay address.

Apple only sends the email and name the **first** time someone signs in
with Apple. Better Auth saves them then. Don't delete Apple users' emails
expecting to get them back.

## 3. Coins: Apple in-app purchase only

**Decision:** in the iOS app, coins are bought only with Apple's in-app
purchase, in every country.

- **Continuity comes from the account, not the payment.** Coins belong to the
  TardiGeddon account, so coins bought with Apple, Google or Stripe on the
  website all spend everywhere. Apple allows that (Guideline 3.1.3(b),
  multiplatform games), as long as Apple's own purchase is offered in the app.
- **Linking out to the website (US only) is still unsettled** *(changing)*.
  Apple's rules currently allow US apps to link to a website shop, but the
  court case behind it (Epic v. Apple) is still going. Apple has proposed a 5%
  fee on link-out sales for Small Business Program developers, and the
  Supreme Court is reviewing part of the case. Building it now means
  building against rules that may change. Revisit once it settles. It would
  be a button in the US App Store only, alongside Apple's purchase.
- In every other country Apple forbids buttons or links to other ways of
  paying. The app mustn't mention website prices either.

**App side** (`ios/App/App/AppStorePlugin.swift` + `src/shop/appStore.ts`),
with StoreKit 2:

- `products(ids)` → localised prices. Show Apple's price, never the website's.
- `buy(id, appAccountToken)` → Apple's payment sheet. `appAccountToken` is
  Apple's version of Google's obfuscated account id, but it must be a
  UUID: take the first 16 bytes of `sha256("tardigeddon:" + userId)`,
  formatted as a UUID (a helper beside `playAccountTag`, with a test that the
  app and server agree).
- Send the purchase's **signed transaction (JWS)** to the server. Call
  `transaction.finish()` only **after the server says it has granted it**.
- `Transaction.unfinished` at startup (like `playUnfinished()`), and
  `Transaction.updates` for purchases that finish later (Ask to Buy, slow
  payments).

**Shared app code:** put one small interface in front of both stores
(`products / buy / unfinished / onUpdated`), picked by platform.
`MeResponse.playBilling` becomes a per-store flag. `playProductId` becomes
`storeProductId`.

**Products** (App Store Connect → the app → In-App Purchases): the same ids
as Google Play (`coins_200_1`, `coins_500`, … `coins_10000`), type
**Consumable**, the same names. Prices: the GBP price points £1.99 … £99.99,
with the **United Kingdom as the base country**. Each needs a review
screenshot (the shop with the packs).

**Server side** (`server/appStore.ts`, `POST /api/shop/apple`):

- Use Apple's **`@apple/app-store-server-library`** (Node). It checks the
  signature chain up to Apple's root and talks to the App Store Server API.
- Check: signed by Apple, our bundle id, a known coin pack, not revoked,
  `appAccountToken` matches this player. Then `recordPurchase` with id
  `apple:<transactionId>` (granted once, like `gplay:`). The `storefront`
  country is **3 letters** (`JPN`): convert it to the 2-letter code the Japan
  figure uses (`src/shop/japan.ts`).
- **Sandbox** purchases (TestFlight, sandbox testers) grant coins but count
  as £0, like Google's licence testers.
- **App Store Server Notifications v2** → `POST /api/shop/apple/notifications`
  (signature checked by the same library): `REFUND` / `REVOKE` → `revokePurchase`
  takes the coins back. The same address also gets the parental-consent
  notices in §4.
- Server secrets: `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`,
  `APPLE_IAP_PRIVATE_KEY` (an In-App Purchase key: App Store Connect → Users
  and Access → Integrations), `APPLE_BUNDLE_ID` (`com.tardigeddon.app`).
- Tests like `tests/googleplay.test.ts`: granted once, wrong account refused,
  sandbox counts as £0, refund takes the coins back, unknown product refused,
  and a forged or tampered JWS refused.

## 4. Ages and parents *(changing)*

As of October 2026, Apple requires these for apps in some places:

| Where | From | What we must do |
|---|---|---|
| **Texas** (SB 2420) | in force (Apple applies it to new Texas accounts) | Read the age category; ask a parent's consent for a **significant change**; handle a parent **withdrawing consent** |
| **Utah** | 6 May 2026 | The same tools |
| **Louisiana** | 1 July 2026 | The same tools |
| **Brazil** (Digital ECA) | in force | Read the age category if shared. Declaring loot boxes would make the app 18+ there (we have none) |

Apple's tools, all needed:

- **Declared Age Range API** → under 13 / 13–15 / 16–17 / 18+, and whether
  the law applies to this player. As on Android (`src/shop/ageSignals.ts`),
  use it for **buying coins** (a note for under-18s; off while a parent
  hasn't approved), keep the answer in memory only, and never send it to the
  server.
- **Significant Change API** (PermissionKit) and **`AppStore.ageRatingCode`**
  (StoreKit): when we release a significant change, or the age rating changes
  (that always counts), a child's parent is asked to approve. We decide
  what counts as significant. Rule of thumb: a new age rating, new ways to
  interact with other players (e.g. chat), new kinds of purchase.
- **Consent withdrawn:** Apple stops the app opening on the child's device
  and sends our server a notification. Log it. There's nothing on our side
  to switch off (no account is needed to play).
- Test it all in **sandbox** (Apple: "Testing age assurance in sandbox").

These US laws apply to **Google Play too**: the Android app's age check
only covers Brazil today. Check that separately before the Android launch.

**Age rating:** Apple's age ratings changed in 2026 (4+, 9+, 13+, 16+, 18+),
with new questions. Answer them like Google's (`docs/GOOGLE_PLAY.md` §4):
cartoon violence, in-app purchases, online play with no chat, blocking and
reporting. Expect 9+ or 13+. Not in the **Kids** category: accounts and
online play are 13+.

## 5. Building on GitHub (no Mac)

- **Xcode:** apps uploaded since 28 April 2026 must be built with **Xcode 26
  or later** (iOS 26 SDK). GitHub's `macos-26` runner has Xcode 26.x. Pin
  the Xcode version in the workflow so a runner update can't change it
  silently. Expect Apple to require the **iOS 27 SDK** from around spring
  2027 (§7 is ready for it).
- **Minimum iOS:** 15 (StoreKit 2 needs it; Apple's floor is 13). The age
  range check only runs on iOS 26 and later.
- `.github/workflows/ios.yml`: `npm ci`, `npm run app:build`, then fastlane:
  `match` (signing), `build_app`, `upload_to_testflight`. Run it on merges to
  `main` and by hand ("Run workflow"). Not on every push: macOS minutes
  cost 10× Linux minutes on GitHub's allowance.
- **Secrets** (GitHub → Settings → Secrets → Actions): an **App Store Connect
  API key** (`.p8`, key id, issuer id; App Store Connect → Users and Access →
  Integrations, role App Manager), `MATCH_PASSWORD` (encrypts the signing
  repo), and a deploy key or token that can read the signing repo. Never in
  this repo.
- Build number = the run number; the version comes from `package.json`, as
  on Android.
- **TestFlight:** internal testers (up to 100, no review): the owner's
  iPhone and iPad. External testers need a short beta review.

## 6. Store listing, privacy and legal

- **Listing:** reuse Google Play's text. Apple adds a 30-character
  **subtitle** (e.g. "Tiny tardigrade artillery") and a 100-character
  **keywords** field. Category **Games → Strategy** (second: Casual).
- **Screenshots** (up to 10 per size, PNG/JPEG, no transparency):
  - iPhone, **required**: landscape **2622×1206** (or 2556×1179);
  - iPad 13-inch, **required since we support iPad**: landscape **2752×2064**
    (or 2732×2048).

  Add these to `scripts/store-images.mjs`, output in `store/app-store/`.
- **App Privacy** labels: the same facts as Google's Data safety: email,
  name, user id, gameplay data, purchase history, user content (team names).
  All **linked to the user**, **no tracking**, purpose App Functionality. No
  tracking means no App Tracking Transparency prompt. Keep it in step with
  `site/legal/` (`CLAUDE.md`). Sign in with Apple adds nothing new (name,
  email).
- **Privacy manifest** `ios/App/App/PrivacyInfo.xcprivacy`: no tracking,
  plus the reason for each "required reason" API we or Capacitor use
  (e.g. UserDefaults). Apple refuses uploads without it.
- **Export compliance:** HTTPS only, so `ITSAppUsesNonExemptEncryption = NO`
  in `Info.plist`.
- **Legal pages:** Privacy Policy 11.0.1 still says apps are coming. Update it
  for both apps, with the iOS age check (as 2.0.4 does for Android), Sign in
  with Apple and Hide My Email. Terms: Apple as the seller in the app, and
  refunds through Apple (reportaproblem.apple.com), as 5.1.3/5.7 do for Google.
- **App Review notes:** give a demo account (reviewers like to see the shop
  signed in). Say coins are cosmetic only, and that coins bought on the
  website or Android also spend here (Guideline 3.1.3(b)).
- **Countries:** as Google Play: everywhere except Vietnam.

## 7. The Xcode project

- `npm i @capacitor/ios`, `npx cap add ios`, commit `ios/` (like
  `android/`). `capacitor.config.ts`: `ios: { scheme: 'capacitor' }` with
  the same `hostname` (→ `capacitor://app.tardigeddon.com`) and background
  colour. Add `npm run app:ios` (`cap open ios`) for anyone with a Mac.
- **Launch screen:** Capacitor's storyboard. Apple requires one from the iOS
  27 SDK.
- **iPhone:** landscape only (`UISupportedInterfaceOrientations`).
- **iPad: portrait and resizable windows have to work.** Since iPadOS 26
  the "full screen only" setting (`UIRequiresFullScreen`) is deprecated.
  With the iOS 27 SDK it's ignored: the app can be put in a resizable
  window, and resizable apps must support **every orientation**. So:
  - declare all four orientations on iPad, and ask to stay in landscape
    while playing (`prefersInterfaceOrientationLocked`; iPadOS may say no);
  - make the game **playable in iPad portrait** (3:4 is wide enough: the
    camera zooms out, HUD and menus reflow). Today `src/ui/landscape.ts`
    covers portrait with "Turn your phone sideways";
  - keep that overlay only for windows too narrow to play in (e.g. a thin
    split screen), with tablet wording;
  - check the game redraws correctly when the window is resized.
- **Full screen:** hide the status bar, auto-hide the home indicator,
  keep the screen on (`isIdleTimerDisabled`), like Android.
- **Sound:** audio session **ambient** (respects the silent switch, doesn't
  stop the player's music). Check sound starts after the first tap and comes
  back after a call or the background.
- **Text size:** WebKit doesn't enlarge web text with the phone's text size,
  so nothing spills. Later, optionally: pass the iOS text size to Settings →
  Text size "Auto" (`src/ui/textSize.ts` is Android-only today).
- **Icons:** `npx @capacitor/assets generate --ios` from `assets/` (no
  transparency).
- **Invite links** stay web links. Later, with Android app links: Universal
  Links (`/.well-known/apple-app-site-association` on the website).

## 8. Order of work

| # | Work | Who | Needs |
|---|---|---|---|
| 1 | Enrol; agreements, tax, bank; Small Business Program; EU trader status; signing repo | Owner | — |
| 2 | Token sign-in + WebSocket tickets (server + app, tests), off on Android | Code | — |
| 3 | `ios/` project: orientations, full screen, sound, icons, launch screen, privacy manifest | Code | — |
| 4 | iPad portrait and resizable windows in the web game | Code | — |
| 5 | `ios.yml` + fastlane: build, sign, upload to TestFlight | Code + owner (API key, secrets) | 1, 3 |
| 6 | First TestFlight build on the iPhone and iPad: play, sign in, online, tutorial, rotate, split screen | Owner | 2–5 |
| 7 | One interface for both stores; `AppStorePlugin.swift`, `appStore.ts` | Code | 3 |
| 8 | `server/appStore.ts`, notifications, tests; products in App Store Connect | Code + owner (IAP key, products) | 1, 7 |
| 9 | Sandbox purchases on TestFlight: pay, refund, app closed mid-purchase, wrong account | Owner | 6, 8 |
| 10 | Sign in with Apple (native) + "Link Apple" + add a password; confirmation emails live | Code + owner (Apple keys, SMTP) | 2 |
| 11 | Age range, Significant Change API, consent notifications; sandbox-tested | Code | 7, 8 |
| 12 | Screenshots, listing, App Privacy, age rating, legal pages | Code + owner | 6 |
| 13 | Submit for review | Owner | all |

Steps 2, 3 and 4 can start now and don't touch the Android release.
