# Social accounts

TardiGeddon's social accounts, set up one platform at a time. Each platform
has its own guide with everything to paste in; this page holds what they
share: names, the bios, the voice and the rules.

| Platform | Account | Status | Guide |
|---|---|---|---|
| Discord | developer@tardigeddon.com, server "TardiGeddon" (ID `1563291030382706768`), [tardigeddon.com/discord](https://tardigeddon.com/discord) | Live (set up by `scripts/discord-setup.ts`) | [DISCORD.md](DISCORD.md) |
| YouTube | [@TardiGeddon](https://www.youtube.com/@TardiGeddon) | Live | [YOUTUBE.md](YOUTUBE.md) |
| TikTok | [@tardigeddon](https://www.tiktok.com/@tardigeddon) | Live | [TIKTOK.md](TIKTOK.md) |
| Bluesky | [@tardigeddon.com](https://bsky.app/profile/tardigeddon.com) | Live | [BLUESKY.md](BLUESKY.md) |
| Instagram, X, Reddit, Threads, Facebook | | Later, one at a time | |

Pictures for every platform: `npx tsx scripts/social-images.ts` writes them
to `store/social/` (see the table at the end). They're drawn from the game's
own art, so redraw them after the mascot or logo changes.

## Names

- **Name everywhere:** TardiGeddon (capital T, capital G).
- **Handle:** `@TardiGeddon` where capitals are allowed, `tardigeddon` where
  they aren't. If it's taken, `TardiGeddonGame`, then `PlayTardiGeddon`.
- **Sign-ups:** use a tardigeddon.com address (developer@ or support@), never
  a personal one, so the accounts belong to the company. Turn on two-step
  sign-in with an authenticator app, and keep the backup codes somewhere
  safe that isn't the same email inbox.

## Bios (copy as is)

Use the longest one that fits.

**30 characters:** Tiny. Indestructible. Armed.

**80 characters:** Free turn-based artillery game starring tardigrades. Play in your browser.

**160 characters:** TardiGeddon: a free turn-based artillery game starring tardigrades. Blast the map, mind the wind, last tardi standing wins. No download, no ads.

**One paragraph** (the same as the press kit, so they always agree):

> TardiGeddon is a free turn-based artillery game starring tardigrades. Teams
> take turns to walk, aim and fire across destructible maps, allowing for the
> wind, with 29 weapons from the Spore Bazooka to the Concrete Tun. Every
> match is a new map in one of 7 styles, from floating Sky Realms to
> tunnel-riddled Caverns. Play against the computer, with up to 10 teams on
> one device, or online with friends, plus a new daily challenge with
> leaderboards. It plays in any modern browser on computers, phones and
> tablets, with no download, no ads, and nothing to buy that helps you win.

**Links:** tardigeddon.com/play (the game) first, then tardigeddon.com.
Contact: support@tardigeddon.com.

**Hashtags:** #TardiGeddon always; then two or three of #indiegame
#browsergame #indiedev #gamedev #tardigrade #artillerygame #turnbased.

## Voice

Cheerful, short, a bit silly, never mean. The tardis are tough little
heroes; explosions are cartoon. Write the way the game's own text reads
("Mind the gaps."). British spelling.

## Rules for every post

- **Never say "Worms"** or name other games to borrow their audience, in
  titles, tags, hashtags or bios (game plan §1). Say "turn-based artillery".
  Players will make the comparison themselves; that's fine, we just don't.
- **Fair play is the selling point:** money only buys looks, weapons unlock
  with Slime earned by playing. Never suggest you can buy power or Slime.
- **Promo codes** go up on tardigeddon.com/promo-codes first, then the
  socials link there.
- **Kids:** the game is a cartoon with no chat, made to be safe for
  children. Social platforms with chat (Discord) are 13+, so link to them from
  the website and other socials, not from inside the game.
- **Music and clips:** only the game's own footage and sound, YouTube's
  Audio Library, or a platform's licensed sounds. No chart music.
- **AI:** the art is made with AI tools and checked by people (our AI Policy
  says so). Cartoon footage doesn't need the platforms' "realistic altered
  content" labels; answer "No" to those.
- Reply to people. A thank-you or a straight answer to a bug report does more
  than another advert.

## After each platform goes live

1. Add it to `sameAs` on the Organization in `site/src/seo.ts` and to the
   "Game" links in the site footer (`site/src/components/Layout.tsx`).
2. Link it from the other platforms' link lists.
3. Update the status in the table above.

## Pictures (`store/social/`)

| File | Size | Where |
|---|---|---|
| `youtube-banner.png` | 2560×1440 | YouTube banner (text inside the middle 1546×423) |
| `youtube-avatar.png` | 800×800 | YouTube picture; also fine as any round profile picture |
| `youtube-watermark.png` | 150×150 | YouTube video watermark |
| `youtube-thumb-trailer.png` | 1280×720 | Thumbnail for the trailer |
| `youtube-thumb-template.png` | 1280×720 | Layout to copy for gameplay thumbnails |
| `shorts/teaser.mp4` | 1080×1920, 25 s | First YouTube Short (also suits TikTok, Reels) |
| `bluesky-banner.png` | 3000×1000 | Bluesky profile banner (avatar covers the bottom-left) |
| `reddit-banner.png` | 1920×384 | r/TardiGeddon banner (phones crop the sides) |
| `reddit-profile-banner.png` | 1600×500 | Reddit profile banner (the profile shows about 3.2:1) |
| `reddit-icon.png` | 256×256 | r/TardiGeddon community icon |
| `facebook-cover.png` | 1640×624 | Facebook Page cover (phones show only the middle; the profile picture covers the bottom-left) |
| `twitch-banner.png` | 1200×480 | Twitch profile banner |
| `twitch-offline.png` | 1920×1080 | Twitch video player banner when not live |
| `twitch-panel-*.png` | 320×100 | Twitch About panels: About, Play free, Discord, Schedule |
| `game-cover.png` | 1200×1700 | Box-style game cover: IGDB and game directories |
| `discord-server-icon.png` | 512×512 | Discord server icon |
| `discord-server-banner.png` | 960×540 | Discord server banner (Boost level 2) |
| `discord-invite-splash.png` | 1920×1080 | Discord invite background (Boost level 1) |
| `discord-profile-banner.png` | 680×240 | Discord profile banner (Nitro) |
| `emoji/*.png` | 128×128 | Discord custom emoji |
| `docs/brand/tardigeddon-icon-512.png` | 512×512 | Square app-style icon |
