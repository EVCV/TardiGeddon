// Contest prize rules shared by the server (server/prizes.ts), the Sales page and the game.
// Kept out of catalog.ts so a prize can be as big as "every Shop look" in one grant.

import { EVERYONE_ITEMS } from './catalog';

/** Most looks in one prize grant: enough for every Shop look at once (the grand prize). */
export const PRIZE_GRANT_MAX = 300;

/** The badges a contest can give (shown by the player's name: 🏆). */
export type PrizeBadge = 'winner';

/**
 * What a player can use: what they own plus the looks everyone has (catalog's
 * EVERYONE_ITEMS: no purchase, no account needed). Signed-out players pass [].
 * A new array (never the input), in order, with no repeats.
 */
export function withEveryone(owned: readonly string[], everyone: readonly string[] = EVERYONE_ITEMS): string[] {
  if (!everyone.length) return [...owned];
  const have = new Set(owned);
  return [...owned, ...everyone.filter((id) => !have.has(id))];
}
