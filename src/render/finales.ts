// Victory dances and gravestones: how a team celebrates a win, and what it
// leaves behind when one of its tardigrades pops. Team cosmetics like hats,
// so everyone in a match (online too) sees them. Looks only. Prices in
// src/shop/catalog.ts; the first two of each are free.

export interface DanceDef {
  id: string;
  name: string;
}

export const DANCES: DanceDef[] = [
  { id: 'classic', name: 'Happy hop' },
  { id: 'wiggle', name: 'Wiggle' },
  { id: 'spin', name: 'Spin cycle' },
  { id: 'flip', name: 'Backflip' },
  { id: 'moonwalk', name: 'Moonwalk' },
  { id: 'floss', name: 'Floss' },
  { id: 'helicopter', name: 'Helicopter' },
  { id: 'worm', name: 'The worm' },
];

export interface GraveDef {
  id: string;
  name: string;
}

export const GRAVES: GraveDef[] = [
  { id: 'classic', name: 'Husk' },
  { id: 'stone', name: 'Headstone' },
  { id: 'cross', name: 'Twig cross' },
  { id: 'flowers', name: 'Flower pot' },
  { id: 'ghost', name: 'Little ghost' },
  { id: 'trophy', name: 'Trophy' },
  { id: 'rocket', name: 'Rocket' },
  { id: 'crystal', name: 'Crystal' },
  { id: 'founder', name: 'Founder’s plaque' },
];

export function danceById(id: string | undefined): DanceDef {
  return DANCES.find((d) => d.id === id) ?? DANCES[0];
}

export function graveById(id: string | undefined): GraveDef {
  return GRAVES.find((g) => g.id === id) ?? GRAVES[0];
}

/**
 * Pose for a dance at time t (seconds): how high the body lifts, its
 * rotation, which way it faces (1/-1 or 0 to keep), squash, and a sideways slide.
 */
export function dancePose(id: string, t: number, seed: number): { lift: number; rot: number; face: number; squash: number; slide: number } {
  const p = t + seed;
  switch (id) {
    case 'wiggle':
      return { lift: 0, rot: Math.sin(p * 14) * 0.25, face: 0, squash: 1 + Math.sin(p * 14) * 0.08, slide: Math.sin(p * 7) * 2 };
    case 'spin':
      return { lift: Math.abs(Math.sin(p * 4)) * 4, rot: 0, face: Math.sin(p * 12) > 0 ? 1 : -1, squash: 1, slide: 0 };
    case 'flip': {
      // A jump with a full turn every 1.2s.
      const k = (p % 1.2) / 1.2;
      return { lift: Math.sin(k * Math.PI) * 18, rot: k < 0.85 ? -k / 0.85 * Math.PI * 2 : 0, face: 0, squash: 1, slide: 0 };
    }
    case 'moonwalk':
      return { lift: 0, rot: 0, face: Math.sin(p * 0.8) > 0 ? 1 : -1, squash: 1, slide: Math.sin(p * 0.8) * -14 };
    case 'floss':
      return { lift: Math.abs(Math.sin(p * 10)) * 2, rot: Math.sin(p * 10) * 0.35, face: 0, squash: 1, slide: Math.sin(p * 10) * 4 };
    case 'helicopter':
      return { lift: 10 + Math.sin(p * 3) * 4, rot: p * 9, face: 0, squash: 1, slide: 0 };
    case 'worm':
      return { lift: Math.max(0, Math.sin(p * 6)) * 5, rot: Math.sin(p * 6) * 0.2, face: 0, squash: 1 - Math.sin(p * 6) * 0.25, slide: 0 };
    default:
      return { lift: Math.abs(Math.sin(p * 8)) * 7, rot: Math.sin(p * 6) * 0.3, face: Math.sin(p * 3) > 0 ? 1 : -1, squash: 1, slide: 0 };
  }
}
