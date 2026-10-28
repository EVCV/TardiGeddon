// New looks released in the Shop ("drops"), for the lobby's banner
// (src/ui/drops.ts). Seasonal events (render/seasons.ts) get a banner on
// their own; add a row here when new designs go in the Shop, and the banner
// shows from `from` for `days` days, until each player closes it.
//
// `name` and `blurb` are English, translated like any other text (add them
// to the locales: `npm run i18n -- missing <lang>`).

export interface Drop {
  /** Unique, never reused (closing the banner remembers it). */
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  /** First day (YYYY-MM-DD, UTC). */
  from: string;
  /** How long the banner offers it (default 30). */
  days?: number;
}

export const DROPS: Drop[] = [];
