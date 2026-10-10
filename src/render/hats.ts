// Hats: the first cosmetic slot. Each hat is a list of simple shapes in
// "hat space" (origin = top-centre of the head, 1 unit = head radius, -y up),
// drawn both with PixiJS (in game) and as SVG (menu previews), so the two
// always match. New hats are just new shape lists.

import type { Graphics } from 'pixi.js';
import { PALETTE, hex } from './palette';

type Fill = 'team' | 'ink' | 'white' | 'gold' | 'red' | 'green' | 'blue' | 'pink' | 'brown' | 'grey' | 'orange' | 'purple' | 'black';

type Shape =
  | { k: 'circle'; x: number; y: number; r: number; fill: Fill }
  | { k: 'dome'; x: number; y: number; r: number; fill: Fill } // top half-disc
  | { k: 'poly'; pts: number[]; fill: Fill };

export interface HatDef {
  id: string;
  name: string;
  shapes: Shape[];
}

const flowerPetals: Shape[] = [0, 1, 2, 3, 4].map((i) => {
  // Five petals around (0, -1); positions precomputed (cos/sin of 72° steps).
  const pts = [
    [0, -0.55],
    [0.52, -0.17],
    [0.32, 0.45],
    [-0.32, 0.45],
    [-0.52, -0.17],
  ][i];
  return { k: 'circle', x: pts[0], y: -1 + pts[1], r: 0.42, fill: 'team' } as Shape;
});

