// Our giveaways (contests): one entry per contest, in any order.
// The Giveaway page (pages/Giveaway.tsx) works out from the dates which one to
// show and what state it is in, and lists the finished ones that have winners
// under "Past winners". To add a contest or its winners, see docs/WEBSITE.md.

export interface Prize {
  /** The tier's name, as winners are grouped by it ("Grand prize"). */
  tier: string;
  /** How many winners win this tier. */
  count: number;
  /** What the winners get. Looks only; never anything that helps you win. */
  text: string;
  /** A square picture of the prize (in site/public), and its alt text. */
  image?: string;
  alt?: string;
}

export interface Winner {
  /** Must match a `tier` in the contest's `prizes`. */
  tier: string;
  /** Player name only. Never a real name, an email or anything else. */
  playerName: string;
}

export interface Giveaway {
  /** A short unique id, e.g. "launch-2026". */
  slug: string;
  title: string;
  /** When entries open, ISO 8601 in UTC (UK time is UTC in winter, UTC+1 in summer). */
  opens: string;
  /** When entries close, ISO 8601 in UTC. */
  closes: string;
  /** The Sociamonials entry form (embedded on the page, and linked below it). */
  entryUrl: string;
  /** The Official Rules page on this site. */
  rulesPath: string;
  prizes: Prize[];
  /** Fill in once the draw is done and the winners have been told. Empty until then. */
  winners: Winner[];
}

export const GIVEAWAYS: Giveaway[] = [
  {
    slug: 'launch-2026',
    title: 'TardiGeddon Launch Giveaway',
    opens: '2026-11-12T00:00:00Z',
    closes: '2027-01-31T23:59:59Z',
    entryUrl: 'https://app.socialmi.co.uk/tardigeddon-launch-giveaway/c29222/',
    rulesPath: '/legal/launch-giveaway-rules',
    prizes: [
      {
        tier: 'Grand prize',
        count: 1,
        image: '/media/giveaway/prize-grand.jpg',
        alt: 'The grand prize: a wall of worlds, aims and explosions from the Shop, a tardigrade in the Champion’s crown and a trophy badge. 121 looks plus both launch sets, and design your own world and music with us.',
        text: 'Every look in the Shop (121 looks), the Launch Champion and Launch Winner sets, the 🏆 Launch Winner badge, and a set of looks designed with you by email (a world, a music track and more). You keep the one-of-a-kind edition, and we may release a version to every player, credited to your player name.',
      },
      {
        tier: 'Second prize',
        count: 5,
        image: '/media/giveaway/prize-second.jpg',
        alt: 'The Champion set: Champion’s Arena at sunset with fireworks, the Champion’s monument, sights, salute and Fanfare music, and a tardigrade in the Champion’s crown.',
        text: 'The Launch Champion set (Champion’s Arena world, Champion’s Fanfare music, Champion’s crown, monument, sights and salute), every look in every Shop bundle, the Launch Winner set and the 🏆 badge.',
      },
      {
        tier: 'Third prize',
        count: 20,
        image: '/media/giveaway/prize-third.jpg',
        alt: 'The Winner set: a tardigrade wearing the Launch Winner’s cup, the gold Winner’s laurels aim and a trophy badge.',
        text: 'The Launch Winner set (Launch Winner’s cup hat, Winner’s laurels aim), the looks in one Shop bundle of your choice (up to 4,700 coins), and the 🏆 badge.',
      },
    ],
    winners: [],
  },
];

/** Winners are drawn within this many days after a contest closes, and announced here. */
export const ANNOUNCE_WITHIN_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

export const opensAt = (g: Giveaway) => Date.parse(g.opens);
export const closesAt = (g: Giveaway) => Date.parse(g.closes);
/** The latest date winners will be announced by. */
export const announceBy = (g: Giveaway) => closesAt(g) + ANNOUNCE_WITHIN_DAYS * DAY;

export type GiveawayStatus = 'soon' | 'open' | 'closed';

export const statusAt = (g: Giveaway, now: number): GiveawayStatus => (now < opensAt(g) ? 'soon' : now <= closesAt(g) ? 'open' : 'closed');

export interface GiveawayView {
  /** The contest to feature at the top: the one open now, else the next to open, else the latest that has closed and awaits its winners. Null if there is none. */
  current: Giveaway | null;
  status: GiveawayStatus | null;
  /** Finished contests with winners, newest first. */
  past: Giveaway[];
}

/** What the page shows at a moment in time (`now`: milliseconds since 1970). */
export function viewAt(now: number, list: Giveaway[] = GIVEAWAYS): GiveawayView {
  const byOpen = [...list].sort((a, b) => opensAt(a) - opensAt(b));
  const open = byOpen.find((g) => statusAt(g, now) === 'open');
  const next = byOpen.find((g) => statusAt(g, now) === 'soon');
  const awaiting = [...byOpen].reverse().find((g) => statusAt(g, now) === 'closed' && g.winners.length === 0);
  const current = open ?? next ?? awaiting ?? null;
  const past = list
    .filter((g) => statusAt(g, now) === 'closed' && g.winners.length > 0)
    .sort((a, b) => closesAt(b) - closesAt(a));
  return { current, status: current ? statusAt(current, now) : null, past };
}

/** "1 December 2026", in UK time. */
export function dayUK(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
}

/** "14 December 2026, 23:59 UK time". */
export function dayTimeUK(ms: number): string {
  const time = new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
  return `${dayUK(ms)}, ${time} UK time`;
}

/** "1 December" (no year), in UK time. */
export function dayShortUK(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' });
}
