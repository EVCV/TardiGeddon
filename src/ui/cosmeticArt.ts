// Shop and team-editor pictures for aim styles and explosion effects, drawn
// as SVG from the same colours the game uses (render/cosmetics.ts).

import { aimStyle, fxStyle, RAINBOW } from '../render/cosmetics';
import { hex } from '../render/palette';

const INK = '#2b1b24';
let uid = 0;

function heart(x: number, y: number, r: number, fill: string): string {
  return `<path d="M${x} ${y + r} C${x - r * 1.6} ${y - r * 0.2} ${x - r * 0.7} ${y - r * 1.4} ${x} ${y - r * 0.45} C${x + r * 0.7} ${y - r * 1.4} ${x + r * 1.6} ${y - r * 0.2} ${x} ${y + r} Z" fill="${fill}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

function star(x: number, y: number, r: number, fill: string, turn = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = turn + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`;
}

/** An aim style: the power bar charging up towards the marker. */
export function aimSvg(id: string, teamColor = 0xe04848): string {
  const st = aimStyle(id);
  const g = `aimg${++uid}`;
  const marker = st.marker === 'team' ? hex(teamColor) : st.marker === 'rainbow' ? `url(#${g}m)` : hex(st.marker);
  const stops =
    st.bar === 'heat'
      ? [['0', '#ffe14a'], ['1', '#e5332a']]
      : st.bar === 'rainbow'
        ? RAINBOW.map((c, i) => [`${i / (RAINBOW.length - 1)}`, hex(c)])
        : st.bar === 'stripes'
          ? Array.from({ length: 8 }, (_, i) => [[`${i / 8}`, i % 2 ? '#ffffff' : '#e04848'], [`${(i + 1) / 8}`, i % 2 ? '#ffffff' : '#e04848']]).flat()
          : [['0', hex(st.bar[0])], ['1', hex(st.bar[1])]];
  const defs = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>${
    st.marker === 'rainbow' ? `<linearGradient id="${g}m" x1="0" y1="0" x2="1" y2="1">${RAINBOW.map((c, i) => `<stop offset="${i / (RAINBOW.length - 1)}" stop-color="${hex(c)}"/>`).join('')}</linearGradient>` : ''
  }</defs>`;
  // Bar from bottom-left up towards the marker at (20, -10).
  const bar = `<polygon points="-30,16 8,-3 4,-11" transform="rotate(0)" fill="url(#${g})" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  const mx = 22;
  const my = -12;
  const parts: string[] = [];
  if (st.tail) for (let i = 0; i < 4; i++) parts.push(star(-24 + i * 7, 18 - i * 6 + (i % 2) * 4, 2.6, i % 2 ? '#ffffff' : '#7fd3f7'));
  if (st.laser !== undefined) parts.push(`<line x1="-30" y1="16" x2="${mx}" y2="${my}" stroke="${hex(st.laser)}" stroke-width="5" opacity=".25"/><line x1="-30" y1="16" x2="${mx}" y2="${my}" stroke="${hex(st.laser)}" stroke-width="1.6"/>`);
  if (st.glow !== undefined) parts.push(`<circle cx="${mx}" cy="${my}" r="15" fill="${hex(st.glow)}" opacity=".3"/>`);
  if (st.shape === 'heart') parts.push(heart(mx, my, 9, marker));
  else if (st.shape === 'star') parts.push(star(mx, my, 11, marker));
  else
    parts.push(
      `<circle cx="${mx}" cy="${my}" r="8" fill="none" stroke="${INK}" stroke-width="4"/><circle cx="${mx}" cy="${my}" r="8" fill="none" stroke="${marker}" stroke-width="2.5"/>` +
        `<path d="M${mx - 13} ${my}h7M${mx + 6} ${my}h7M${mx} ${my - 13}v7M${mx} ${my + 6}v7" stroke="${marker}" stroke-width="2.5" stroke-linecap="round"/>`,
    );
  if (st.sparkle) st.sparkle.slice(0, 3).forEach((c, i) => parts.push(star(mx + [-14, 13, 4][i], my + [-9, 6, -17][i], 3.2, hex(c), i)));
  return `<svg viewBox="-40 -30 80 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${bar}${parts.join('')}</svg>`;
}

/** An explosion effect: the flash, its smoke and what it throws out. */
export function fxSvg(id: string): string {
  const st = fxStyle(id);
  const parts: string[] = [];
  const smoke = [
    [-14, 6, 10],
    [12, 8, 9],
    [-4, -10, 11],
    [14, -8, 8],
    [-18, -6, 7],
  ];
  smoke.forEach(([x, y, r], i) => parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${hex(st.smoke[i % st.smoke.length])}" opacity=".85"/>`));
  parts.push(`<circle cx="0" cy="0" r="14" fill="#ffb13b" opacity=".8"/><circle cx="0" cy="0" r="9" fill="${hex(st.flash)}"/>`);
  const bits = [
    [-26, -16],
    [24, -18],
    [-30, 10],
    [28, 12],
    [0, -24],
    [-12, 20],
    [14, 22],
  ];
  const colors = st.extra?.colors ?? st.debris ?? [0x9c6438];
  bits.forEach(([x, y], i) => {
    const c = hex(colors[i % colors.length]);
    switch (st.extra?.kind) {
      case 'heart':
        parts.push(heart(x, y, 5, c));
        break;
      case 'star':
        parts.push(star(x, y, 5.5, c, i));
        break;
      case 'coin':
        parts.push(`<ellipse cx="${x}" cy="${y}" rx="${3 + (i % 3)}" ry="5" fill="${c}" stroke="${INK}" stroke-width="1.4"/>`);
        break;
      case 'snow':
        parts.push(`<circle cx="${x}" cy="${y}" r="3" fill="${c}" stroke="#a6d4ef" stroke-width="1"/>`);
        break;
      case 'confetti':
        parts.push(`<rect x="${x - 3}" y="${y - 2}" width="6" height="4" fill="${c}" transform="rotate(${i * 37} ${x} ${y})"/>`);
        break;
      default:
        parts.push(`<circle cx="${x}" cy="${y}" r="3" fill="${c}" stroke="${INK}" stroke-width="1"/>`);
    }
  });
  return `<svg viewBox="-40 -30 80 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`;
}
