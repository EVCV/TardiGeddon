// Aim styles and explosion effects: cosmetics bought in the shop (prices in
// src/shop/catalog.ts). Looks only: they never change how anything plays.
// The renderer draws them in the game; ui/cosmeticArt.ts draws the shop
// previews from the same colours.

export const RAINBOW = [0xe04848, 0xf28a2e, 0xffd84a, 0x5aa83a, 0x3a7be0, 0x8f5bd6];

export interface AimStyle {
  id: string;
  name: string;
  /** Marker colour; 'team' uses the team colour, 'rainbow' cycles. */
  marker: number | 'team' | 'rainbow';
  /** Power bar colours from empty to full; 'heat' is yellow to red, 'rainbow' every colour. */
  bar: [number, number] | 'heat' | 'rainbow' | 'stripes';
  /** A beam from the tardi to the marker. */
  laser?: number;
  /** A glow behind the marker. */
  glow?: number;
  /** Sparkles fizzing around the marker. */
  sparkle?: number[];
  /** Marker drawn as a heart / star instead of a ring. */
  shape?: 'heart' | 'star';
  /** A blazing tail behind the power bar. */
  tail?: boolean;
}

export const AIM_STYLES: AimStyle[] = [
  { id: 'classic', name: 'Classic', marker: 'team', bar: 'heat' },
  { id: 'candy', name: 'Candy cane', marker: 0xe04848, bar: 'stripes' },
  { id: 'laser', name: 'Laser sight', marker: 0xff3b3b, bar: [0xff8a8a, 0xff1a1a], laser: 0xff2a2a },
  { id: 'neon', name: 'Neon', marker: 0x4ff0ff, bar: [0x4ff0ff, 0xff4fd8], glow: 0xff4fd8 },
  { id: 'hearts', name: 'Lovestruck', marker: 0xff5fa8, bar: [0xffb6dc, 0xff2f7a], shape: 'heart' },
  { id: 'rainbow', name: 'Rainbow aim', marker: 'rainbow', bar: 'rainbow' },
  { id: 'sparkle', name: 'Sparkler', marker: 0xfff6c2, bar: [0xfff6c2, 0xffb02e], sparkle: [0xffffff, 0xfff27a, 0xffb02e] },
  { id: 'comet', name: 'Comet', marker: 0xbff3ff, bar: [0x7fd3f7, 0xffffff], shape: 'star', tail: true, glow: 0x7fd3f7 },
  { id: 'gold', name: 'Golden aim', marker: 0xffd84a, bar: [0xfff2a0, 0xe0a920], glow: 0xffd84a, sparkle: [0xfff6c2, 0xffd84a] },
];

export function aimStyle(id: string | undefined): AimStyle {
  return AIM_STYLES.find((a) => a.id === id) ?? AIM_STYLES[0];
}

export interface FxStyle {
  id: string;
  name: string;
  /** The bright flash at the centre. */
  flash: number;
  /** Smoke puff colours (picked in turn). */
  smoke: number[];
  /** Flying bits: earth by default. */
  debris?: number[];
  /** Something extra thrown out of the blast. */
  extra?: { kind: 'confetti' | 'heart' | 'star' | 'coin' | 'snow'; colors: number[] };
}

export const FX_STYLES: FxStyle[] = [
  { id: 'classic', name: 'Classic', flash: 0xfff6c2, smoke: [0x6b5d63] },
  { id: 'confetti', name: 'Party popper', flash: 0xfff6c2, smoke: [0x6b5d63], extra: { kind: 'confetti', colors: [0xff5fa8, 0xffd84a, 0x4ff0ff, 0x5aa83a, 0x8f5bd6] } },
  { id: 'slime', name: 'Slime splat', flash: 0xd8ff9a, smoke: [0x7fd06a, 0x5aa83a], debris: [0x86d43a, 0x4f9a2a] },
  { id: 'frost', name: 'Ice blast', flash: 0xe8f8ff, smoke: [0xcfe9f7, 0xa6d4ef], extra: { kind: 'snow', colors: [0xffffff, 0xd9f3ff] } },
  { id: 'hearts', name: 'Love bomb', flash: 0xffd1e3, smoke: [0xff8fc8, 0xf0525a], extra: { kind: 'heart', colors: [0xff5fa8, 0xe04848, 0xffb6dc] } },
  { id: 'shadow', name: 'Shadow blast', flash: 0xcdb5ff, smoke: [0x3a2a5a, 0x5a3a8a, 0x2b1b24] },
  { id: 'fireworks', name: 'Fireworks', flash: 0xffffff, smoke: [0x6b5d63], extra: { kind: 'star', colors: [0xff5fa8, 0xffd84a, 0x4ff0ff, 0x7dff6a, 0xb18cff] } },
  { id: 'rainbow', name: 'Rainbow blast', flash: 0xffffff, smoke: RAINBOW, extra: { kind: 'star', colors: RAINBOW } },
  { id: 'gold', name: 'Golden blast', flash: 0xfff2a0, smoke: [0xe0b84a, 0xc9a23a], debris: [0xffd84a, 0xe0a920], extra: { kind: 'coin', colors: [0xffd84a, 0xfff2a0] } },
];

export function fxStyle(id: string | undefined): FxStyle {
  return FX_STYLES.find((f) => f.id === id) ?? FX_STYLES[0];
}

/** Mix two colours: t = 0 gives a, 1 gives b. */
export function mixColor(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** A smooth trip round the rainbow: t in [0, 1). */
export function rainbowAt(t: number): number {
  const n = RAINBOW.length;
  const f = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(f);
  return mixColor(RAINBOW[i], RAINBOW[(i + 1) % n], f - i);
}
