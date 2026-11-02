// "TardiGeddon has an app": on a phone or tablet's browser, once a visit, a
// reminder that the app is in the store (only once it's live there: src/apps.ts).
// "Play in the app" opens the app if it's installed (Android: an intent link
// that falls back to Google Play; iOS: the App Store page, which says Open
// when it's installed), "Keep playing here" closes it for this visit, and
// "Don't remind me again" for good. Never in the apps themselves.

import { APPS, WEB_GAME, androidOpenLink, appToSuggest, mobileOs } from '../apps';
import { t } from '../i18n/i18n';
import { isNativeApp } from '../native';
import { mascotSvg } from './mascot';

const NEVER_KEY = 'tardigeddon.appNudge';
const VISIT_KEY = 'tardigeddon.appNudgeShown';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const read = (s: Storage | undefined, k: string): boolean => {
  try {
    return s?.getItem(k) !== null && s?.getItem(k) !== undefined;
  } catch {
    return false;
  }
};
const write = (s: Storage | undefined, k: string): void => {
  try {
    s?.setItem(k, '1');
  } catch {
    /* storage blocked: it may ask again next time */
  }
};

/** Shows the reminder over the menu if it's wanted here. `search`: this page's ?settings, carried into the app. */
export function maybeSuggestApp(root: HTMLElement, search = ''): void {
  const os = appToSuggest({
    native: isNativeApp(),
    os: mobileOs(),
    never: read(globalThis.localStorage, NEVER_KEY),
    shownThisVisit: read(globalThis.sessionStorage, VISIT_KEY),
  });
  if (!os) return;
  write(globalThis.sessionStorage, VISIT_KEY);
  const app = APPS[os];

  const overlay = el('div', 'editor-overlay app-nudge');
  const box = el('div', 'editor app-nudge-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  const title = el('h2', 'card-title', t('TardiGeddon has an app!'));
  title.id = 'app-nudge-title';
  box.setAttribute('aria-labelledby', title.id);
  const pic = el('div', 'app-nudge-pic');
  pic.innerHTML = mascotSvg(0xe04848, 'crown');
  const body = el(
    'p',
    '',
    os === 'ios'
      ? t('Free on the App Store for iPhone and iPad: it fills the whole screen, and links from friends open straight in the game. Same account, same stats.')
      : t('Free on Google Play: it fills the whole screen, and links from friends open straight in the game. Same account, same stats.'),
  );
  const get = el('a', 'big-btn app-nudge-get', t('📲 Play in the app'));
  // Android: opens the app at this page (a room link keeps its room), or Google Play if it isn't installed.
  get.href = os === 'android' ? androidOpenLink(WEB_GAME + search, app.url) : app.url;
  get.rel = 'noopener';
  const close = () => overlay.remove();
  const stay = el('button', 'big-btn secondary', t('Keep playing here'));
  stay.onclick = close;
  const never = el('button', 'link-btn app-nudge-never', t('Don’t remind me again'));
  never.onclick = () => {
    write(globalThis.localStorage, NEVER_KEY);
    close();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  overlay.onkeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  box.append(pic, title, body, get, stay, never);
  overlay.append(box);
  root.append(overlay);
  get.focus();
}