export const HATS: HatDef[] = [
  {
    id: 'beanie',
    name: 'Beanie',
    shapes: [
      { k: 'dome', x: 0, y: 0, r: 1, fill: 'team' },
      { k: 'circle', x: 0, y: -1.15, r: 0.4, fill: 'white' },
    ],
  },
  {
    id: 'tophat',
    name: 'Top hat',
    shapes: [
      { k: 'poly', pts: [-0.8, 0, -0.8, -2, 0.8, -2, 0.8, 0], fill: 'team' },
      { k: 'poly', pts: [-0.8, -0.45, -0.8, -0.75, 0.8, -0.75, 0.8, -0.45], fill: 'white' },
      { k: 'poly', pts: [-1.4, 0.15, -1.4, -0.15, 1.4, -0.15, 1.4, 0.15], fill: 'ink' },
    ],
  },
  {
    id: 'crown',
    name: 'Crown',
    shapes: [
      { k: 'poly', pts: [-1, 0, -1.05, -1.3, -0.5, -0.7, 0, -1.5, 0.5, -0.7, 1.05, -1.3, 1, 0], fill: 'gold' },
      { k: 'circle', x: 0, y: -0.45, r: 0.24, fill: 'team' },
    ],
  },
  {
    id: 'flower',
    name: 'Flower',
    shapes: [...flowerPetals, { k: 'circle', x: 0, y: -1, r: 0.32, fill: 'gold' }],
  },
  {
    id: 'cap',
    name: 'Cap',
    shapes: [
      { k: 'poly', pts: [0.6, 0, 1.9, 0.05, 1.9, -0.22, 0.5, -0.35], fill: 'team' },
      { k: 'dome', x: 0, y: 0, r: 1, fill: 'team' },
      { k: 'circle', x: 0, y: -1.02, r: 0.18, fill: 'white' },
    ],
  },
  { id: 'none', name: 'No hat', shapes: [] },
  // More shop hats (prices in src/shop/catalog.ts).
  {
    id: 'chef',
    name: 'Chef hat',
    shapes: [
      { k: 'poly', pts: [-0.85, 0.05, -0.85, -0.9, 0.85, -0.9, 0.85, 0.05], fill: 'white' },
      { k: 'circle', x: -0.6, y: -1.25, r: 0.55, fill: 'white' },
      { k: 'circle', x: 0.6, y: -1.25, r: 0.55, fill: 'white' },
      { k: 'circle', x: 0, y: -1.55, r: 0.65, fill: 'white' },
      { k: 'poly', pts: [-0.85, 0.05, -0.85, -0.3, 0.85, -0.3, 0.85, 0.05], fill: 'team' },
    ],
  },
  {
    id: 'cowboy',
    name: 'Cowboy hat',
    shapes: [
      { k: 'poly', pts: [-1.8, 0.1, -1.5, -0.25, 1.5, -0.25, 1.8, 0.1, 0, 0.3], fill: 'brown' },
      { k: 'poly', pts: [-0.85, -0.2, -0.75, -1.3, -0.2, -1.05, 0.2, -1.05, 0.75, -1.3, 0.85, -0.2], fill: 'brown' },
      { k: 'poly', pts: [-0.85, -0.2, -0.82, -0.5, 0.82, -0.5, 0.85, -0.2], fill: 'team' },
    ],
  },
  {
    id: 'party',
    name: 'Party hat',
    shapes: [
      { k: 'poly', pts: [-0.9, 0.05, 0, -2.2, 0.9, 0.05], fill: 'team' },
      { k: 'circle', x: -0.3, y: -0.5, r: 0.13, fill: 'gold' },
      { k: 'circle', x: 0.25, y: -1.0, r: 0.13, fill: 'white' },
      { k: 'circle', x: -0.05, y: -1.5, r: 0.12, fill: 'gold' },
      { k: 'circle', x: 0, y: -2.25, r: 0.3, fill: 'gold' },
    ],
  },
  {
    id: 'propeller',
    name: 'Propeller cap',
    shapes: [
      { k: 'dome', x: 0, y: 0, r: 1, fill: 'team' },
      { k: 'poly', pts: [-0.06, -1, -0.06, -1.5, 0.06, -1.5, 0.06, -1], fill: 'ink' },
      { k: 'poly', pts: [0, -1.55, -1.1, -1.75, -1.1, -1.4], fill: 'red' },
      { k: 'poly', pts: [0, -1.55, 1.1, -1.75, 1.1, -1.4], fill: 'blue' },
      { k: 'circle', x: 0, y: -1.55, r: 0.16, fill: 'gold' },
    ],
  },
  {
    id: 'mushroom',
    name: 'Toadstool',
    shapes: [
      { k: 'dome', x: 0, y: 0.1, r: 1.35, fill: 'red' },
      { k: 'circle', x: -0.6, y: -0.55, r: 0.2, fill: 'white' },
      { k: 'circle', x: 0.15, y: -0.95, r: 0.24, fill: 'white' },
      { k: 'circle', x: 0.75, y: -0.4, r: 0.18, fill: 'white' },
    ],
  },
  {
    id: 'bunny',
    name: 'Bunny ears',
    shapes: [
      { k: 'poly', pts: [-0.7, 0, -1.0, -1.4, -0.75, -2.3, -0.35, -1.5, -0.25, 0], fill: 'white' },
      { k: 'poly', pts: [0.25, 0, 0.35, -1.5, 0.75, -2.3, 1.0, -1.4, 0.7, 0], fill: 'white' },
      { k: 'poly', pts: [-0.6, -0.3, -0.8, -1.3, -0.7, -1.9, -0.45, -1.4, -0.4, -0.3], fill: 'pink' },
      { k: 'poly', pts: [0.4, -0.3, 0.45, -1.4, 0.7, -1.9, 0.8, -1.3, 0.6, -0.3], fill: 'pink' },
    ],
  },
  {
    id: 'hardhat',
    name: 'Hard hat',
    shapes: [
      { k: 'poly', pts: [-1.4, 0.1, -1.4, -0.15, 1.4, -0.15, 1.4, 0.1], fill: 'gold' },
      { k: 'dome', x: 0, y: -0.1, r: 1.05, fill: 'gold' },
      { k: 'poly', pts: [-0.15, -0.1, -0.15, -1.1, 0.15, -1.1, 0.15, -0.1], fill: 'orange' },
    ],
  },
  {
    id: 'fez',
    name: 'Fez',
    shapes: [
      { k: 'poly', pts: [-0.8, 0.05, -0.6, -1.2, 0.6, -1.2, 0.8, 0.05], fill: 'red' },
      { k: 'poly', pts: [0, -1.2, 0.05, -1.2, 0.75, -0.55, 0.65, -0.5], fill: 'ink' },
      { k: 'circle', x: 0.72, y: -0.45, r: 0.16, fill: 'gold' },
    ],
  },
  {
    id: 'sombrero',
    name: 'Sombrero',
    shapes: [
      { k: 'poly', pts: [-2.1, 0.15, -1.6, -0.25, 1.6, -0.25, 2.1, 0.15, 0, 0.35], fill: 'gold' },
      { k: 'dome', x: 0, y: -0.2, r: 0.85, fill: 'gold' },
      { k: 'poly', pts: [-0.8, -0.2, -0.75, -0.45, 0.75, -0.45, 0.8, -0.2], fill: 'team' },
    ],
  },
  {
    id: 'grad',
    name: 'Graduation cap',
    shapes: [
      { k: 'dome', x: 0, y: 0, r: 0.85, fill: 'ink' },
      { k: 'poly', pts: [-1.5, -0.75, 0, -1.25, 1.5, -0.75, 0, -0.3], fill: 'ink' },
      { k: 'poly', pts: [0, -0.8, 1.05, -0.65, 1.05, 0.1, 0.95, 0.1, 0.95, -0.55], fill: 'gold' },
      { k: 'circle', x: 1.0, y: 0.15, r: 0.15, fill: 'gold' },
    ],
  },
  {
    id: 'bow',
    name: 'Big bow',
    shapes: [
      { k: 'poly', pts: [0, -0.6, -1.1, -1.3, -1.15, -0.1], fill: 'pink' },
      { k: 'poly', pts: [0, -0.6, 1.1, -1.3, 1.15, -0.1], fill: 'pink' },
      { k: 'circle', x: 0, y: -0.6, r: 0.3, fill: 'pink' },
    ],
  },
  {
    id: 'antennae',
    name: 'Alien antennae',
    shapes: [
      { k: 'poly', pts: [-0.45, 0, -0.85, -1.6, -0.72, -1.62, -0.3, 0], fill: 'green' },
      { k: 'poly', pts: [0.3, 0, 0.72, -1.62, 0.85, -1.6, 0.45, 0], fill: 'green' },
      { k: 'circle', x: -0.8, y: -1.7, r: 0.32, fill: 'green' },
      { k: 'circle', x: 0.8, y: -1.7, r: 0.32, fill: 'green' },
    ],
  },
  {
    id: 'tiara',
    name: 'Tiara',
    shapes: [
      { k: 'poly', pts: [-0.9, 0, -0.75, -0.6, -0.4, -0.35, 0, -0.95, 0.4, -0.35, 0.75, -0.6, 0.9, 0], fill: 'grey' },
      { k: 'circle', x: 0, y: -0.45, r: 0.2, fill: 'pink' },
    ],
  },
  {
    id: 'cone',
    name: 'Traffic cone',
    shapes: [
      { k: 'poly', pts: [-1.0, 0.05, -1.0, -0.2, 1.0, -0.2, 1.0, 0.05], fill: 'orange' },
      { k: 'poly', pts: [-0.7, -0.2, -0.12, -2.0, 0.12, -2.0, 0.7, -0.2], fill: 'orange' },
      { k: 'poly', pts: [-0.47, -0.9, -0.33, -1.35, 0.33, -1.35, 0.47, -0.9], fill: 'white' },
    ],
  },
  {
    id: 'jester',
    name: 'Jester hat',
    shapes: [
      { k: 'poly', pts: [-0.9, 0, -1.7, -1.3, -0.3, -0.5], fill: 'team' },
      { k: 'poly', pts: [0.9, 0, 1.7, -1.3, 0.3, -0.5], fill: 'purple' },
      { k: 'poly', pts: [-0.5, -0.3, 0, -1.9, 0.5, -0.3], fill: 'gold' },
      { k: 'poly', pts: [-0.95, 0.05, -0.95, -0.3, 0.95, -0.3, 0.95, 0.05], fill: 'ink' },
      { k: 'circle', x: -1.7, y: -1.35, r: 0.2, fill: 'gold' },
      { k: 'circle', x: 1.7, y: -1.35, r: 0.2, fill: 'gold' },
      { k: 'circle', x: 0, y: -1.95, r: 0.2, fill: 'team' },
    ],
  },
  {
    id: 'sprout',
    name: 'Sprout',
    shapes: [
      { k: 'poly', pts: [-0.06, 0, -0.06, -0.9, 0.06, -0.9, 0.06, 0], fill: 'green' },
      { k: 'poly', pts: [0, -0.85, -0.9, -1.4, -0.3, -0.75], fill: 'green' },
      { k: 'poly', pts: [0, -0.9, 0.95, -1.6, 0.35, -0.7], fill: 'green' },
    ],
  },
  {
    id: 'bucket',
    name: 'Bucket hat',
    shapes: [
      { k: 'poly', pts: [-1.35, 0.15, -0.8, -0.3, 0.8, -0.3, 1.35, 0.15], fill: 'team' },
      { k: 'poly', pts: [-0.85, -0.25, -0.7, -1.1, 0.7, -1.1, 0.85, -0.25], fill: 'team' },
      { k: 'poly', pts: [-0.82, -0.25, -0.8, -0.45, 0.8, -0.45, 0.82, -0.25], fill: 'white' },
    ],
  },
  {
    id: 'deerstalker',
    name: 'Detective hat',
    shapes: [
      { k: 'poly', pts: [-1.4, 0.05, -0.9, -0.15, -0.9, 0.15], fill: 'brown' },
      { k: 'poly', pts: [1.4, 0.05, 0.9, -0.15, 0.9, 0.15], fill: 'brown' },
      { k: 'dome', x: 0, y: 0.05, r: 1, fill: 'brown' },
      { k: 'poly', pts: [-0.06, -0.95, -0.06, -1.25, 0.06, -1.25, 0.06, -0.95], fill: 'ink' },
      { k: 'circle', x: 0, y: -1.3, r: 0.14, fill: 'brown' },
    ],
  },
  {
    id: 'eggshell',
    name: 'Eggshell',
    shapes: [
      { k: 'poly', pts: [-1.0, 0.05, -0.95, -0.7, -0.6, -1.2, 0, -1.4, 0.6, -1.2, 0.95, -0.7, 1.0, 0.05, 0.7, -0.25, 0.4, 0.05, 0.1, -0.3, -0.25, 0.05, -0.6, -0.25], fill: 'white' },
    ],
  },
  {
    id: 'headphones',
    name: 'Headphones',
    shapes: [
      { k: 'poly', pts: [-1.15, 0.2, -1.05, -0.7, -0.6, -1.15, 0, -1.3, 0.6, -1.15, 1.05, -0.7, 1.15, 0.2, 0.95, 0.2, 0.85, -0.6, 0.5, -0.95, 0, -1.05, -0.5, -0.95, -0.85, -0.6, -0.95, 0.2], fill: 'ink' },
      { k: 'circle', x: -1.05, y: 0.25, r: 0.4, fill: 'team' },
      { k: 'circle', x: 1.05, y: 0.25, r: 0.4, fill: 'team' },
    ],
  },
  // Shop hats (see src/shop/catalog.ts): usable once owned.
  {
    id: 'wizard',
    name: 'Wizard',
    shapes: [
      { k: 'poly', pts: [-1.3, 0.1, -0.15, -2.6, 0.35, -2.2, 0.75, -1.2, 1.3, 0.1], fill: 'team' },
      { k: 'poly', pts: [-1.5, 0.2, -1.5, -0.12, 1.5, -0.12, 1.5, 0.2], fill: 'team' },
      { k: 'circle', x: 0.05, y: -0.9, r: 0.2, fill: 'gold' },
      { k: 'circle', x: -0.4, y: -0.4, r: 0.12, fill: 'gold' },
    ],
  },
  {
    id: 'pirate',
    name: 'Pirate',
    shapes: [
      { k: 'poly', pts: [-1.6, -0.1, -1.1, -1.3, 0, -0.95, 1.1, -1.3, 1.6, -0.1, 0, 0.15], fill: 'ink' },
      { k: 'circle', x: 0, y: -0.55, r: 0.27, fill: 'white' },
    ],
  },
  {
    id: 'viking',
    name: 'Viking',
    shapes: [
      { k: 'poly', pts: [-0.85, -0.35, -1.65, -1.0, -1.55, -1.75, -1.2, -1.0, -0.6, -0.75], fill: 'white' },
      { k: 'poly', pts: [0.85, -0.35, 1.65, -1.0, 1.55, -1.75, 1.2, -1.0, 0.6, -0.75], fill: 'white' },
      { k: 'dome', x: 0, y: 0, r: 1, fill: 'team' },
      { k: 'poly', pts: [-1, 0.05, -1, -0.25, 1, -0.25, 1, 0.05], fill: 'gold' },
    ],
  },
];

