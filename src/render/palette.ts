// Shared colours for the vector-cartoon look (see docs/STYLE_GUIDE.md).

export const PALETTE = {
  outline: 0x2b1b24,
  tardiBody: 0xf6c9ab,
  tardiShade: 0xe3a98a,
  tardiMouth: 0xe58b86,
  eyeWhite: 0xffffff,
  pupil: 0x1d1420,
  skyTop: '#7fd3f7',
  skyBottom: '#d9f3ff',
  hillFar: 0x9fd8b0,
  hillNear: 0x6fbf8a,
  water: 0x2f86d6,
  waterLight: 0x7cc4ff,
  grass: [0x2e5a1c, 0x5aa83a, 0x8fdb5f] as const,
  soil: [0x3b2416, 0x9c6438, 0x7f4d29, 0xb57d4c] as const,
};

// Ten distinct team colours (one per player slot).
export const TEAM_COLORS = [
  0xe04848, 0x3a7be0, 0x3cb34a, 0xe0a020, 0x9b59d0,
  0xf07a2a, 0x23b5c8, 0xe85fa8, 0x9a6b3f, 0x7d8a99,
];

export const TEAM_NAMES = [
  'Water Bears', 'Moss Mob', 'Lichen Legion', 'Puddle Pack', 'Tun Troop',
  'Spore Squad', 'Dew Crew', 'Cuticle Club', 'Algae Army', 'Brine Gang',
];

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/**
 * How this player wants things drawn (Settings → Accessibility, ui/access.ts).
 * Only changes what this device shows, never the match.
 */
export const VIEW = {
  /** Team colours from a palette colour-blind players can tell apart, plus a symbol per team. */
  colourBlind: false,
  /** Bigger, bolder name tags and solid panels. */
  highContrast: false,
  /** Fewer flashes and less movement (lightning, the tornado's sweep, shaking). */
  calm: false,
};

/**
 * Okabe & Ito's colour-blind-safe colours, one per team colour above (same
 * order). Beyond eight, colour alone can't stay distinct for everyone, so
 * each team also gets a symbol (TEAM_SYMBOLS).
 */
export const CB_COLORS = [
  0xd55e00, 0x0072b2, 0x009e73, 0xf0e442, 0xcc79a7,
  0xe69f00, 0x56b4e9, 0xf5f5f5, 0x8c6d46, 0x6e6e6e,
];

export const TEAM_SYMBOLS = ['●', '▲', '■', '◆', '★', '✚', '⬟', '♥', '✖', '⬢'];

/** A team colour as this player sees it. */
export function shown(c: number): number {
  if (!VIEW.colourBlind) return c;
  const i = TEAM_COLORS.indexOf(c);
  return i < 0 ? c : CB_COLORS[i];
}

/** The symbol in front of a team's name when colour-blind mode is on ('' otherwise). */
export function teamSymbol(c: number): string {
  if (!VIEW.colourBlind) return '';
  const i = TEAM_COLORS.indexOf(c);
  return i < 0 ? '' : TEAM_SYMBOLS[i] + ' ';
}
