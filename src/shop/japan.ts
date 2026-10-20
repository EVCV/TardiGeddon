// Japan's Payment Services Act treats coins bought by players in Japan as
// prepaid credit. Nothing is owed to a player who simply stops playing, but
// once their unspent paid coins are worth more than ¥10 million on 31 March
// or 30 September, the issuer (EVCV) must notify the Local Finance Bureau
// and lodge a deposit or bank guarantee for half the excess. The game server
// keeps that figure (server/store.ts unspentCoins), shows it on the sales
// page and emails the owner as it gets close. docs/GOOGLE_PLAY.md has more.

/** The Payment Services Act's limit, in yen. */
export const JAPAN_LIMIT_YEN = 10_000_000;

/**
 * Yen per pound for the figure, unless the server's JPY_PER_GBP says
 * otherwise. Deliberately more than the usual rate, so the figure errs high
 * and warnings come early.
 */
export const DEFAULT_JPY_PER_GBP = 220;

/** Shares of the limit that each send the owner one email. */
export const JAPAN_ALERTS = [0.5, 0.75, 0.9] as const;

/** Unspent paid coins in one country and currency (value in the currency's smallest unit). */
export interface UnspentRow {
  region: string | null;
  currency: string | null;
  coins: number;
  value: number;
}

/**
 * What the unspent paid coins of players in Japan cost, in yen. Pounds are
 * converted at `jpyPerGbp`; yen have no smaller unit.
 */
export function japanYen(rows: UnspentRow[], jpyPerGbp: number): number {
  let yen = 0;
  for (const r of rows) {
    if (r.region !== 'JP') continue;
    const cur = (r.currency ?? 'gbp').toLowerCase();
    if (cur === 'jpy') yen += r.value;
    // We only sell in pounds (and Google's yen prices); anything else counts at the pound rate too.
    else yen += (r.value / 100) * jpyPerGbp;
  }
  return Math.round(yen);
}

/** The alert levels a figure has reached. */
export function japanLevelsReached(yen: number): number[] {
  return JAPAN_ALERTS.filter((l) => yen >= l * JAPAN_LIMIT_YEN);
}
