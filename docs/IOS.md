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
| Sign-in | **Email, Apple and Google on every platform** (website, iOS, Android) (§2) |
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
   <https://developer.apple.com/programs/enroll/>. $99 a year. Apple phones
   to check the company. Allow one to two weeks.
   1. **An email on the company's domain.** Apple wants a work email on
      the organisation's own domain, not Gmail. Add a forwarding address
      such as `developer@tardigeddon.com` (like `support@`), so Apple's
      emails reach the owner's inbox. The website already shows "developed
      by EVCV Limited … company number 13570383" in its footer, which is
      what Apple checks the domain against.
   2. **A new Apple Account with that email**
      (<https://account.apple.com> → Create your Apple Account), in the
      owner's **own legal first and last name** (not "EVCV"), with the
      owner's mobile as the trusted phone number. New Apple Accounts have
      two-factor authentication on from the start: codes come by text
      message to that phone. Keep it separate from the Apple Account on the
      owner's iPhone (iCloud, photos); it's the company's.
   3. **Check the D-U-N-S record** at
      <https://developer.apple.com/enroll/duns-lookup/>: the legal name
      **EVCV Limited** and the address must match what's entered in the
      enrolment exactly. If Dun & Bradstreet has an old address or name,
      correct it with them first (it takes a few days to reach Apple).
   4. **Enrol in the Apple Developer app** on the iPhone or iPad (from the
      App Store). Sign in inside that app with the new account; the phone's
      own iCloud sign-in stays as it is. Choose **Organisation**, and
      enter the D-U-N-S number, `https://tardigeddon.com`, and a phone
      number Apple can call. (The website at developer.apple.com works too.)
      The owner enrols as a director, which covers "legal binding authority".
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

### 2a. Tokens instead of the cookie: **built**

Server and game code are done and tested (`tests/accounts.test.ts`, "signs
the iOS app in with a token…"), and the `AuthToken` Keychain plugin is in the
Xcode project (§7). The game server trusts the iOS app's address (set
October 2026, alongside Android's; `docs/APPS.md`, "One server setting"):

```sh
fly secrets set TRUSTED_ORIGINS=https://app.tardigeddon.com,capacitor://app.tardigeddon.com
```

How it works:

The Android app's pages live at `https://app.tardigeddon.com` inside the
phone, so the game server's sign-in cookie is same-site. iOS reserves
`https` for itself, so Capacitor serves the iOS app's pages from
`capacitor://app.tardigeddon.com`. The server's cookie is then cross-site,
and iOS's WebKit drops it. Sign-in "works", then the next request comes
back signed out.

So the app signs in with a **bearer token** instead:

- **Server** (`server/accounts.ts`): Better Auth's `bearer()` plugin, with
  signed tokens only. Sign-in replies carry the token in a `set-auth-token`
  header, and `Authorization: Bearer …` counts as signed in everywhere
  (`userFrom`). The token is only handed to `capacitor://` origins
  (`signsInWithToken`); for the website and the Android app it's stripped
  from the reply, so their HttpOnly cookie stays out of scripts' reach.
- **Online play:** the WebSocket can't send headers, and the token mustn't
  go in the URL (logs). The app asks `POST /api/ws-ticket` for a ticket
  (random, one use, 30 seconds) and joins with `?ticket=…`; `playerFor`
  accepts the cookie or a ticket (`server/main.ts`). `src/net/client.ts`
  fetches one before each connection, reconnects included.
- **App** (`src/account/token.ts`, used by `call()` in
  `src/account/session.ts`): on iOS it sends the token instead of cookies,
  saves a new one when the server sends it, and forgets it on sign-out or when
  the server no longer knows it. It's kept in the **Keychain** through the
  `AuthToken` plugin (`ios/App/App/AuthTokenPlugin.swift`), never `localStorage`.
- **Android** keeps the cookie through its launch and can move to tokens in a
  later update (one path is easier to look after than two).

### 2b. Sign in with Apple and Google

**Why:** buying coins needs an account, so every step between "I want that
hat" and paying loses some buyers. A one-tap Apple or Google sign-in is far
quicker than typing an email and password and confirming the email.

**Apple's rule** (App Review Guideline 4.8): an app that offers Google
sign-in must also offer Sign in with Apple, or a sign-in with the same
privacy promises. Email sign-in on its own needs neither.

**Decided: email, Apple and Google everywhere**, so a player can sign in the
same way on any device:

| | Email | Apple | Google |
|---|---|---|---|
| Website | ✓ now | ✓ (server already supports it: needs its secrets in production) | ✓ (the same) |
| iOS app | ✓ | ✓ native sheet | ✓ through the system browser |
| Android app | ✓ | ✓ through the system browser | ✓ native account picker |

The iOS app's first release needs at least email + Apple. Google can follow
in an update if it isn't ready, but Apple must never be missing while Google
is offered (Guideline 4.8).

**Sign in with Apple in the iOS app: built** (October 2026).
`ios/App/App/AppleSignInPlugin.swift` ↔ `src/account/appleSignIn.ts`, used by
`signInInApp` in `src/account/session.ts`:

- iOS's own sheet asks for the **email only** and gives an **ID token** for
  the app's bundle ID, with a fresh nonce (its SHA-256 goes to Apple; the
  nonce itself to the server, so a token can't be replayed). The app sends
  it to `/api/auth/sign-in/social` with `idToken`; Better Auth checks Apple's
  signature (Apple's public keys), the audience (`com.tardigeddon.app`,
  or `APPLE_APP_BUNDLE_IDENTIFIER`) and the nonce, and replies with the
  bearer token from 2a. No browser, no redirect.
- **Needs nothing on the server**: no Apple key or secret, so it's always on
  (`appleInApp` in `/api/me`). The website's and the Android app's Apple
  button still need the Services ID and secret (docs/ACCOUNTS.md), and only
  shows when they're set.
- New accounts made with Apple or Google get a **made-up player name**
  (e.g. "Mossy Rockets", changeable on the Account page): Apple often sends
  no name, and real names mustn't show on leaderboards.
- An existing account with that email that isn't **confirmed** isn't linked
  (2c); the app says to sign in with the password and confirm the email first.
- The button is black with Apple's logo (Apple's design guidelines).
- Needs the **Sign in with Apple** capability on the App ID (§5 step 1) and
  `App.entitlements`. fastlane makes a new signing profile once if the old
  one lacks it.
- Tested in `tests/accounts.test.ts` (Apple's signature check stood in for).

Still to do: **revoking Apple's tokens when an Apple account is deleted**.
Apple asks apps with Sign in with Apple to call its REST API's revoke
endpoint on account deletion. That needs a Sign in with Apple **key** (the
same one the website's Apple button needs) and the authorization code the
sheet gives, exchanged for a refresh token at sign-in. Do it with the
website's Apple sign-in. Later, the "other" provider in each app (Google on iOS,
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
password and confirm your email first, then you can use Apple."
Confirmation emails already work in production (the test accounts were
confirmed that way).

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

**Built** (server, app and tests); waiting for the owner's App Store setup below.

**App side** (`ios/App/App/AppStorePlugin.swift` ↔ `src/shop/appStore.ts`),
with StoreKit 2:

- `products(ids)` → Apple's localised prices; the shop shows only those, and
  a pack can't be bought until its price has arrived.
- `buy(id, account)` → Apple's payment sheet. `account` is Apple's
  `appAccountToken`: a UUID made from a hash of the player's id
  (`src/shop/appStoreAccount.ts`; the server makes the same one).
- The signed purchase goes to the server; `finish` is only called once the
  server has granted it. `unfinished` (sent again on every start and return
  to the app) and the `purchasesUpdated` listener catch the rest: no signal,
  the app closed, Ask to Buy approved later.
- `src/shop/storeBilling.ts` is the one interface in front of both stores;
  `buyCoinsInApp` and `finishStorePurchases` (`src/account/session.ts`)
  handle both. The shop says "App Store" instead of "Google Play" on iOS.

**Products:** the same ids as Google Play (`coins_200_1`, `coins_500`, …
`coins_10000`: `storeProductId` in `src/shop/catalog.ts`), type
**Consumable**.

**Server side** (`server/appStore.ts`, `POST /api/shop/apple`):

- Apple's own **`@apple/app-store-server-library`** checks the signature up
  to Apple Root CA - G3 (`server/apple/`, checked against apple.com by the
  iOS build), with revocation checks, for our bundle id, in the live store
  or the sandbox.
- Grants only a coin pack (consumable), not refunded, tagged with this
  player's UUID, once (`apple:<transactionId>`); another account's purchase
  is refused and stays for that account. The country (`storefront`, 3
  letters) is kept as 2 letters for the Japan figure (`server/storefronts.ts`).
- **Sandbox** purchases (TestFlight, sandbox testers, App Review) grant coins
  but count as £0. Because of that, **never open a public TestFlight link**:
  internal testers only.
- **Refunds:** App Store Server Notifications v2 at
  `POST /api/shop/apple/notifications`; `REFUND` / `REVOKE` take the coins
  back (once), as with Stripe and Google. Others are acknowledged.
- One server setting, `APPLE_APP_ID`, turns it on. No Apple key is needed on
  the server: checking Apple's signature only needs Apple's public certificate.
- Tests: `tests/appstore.test.ts` runs Apple's real signature checks against
  a stand-in certificate chain (genuine, changed, another app's, someone
  else's chain, refund notifications); `tests/accounts.test.ts` covers
  granting once, wrong account, sandbox £0 and refunds.

### Owner: coins in App Store Connect (after §5's steps 1–2)

1. **Paid Apps Agreement, tax and bank** (App Store Connect → Business) must
   be done first, or Apple won't sell anything, even in testing.
2. **The products.** App Store Connect → the app → **Monetization → In-App
   Purchases → +**, type **Consumable**, one per pack. The Product ID must be
   exactly as below and can never be reused:

   | Reference name | Product ID | Price (UK) |
   |---|---|---|
   | Pocket pouch | `coins_200_1` | £1.99 |
   | Coin stack | `coins_500` | £4.99 |
   | Treasure chest | `coins_1000` | £9.99 |
   | Royal hoard | `coins_2000` | £19.99 |
   | Mountain of coins | `coins_5000` | £49.99 |
   | Dragon's hoard | `coins_10000` | £99.99 |

   For each: **Price Schedule → Base country United Kingdom**, the price
   above (Apple sets the other countries). **Localization** English (U.K.):
   display name as the reference name, description e.g. "500 coins + 50
   bonus". A **review screenshot** (the shop with the packs, taken on the
   iPhone from TestFlight; the same one does for all six). The optional
   **Image** (1024×1024): `store/app-store/products/<product id>.png`, made by
   `npx tsx scripts/product-icons.ts`; where App Store Connect takes one image
   for every pack, `all-packs.png` (the six together). Apple reviews the products with the
   first app version that sells them.
3. **The server.** The app's Apple ID is the number under App Store Connect →
   the app → App Information → **Apple ID**:

   ```sh
   fly secrets set APPLE_APP_ID=1234567890
   ```

4. **Refund notifications.** App Store Connect → the app → App Information →
   **App Store Server Notifications**: Production and Sandbox Server URL
   `https://server.tardigeddon.com/api/shop/apple/notifications`, **Version 2**.
5. **Test buyers.** App Store Connect → Users and Access → **Sandbox → Test
   Accounts → +** (a made-up email works). On the iPhone: Settings →
   Developer → Sandbox Apple Account (or the App Store asks at the first
   purchase in TestFlight). Sandbox payments are free and grant coins as £0.

## 4. Ages and parents *(changing)*

**Built** (October 2026): `ios/App/App/AgeSignalsPlugin.swift` (the same JS
plugin name as Android's, `AgeSignals`, so `src/shop/ageSignals.ts` serves
both). Where Apple says the law applies (`isEligibleForAgeFeatures`, iOS 26.2+)
it asks `requestAgeRange(ageGates: 13, 16, 18)` when the coin packs open, and
under-18s see "a parent or carer may need to approve purchases. Apple will
ask them" (Ask to Buy). Elsewhere, and on older iOS, nothing is asked. In
memory only; never sent to the server. Needs the **Declared Age Range**
capability on the App ID (§5 step 1) and `App.entitlements`. Not built yet:
the Significant Change acknowledgement (`showSignificantUpdateAcknowledgment`,
`requiredRegulatoryFeatures`, iOS 26.4) for a future significant update.

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
reporting. Not in the **Kids** category: accounts and online play are 13+.

**As answered (October 2026), rated 13+:** Parental Controls No, Age
Assurance No (change to Yes now the age check is built), Unrestricted Web
Access No, User-Generated Content **Yes** (names on leaderboards, team names
and maps online; report and block), Social Media No (sharing goes out
through the phone's share sheet; no feed), Messaging and Chat No,
Advertising No; mature themes, medical, sexuality all None; Cartoon or
Fantasy Violence **Frequent**, Guns or Other Weapons **Frequent**, other
violence None; Contests **Frequent** (daily challenge leaderboards, quick-play
rating), Simulated Gambling None, Gambling No, Loot Boxes No; In-App
Purchases Yes. No override; Age Suitability URL
`https://tardigeddon.com/legal/childrens-privacy`.

## 5. Building on GitHub (no Mac): **built**, waiting for the owner's keys

Two workflows, both on GitHub's **Xcode 27 image** (`runs-on: xcode-27`,
macOS 27, generally available since 15 October 2026), with its newest Xcode
27 that isn't a beta (the App Store refuses beta builds), and they stop unless
it has the **iOS 27.1 SDK** or later. 27.1 is what makes the app fill both of
iPhone Duo's screens (built with older SDKs, it runs in an iPhone-sized box in
the middle); Apple requires the iOS 27 SDK for all uploads from April 2027:

| Workflow | When | What |
|---|---|---|
| `.github/workflows/ios.yml` | a push that changes `ios/`, the Capacitor settings or packages | Unsigned simulator build: proves the project and our Swift compile. Needs nothing from Apple |
| `.github/workflows/ios-testflight.yml` | every merge to `main` that changes the app, and **Actions → iOS TestFlight → Run workflow** | `npm run app:build`, then fastlane (`ios/fastlane/Fastfile`, lane `beta`): `match` fetches the signing certificate (making it the first time), the build is signed and uploaded to **TestFlight**. Until the secrets below exist it just says so and stops |

The version players see is `package.json`'s (`1.0.0` from the launch), as on Android; the
build number is the workflow's run number, so it goes up by itself. Minimum
iOS 15 (StoreKit 2 needs it). fastlane's version is pinned in
`ios/Gemfile.lock`.

### Owner: once Apple approves the account (about 30 minutes)

On a computer, signed in to developer.apple.com with the company's Apple
Account.

1. **Register the app's id.** developer.apple.com → Account → **Certificates,
   Identifiers & Profiles → Identifiers → +** → App IDs → App. Description
   `TardiGeddon`, **Explicit** Bundle ID `com.tardigeddon.app`. Under
   Capabilities, **In-App Purchase** is already on; also tick **Sign in with
   Apple** and **Declared Age Range** (both are in `App.entitlements`; a
   signed build fails until the App ID has them). Continue → Register. Ticked
   later on an existing App ID: Identifiers → `com.tardigeddon.app` → tick →
   Save; the next TestFlight build makes a new signing profile by itself.
2. **Create the app.** appstoreconnect.apple.com → **Apps → + → New App**:
   iOS, name `TardiGeddon`, primary language English (U.K.), bundle ID
   `com.tardigeddon.app`, SKU `tardigeddon-ios`, User Access: Full Access.
3. **An API key for GitHub.** App Store Connect → **Users and Access →
   Integrations → App Store Connect API → Team Keys → +**. Name `GitHub`,
   access **App Manager**. Note the **Key ID** and, above the list, the
   **Issuer ID**. **Download** the `.p8` file (Apple only lets you do this
   once: keep it in the password manager).
4. **The signing repo.** GitHub → New repository → `EVCV/tardigeddon-signing`,
   **Private**, nothing else. fastlane keeps the certificate there, encrypted.
5. **A token that can use it.** GitHub → your picture → Settings → Developer
   settings → **Fine-grained tokens → Generate new token**: name
   `fastlane match`, expiry 1 year (put a reminder in the calendar),
   Repository access **Only select repositories** → `tardigeddon-signing`,
   Permissions → **Contents: Read and write**. Copy the token.
6. **Make up a password** for the signing repo (long and random) and save it
   in the password manager. Losing it means making new certificates, nothing
   worse.
7. **Add five secrets** to this repo: **Settings → Secrets and variables →
   Actions → New repository secret**. In PowerShell, in the folder with the
   `.p8` file, these copy the two encoded ones to the clipboard:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
   [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("EVCV:github_pat_...the token...")) | Set-Clipboard
   ```

   | Name | Value |
   |---|---|
   | `ASC_KEY_ID` | the Key ID (step 3) |
   | `ASC_ISSUER_ID` | the Issuer ID (step 3) |
   | `ASC_KEY_P8_BASE64` | the `.p8` file as text (first command) |
   | `MATCH_PASSWORD` | the password from step 6 |
   | `MATCH_GIT_BASIC_AUTHORIZATION` | `EVCV:` + the token, as text (second command) |

8. **Run it.** **Actions → iOS TestFlight → Run workflow** (branch `main`).
   About 15 minutes. The first run makes the distribution certificate and
   saves it to the signing repo.
9. **Install it.** App Store Connect → the app → **TestFlight**. Apple
   processes the build for 10–30 minutes. Then **Internal Testing → +**: a
   group called `EVCV`, add yourself. Install **TestFlight** from the App
   Store on the iPhone and the iPad, sign in with the same Apple Account,
   and install TardiGeddon from there. Each later build arrives the same way.

Export compliance is answered by `Info.plist` (standard encryption only), so
Apple doesn't ask at each upload. Internal testers (up to 100) need no
review; external testers need a short beta review.

## 6. Store listing, privacy and legal

- **Listing:** reuse Google Play's text. Apple adds a 30-character
  **subtitle** (e.g. "Tiny tardigrade artillery") and a 100-character
  **keywords** field. Category **Games → Strategy** (second: Casual).
- **Screenshots** (up to 10 per size, PNG/JPEG, no transparency):
  - iPhone, **required**: landscape **2622×1206** (or 2556×1179);
  - iPad 13-inch, **required since we support iPad**: landscape **2752×2064**
    (or 2732×2048);
  - **iPhone Duo: required for every app from April 2027**, across its poses
    (outer screen, open), sizes in App Store Connect's screenshot
    specifications. Sending them early earns the "optimized for iPhone Duo"
    badge on the product page.

  **Made**: `store/listing/<lang>/app-store/` by `scripts/store-art.ts`, with
  the listing text, in `docs/STORE_LISTING.md`.
- **App Privacy** labels: the same facts as Google's Data safety: email,
  name, user id, gameplay data, purchase history, user content (team names).
  All **linked to the user**, **no tracking**, purpose App Functionality.
  Plus **Usage Data → Product Interaction** (the anonymous play counts,
  `docs/USAGE.md`), and **Diagnostics → Crash Data** (error counts by kind
  and place, never the message), **Diagnostics → Performance Data** (loading
  times in bands) and **Diagnostics → Other Diagnostic Data** (online
  desyncs, graphics or sound failing): all **not linked to the user**, no
  tracking, purpose **Analytics**. No tracking means no App Tracking Transparency prompt. Keep it in step with
  `site/legal/` (`CLAUDE.md`). Sign in with Apple adds nothing new (name,
  email).
- **Privacy manifest** `ios/App/App/PrivacyInfo.xcprivacy`: no tracking,
  plus the reason for each "required reason" API we or Capacitor use
  (e.g. UserDefaults). Apple refuses uploads without it.
- **Export compliance:** HTTPS only, so `ITSAppUsesNonExemptEncryption = NO`
  in `Info.plist`.
- **Legal pages: done** (31 October 2026): Privacy Policy v2.12 (2.0.4A age
  range, 2.2.1 Sign in with Apple and Hide My Email, 2.3.4A and 4.0.4B App
  Store purchases, Section 11), Terms v2.3 (5.1.5A, 5.7.2 Apple's standard
  licence), Cookie & Storage v1.9 (Keychain token), Children's Privacy v1.10,
  Delete your account v1.2.
- **App Review notes:** give a demo account (reviewers like to see the shop
  signed in). Say coins are cosmetic only, and that coins bought on the
  website or Android also spend here (Guideline 3.1.3(b)).
- **Countries:** everywhere except **Vietnam** (online games need a licence),
  **China mainland** (games need a government licence, an ISBN approval
  number), and **South Korea** until we have a GRAC rating number (Age
  Ratings asks for one). Apple itself leaves out **Afghanistan and Morocco**
  for this age rating.
- **As set up in App Store Connect (October 2026):** app Apple ID
  `6826841030` (`APPLE_APP_ID` on the server), primary language English
  (U.K.), Games → Strategy + Casual, Content Rights "Yes, has the rights"
  (open-source fonts and code, players' names and maps), Apple's Standard
  License Agreement, EU trader status, App Store Server Notifications v2 at
  `/api/shop/apple/notifications` (production and sandbox), version 1.0.0
  (`package.json`). App Privacy: Name, Email Address, **Contacts** (the
  friends list counts as a social graph), Gameplay Content, Other User
  Content, User ID, Purchases (linked, App Functionality); Product
  Interaction, Crash Data, Performance Data, Other Diagnostic Data (not
  linked, Analytics); no tracking. Privacy Policy URL
  `https://tardigeddon.com/legal/privacy-policy`, User Privacy Choices URL
  `https://tardigeddon.com/legal/delete-account`. Names and subtitles per
  language: `docs/STORE_LISTING.md`.

## 7. The Xcode project: **built**

`ios/` (Capacitor 8, Swift Package Manager: no CocoaPods), opened with
`npm run app:ios` on a Mac. `npm run app:build` copies the game into it, as
for Android. `.github/workflows/ios.yml` builds it for the simulator, unsigned,
whenever the iOS side changes: that's the check that the Swift compiles.

| What | Where |
|---|---|
| Our screen: Capacitor's web view, edge swipes need a second swipe, our plugins | `ios/App/App/GameViewController.swift` |
| Home bar fades away while playing (Capacitor's SystemBars) | `src/native.ts` |
| The sign-in token in the Keychain (this device only) | `ios/App/App/AuthTokenPlugin.swift` ↔ `src/account/token.ts` |
| Sound mixes with the player's music and follows the silent switch; the screen stays on | `AppDelegate.swift` (+ `navigator.audioSession` in `src/native.ts`) |
| Orientations, no status bar, `ITSAppUsesNonExemptEncryption = NO`, arm64 | `Info.plist` |
| Privacy manifest (no tracking; what an account holds) | `PrivacyInfo.xcprivacy` |
| Settings: `capacitor://app.tardigeddon.com`, no bounce, iPad gets the touch game | `capacitor.config.ts` → `ios` |
| Icon and splash | `npx @capacitor/assets generate --ios --iconBackgroundColor '#7fd3f7' --splashBackgroundColor '#7fd3f7'` (from `assets/`) |

Minimum iOS 15. Version 1.0.0 (from `package.json`); the build number comes
from the TestFlight build (§5).

- **Launch screen:** Capacitor's storyboard. Apple requires one from the iOS
  27 SDK.
- **iPhone:** landscape only (`UISupportedInterfaceOrientations`).
- **Apple's foldable, iPhone Duo** (out 23 October 2026, iOS 27.1; Apple's
  "Preparing your app for iPhone Duo"):
  - **Built with the iOS 27.1 SDK** (§5), the app fills the outer screen and
    the open one, and moves between them as the phone folds without
    restarting (it's a resize; `SceneDelegate` uses `UIWindow(windowScene:)`,
    as Apple asks, never the screen's size).
  - **Outer screen** (5.4", ~466×678 points): a phone; landscape, phone menu.
  - **Open screen** (7.6", ~626–669 × 890–951 points; Apple's point sizes
    aren't published yet): plays **either way up**. Apple says the open
    screen may not keep an app's orientation lock and wants games playable
    in every pose, so "Turn your phone sideways" only covers windows under
    600px wide.
  - **Split View** (two apps on the open screen): the game redraws as the
    divider moves; a half too narrow to play in asks to "Make the window
    wider".
  - Tested at the published sizes (`e2e/foldable.spec.ts`); try it on a real
    one through TestFlight.
- **iPad: portrait and resizable windows have to work.** Since iPadOS 26
  the "full screen only" setting (`UIRequiresFullScreen`) is deprecated.
  With the iOS 27 SDK it's ignored: the app can be put in a resizable
  window, and resizable apps must support **every orientation**. **Done:**
  - all four orientations on iPad (`Info.plist`); no orientation lock is
    needed, since the game plays upright as well as sideways;
  - the game **plays in iPad portrait**: the menu reflows into one column, the
    match keeps its touch controls and the map scrolls sideways as on a phone,
    and a match redraws when the iPad is turned mid-game;
  - "Turn your phone sideways" (`src/ui/landscape.ts`, `#rotate` in
    `style.css`) only covers windows under 600px wide: upright phones, and a
    thin split-screen window on a tablet, which is asked to "Make the window
    wider" instead;
  - between 981 and 1499px wide the lobby is two columns, and the title is
    sized to its half (it ran out of its card on an upright 13-inch iPad);
  - `e2e/tablet.spec.ts` checks all of this.
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
| 2 | ✅ Token sign-in + WebSocket tickets (server + app, tests), off on Android. | Code | — |
| 3 | ✅ `ios/` project: orientations, full screen, sound, icons, launch screen, privacy manifest, Keychain plugin; simulator build on GitHub | Code | — |
| 4 | ✅ iPad portrait and resizable windows in the web game (`e2e/tablet.spec.ts`) | Code | — |
| 5 | ✅ `ios-testflight.yml` + fastlane: build, sign, upload to TestFlight. Left: the owner's keys (§5) | Code + owner (API key, secrets) | 1, 3 |
| 6 | First TestFlight build on the iPhone and iPad: play, sign in, online, tutorial, rotate, split screen | Owner | 2–5 |
| 7 | ✅ One interface for both stores; `AppStorePlugin.swift`, `appStore.ts` | Code | 3 |
| 8 | ✅ `server/appStore.ts`, notifications, tests. Left: products, `APPLE_APP_ID`, notification URL (§3) | Code + owner | 1, 7 |
| 9 | Sandbox purchases on TestFlight: pay, refund, app closed mid-purchase, wrong account | Owner | 6, 8 |
| 10 | ✅ Sign in with Apple in the app (§2b). Left: Google in the iOS app, "Link Apple/Google", add a password, revoking Apple tokens on deletion; Apple and Google web keys on the server | Code + owner (Apple and Google keys) | 2 |
| 11 | ✅ Age range for the coin shop (§4). Left: Significant Change acknowledgement, consent notifications; sandbox-test it all | Code | 7, 8 |
| 12 | ✅ Screenshots, listing, App Privacy, age rating, legal pages | Code + owner | 6 |
| 13 | Submit for review | Owner | all |

Steps 2, 3 and 4 can start now and don't touch the Android release.
