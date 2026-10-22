// Phones play in landscape only: a window too narrow to play in (upright, under
// 700px wide: style.css #rotate) shows a "turn your phone" screen over
// everything, and the first tap asks the browser to go fullscreen and lock to
// landscape (Android honours this; iOS Safari can't lock, so the overlay is
// what enforces it there). Installed apps get the same from the manifest's
// "orientation": "landscape". Tablets and the big screen of an open foldable
// are wide enough to play upright too (the iPad app must work every way round:
// docs/IOS.md §7). A window much narrower than its screen is a split screen,
// where turning the phone wouldn't help, so it asks for a wider window instead.
// A screen too small either way up (a flip phone's cover screen) asks for the
// phone to be opened.
// It's decided again whenever the window changes (a foldable opened or closed,
// a split screen dragged).

import { t } from '../i18n/i18n';

export function enforceLandscape(): void {
  document.documentElement.classList.add('touch');
  const el = document.createElement('div');
  el.id = 'rotate';
  let shown = '';
  const show = () => {
    // A cover screen: under 500px whichever way it's held.
    const tiny = Math.max(screen.width, screen.height) < 500;
    // Split screen: the window takes well under the screen's narrow side.
    const split = innerWidth < Math.min(screen.width, screen.height) * 0.85;
    const now = tiny ? 'tiny' : split ? 'split' : 'turn';
    if (now === shown) return;
    shown = now;
    el.innerHTML =
      now === 'tiny'
        ? `<h2>${t('Open your phone')}</h2>
    <p>${t('TardiGeddon needs a bigger screen.')}</p>`
        : now === 'split'
          ? `<h2>${t('Make the window wider')}</h2>
    <p>${t('TardiGeddon needs a wider window to play.')}</p>`
          : `<div class="rotate-phone" aria-hidden="true"></div>
    <h2>${t('Turn your phone sideways')}</h2>
    <p>${t('TardiGeddon is played in landscape.')}</p>`;
  };
  show();
  addEventListener('resize', show);
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
