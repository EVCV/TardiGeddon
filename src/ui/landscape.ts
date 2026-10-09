// Phones and tablets play in landscape only: portrait shows a "turn your
// phone" screen over everything, and the first tap asks the browser to go
// fullscreen and lock to landscape (Android honours this; iOS Safari can't
// lock, so the overlay is what enforces it there). Installed apps get the
// same from the manifest's "orientation": "landscape".

export function enforceLandscape(): void {
  document.documentElement.classList.add('touch');
  const el = document.createElement('div');
  el.id = 'rotate';
  el.innerHTML = `
    <div class="rotate-phone" aria-hidden="true"></div>
    <h2>Turn your phone sideways</h2>
    <p>TardiGeddon is played in landscape.</p>`;
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
