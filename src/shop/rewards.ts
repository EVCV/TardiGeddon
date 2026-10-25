// Rewards that cost nothing: inviting friends, and the Founder pack for the
// players who were here first (docs/ACCOUNTS.md). Plain constants, so the menu
// can show them without loading anything else; the server alone grants them.

/** Coins each side gets when an invited friend has confirmed their email and played a few matches. */
export const INVITE_COINS = 100;
/** Most invited friends one player is rewarded for in a calendar month (UTC). */
export const INVITE_MAX = 10;
/** Matches (online or against the CPU) the invited friend plays before the reward. */
export const INVITE_MATCHES = 3;
/** How long after making an account a friend's invite code can still be entered. */
export const INVITE_DAYS = 7;

/**
 * The Early bird pack: looks never sold, a 🐣 badge and some coins, for the
 * first EARLY_BIRD_MAX accounts made up to EARLY_BIRD_UNTIL (the server's
 * settings of the same names can change both).
 */
export const EARLY_BIRD_ITEMS = ['hat:earlybird', 'grave:egg', 'dance:hatch', 'arena:dawn', 'music:daybreak'];
export const EARLY_BIRD_COINS = 100;
export const EARLY_BIRD_UNTIL = '2026-12-31';
export const EARLY_BIRD_MAX = 1000;

/** The Founder pack (founders get the Early bird pack too): looks never sold, a 🌱 badge, and some coins. */
export const FOUNDER_ITEMS = ['hat:founder', 'grave:founder', 'dance:bow', 'arena:golden', 'music:anthem'];
export const FOUNDER_COINS = 250;
/**
 * Accounts made up to the end of this day (UTC) are founders, unless the
 * server's FOUNDER_UNTIL says another day. Emails in FOUNDER_EMAILS (testers
 * and helpers) are founders whenever they joined.
 */
export const FOUNDER_UNTIL = '2026-10-31';
