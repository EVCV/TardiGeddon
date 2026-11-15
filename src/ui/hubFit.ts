// Big screens: the menu grows with the screen (the `--hub-zoom` steps in style.css),
// but only as far as the lobby still fits the screen's height. The steps go by
// width, and a wide but short window (a 1920×1080 screen less the browser's bars)
// has less height than the zoomed lobby needs, so its bottom row ran off the screen.
// Here the lobby is measured at zoom 1 and the zoom (`--hub-fit`) set so it fits:
// never more than the step, and a little less than 1 on short windows.
// Every page uses the lobby's zoom, so the bar doesn't change size between pages
// (the other pages scroll as they always have).

/** The big-screen lobby: three columns, laid out to fit the screen (style.css, "Big screens"). */
const BIG = '(min-width: 1500px) and (min-height: 501px) and (pointer: fine), (min-width: 1500px) and (min-height: 901px)';
/** The smallest zoom fitting may use; shorter than that, the page scrolls. */
const LEAST = 0.85;
/** Room under the cards (their shadows) at zoom 1. */
const GAP = 14;

/** The lobby page's height at zoom 1, from the top bar to the cards' bottom, when last measured (0: never). */
let natural = 0;

/** Fit the menu to the screen; `measure` when the lobby is showing (its height may have changed). */
export function fitHub(shell: HTMLElement, measure: boolean): void {
  const root = document.documentElement;
  if (!shell.isConnected || !matchMedia(BIG).matches || root.hasAttribute('data-phone-menu')) {
    shell.style.removeProperty('--hub-fit');
    return;
  }
  if (measure) natural = measureLobby(shell) || natural;
  if (!natural) return;
  const most = Number(getComputedStyle(shell).getPropertyValue('--hub-zoom')) || 1;
  // Bigger text chosen in Settings: never made smaller than normal to fit.
  const least = Math.min(most, root.hasAttribute('data-scaled') ? 1 : LEAST);
  const z = Math.max(least, Math.min(most, shell.clientHeight / natural));
  shell.style.setProperty('--hub-fit', String(Math.floor(z * 100) / 100));
}

/** The height the menu needs, at zoom 1, to show the whole lobby (the footer's links may scroll). */
function measureLobby(shell: HTMLElement): number {
  const page = shell.querySelector<HTMLElement>('.hub-page');
  if (!page || !page.firstElementChild) return 0;
  shell.style.setProperty('--hub-fit', '1');
  // Offsets ignore the Text size scaling (a transform), so these are in the menu's own pixels.
  let above = 0;
  for (const part of shell.children) {
    if (part === page) break;
    // Only what takes up room above the page: not the season's sky behind it (position: fixed).
    if (!(part instanceof HTMLElement)) continue;
    const pos = getComputedStyle(part).position;
    if (pos !== 'fixed' && pos !== 'absolute') above += part.offsetHeight;
  }
  let top = Infinity;
  let bottom = 0;
  for (const child of page.children) {
    if (!(child instanceof HTMLElement)) continue;
    top = Math.min(top, child.offsetTop);
    bottom = Math.max(bottom, child.offsetTop + child.offsetHeight);
  }
  const padTop = parseFloat(getComputedStyle(page).paddingTop) || 0;
  return bottom > top ? Math.ceil(above + padTop + (bottom - top) + GAP) : 0;
}
