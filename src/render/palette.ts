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

export const TEAM_COLORS = [0xe04848, 0x3a7be0, 0x3cb34a, 0xe0a020];

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
