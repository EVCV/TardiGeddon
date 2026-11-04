# Steam plan

Status: **plan, not started** (4 Nov 2026). Decisions are in §7. Facts about
Steam below are from memory: check them in Valve's Steamworks documentation
(partner.steamgames.com/doc) as you go, as fees and rules change.

## 1. Do we need Steam just to "save the name"?

No, and you can't, quite: Steam has no way to reserve a name on its own.
A game's name is only held once you've paid the **Steam Direct fee** (about
**$100 per game**, refunded to you once the game earns about $1,000 on Steam)
and created the app in Steamworks. Even then, Steam doesn't stop another game
using a similar name.

What protects the name is what we already have: the domain
(tardigeddon.com), the app store listings, the social handles, and if you
want legal protection, a **UK trade mark** for "TardiGeddon" (classes 9 and 41,
about £170 to £200 online at gov.uk). That's worth more than a Steam page.

So: **only pay for Steam when we decide to ship on Steam.**

## 2. Is Steam worth it for TardiGeddon?

**For:**
- PC players are the biggest audience for turn-based artillery games, and
  Steam is where they look. A "Coming soon" page collects **wishlists**, which
  Steam turns into a big launch-day email to everyone who wishlisted it.
- Free-to-play games are welcome on Steam, with cosmetic in-game purchases.
- Steam Deck owners love this kind of game.

**Against, or work to plan for:**
- **A desktop build:** the game is a web app, so it needs wrapping as a desktop
  program (Tauri, as `docs/GAME_PLAN.md` already plans), tested on Windows,
  Mac and Linux or Steam Deck.
- **Gamepad controls:** needed for Steam Deck "Verified" (and expected on
  Steam). TardiGeddon has keyboard, mouse and touch, but no gamepad yet.
- **Payments inside a Steam build must go through Steam** (its
  microtransaction system, Steam Wallet), like Apple and Google in their apps:
  coin packs would be Steam products, with Steam's 30% share, and the server
  would check Steam purchases as it does Google's and Apple's.
- **Sign-in with Steam** would need adding (the server checks a Steam session
  ticket), linked to TardiGeddon accounts so coins and looks carry over.
- Steam's store page, trailer, capsule art in many sizes, and its own content
  and age questions.

## 3. The two ways to start

| | Cost | What you get |
|---|---|---|
| **A. Store page only, now** | $100 fee | A "Coming soon" page collecting wishlists while we build the Steam version. Valve reviews the page (a few days). Release whenever the build is ready |
| **B. Wait** | nothing | Do it all together once the PC build is underway |

**Recommendation: B until the launch (1 December) is done, then A in
early 2027** if the launch goes well. Steam advice is that a page should
collect wishlists for months before release, so start the page early once we
know we'll do it.

## 4. Setting up Steamworks (when we start)

1. **partner.steamgames.com → Join Steamworks** with a company Steam account
   (`developer@tardigeddon.com`, Steam Guard on).
2. **Company:** EVCV Limited, its address, bank account (pays in GBP or USD).
3. **Tax interview:** a **W-8BEN-E**, the same answers as the one you've just
   done (Corporation, United Kingdom, the company UTR, the treaty claim).
4. **Identity check** of a director (Valve's verification), then pay the
   **Steam Direct fee** for one app.
5. Valve asks you to wait about **30 days** after paying before you can
   release (the store page can go up sooner, after Valve reviews it).
6. Name the app **TardiGeddon**.

## 5. What to build (when we decide to ship)

1. **Desktop build** with Tauri (Windows first, then Mac and Linux / Steam
   Deck), loading the same game, saving offline like the web version.
2. **Gamepad support** (aim with the stick, buttons for fire, jump, weapons),
   also good for the web game and phones with controllers.
3. **Steam sign-in** linked to TardiGeddon accounts.
4. **Steam purchases:** coin packs (and anything else sold) as Steam items;
   the server checks and grants them, like `server/googlePlay.ts`.
5. **Store page:** description from `docs/social/README.md` (never mention
   Worms), screenshots and trailer from the game, capsule art.
6. **Steam extras, later:** achievements, Steam Cloud is not needed (accounts
   already sync), rich presence for "in a match".

## 6. Rough order and size

| Step | Size |
|---|---|
| Trade mark (optional, any time) | an evening, about £170 to £200 |
| Steamworks account, fee, store page | a day, $100 |
| Gamepad support | about a week |
| Tauri desktop build and testing | about a week |
| Steam sign-in and purchases | about a week |
| Capsule art, trailer, page | a few days |

## 7. Decisions for the owner

1. Do we want a Steam version at all, and roughly when (suggested: decide in
   January, after the launch)?
2. Store page early (option A) to collect wishlists, or wait (option B)?
3. A UK trade mark for "TardiGeddon": worth doing whatever happens with Steam.
