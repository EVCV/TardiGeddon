// Team emblems: a free badge each team builds from ready-made parts (a
// shape, a picture, two colours and a pattern), shown beside its name and
// health bar, online too. Stored as five numbers, "shape-icon-bg-fg-pattern",
// so it's tiny to send and easy to check. DOM-free: the server checks emblems
// with isEmblem, and the menu and HUD draw them with emblemSvg.

export const EMBLEM_SHAPES = ['circle', 'shield', 'square', 'hexagon', 'diamond', 'star', 'heart', 'pennant', 'cloud', 'burst'] as const;

/** Pictures in the middle of the badge. */
export const EMBLEM_ICONS = [
  '🐻', '🐸', '🐙', '🦀', '🐢', '🦖', '🐉', '🦄', '🐝', '🦋', '🐌', '🦉',
  '🐳', '🦈', '🐧', '🦊', '🐺', '🦁', '🐯', '🐼', '🐨', '🐵', '🐞', '🦠',
  '🍄', '🌵', '🌻', '🍀', '🌙', '⭐', '☀️', '⚡', '🔥', '💧', '❄️', '🌊',
  '🌋', '💎', '👑', '⚓', '🚀', '🛸', '🎯', '🎲', '🎸', '🍕', '🍩', '🧁',
  '🍉', '🍒', '🥑', '💀', '👻', '👽', '🤖', '🎃', '⚔️', '🛡️', '🏆', '🌈',
  '🧪', '🔬', '🧲', '🪐', '🌍', '🗿',
];

export const EMBLEM_COLORS = [
  0xe04848, 0xf07a2a, 0xffd84a, 0x5aa83a, 0x23b5c8, 0x3a7be0, 0x9b59d0, 0xe85fa8,
  0x9a6b3f, 0x2b1b24, 0x7d8a99, 0xffffff, 0x0d1640, 0x1f5a3a,
];

export const EMBLEM_PATTERNS = ['plain', 'stripes', 'dots', 'split', 'chevron', 'rays', 'checks', 'ring'] as const;

const PARTS = [EMBLEM_SHAPES.length, EMBLEM_ICONS.length, EMBLEM_COLORS.length, EMBLEM_COLORS.length, EMBLEM_PATTERNS.length];

export interface Emblem {
  shape: number;
  icon: number;
  bg: number;
  fg: number;
  pattern: number;
}

export function parseEmblem(s: string | undefined): Emblem | null {
  if (typeof s !== 'string' || !/^\d{1,2}(-\d{1,2}){4}$/.test(s)) return null;
  const n = s.split('-').map(Number);
  if (n.some((v, i) => v >= PARTS[i])) return null;
  return { shape: n[0], icon: n[1], bg: n[2], fg: n[3], pattern: n[4] };
}

export function isEmblem(s: unknown): s is string {
  return typeof s === 'string' && parseEmblem(s) !== null;
}

export function emblemString(e: Emblem): string {
  return [e.shape, e.icon, e.bg, e.fg, e.pattern].join('-');
}

/** A different starting badge for each team slot. */
export function defaultEmblem(slot: number): string {
  return emblemString({ shape: slot % EMBLEM_SHAPES.length, icon: (slot * 7) % EMBLEM_ICONS.length, bg: slot % 8, fg: 11, pattern: slot % 3 });
}

