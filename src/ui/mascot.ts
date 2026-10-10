// The TardiGeddon mascot as inline SVG (same design as the in-game tardi).

import { hatSvg } from '../render/hats';
import { patternMarks, skinById, type SkinDef } from '../render/skins';
import { hex } from '../render/palette';

/** Pattern marks, scaled from the in-game body (12 x 7.5 at (0,-1)) to this one (27 x 16 at (0,-2)). */
function patternSvg(skin: SkinDef): string {
  const sx = 27 / 12;
  const sy = 16 / 7.5;
  const X = (x: number) => (x * sx).toFixed(1);
  const Y = (y: number) => ((y + 1) * sy - 2).toFixed(1);
  const m = patternMarks(skin.pattern);
  const c = hex(skin.mark);
  return (
    m.stripes.map(([x0, y0, x1, y1]) => `<line x1="${X(x0)}" y1="${Y(y0)}" x2="${X(x1)}" y2="${Y(y1)}" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>`).join('') +
    m.circles.map(([x, y, r]) => `<circle cx="${X(x)}" cy="${Y(y)}" r="${(r * sx).toFixed(1)}" fill="${c}" stroke="none"/>`).join('')
  );
}

/** A tardi in SVG wearing the given hat (in the team colour) and skin. */
export function mascotSvg(teamColor = 0xe04848, hat = 'beanie', skinId = 'classic'): string {
  const k = skinById(skinId);
  const body = hex(k.body);
  const shade = hex(k.shade);
  return `
<svg viewBox="-40 -40 80 60" xmlns="http://www.w3.org/2000/svg" aria-label="Tardigrade mascot">
  <g stroke="#2b1b24" stroke-linejoin="round" stroke-linecap="round">
    <rect x="-17" y="2" width="7" height="15" rx="3.5" fill="${shade}" stroke-width="2"/>
    <rect x="9" y="2" width="7" height="15" rx="3.5" fill="${shade}" stroke-width="2"/>
    <ellipse cx="0" cy="-2" rx="27" ry="16" fill="${body}" stroke-width="3"/>
    ${patternSvg(k)}
    <ellipse cx="-2" cy="6" rx="20" ry="6" fill="${shade}" opacity=".55" stroke="none"/>
    <path d="M-13 -15 q-3 10 0 19 M-3 -17 q-3 11 0 21 M7 -16 q-3 10 0 19" fill="none" stroke="${shade}" stroke-width="2"/>
    <rect x="-22" y="5" width="8" height="14" rx="4" fill="${body}" stroke-width="2"/>
    <rect x="-9" y="5" width="8" height="14" rx="4" fill="${body}" stroke-width="2"/>
    <rect x="3" y="5" width="8" height="14" rx="4" fill="${body}" stroke-width="2"/>
    <rect x="14" y="5" width="8" height="14" rx="4" fill="${body}" stroke-width="2"/>
    <circle cx="26" cy="0" r="5" fill="${hex(k.mouth)}" stroke-width="2.2"/>
    <circle cx="27" cy="0" r="2" fill="#2b1b24" stroke="none"/>
    <circle cx="10" cy="-9" r="4.6" fill="#fff" stroke-width="2"/>
    <circle cx="17.5" cy="-8" r="6" fill="#fff" stroke-width="2.2"/>
    <circle cx="11" cy="-8.8" r="2.3" fill="#1d1420" stroke="none"/>
    <circle cx="19" cy="-7.5" r="3" fill="#1d1420" stroke="none"/>
    <circle cx="20" cy="-8.8" r="1.1" fill="#fff" stroke="none"/>
  </g>
  ${hatSvg(hat, teamColor, 5, -15, 9)}
</svg>`;
}

export const MASCOT_SVG = mascotSvg();
