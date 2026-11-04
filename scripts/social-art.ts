// Shared drawing bits for the social pictures (scripts/social-images.ts) and
// the scheduled posts' cards (scripts/social-posts.ts): the game's fonts,
// colours, sky and ground, the mascot and framed screenshots.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mascotSvg } from '../src/ui/mascot';

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
