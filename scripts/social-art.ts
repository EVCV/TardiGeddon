// Shared drawing bits for the social pictures (scripts/social-images.ts) and
// the scheduled posts' cards (scripts/social-posts.ts): the game's fonts,
// colours, sky and ground, the mascot and framed screenshots.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mascotSvg } from '../src/ui/mascot';
import { aimSvg, arenaSvg, fxSvg, graveSvg, musicSvg } from '../src/ui/cosmeticArt';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const media = join(root, 'site', 'public', 'media');
export const font = (file: string) => readFileSync(join(root, 'node_modules', '@fontsource', file)).toString('base64');
export const pic = (file: string) => `data:image/webp;base64,${readFileSync(join(media, file)).toString('base64')}`;

export const RED = 0xe04848;
export const BLUE = 0x3a7be0;
export const GREEN = 0x3cb34a;
export const GOLD = 0xe0a020;

export const CSS = `
@font-face { font-family: 'Luckiest Guy'; src: url(data:font/woff2;base64,${font('luckiest-guy/files/luckiest-guy-latin-400-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Nunito'; font-weight: 800; src: url(data:font/woff2;base64,${font('nunito/files/nunito-latin-800-normal.woff2')}) format('woff2'); }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { font-family: 'Nunito', sans-serif; font-weight: 800; color: #2b1b24; }
.sky { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(#7fd3f7, #d9f3ff 75%); }
.ground { position: absolute; left: 0; right: 0; bottom: 0; background: #9c6438; box-shadow: 0 -4px 0 #2b1b24; }
.logo { font-family: 'Luckiest Guy', sans-serif; color: #e04848; -webkit-text-stroke: 5px #2b1b24; paint-order: stroke fill; text-shadow: 0 8px 0 #2b1b24; line-height: 1; letter-spacing: 0.01em; white-space: nowrap; }
.logo span { color: #ffd84a; }
.big { font-family: 'Luckiest Guy', sans-serif; color: #ffd84a; -webkit-text-stroke: 5px #2b1b24; paint-order: stroke fill; text-shadow: 0 8px 0 #2b1b24; line-height: 1.02; }
.badges { display: flex; gap: 14px; }
.badges b { background: #fff8ec; border: 4px solid #2b1b24; border-radius: 999px; padding: 4px 20px; }
.badges b::before { content: '✓ '; color: #3cb34a; }
.shot { position: absolute; border: 8px solid #2b1b24; border-radius: 26px; box-shadow: 0 14px 0 #2b1b24; overflow: hidden; background: #2b1b24; }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.mascot { position: absolute; }
.mascot svg { display: block; width: 100%; height: auto; }
.center { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
`;

export const page = (body: string, w: number, h: number) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="width:${w}px;height:${h}px;position:relative">${body}</body></html>`;
export const shot = (file: string, style: string) => `<div class="shot" style="${style}"><img src="${pic(file)}"></div>`;
export const tardi = (color: number, hat: string, style: string, skin = 'classic') => `<div class="mascot" style="${style}">${mascotSvg(color, hat, skin)}</div>`;
export const ground = (h: number, grass: number) => `<div class="ground" style="height:${h}px;border-top:${grass}px solid #5aa83a"></div>`;

/** A picture from site/public as a data address (the giveaway's prize pictures are JPEGs). */
export const publicPic = (path: string) =>
  `data:image/${path.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(join(root, 'site', 'public', path)).toString('base64')}`;

// ── Looks: the Shop and giveaway items, drawn the way the game's Shop draws them ──

/** The looks the posts can show: "kind:ref" (aim, fx, arena, grave, music, hat) or "badge", with the name printed under it. */
export const LOOK_NAMES: Record<string, string> = {
  'arena:champion': 'Champion’s Arena',
  'music:champion': 'Champion’s Fanfare',
  'hat:champion': 'Champion’s crown',
  'grave:champion': 'Champion’s monument',
  'aim:champion': 'Champion’s sights',
  'fx:champion': 'Champion’s salute',
  'hat:launchwinner': 'Launch Winner’s cup',
  'aim:launchwinner': 'Winner’s laurels',
  badge: '🏆 Launch Winner badge',
};

/** The picture for a look (an 80×60 SVG, or the badge). */
export function lookPic(ref: string, color: number): string {
  const [kind, id] = ref.split(':');
  switch (kind) {
    case 'aim': return aimSvg(id, color);
    case 'fx': return fxSvg(id);
    case 'arena': return arenaSvg(id);
    case 'grave': return graveSvg(id, color);
    case 'music': return musicSvg(id);
    case 'hat': return mascotSvg(color, id);
    default: return '<div class="badge-pic">🏆</div>';
  }
}

export const LOOK_CSS = `
.look { flex: 1 1 0; min-width: 0; background: #fff8ec; border: 6px solid #2b1b24; border-radius: 28px; box-shadow: 0 10px 0 #2b1b24; padding: 16px 16px 14px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; }
.look .pic { flex: none; aspect-ratio: 4 / 3; width: 100%; display: flex; align-items: center; justify-content: center; }
.look .pic svg { width: 100%; height: auto; max-height: 100%; }
.look.arena { padding: 0 0 14px; }
.look.arena .pic svg { height: 100%; border-bottom: 6px solid #2b1b24; }
.look.aim .pic svg, .look.fx .pic svg, .look.music .pic svg { transform: scale(1.15); }
.look .name { position: relative; z-index: 1; font-size: 36px; line-height: 1.1; text-align: center; margin-top: 10px; }
.badge-pic { width: 250px; height: 250px; border-radius: 50%; background: #ffd84a; border: 8px solid #2b1b24; display: flex; align-items: center; justify-content: center; font-size: 150px; }
`;

/** One look in its cream panel, with its name under it. */
export const lookPanel = (ref: string, color: number, style = '') =>
  `<div class="look ${ref.split(':')[0]}" style="${style}"><div class="pic">${lookPic(ref, color)}</div><div class="name">${LOOK_NAMES[ref] ?? ref}</div></div>`;
