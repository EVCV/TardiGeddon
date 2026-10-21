// Ranks for quick play: an Elo-style rating per signed-in player, moved by
// quick-play matches against other signed-in players (private rooms don't
// count, so friends can't boost each other). Quick play prefers opponents
// with a similar rating (server/matchmaker.ts). Shared by the server (which
// alone changes ratings) and the menus (which show the tier).

export const START_RATING = 1000;

/** How far one match can move a rating: more while a player is new. */
function k(ratedGames: number): number {
  return ratedGames < 10 ? 40 : 24;
}

/** Chance A beats B, by their ratings. */
function expected(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/**
 * Ratings after a match: the winner (index into `players`, or -1 for a draw)
 * against each other player, as separate one-on-one results averaged over
 * the opponents. Whole numbers; the total barely changes.
 */
export function newRatings(players: { rating: number; rated: number }[], winner: number): number[] {
  const n = players.length;
  if (n < 2) return players.map((p) => p.rating);
  return players.map((p, i) => {
    let delta = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const score = winner < 0 ? 0.5 : i === winner ? 1 : j === winner ? 0 : 0.5;
      // Two losers in a free-for-all don't play each other: only results against the winner count.
      if (winner >= 0 && i !== winner && j !== winner) continue;
      delta += k(p.rated) * (score - expected(p.rating, players[j].rating));
    }
    const opponents = winner < 0 || i === winner ? n - 1 : 1;
    return Math.round(p.rating + delta / Math.sqrt(opponents));
  });
}

export interface Tier {
  name: string;
  emoji: string;
  /** Lowest rating in the tier. */
  from: number;
}

export const TIERS: Tier[] = [
  { name: 'Egg', emoji: '🥚', from: -Infinity },
  { name: 'Moss', emoji: '🌱', from: 900 },
  { name: 'Lichen', emoji: '🌿', from: 1100 },
  { name: 'Dewdrop', emoji: '💧', from: 1300 },
  { name: 'Water Bear', emoji: '🐻', from: 1500 },
  { name: 'Tun Legend', emoji: '👑', from: 1700 },
];

export function tierFor(rating: number): Tier {
  let t = TIERS[0];
  for (const x of TIERS) if (rating >= x.from) t = x;
  return t;
}

/** How far apart two players' ratings may be to be matched, after waiting this long. */
export function ratingWindow(waitedMs: number): number {
  return Math.min(2000, 200 + (waitedMs / 1000) * 40);
}