/** A random badge (the 🎲 button). */
export function randomEmblem(rand: () => number = Math.random): string {
  const pick = (n: number) => Math.floor(rand() * n);
  const bg = pick(EMBLEM_COLORS.length);
  let fg = pick(EMBLEM_COLORS.length);
  if (fg === bg) fg = (fg + 5) % EMBLEM_COLORS.length;
  return emblemString({ shape: pick(PARTS[0]), icon: pick(PARTS[1]), bg, fg, pattern: pick(PARTS[4]) });
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const INK = '#2b1b24';

/** The outline of each shape in a 100x100 box. */
function shapePath(shape: (typeof EMBLEM_SHAPES)[number]): string {
  switch (shape) {
    case 'circle': return 'M50 4 A46 46 0 1 1 49.9 4 Z';
    case 'shield': return 'M50 4 L92 16 Q92 66 50 96 Q8 66 8 16 Z';
    case 'square': return 'M20 6 H80 Q94 6 94 20 V80 Q94 94 80 94 H20 Q6 94 6 80 V20 Q6 6 20 6 Z';
    case 'hexagon': return 'M50 4 L90 27 V73 L50 96 L10 73 V27 Z';
    case 'diamond': return 'M50 3 L97 50 L50 97 L3 50 Z';
    case 'star': return 'M50 3 L62 36 L97 37 L69 58 L79 93 L50 72 L21 93 L31 58 L3 37 L38 36 Z';
    case 'heart': return 'M50 92 Q6 60 6 32 Q6 8 28 8 Q44 8 50 24 Q56 8 72 8 Q94 8 94 32 Q94 60 50 92 Z';
    case 'pennant': return 'M8 6 H92 V70 L50 96 L8 70 Z';
    case 'cloud': return 'M24 80 Q4 80 6 60 Q8 44 24 44 Q24 18 50 16 Q74 16 78 40 Q96 42 94 62 Q92 80 74 80 Z';
    case 'burst': return 'M50 2 L60 22 L82 12 L78 36 L98 44 L80 58 L92 80 L68 78 L60 98 L50 80 L40 98 L32 78 L8 80 L20 58 L2 44 L22 36 L18 12 L40 22 Z';
  }
}

function patternSvg(p: (typeof EMBLEM_PATTERNS)[number], color: string): string {
  switch (p) {
    case 'stripes': return [0, 1, 2, 3, 4].map((i) => `<rect x="${i * 24 - 10}" y="-20" width="10" height="140" fill="${color}" transform="rotate(30 50 50)"/>`).join('');
    case 'dots': return [15, 38, 62, 85].flatMap((x) => [15, 38, 62, 85].map((y) => `<circle cx="${x}" cy="${y}" r="5" fill="${color}"/>`)).join('');
    case 'split': return `<rect x="50" y="0" width="50" height="100" fill="${color}"/>`;
    case 'chevron': return `<path d="M0 30 L50 60 L100 30 V50 L50 80 L0 50 Z" fill="${color}"/>`;
    case 'rays': return [0, 45, 90, 135].map((a) => `<path d="M50 50 L44 -20 H56 Z M50 50 L44 120 H56 Z" fill="${color}" transform="rotate(${a} 50 50)"/>`).join('');
    case 'checks': return [0, 1, 2, 3, 4].flatMap((x) => [0, 1, 2, 3, 4].map((y) => ((x + y) % 2 ? `<rect x="${x * 20}" y="${y * 20}" width="20" height="20" fill="${color}"/>` : ''))).join('');
    case 'ring': return `<circle cx="50" cy="50" r="34" fill="none" stroke="${color}" stroke-width="7"/>`;
    default: return '';
  }
}

let uid = 0;

/** The label may be a player's team name: never let it out of its attribute. */
function attr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The badge as SVG (any size: it scales). Unknown emblems draw a plain grey badge. */
export function emblemSvg(s: string | undefined, label = 'Team emblem'): string {
  const e = parseEmblem(s) ?? { shape: 0, icon: 0, bg: 10, fg: 11, pattern: 0 };
  const id = `em${++uid}`;
  const path = shapePath(EMBLEM_SHAPES[e.shape]);
  const bg = hex(EMBLEM_COLORS[e.bg]);
  // The pattern in a see-through version of the second colour, so the picture stays clear.
  const fg = hex(EMBLEM_COLORS[e.fg]);
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${attr(label)}">`
    + `<defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs>`
    + `<g clip-path="url(#${id})"><rect width="100" height="100" fill="${bg}"/><g opacity=".45">${patternSvg(EMBLEM_PATTERNS[e.pattern], fg)}</g></g>`
    + `<path d="${path}" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`
    + `<text x="50" y="54" font-size="44" text-anchor="middle" dominant-baseline="middle">${EMBLEM_ICONS[e.icon]}</text>`
    + `</svg>`;
}
