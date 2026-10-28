// The menu's sky during a seasonal event (render/seasons.ts): a few things
// drifting down (or up) behind the menu. Snow for the winter festival, blossom
// in spring, leaves and bats for Halloween, confetti at New Year, hearts for
// Valentine's week. Nothing religious: a winter festival, not Christmas.
// South of the equator the seasons are the other way round, so snow becomes
// sparkles in December and blossom becomes autumn leaves in March.

import { currentSeason } from '../render/seasons';

/** Time zones south of the equator (the ones most players there use). */
const SOUTH = ['Australia/', 'Antarctica/', 'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fiji', 'Pacific/Tongatapu', 'America/Sao_Paulo', 'America/Argentina', 'America/Santiago', 'America/Montevideo', 'America/Asuncion', 'Africa/Johannesburg', 'Africa/Maputo', 'Africa/Harare', 'Africa/Windhoek', 'Africa/Lusaka', 'Indian/Mauritius', 'Indian/Reunion'];

function southern(): boolean {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    return SOUTH.some((z) => zone.startsWith(z));
  } catch {
    return false;
  }
}

/** What drifts across the sky for the event on now, and which way. */
function decoration(now: Date): { bits: string[]; up?: boolean } | null {
  const season = currentSeason(now);
  if (!season) return null;
  const south = southern();
  switch (season.id) {
    case 'winter':
      return { bits: south ? ['✨'] : ['❄', '❅', '❆'] };
    case 'newyear':
      return { bits: ['✨', '🎉', '🎊'] };
    case 'valentine':
      return { bits: ['💗', '💕'], up: true };
    case 'spring':
      return { bits: south ? ['🍂', '🍁'] : ['🌸', '🌸', '🌼'] };
    case 'summer':
      return south ? { bits: ['❄', '❅'] } : { bits: ['🫧'], up: true };
    case 'halloween':
      return { bits: ['🍂', '🍁', '🦇'] };
    default:
      return null;
  }
}

/** Decorate the menu's sky if an event is on (behind everything, never in the way). */
export function seasonSky(host: HTMLElement, now = new Date()): void {
  const deco = decoration(now);
  if (!deco) return;
  const sky = document.createElement('div');
  sky.className = 'season-sky' + (deco.up ? ' up' : '');
  sky.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 18; i++) {
    const b = document.createElement('span');
    b.textContent = deco.bits[i % deco.bits.length];
    // Spread across the width, each at its own size, speed and starting point.
    b.style.left = `${(i * 37) % 100}%`;
    b.style.fontSize = `${14 + ((i * 7) % 14)}px`;
    b.style.animationDuration = `${11 + ((i * 5) % 9)}s`;
    b.style.animationDelay = `-${(i * 13) % 17}s`;
    sky.append(b);
  }
  host.prepend(sky);
}
