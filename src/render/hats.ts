// Hats: the first cosmetic slot. Each hat is a list of simple shapes in
// "hat space" (origin = top-centre of the head, 1 unit = head radius, -y up),
// drawn both with PixiJS (in game) and as SVG (menu previews), so the two
// always match. New hats are just new shape lists.

import type { Graphics } from 'pixi.js';
import { PALETTE, hex } from './palette';

type Fill = 'team' | 'ink' | 'white' | 'gold';

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
