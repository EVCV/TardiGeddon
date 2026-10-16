# Google Play: from account to first release

Everything to get TardiGeddon onto Google Play, in the order the Play Console
asks for it, with the answers already worked out from what the game does. The
app itself is described in `docs/APPS.md`.

The developer account is an **Organisation** account for EVCV Limited
(D-U-N-S verified). Organisation accounts don't have the "12 testers for
14 days" rule that new personal accounts have.

## 1. The upload key (once, on your computer)

Google signs the app that players download (**Play App Signing**). We sign
what we upload with an *upload key*. Make it once, on your own computer, with
Java's `keytool`.

**On Windows (PowerShell):**

1. Install Java, then **close and reopen PowerShell**:
   `winget install --id EclipseAdoptium.Temurin.21.JDK -e`
2. Make the key (one line; PowerShell doesn't use `\` to continue lines):

   ```powershell
   keytool -genkeypair -v -keystore tardigeddon-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   If `keytool` still isn't found:
   `& (Get-ChildItem "C:\Program Files\Eclipse Adoptium\*\bin\keytool.exe" | Select-Object -First 1).FullName -genkeypair -v -keystore tardigeddon-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
3. Copy it as text to the clipboard, for the GitHub secret:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\tardigeddon-upload.jks")) | Set-Clipboard
   ```

**On a Mac or Linux:**

```sh
keytool -genkeypair -v -keystore tardigeddon-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -i tardigeddon-upload.jks -o key.txt    # Linux: base64 -w0 tardigeddon-upload.jks > key.txt
```

`keytool` asks for a password (one password covers the file and the key: save
it in a password manager), your name, organisation (`EVCV Limited`), city,
county and country code (`GB`). Then:

1. **Back the `.jks` file and password up somewhere safe.** If the upload key
   is lost, Google can reset it, but it takes days.
2. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**, and add four:

   | Name | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | the key as text (clipboard, or the contents of `key.txt`) |
   | `ANDROID_KEYSTORE_PASSWORD` | the password you chose |
   | `ANDROID_KEY_ALIAS` | `upload` |
   | `ANDROID_KEY_PASSWORD` | the same password |

3. Delete `key.txt` if you made one. Never commit or email the `.jks` file.

From then on, every merge to `main` builds **`tardigeddon-release-N`** in
GitHub Actions (**Actions → Android app → the run → Artifacts**). To build one
straight away, without waiting for a merge: **Actions → Android app → Run
workflow** (branch `main`). It contains:

- `app-release.aab`: what you upload to Google Play;
- `app-release.apk`: the same app, signed, to install on a phone directly.
  These install over each other, no uninstalling.

The version number Google sees (`versionCode`) is the build's run number, so
it goes up by itself with every build. The version players see is the one in
`package.json` (`0.1.0` now).

## 2. Create the app

**Play Console → Create app:**

| Field | Answer |
|---|---|
| App name | `TardiGeddon` |
| Default language | English (United Kingdom) – en-GB |
| App or game | Game |
| Free or paid | Free |
| Declarations | Tick both (Developer Programme Policies, US export laws) |

Then **Setup → App signing**: accept Play App Signing (Google holds the app
signing key; we keep the upload key).

## 3. Store listing (Grow → Store presence → Main store listing)

**App name:** TardiGeddon

**Short description** (80 characters max):

> Turn-based artillery battles starring tiny, indestructible tardigrades.

**Full description:**

> Tiny. Indestructible. Armed.
>
> Tardigrades can survive space, boiling water and being frozen solid. Now
> they've found the weapons cupboard. TardiGeddon is a cartoon turn-based
> artillery game: take turns to walk, aim and fire across a landscape you can
> blow holes in, and be the last team standing.
>
> • Over 20 weapons and tools: spore bazookas, pebble grenades, raindrop
>   strikes, a silk rope to swing on, teleports, girders and more, plus season
>   weapons you unlock by playing
> • Wind, mines, brine drums, supply crates and sudden death
> • Play against the computer, pass the phone round with friends (2–10 teams),
>   or play online: quick play or a private room with a code
> • A step-by-step tutorial for brand-new players
> • Dress your team up with hats, skins, aim styles and explosion effects
> • Controls you can change, including left-handed and bigger buttons
>
> Fair play: everything that changes how the game plays is earned by playing.
> Shop items only change how your team looks. No adverts, and no account
> needed: sign in only if you want your stats and items on every device.

**Graphics** (all in `store/google-play/`, made by `scripts/store-images.mjs`):

| Slot | File |
|---|---|
| App icon (512×512) | `docs/brand/tardigeddon-icon-512.png` |
| Feature graphic (1024×500) | `store/google-play/feature-graphic.png` |
| Phone screenshots (2–8) | `phone-1-home.png` … `phone-7-tutorial.png` (1920×1080) |
| 7-inch tablet screenshots | `tablet7-1-lobby.png`, `tablet7-2-match.png` |
| 10-inch tablet screenshots | `tablet10-1-lobby.png`, `tablet10-2-match.png` |

Suggested phone order: 4 (aim), 6 (battle), 5 (weapons), 1 (home), 3 (team),
7 (tutorial), 2 (setup). The first three are what people see in search.

**Category:** Game → Strategy. **Tags:** Artillery, Turn-based strategy,
Multiplayer, Casual (pick what the list offers).

**Contact details:** email `support@tardigeddon.com`, website
`https://tardigeddon.com`. A phone number is optional.

New screenshots after the game changes: `npm run build`, `npx vite preview
--port 4173` (and `npm run server` with accounts, for the full home screen),
then `PW_CHROMIUM_PATH=… node scripts/store-images.mjs`.

## 4. App content (Policy → App content)

Answer each section:

**Privacy policy:** `https://tardigeddon.com/legal/privacy-policy`

**Ads:** No, the app doesn't contain ads.

**App access:** All functionality is available without special access.
(Accounts are optional and anyone can make one, so reviewers need no login.)

**Advertising ID:** No, the app doesn't use one.

**Content rating:** start the questionnaire (IARC), category **Game**, email
`support@tardigeddon.com`, and answer:

| Question | Answer |
|---|---|
| Violence | Yes: cartoon/fantasy violence. Characters are knocked about and "pop" when out of health; no blood, gore or realistic violence, not against humans |
| Fear / horror | No |
| Sexuality, nudity | No |
| Language (crude humour, swearing) | No |
| Controlled substances (drugs, alcohol, tobacco) | No |
| Gambling, simulated gambling | No |
| Users can interact or exchange information | Yes: online multiplayer, where other players see your team and tardigrade names. There is no chat |
| Shares the user's location | No |
| Digital purchases | No, for now: coins can't be bought in the app yet (see §7). Change this when Google Play Billing is added |
| Unrestricted internet access (a browser) | No |

Expect a low rating such as PEGI 7 / Everyone 10+; IARC decides.

**Target audience and content:** our terms say online play and accounts are
for **13 and over**, so pick the age groups **13–15, 16–17 and 18+**. Not
under 13: choosing under-13s brings in Google's Families policy, which our
online play and accounts aren't set up for. To "could the app unintentionally
appeal to children?" answer honestly: it's a cartoon, so **yes, possibly**,
and point to the Children's Privacy page
(`https://tardigeddon.com/legal/childrens-privacy`). Google may then ask for
a short explanation; ours: no ads, no chat, no data collected without an
account, accounts 13+ self-declared.

**News app:** No. **COVID-19 apps:** No. **Government app:** No.
**Financial features:** None. **Health:** No.

**Data safety:**

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | Yes (collect; nothing is shared) |
| Is all collected data encrypted in transit? | Yes (HTTPS and secure WebSockets) |
| Can users ask for their data to be deleted? | Yes: in the game (Account → Delete account), or by emailing privacy@tardigeddon.com |
| Delete-account link (Google asks for a web page) | `https://tardigeddon.com/legal/privacy-policy` (section 5.1.4 explains it) |

Data types to tick, all **collected, not shared, optional** (only with an
account), purpose **App functionality** and **Account management**:

| Data type | What it is in TardiGeddon |
|---|---|
| Personal info → Email address | the account's email |
| Personal info → Name | the player name on the account (not necessarily a real name) |
| Personal info → User IDs | the account's id |
| App activity → In-app actions | game stats (wins, pops, damage), items owned, coin and Slime balances, control settings |

Also tick, as **collected, processed ephemerally** (kept in memory only, for the
match), purpose **App functionality**: **App activity → Other user-generated
content** (team and tardigrade names shown to other players in online play;
showing them to the other players is something the player chooses, so it
isn't "sharing" in Google's sense).

Not collected: location, contacts, photos, files, audio, health, financial
or payment info (no purchases in the app yet), device IDs, crash logs,
diagnostics, browsing history. Sign-in providers (Google, Apple) are off in
the app.

## 5. First release: internal testing

1. **Test and release → Testing → Internal testing → Create new release.**
2. Upload `app-release.aab` from the latest `tardigeddon-release-N`.
3. Release name: the version (e.g. `0.1.0 (12)`). Notes: "First test build."
4. **Testers:** create an email list with your own Google account(s) and save.
5. Roll out, then open the **"Join on the web"** link on your phone and
   install from Google Play.

Before going further, check on a real phone from Play: sign in (needs
`TRUSTED_ORIGINS` on the server, `docs/APPS.md`), online play, the back
button, the tutorial, and that links open in the browser.

## 6. Production

When the internal build is good: **Production → Create new release**, use
the same `.aab` (or a newer one), choose **countries** (the game plan
suggests a few countries first, e.g. the UK and Ireland, then the rest), and
**Send for review**. The first review usually takes a few days.

## 7. Later

- **Buying coins in the app:** Google requires Google Play Billing for digital
  items, so the app hides coin packs for now. Next step: RevenueCat (planned in
  `GAME_PLAN.md`) with the server granting the coins, then update the content
  rating ("digital purchases: yes") and the Data safety form (purchase history).
- **Google sign-in** with the phone's account picker.
- **App links:** `https://tardigeddon.com/play/?room=…` opening the app. Needs
  `/.well-known/assetlinks.json` on the website with the **app signing**
  key's SHA-256 (Play Console → App signing).
