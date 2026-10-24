# Bluesky: @tardigeddon.com

Shared names, bios and rules are in [README.md](README.md); pictures are in
`store/social/`. Bluesky is where many indie developers and games press moved
from X, so it suits dev diaries and #screenshotsaturday-style posts as well as
the Shorts.

## 1. The account

1. bsky.app → **Sign up** with `developer@tardigeddon.com`.
2. **Settings → Privacy and security → Two-factor authentication:** on.
3. **Handle: `@tardigeddon.com`.** Settings → Account → Handle → "I have my
   own domain" → `tardigeddon.com` → DNS panel. Bluesky shows a value
   `did=did:plc:…`; add it in Cloudflare (tardigeddon.com → DNS → Records)
   as a **TXT** record named **`_atproto`**, then **Verify DNS Record**.
   Only the owner of the domain can claim this handle, so it proves the
   account is ours. **Don't delete that DNS record**, or the handle breaks.

## 2. Profile

- **Avatar:** `store/social/youtube-avatar.png`
- **Banner:** `store/social/bluesky-banner.png` (3000×1000; the bottom-left corner is kept clear for the avatar)
- **Display name:** TardiGeddon
- **Description:**
  > Free turn-based artillery game starring tardigrades 💥 Walk, aim, fire, and be the last tardi standing. No download, no ads.
  >
  > ▶ Play: tardigeddon.com/play
  > 💬 Discord: tardigeddon.com/discord

## 3. Settings

- **Moderation:** filters for adult content, violence and spam on.
- **Privacy and security → Allow new messages from:** No one (support goes
  to support@tardigeddon.com).

## 4. Posting

- 300 characters per post; videos up to 3 minutes. Post the same vertical
  clips as TikTok and Shorts, with alt text describing the video.
- Hashtags work as search: two or three of `#indiedev #gamedev #indiegame
  #screenshotsaturday` (Saturdays), plus `#TardiGeddon`.
- Bluesky rewards conversation more than reach: reply, repost other indie
  devs, and post dev-diary threads (how a feature was made, with a clip).
