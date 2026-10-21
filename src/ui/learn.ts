// Light bits of the tutorial and practice for the menu: whether the tutorial
// was seen, and the practice chooser (the matches themselves are in tutorial.ts).

const DONE_KEY = 'tardigeddon.tutorial';

/** Whether this device has started the tutorial before (for the "New here?" nudge). */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* storage blocked */
  }
}

/** Target dummies in Practice. */
export const PRACTICE_TARGETS = 10;

/**
 * Which practice? Pop all the targets (it ends when they're gone), or endless
 * targets that keep coming back until you quit. Shown over the menu.
 */
export function choosePractice(host: HTMLElement, onPick: (endless: boolean) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  const box = document.createElement('div');
  box.className = 'editor practice-choice';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Practice');
  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  const h = document.createElement('h2');
  h.className = 'editor-title';
  h.textContent = '🎯 Practice';
  const p = document.createElement('p');
  p.className = 'account-note';
  p.textContent = 'Your tardigrade can’t be hurt and every weapon has unlimited ammo. The wind blows, and there are brine drums to try.';
  const option = (title: string, text: string, endless: boolean) => {
    const b = document.createElement('button');
    b.className = 'practice-option';
    const t = document.createElement('b');
    t.textContent = title;
    const d = document.createElement('span');
    d.textContent = text;
    b.append(t, d);
    b.onclick = () => {
      close();
      onPick(endless);
    };
    return b;
  };
  const cancel = document.createElement('button');
  cancel.className = 'hud-btn';
  cancel.textContent = 'Cancel';
  cancel.onclick = close;
  box.append(
    h,
    p,
    option(`🎯 Pop ${PRACTICE_TARGETS} targets`, `${PRACTICE_TARGETS} targets around the map. Pop them all to finish.`, false),
    option('♾️ Endless targets', 'Popped targets come back somewhere else. Keep going as long as you like, and quit from the ☰ menu.', true),
    cancel,
  );
  overlay.append(box);
  host.append(overlay);
}
