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
  /** Drawn round the ring and cross hairs: a laurel wreath, or a crown above them. */
  emblem?: 'laurel' | 'crown';
  /** A blazing tail behind the power bar (sparks in the sparkle colours, if it has them). */
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
  // The Patron pack's (limited time, never in the shop).
  { id: 'goldheart', name: 'Golden heart', marker: 0xffd84a, bar: [0xffb6dc, 0xffd84a], shape: 'heart', glow: 0xffb6dc, sparkle: [0xffffff, 0xffd84a, 0xff8fc8] },
  // The Launch Winner and Launch Champion sets' (launch giveaway prizes; never sold).
  { id: 'launchwinner', name: 'Winner’s laurels', marker: 0xffd84a, bar: [0xffe9a0, 0xf28a1e], emblem: 'laurel', glow: 0xffe27a, sparkle: [0xffffff, 0xfff2a0, 0xffd84a], tail: true },
  { id: 'champion', name: 'Champion’s sights', marker: 0xffd84a, bar: [0xff5f7a, 0xffd84a], emblem: 'crown', laser: 0xffd84a, glow: 0xffe27a, sparkle: [0xffffff, 0xffd84a, 0xff8fa0, 0xb388ff], tail: true },
  // The Superfan pack's (a creator's code; never sold).
  { id: 'spotlight', name: 'Spotlight', marker: 0xffd84a, bar: [0xb388ff, 0xffd84a], shape: 'star', glow: 0xfff2a0, sparkle: [0xffffff, 0xffd84a, 0xb388ff] },
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
  extra?: { kind: 'confetti' | 'heart' | 'star' | 'coin' | 'snow' | 'crown'; colors: number[] };
  /** A second kind of something extra. */
  also?: { kind: 'confetti' | 'heart' | 'star' | 'coin' | 'snow' | 'crown'; colors: number[] };
  /** Rings of light spreading out from the blast, one per colour. */
  rings?: number[];
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
  // The Superfan pack's (a creator's code; never sold): gold and purple stars, like a crowd cheering.
  { id: 'fanfare', name: 'Fanfare', flash: 0xfff6c2, smoke: [0x8f5bd6, 0x6b5d63], extra: { kind: 'star', colors: [0xffd84a, 0xb388ff, 0xffffff] } },
  // The Launch Champion set's (a launch giveaway prize; never sold): a royal salute of rings, crowns and stars.
  { id: 'champion', name: 'Champion’s salute', flash: 0xfff2a0, smoke: [0xe8b84a, 0xc23a54, 0x7a4ab8], debris: [0xffd84a, 0xfff2a0, 0xe0a920], extra: { kind: 'crown', colors: [0xffd84a, 0xfff2a0] }, also: { kind: 'star', colors: [0xffffff, 0xff8fa0, 0xb388ff, 0xffd84a] }, rings: [0xffd84a, 0xffffff] },
];

export function fxStyle(id: string | undefined): FxStyle {
  return FX_STYLES.find((f) => f.id === id) ?? FX_STYLES[0];
}

/** A laurel wreath round a marker of radius r at (x, y), open at the top: leaves as flat [x, y, ...] polygons. */
export function laurelLeaves(x: number, y: number, r: number): number[][] {
  const leaves: number[][] = [];
  const lean = 0.45;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const a = side * (0.35 + i * 0.38);
      // The leaf's middle on a circle round the marker; it points along the circle, leaning outwards.
      const nx = Math.sin(a);
      const ny = Math.cos(a);
      const tx = side * Math.cos(a);
      const ty = -side * Math.sin(a);
      const ax = tx * Math.cos(lean) + nx * Math.sin(lean);
      const ay = ty * Math.cos(lean) + ny * Math.sin(lean);
      const px = x + nx * r * 1.75;
      const py = y + ny * r * 1.75;
      const l = r * 0.55;
      const w = r * 0.28;
      leaves.push([px - ax * l, py - ay * l, px + nx * w, py + ny * w, px + ax * l, py + ay * l, px - nx * w, py - ny * w]);
    }
  }
  return leaves;
}

/** A little crown of "size" r with its base middle at (x, y): a flat [x, y, ...] polygon. */
export function crownShape(x: number, y: number, r: number): number[] {
  const w = r * 1.1;
  const h = r * 1.2;
  return [x - w, y + h / 2, x - w, y - h / 2, x - w / 2, y - h * 0.05, x, y - h * 0.75, x + w / 2, y - h * 0.05, x + w, y - h / 2, x + w, y + h / 2];
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
