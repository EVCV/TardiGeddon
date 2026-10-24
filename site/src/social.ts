// The game's official accounts (docs/social/): the footer's "Follow" links and
// the Organization's sameAs for search engines both come from this list.

export interface SocialAccount {
  label: string;
  /** Where the footer link goes. */
  href: string;
  /** The address search engines get, when it isn't `href` (our own redirects). */
  profile?: string;
}

export const SOCIAL: SocialAccount[] = [
  { label: 'YouTube', href: 'https://www.youtube.com/@TardiGeddon' },
  { label: 'Discord', href: '/discord', profile: 'https://discord.gg/qK4gxGm28Z' },
  { label: 'TikTok', href: 'https://www.tiktok.com/@tardigeddon' },
  { label: 'Instagram', href: 'https://www.instagram.com/tardigeddon' },
  { label: 'Facebook', href: 'https://www.facebook.com/tardigeddon' },
  { label: 'X', href: 'https://x.com/TardiGeddon' },
  { label: 'Threads', href: 'https://www.threads.net/@tardigeddon' },
  { label: 'Bluesky', href: 'https://bsky.app/profile/tardigeddon.com' },
  { label: 'Twitch', href: 'https://www.twitch.tv/tardigeddon' },
  { label: 'Reddit', href: 'https://www.reddit.com/r/TardiGeddon' },
  { label: 'itch.io', href: 'https://tardigeddon.itch.io/tardigeddon' },
  { label: 'IGDB', href: 'https://www.igdb.com/games/tardigeddon' },
];
