// Arena themes: the colours of the sky, hills, water and ground. Each player
// picks their own and only they see it (it never changes the match for
// anyone else), so it lives in the view and never touches the sim.

import { PALETTE } from './palette';

export interface ArenaTheme {
  id: string;
  name: string;
  skyTop: string;
  skyBottom: string;
  hillFar: number;
  hillNear: number;
  water: number;
  waterLight: number;
  /** Top band of the ground: dark edge, main, highlight. */
  grass: readonly [number, number, number];
  /** Ground: outline, fill, pebble, pebble highlight. */
  soil: readonly [number, number, number, number];
  /** Twinkling stars in the sky. */
  stars?: boolean;
  /** Snowflakes or embers drifting down/up. */
  drift?: { color: number; up?: boolean };
}

export const ARENAS: ArenaTheme[] = [
  {
    id: 'classic',
    name: 'Meadow',
    skyTop: PALETTE.skyTop,
    skyBottom: PALETTE.skyBottom,
    hillFar: PALETTE.hillFar,
    hillNear: PALETTE.hillNear,
    water: PALETTE.water,
    waterLight: PALETTE.waterLight,
    grass: PALETTE.grass,
    soil: PALETTE.soil,
  },
  {
    id: 'sunset',
    name: 'Sunset Shore',
    skyTop: '#ff7e5f',
    skyBottom: '#ffd27a',
    hillFar: 0xd98a6a,
    hillNear: 0xb8664f,
    water: 0x3d6fb6,
    waterLight: 0xf2a37a,
    grass: [0x3d4a1c, 0x8a9a3a, 0xc8d06a],
    soil: [0x3b2416, 0xa4683c, 0x84502b, 0xc58a55],
  },
  {
    id: 'autumn',
    name: 'Autumn Woods',
    skyTop: '#9fc7e8',
    skyBottom: '#f3e2c6',
    hillFar: 0xd99a4e,
    hillNear: 0xb8642e,
    water: 0x2f6f9e,
    waterLight: 0x86b8d8,
    grass: [0x5a2a10, 0xc8611f, 0xf0a040],
    soil: [0x33200f, 0x8a5a33, 0x6e4526, 0xa8774a],
  },
  {
    id: 'snow',
    name: 'Snowy Peaks',
    skyTop: '#a9c8ec',
    skyBottom: '#eef6ff',
    hillFar: 0xdfe9f5,
    hillNear: 0xbfd2e8,
    water: 0x3f7fb8,
    waterLight: 0xbfe3ff,
    grass: [0x7f97b3, 0xf4f8ff, 0xffffff],
    soil: [0x2c3442, 0x6f7f96, 0x5a687d, 0x93a3b8],
    drift: { color: 0xffffff },
  },
  {
    id: 'desert',
    name: 'Desert Dunes',
    skyTop: '#5fb8f0',
    skyBottom: '#ffe9b8',
    hillFar: 0xf0cf8a,
    hillNear: 0xdcae62,
    water: 0x2a9fb0,
    waterLight: 0x8fe0e0,
    grass: [0x9a6a22, 0xe8b85a, 0xffe08e],
    soil: [0x4a2e14, 0xc98f4b, 0xb07a3c, 0xe2ac6a],
  },
  {
    id: 'candy',
    name: 'Candy Land',
    skyTop: '#ffb3de',
    skyBottom: '#fff0fa',
    hillFar: 0xc9a6f2,
    hillNear: 0xff9ccf,
    water: 0xe05aa8,
    waterLight: 0xffb8e0,
    grass: [0xb03a7a, 0xff8ac6, 0xffd1ea],
    soil: [0x5a2440, 0xf6d4a0, 0xff9e9e, 0x9be0ff],
  },
  {
    id: 'night',
    name: 'Starry Night',
    skyTop: '#0d1640',
    skyBottom: '#3b3f8f',
    hillFar: 0x2a2f6a,
    hillNear: 0x1c2152,
    water: 0x1b3d7a,
    waterLight: 0x4f74c8,
    grass: [0x0f3320, 0x2e7a4a, 0x56b07a],
    soil: [0x120c1c, 0x4a3a5a, 0x3a2c4a, 0x67557a],
    stars: true,
  },
  {
    id: 'volcano',
    name: 'Volcano',
    skyTop: '#3a1414',
    skyBottom: '#c8502a',
    hillFar: 0x5a2a24,
    hillNear: 0x3a1a18,
    water: 0xe0501e,
    waterLight: 0xffb23a,
    grass: [0x1a0c0c, 0x3a2a2a, 0x5a4444],
    soil: [0x140808, 0x4a2a24, 0x6a1a10, 0xff6a2a],
    drift: { color: 0xffa040, up: true },
  },
  {
    id: 'alien',
    name: 'Alien Planet',
    skyTop: '#1a0f3a',
    skyBottom: '#7a3fb8',
    hillFar: 0x3fa89a,
    hillNear: 0x2a7f8a,
    water: 0x7a2fd0,
    waterLight: 0xc88aff,
    grass: [0x1f5a3a, 0x5ae06a, 0xb8ff7a],
    soil: [0x140a24, 0x3a6a8a, 0x2a4a6a, 0x9ae0ff],
    stars: true,
  },
];

export function arenaTheme(id: string | undefined): ArenaTheme {
  return ARENAS.find((a) => a.id === id) ?? ARENAS[0];
}