export function hatById(id: string): HatDef {
  return HATS.find((h) => h.id === id) ?? HATS[0];
}

function fillColor(f: Fill, team: number): number {
  switch (f) {
    case 'team':
      return team;
    case 'ink':
      return PALETTE.outline;
    case 'white':
      return 0xffffff;
    case 'gold':
      return 0xffd84a;
    case 'red':
      return 0xe04848;
    case 'green':
      return 0x5aa83a;
    case 'blue':
      return 0x3a7be0;
    case 'pink':
      return 0xff8fc8;
    case 'brown':
      return 0x9c6438;
    case 'grey':
      return 0xa9a9b4;
    case 'orange':
      return 0xf28a2e;
    case 'purple':
      return 0x8f5bd6;
    case 'black':
      return 0x2b1b24;
  }
}

/** Draw a hat into a Pixi Graphics, centred at (ox, oy) with the given head radius. */
export function drawHatPixi(g: Graphics, hatId: string, team: number, ox: number, oy: number, unit: number): void {
  const stroke = { width: unit * 0.32, color: PALETTE.outline };
  for (const s of hatById(hatId).shapes) {
    const color = fillColor(s.fill, team);
    if (s.k === 'circle') {
      g.circle(ox + s.x * unit, oy + s.y * unit, s.r * unit).fill(color).stroke(stroke);
    } else if (s.k === 'dome') {
      const cx = ox + s.x * unit;
      const cy = oy + s.y * unit;
      g.moveTo(cx - s.r * unit, cy).arc(cx, cy, s.r * unit, Math.PI, 0).closePath().fill(color).stroke(stroke);
    } else {
      g.poly(s.pts.map((v, i) => (i % 2 === 0 ? ox + v * unit : oy + v * unit))).fill(color).stroke(stroke);
    }
  }
}

/** The same hat as an SVG fragment (for menu previews). */
export function hatSvg(hatId: string, team: number, ox: number, oy: number, unit: number): string {
  const sw = (unit * 0.27).toFixed(2);
  const ink = hex(PALETTE.outline);
  return hatById(hatId)
    .shapes.map((s) => {
      const fill = hex(fillColor(s.fill, team));
      const common = `fill="${fill}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"`;
      if (s.k === 'circle') return `<circle cx="${ox + s.x * unit}" cy="${oy + s.y * unit}" r="${s.r * unit}" ${common}/>`;
      if (s.k === 'dome') {
        const cx = ox + s.x * unit;
        const cy = oy + s.y * unit;
        const r = s.r * unit;
        return `<path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z" ${common}/>`;
      }
      const pts = s.pts.map((v, i) => (i % 2 === 0 ? ox + v * unit : oy + v * unit)).join(' ');
      return `<polygon points="${pts}" ${common}/>`;
    })
    .join('');
}
