// Phones play in landscape only: a window too narrow to play in (upright, under
// 700px wide: style.css #rotate) shows a "turn your phone" screen over
// everything, and the first tap asks the browser to go fullscreen and lock to
// landscape (Android honours this; iOS Safari can't lock, so the overlay is
// what enforces it there). Installed apps get the same from the manifest's
// "orientation": "landscape". Tablets are wide enough to play upright too (the
// iPad app must work every way round: docs/IOS.md §7); on one, the overlay only
// shows in a narrow split-screen window, so it asks for a wider window instead.

import { t } from '../i18n/i18n';

export function enforceLandscape(): void {
  document.documentElement.classList.add('touch');
  const el = document.createElement('div');
  el.id = 'rotate';
  // A tablet: its screen is wide enough to play on either way up.
  const tablet = Math.min(screen.width, screen.height) >= 700;
  el.innerHTML = tablet
    ? `<h2>${t('Make the window wider')}</h2>
    <p>${t('TardiGeddon needs a wider window to play.')}</p>`
    : `<div class="rotate-phone" aria-hidden="true"></div>
    <h2>${t('Turn your phone sideways')}</h2>
    <p>${t('TardiGeddon is played in landscape.')}</p>`;
  document.body.appendChild(el);

  const lock = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      /* not supported here; the overlay still covers portrait */
    }
  };
  window.addEventListener('pointerdown', () => void lock(), { once: true, capture: true });
}
