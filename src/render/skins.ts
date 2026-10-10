// Skins: the tardi's body colours, plus an optional pattern. Drawn by the
// in-game view (tardiView.ts) and the menu mascot (ui/mascot.ts) from this
// one list, so the two always match. Cosmetic only.

export type SkinPattern = 'none' | 'spots' | 'stripes' | 'seeds' | 'rivets' | 'shine';

export interface SkinDef {
  id: string;
  name: string;
  body: number;
  shade: number;
  /** Snout ring. */
  mouth: number;
  pattern: SkinPattern;
  /** Colour of the pattern marks. */
  mark: number;
}

export const SKINS: SkinDef[] = [
  { id: 'classic', name: 'Classic', body: 0xf6c9ab, shade: 0xe3a98a, mouth: 0xe58b86, pattern: 'none', mark: 0 },
  // Shop skins (prices in src/shop/catalog.ts).
  { id: 'microscope', name: 'Under the Microscope', body: 0xe4d8c4, shade: 0xbfae94, mouth: 0xa98f74, pattern: 'spots', mark: 0xcdbda5 },
  { id: 'moss', name: 'Mossy', body: 0x9fd77e, shade: 0x6fae4f, mouth: 0x4f8a35, pattern: 'spots', mark: 0x5aa83a },
  { id: 'ocean', name: 'Deep Sea', body: 0x8cc8f0, shade: 0x5a9bd0, mouth: 0x3a7bc0, pattern: 'none', mark: 0 },
  { id: 'bubblegum', name: 'Bubblegum', body: 0xffb6dc, shade: 0xf08cc0, mouth: 0xe0609e, pattern: 'none', mark: 0 },
  { id: 'midnight', name: 'Midnight', body: 0x4a4f7a, shade: 0x343858, mouth: 0x8f5bd6, pattern: 'spots', mark: 0xc9c2ff },
  { id: 'ghost', name: 'Ghostly', body: 0xf4f6fb, shade: 0xc9d1e0, mouth: 0xa9b4c8, pattern: 'none', mark: 0 },
  { id: 'lava', name: 'Lava', body: 0xff8a4a, shade: 0xd8562a, mouth: 0xa83020, pattern: 'spots', mark: 0xffd84a },
  { id: 'strawberry', name: 'Strawberry', body: 0xf0525a, shade: 0xc83a44, mouth: 0x5aa83a, pattern: 'seeds', mark: 0xffe27a },
  { id: 'zebra', name: 'Zebra', body: 0xf7f3ea, shade: 0xd6d0c4, mouth: 0x2b1b24, pattern: 'stripes', mark: 0x2b1b24 },
  { id: 'tiger', name: 'Tiger', body: 0xf5a03a, shade: 0xd77f1e, mouth: 0xe58b86, pattern: 'stripes', mark: 0x2b1b24 },
  { id: 'robot', name: 'Robo-Tardi', body: 0xc3cad6, shade: 0x8e97a8, mouth: 0x5d6678, pattern: 'rivets', mark: 0x6c7488 },
  { id: 'gold', name: 'Solid Gold', body: 0xffd84a, shade: 0xe0a920, mouth: 0xc98a12, pattern: 'shine', mark: 0xfff6c2 },
  { id: 'zombie', name: 'Zombie', body: 0xa8c49a, shade: 0x7d9b72, mouth: 0x6b3a4a, pattern: 'spots', mark: 0x8a6a7a },
];

export function skinById(id: string | undefined): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

/**
 * Pattern marks in body space (the body is an ellipse centred (0,-1),
 * radii 12 x 7.5 in game units). Shapes are kept inside the body.
 */
export function patternMarks(p: SkinPattern): { circles: [number, number, number][]; stripes: [number, number, number, number][] } {
  switch (p) {
    case 'spots':
      return { circles: [[-7, -3, 1.6], [-2, -5, 1.2], [-4, 1.5, 1.3], [2, 0, 1.1], [-9, 0.5, 0.9]], stripes: [] };
    case 'seeds':
      return { circles: [[-8, -2, 0.5], [-5, -5, 0.5], [-3, -1, 0.5], [-6, 2, 0.5], [0, -4, 0.5], [1, 1, 0.5], [-1, -6, 0.45], [4, -5.5, 0.45]], stripes: [] };
    case 'rivets':
      return { circles: [[-9, -1, 0.6], [-6, -5, 0.6], [-6, 3, 0.6], [-1, -6.5, 0.6], [-1, 4.5, 0.6]], stripes: [] };
    case 'stripes':
      // [x top, y top, x bottom, y bottom]
      return { circles: [], stripes: [[-8, -5.5, -9.5, 3], [-4, -7.5, -5.5, 4.5], [0, -7.8, -1.5, 5]] };
    case 'shine':
      return { circles: [[-6, -4.5, 1.3], [-3.5, -5.5, 0.7]], stripes: [] };
    default:
      return { circles: [], stripes: [] };
  }
}
