// Shop and team-editor pictures for aim styles, explosion effects, arenas,
// music and sound packs, drawn as SVG from the same colours the game uses
// (render/cosmetics.ts, render/arenas.ts, audio/).

import { aimStyle, fxStyle, RAINBOW } from '../render/cosmetics';
import { arenaTheme } from '../render/arenas';
import { hex } from '../render/palette';
import { musicTrack } from '../audio/music';
import { soundPack } from '../audio/sfx';
import { mascotSvg } from './mascot';

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

/** An arena theme: a little landscape in its colours. */
export function arenaSvg(id: string): string {
  const t = arenaTheme(id);
  const g = `arena${++uid}`;
  const parts: string[] = [];
  parts.push(`<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.skyTop}"/><stop offset="1" stop-color="${t.skyBottom}"/></linearGradient></defs>`);
  parts.push(`<rect x="-40" y="-30" width="80" height="60" fill="url(#${g})"/>`);
  if (t.stars) [[-30, -22], [-12, -25], [8, -20], [26, -24], [-22, -12], [18, -10], [34, -16]].forEach(([x, y], i) => parts.push(`<circle cx="${x}" cy="${y}" r="${i % 3 ? 0.9 : 1.4}" fill="#fff"/>`));
  if (t.drift) [[-28, -18], [-8, -10], [14, -22], [30, -6], [-18, 0], [4, 2]].forEach(([x, y]) => parts.push(`<circle cx="${x}" cy="${y}" r="1.4" fill="${hex(t.drift!.color)}"/>`));
  parts.push(`<path d="M-40 6 Q-24 -12 -8 2 T26 -4 T40 4 V30 H-40 Z" fill="${hex(t.hillFar)}"/>`);
  parts.push(`<path d="M-40 12 Q-20 0 0 10 T40 8 V30 H-40 Z" fill="${hex(t.hillNear)}"/>`);
  // An island of ground with its top band, then the sea.
  parts.push(`<path d="M-30 30 L-26 14 Q-12 6 4 12 Q18 6 28 16 L32 30 Z" fill="${hex(t.soil[1])}" stroke="${hex(t.soil[0])}" stroke-width="2"/>`);
  parts.push(`<path d="M-26 14 Q-12 6 4 12 Q18 6 28 16 L27 19 Q18 10 4 15 Q-12 9 -25.5 17 Z" fill="${hex(t.grass[1])}" stroke="${hex(t.grass[0])}" stroke-width="1.2"/>`);
  [[-14, 22], [6, 24], [18, 21]].forEach(([x, y]) => parts.push(`<circle cx="${x}" cy="${y}" r="2" fill="${hex(t.soil[3])}"/>`));
  parts.push(`<rect x="-40" y="24" width="80" height="6" fill="${hex(t.water)}" opacity=".9"/>`);
  parts.push(`<path d="M-40 24 q5 -2 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0" fill="none" stroke="${hex(t.waterLight)}" stroke-width="1.4"/>`);
  return `<svg viewBox="-40 -30 80 60" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`;
}

/** A match music track: a record in its colours, with notes floating off it. */
export function musicSvg(id: string): string {
  const [a, b] = musicTrack(id).colors;
  const g = `music${++uid}`;
  return `<svg viewBox="-40 -30 80 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="${g}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>`
    + `<circle cx="-6" cy="2" r="24" fill="#22252b" stroke="${INK}" stroke-width="2"/>`
    + `<circle cx="-6" cy="2" r="18" fill="none" stroke="#3a3f48" stroke-width="1"/><circle cx="-6" cy="2" r="13" fill="none" stroke="#3a3f48" stroke-width="1"/>`
    + `<circle cx="-6" cy="2" r="9" fill="url(#${g})" stroke="${INK}" stroke-width="1.2"/><circle cx="-6" cy="2" r="1.6" fill="${INK}"/>`
    + `<g fill="${a}" stroke="${INK}" stroke-width="1.2"><ellipse cx="22" cy="-6" rx="4" ry="3"/><path d="M25.5 -6 V-22 l7 3" fill="none" stroke="${INK}" stroke-width="2"/>`
    + `<ellipse cx="30" cy="12" rx="3.4" ry="2.6"/><path d="M33 12 V0" fill="none" stroke="${INK}" stroke-width="1.8"/></g></svg>`;
}

