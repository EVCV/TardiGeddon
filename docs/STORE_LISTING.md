# Store listings (Google Play and the App Store)

What players see before they install: the name, the words, the pictures. The
same design on both stores, in all six of the game's languages (English,
Spanish, Brazilian Portuguese, German, French, Japanese).

| What | Where |
|---|---|
| Words (name, short text, description, App Store subtitle, promo text, keywords) | `store/listing/listing.json` |
| Screenshot headlines | `store/listing/captions.ts` |
| Pictures | `store/listing/<lang>/google-play/`, `store/listing/<lang>/app-store/` (English in the repo; every language from **Actions → Store images → Run workflow**, a zip to download from the run) |
| The script that makes them | `scripts/store-art.ts` |

`tests/listing.test.ts` checks every language fits each store's limits and
avoids what their rules forbid ("free", prices, "#1"/"best", "download now",
other games' names, the app name repeated in Apple's keywords).

## The pictures

Each screenshot is a real moment from the game (played by the script, in that
language), in a tilted frame, with a big headline, a line under it, and the
mascot in a different hat, on its own colour:

1. **Tiny. Indestructible. Armed.**: a battle, a shot in the air
2. **Blow the world to bits**: a bazooka hitting a hillside
3. **20+ silly weapons**: the weapon panel
4. **Swing on the Silk Rope**: Rope Race
5. **Call in a Raindrop Strike**: the drops landing
6. **Up to 10 teams**: Match setup
7. **Dress up your team**: the team editor
8. **7 wild realms**: a realm from further out

The first three are what people see in search results, so they're the action.
Upload them in this order.

| Store slot | Files | Size |
|---|---|---|
| Play: phone screenshots | `google-play/phone-1…8-*.jpg` | 1920×1080 |
| Play: 7-inch and 10-inch tablet screenshots | `google-play/tablet-1…8-*.jpg` (the same set for both) | 2560×1600 |
| Play: feature graphic | `google-play/feature-graphic.jpg` | 1024×500 |
| Play: app icon | `docs/brand/tardigeddon-icon-512.png` | 512×512 |
| App Store: iPhone | `app-store/iphone-1…8-*.jpg` | 2622×1206 |
| App Store: iPad 13-inch | `app-store/ipad-1…8-*.jpg` | 2752×2064 |

To make them again after the game changes: **Actions → Store images → Run
workflow** (leave the languages blank for all six; about 4 minutes a
language), then download `store-listing` from the run. Or on a computer:

```
npm run build && npx vite preview --port 4173
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx scripts/store-art.ts        # all languages
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx tsx scripts/store-art.ts de     # one
SHOT=rope … npx tsx scripts/store-art.ts en                                     # one picture
```

The pictures always use the classic sky world (not a seasonal one) and hide
the help bubbles. New headline text goes in `captions.ts`, in every language;
the game's own names for weapons, modes and realms keep the store and the game
saying the same thing.

## Google Play: where it goes

**Grow → Store presence → Main store listing**, in English (United Kingdom)
as the default:
- **App name**, **Short description**, **Full description** from
  `listing.json` → `en.play`.
- **Graphics:** the table above.
- **Video** (optional, and worth it): a YouTube link to the trailer. It plays
  where the feature graphic shows.

**Translations:** Main store listing → **Manage translations** → add es-419
and es-ES, pt-BR, de-DE, fr-FR and ja-JP. For each, paste that language's text
from `listing.json` (not machine translation) and upload its pictures from
`store/listing/<lang>/google-play/`.

**Category:** Game → Strategy. **Tags:** Artillery, Turn-based strategy,
Multiplayer, Casual.

### The rest of Google's checklist

- **Custom store listings** (up to 50, by country or for ad campaigns):
  not needed at launch. The translations already cover each language. Worth
  one later for a seasonal event, or for Japan with its own headline order.
- **Store listing experiments** (Grow → Store listing experiments): once
  there are a few hundred visitors a day, test the first screenshot or the
  short description against a variant. Change one thing at a time.
- **The Store Listing Certificate** (Google's free course): optional. The
  listing already follows its main advice: action first, words on the
  pictures, every language translated, no claims Google forbids.

## App Store: where it goes

**App Store Connect → the app → App Store tab**, for each language
(English (U.K.) as primary, then Spanish (Mexico) and Spanish (Spain),
Portuguese (Brazil), German, French, Japanese):
- **Name** (`appStore.name`), **Subtitle** (`appStore.subtitle`). A name
  can be used by only one app, and once only: plain "TardiGeddon" is the
  English (U.K.) page's, so the other languages add words to it, and the
  two kinds of Spanish need different ones. Apple also refused a subtitle
  that repeated a word from its name. As entered (October 2026):

  | Language | Name | Subtitle |
  |---|---|---|
  | English (U.K.) | TardiGeddon | Tiny tardigrade artillery war |
  | Spanish (Spain) | TardiGeddon: Batalla artillera | Pequeños, duros y armados |
  | Spanish (Mexico) | TardiGeddon: Guerra de cañones | Artillería de tardígrados |
  | Portuguese (Brazil) | TardiGeddon: Batalha de canhão | Pequenos, duros e armados |
  | German | TardiGeddon: Artillerie-Duell | Bärtierchen-Artilleriekrieg |
  | French | TardiGeddon : Duel de canons | La guerre des tardigrades |
  | Japanese | TardiGeddon：クマムシ砲撃バトル | ちっちゃい不死身の砲撃戦 |

  Spanish (Mexico) is only here (`listing.json` has one Spanish).
- **Promotional Text** (`appStore.promo`): can be changed any time without a
  new build, so use it for events ("Halloween world free until 2 Nov").
- **Description**: the same as Google Play's full description (`play.full`).
- **Keywords** (`appStore.keywords`): comma-separated, no spaces, never the
  app's name (Apple adds that already) or other games' names.
- **Screenshots:** iPhone and iPad 13-inch from `store/listing/<lang>/app-store/`.
  Apple scales them down for smaller iPhones and iPads.
- **Header and Search Results** (optional, the version page's first tab):
  `store/app-store/header.jpg` (21:9, 3840×1646) and
  `store/app-store/search-result.jpg` (3:2, 3840×2560), made by
  `npx tsx scripts/app-store-header.ts`. No words, so the same pair does for
  every language; Apple puts the name and icon over the header.
- **App Preview video** (optional): up to 30 seconds of real play, recorded
  from the device.
