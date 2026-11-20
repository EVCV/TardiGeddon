// Our Patreon (docs/PATREON.md): the tiers, and the patrons who agreed to be
// named on /patrons. Patrons get nothing inside the game, and Patreon is never
// linked from the apps: only from this website.
//
// Update PATRONS by hand each month from Patreon's member list. Only add
// people who show their name on Patreon; anyone else is "Anonymous". Remove
// anyone who leaves or asks (Privacy Policy 2.9).

export const PATREON_URL = 'https://www.patreon.com/tardigeddon';

/**
 * False until the Patreon page is published (January 2027). While false, no
 * page links to Patreon, and /patrons says it's coming and stays out of search.
 */
export const PATREON_LIVE = false;

export type TierName = 'Legend' | 'Tun Club' | 'Water Bear' | 'Moss Fan';

export interface Tier {
  name: TierName;
  /** Pounds a month. */
  price: number;
  /** Team colour of its picture (store/social/patreon-tier-*.png). */
  color: number;
  hat: string;
  perks: string;
  /** Places, if limited. */
  limit?: number;
}

/** Highest first, as the page lists them. Each tier includes everything below it. */
export const TIERS: Tier[] = [
  {
    name: 'Legend',
    price: 25,
    color: 0xe0a020,
    hat: 'crown',
    limit: 10,
    perks: 'Once a year we design a hat with you: it goes in the shop for every player, with your name on it.',
  },
  {
    name: 'Tun Club',
    price: 10,
    color: 0xe04848,
    hat: 'party',
    perks: 'Early previews of new features in your browser, and our monthly voice chat and play-with-the-dev session.',
  },
  {
    name: 'Water Bear',
    price: 5,
    color: 0x3a7be0,
    hat: 'tophat',
    perks: 'A monthly dev diary, votes on what we build next, and wallpapers and Discord emoji each season.',
  },
  {
    name: 'Moss Fan',
    price: 3,
    color: 0x3cb34a,
    hat: 'beanie',
    perks: 'Your name on this page and in the credits of every update, and the Patron role in our Discord.',
  },
];

export interface Patron {
  /** As the patron shows it on Patreon, or 'Anonymous'. */
  name: string;
  tier: TierName;
}

export const PATRONS: Patron[] = [];