/** A sound pack: a speaker in its colours, with sound waves. */
export function soundSvg(id: string): string {
  const [a, b] = soundPack(id).colors;
  return `<svg viewBox="-40 -30 80 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `<path d="M-26 -8 H-14 L0 -20 V20 L-14 8 H-26 Z" fill="${a}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
    + `<rect x="-26" y="-8" width="12" height="16" fill="${b}" stroke="${INK}" stroke-width="2"/>`
    + `<g fill="none" stroke="${b}" stroke-width="3.5" stroke-linecap="round"><path d="M8 -9 Q13 0 8 9"/><path d="M15 -16 Q24 0 15 16"/><path d="M22 -23 Q35 0 22 23"/></g></svg>`;
}

/** A victory dance: the tardi mid-move, with motion marks for how it moves. */
export function danceSvg(id: string, teamColor = 0xe04848, hat = 'beanie', skin = 'classic'): string {
  const pose: Record<string, string> = {
    classic: 'translate(0 -6)',
    wiggle: 'rotate(-12)',
    spin: 'scale(-1 1)',
    flip: 'rotate(-150)',
    moonwalk: 'translate(6 0) scale(-1 1)',
    floss: 'rotate(14)',
    helicopter: 'translate(0 -10) rotate(30)',
    worm: 'scale(1.1 .8)',
  };
  const marks: Record<string, string> = {
    classic: '<path d="M-14 26 h28" stroke-dasharray="4 4"/>',
    wiggle: '<path d="M-34 -6 q-4 6 0 12 M34 -6 q4 6 0 12"/>',
    spin: '<path d="M-30 -20 A32 14 0 1 0 30 -20"/><path d="M30 -20 l-6 -2 m6 2 l-1 6"/>',
    flip: '<path d="M-26 22 A28 28 0 1 1 26 22"/><path d="M26 22 l2 -7 m-2 7 l-7 -2"/>',
    moonwalk: '<path d="M18 20 h18 M22 14 h14"/>',
    floss: '<path d="M-36 -10 l8 8 l-8 8 M36 -10 l-8 8 l8 8"/>',
    helicopter: '<path d="M-24 -26 h48 M-18 -32 h36"/>',
    worm: '<path d="M-34 22 q8 -10 16 0 t16 0 t16 0 t16 0"/>',
  };
  return `<svg viewBox="-40 -30 80 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `<g fill="none" stroke="${hex(teamColor)}" stroke-width="2.5" stroke-linecap="round">${marks[id] ?? marks.classic}</g>`
    + `<g transform="${pose[id] ?? pose.classic}">${mascotSvg(teamColor, hat, skin).replace('<svg ', '<svg x="-26" y="-20" width="52" height="40" ')}</g></svg>`;
}

/** A gravestone, as left where a tardigrade popped. */
export function graveSvg(id: string, teamColor = 0xe04848): string {
  const c = hex(teamColor);
  const ground = `<path d="M-34 22 Q0 14 34 22 V30 H-34 Z" fill="#6fbf8a" stroke="${INK}" stroke-width="2"/>`;
  const art: Record<string, string> = {
    classic: `<ellipse cx="0" cy="14" rx="16" ry="9" fill="#f6c9ab" opacity=".7" stroke="${INK}" stroke-width="2"/><path d="M-8 10 l5 5 m0 -5 l-5 5 M3 10 l5 5 m0 -5 l-5 5" stroke="${INK}" stroke-width="2"/><circle cx="0" cy="2" r="4" fill="${c}" stroke="${INK}" stroke-width="1.5"/>`,
    stone: `<path d="M-14 20 V-6 Q-14 -20 0 -20 Q14 -20 14 -6 V20 Z" fill="#a9b3bf" stroke="${INK}" stroke-width="2.5"/><text x="0" y="0" font-size="10" font-weight="900" text-anchor="middle" fill="${INK}">RIP</text><rect x="-8" y="6" width="16" height="4" rx="2" fill="${c}"/>`,
    cross: `<path d="M-2 20 V-20 M-12 -8 H10" stroke="#8f5f2e" stroke-width="6" stroke-linecap="round"/><path d="M-2 20 V-20 M-12 -8 H10" stroke="${INK}" stroke-width="1.2" fill="none"/><circle cx="-2" cy="-8" r="3" fill="${c}"/>`,
    flowers: `<path d="M-12 20 L-9 4 H9 L12 20 Z" fill="#c8693a" stroke="${INK}" stroke-width="2"/><path d="M0 4 V-10 M-6 4 Q-8 -4 -10 -8 M6 4 Q8 -4 10 -8" stroke="#3a8a28" stroke-width="2" fill="none"/>${[[-10, -10], [0, -14], [10, -10]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${c}" stroke="${INK}" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="1.8" fill="#ffd84a"/>`).join('')}`,
    ghost: `<path d="M-12 14 V-6 Q-12 -20 0 -20 Q12 -20 12 -6 V14 l-4 -4 l-4 4 l-4 -4 l-4 4 l-4 -4 Z" fill="#f4f6fb" stroke="${INK}" stroke-width="2"/><circle cx="-4" cy="-6" r="2" fill="${INK}"/><circle cx="4" cy="-6" r="2" fill="${INK}"/><ellipse cx="0" cy="18" rx="10" ry="2" fill="${c}" opacity=".5"/>`,
    trophy: `<path d="M-10 -18 H10 V-6 Q10 6 0 6 Q-10 6 -10 -6 Z" fill="#ffd84a" stroke="${INK}" stroke-width="2"/><path d="M-10 -14 Q-18 -14 -16 -6 Q-14 0 -9 0 M10 -14 Q18 -14 16 -6 Q14 0 9 0" fill="none" stroke="${INK}" stroke-width="2"/><rect x="-3" y="6" width="6" height="8" fill="#e0a920" stroke="${INK}" stroke-width="1.5"/><rect x="-10" y="14" width="20" height="6" rx="1" fill="${c}" stroke="${INK}" stroke-width="1.5"/>`,
    rocket: `<path d="M0 -24 Q10 -12 8 10 H-8 Q-10 -12 0 -24 Z" fill="#e8ecf2" stroke="${INK}" stroke-width="2"/><circle cx="0" cy="-8" r="4" fill="${c}" stroke="${INK}" stroke-width="1.5"/><path d="M-8 4 L-14 16 L-7 12 M8 4 L14 16 L7 12" fill="${c}" stroke="${INK}" stroke-width="1.5"/><path d="M-4 12 Q0 22 4 12" fill="#ffb02e" stroke="${INK}" stroke-width="1.2"/>`,
    crystal: `<path d="M0 -24 L10 -4 L6 20 H-6 L-10 -4 Z" fill="#bff3ff" stroke="${INK}" stroke-width="2"/><path d="M0 -24 L-3 20 M0 -24 L3 20 M-10 -4 H10" stroke="#6ab0d8" stroke-width="1.2"/><circle cx="0" cy="-4" r="3" fill="${c}" opacity=".8"/>`,
    founder: `<path d="M0 -8 V-20" stroke="#3a8a28" stroke-width="2.5"/><ellipse cx="-5" cy="-20" rx="5" ry="3" fill="#5aa83a" stroke="${INK}" stroke-width="1.5"/><ellipse cx="5" cy="-23" rx="5" ry="3" fill="#5aa83a" stroke="${INK}" stroke-width="1.5"/><rect x="-14" y="-8" width="28" height="28" rx="4" fill="#ffd84a" stroke="${INK}" stroke-width="2.5"/><text x="0" y="5" font-size="7" font-weight="900" text-anchor="middle" fill="${INK}">FOUNDER</text><rect x="-8" y="12" width="16" height="4" rx="2" fill="${c}"/>`,
  };
  return `<svg viewBox="-40 -30 80 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${ground}<g stroke-linejoin="round">${art[id] ?? art.classic}</g></svg>`;
}
