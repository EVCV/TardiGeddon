// Cartoon art for the coin packs: a pouch, a stack, a chest, a treasure pile,
// a mountain of coins and a dragon's hoard, drawn in the game's ink-outlined style (docs/STYLE_GUIDE.md).

const INK = '#2b1b24';
const GOLD = '#ffd84a';
const GOLD_DARK = '#e8a92a';

/** One coin, seen face-on. */
function coin(x: number, y: number, r: number): string {
  return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>
    <circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="none" stroke="${GOLD_DARK}" stroke-width="2.5"/>
    <path d="M${x - r * 0.35} ${y - r * 0.45} q${r * 0.2} -${r * 0.2} ${r * 0.45} -${r * 0.2}" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>`;
}

/** A coin seen edge-on, for stacks. */
function flat(x: number, y: number, w: number): string {
  return `<g><ellipse cx="${x}" cy="${y + 5}" rx="${w}" ry="${w * 0.32}" fill="${GOLD_DARK}" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * 0.32}" fill="${GOLD}" stroke="${INK}" stroke-width="3"/></g>`;
}

function stack(x: number, base: number, n: number, w = 20): string {
  return Array.from({ length: n }, (_, i) => flat(x, base - i * 8, w)).join('');
}

function sparkle(x: number, y: number, s: number): string {
  return `<path d="M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z" fill="#fff" stroke="${INK}" stroke-width="2"/>`;
}

const ART: Record<string, string> = {
  pouch: `
    <path d="M38 52 Q30 92 60 96 Q90 92 82 52 Q72 44 60 46 Q48 44 38 52 Z" fill="#c98b4e" stroke="${INK}" stroke-width="4"/>
    <path d="M44 50 Q60 38 76 50" fill="none" stroke="${INK}" stroke-width="4"/>
    <path d="M48 46 L44 34 M72 46 L76 34" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    ${coin(50, 34, 10)}${coin(68, 30, 10)}
    <path d="M48 70 Q60 76 72 70" fill="none" stroke="#a96f37" stroke-width="3"/>`,
  stack: `${stack(42, 88, 4)}${stack(78, 88, 6)}${stack(60, 94, 3)}${coin(60, 36, 12)}${sparkle(94, 34, 7)}`,
  chest: `
    <rect x="22" y="56" width="76" height="38" rx="6" fill="#b5652e" stroke="${INK}" stroke-width="4"/>
    ${coin(40, 52, 10)}${coin(58, 46, 11)}${coin(78, 52, 10)}${coin(50, 40, 9)}${coin(68, 38, 9)}
    <path d="M22 62 Q22 50 34 50 L86 50 Q98 50 98 62" fill="#c97a3e" stroke="${INK}" stroke-width="4" transform="rotate(-18 22 56) translate(-4 -18)"/>
    <rect x="22" y="70" width="76" height="6" fill="${GOLD_DARK}" stroke="${INK}" stroke-width="3"/>
    <rect x="54" y="66" width="12" height="16" rx="3" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>
    ${sparkle(100, 30, 7)}`,
  vault: `
    ${stack(26, 94, 4, 16)}${stack(94, 94, 5, 16)}
    <path d="M30 96 Q40 52 60 46 Q80 52 90 96 Z" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>
    ${coin(46, 74, 10)}${coin(70, 76, 10)}${coin(58, 60, 10)}${coin(52, 88, 9)}${coin(76, 90, 8)}
    <path d="M46 40 L52 26 L60 36 L68 26 L74 40 Z" fill="${GOLD}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="60" cy="34" r="3" fill="#e04848" stroke="${INK}" stroke-width="2"/>
    ${sparkle(22, 40, 8)}${sparkle(100, 46, 6)}`,
  mountain: `
    <path d="M10 98 L40 44 L56 64 L72 30 L110 98 Z" fill="${GOLD}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M72 30 L72 12" stroke="${INK}" stroke-width="3"/>
    <path d="M72 12 L90 17 L72 23 Z" fill="#e04848" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    ${coin(36, 82, 9)}${coin(56, 86, 9)}${coin(78, 80, 9)}${coin(94, 90, 8)}${coin(48, 66, 8)}${coin(70, 58, 8)}${coin(24, 92, 7)}
    ${stack(16, 100, 3, 12)}${stack(106, 100, 4, 12)}${sparkle(100, 34, 7)}${sparkle(24, 48, 6)}`,
  dragon: `
    <path d="M14 98 Q20 60 60 56 Q100 60 106 98 Z" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>
    ${coin(34, 86, 9)}${coin(54, 78, 10)}${coin(76, 84, 9)}${coin(92, 92, 8)}${coin(64, 94, 8)}${coin(42, 70, 8)}
    <path d="M70 52 Q74 30 92 26 Q104 24 108 32 Q100 34 98 40 Q94 34 88 38 Q82 44 84 56 Z" fill="#6dbb58" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="96" cy="31" r="2.6" fill="${INK}"/>
    <path d="M84 30 L80 20 L88 26 M92 26 L92 16 L97 25" fill="#6dbb58" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M30 56 Q24 40 34 34 Q36 46 44 50" fill="#6dbb58" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
    ${sparkle(20, 30, 7)}${sparkle(56, 40, 5)}`,
};

/** SVG for a pack's picture: 'pouch', 'stack', 'chest', 'vault', 'mountain' or 'dragon'. */
export function packArt(kind: string): string {
  return `<svg viewBox="0 0 120 110" aria-hidden="true">${ART[kind] ?? ART.pouch}</svg>`;
}

/** A single coin icon, for headings. */
export function coinIcon(): string {
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${coin(20, 20, 16)}</svg>`;
}
