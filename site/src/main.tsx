import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/luckiest-guy';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './styles.css';
import { App } from './App';
import { noteStart } from './boot';
import { APPS, androidOpenLink, mobileOs } from '../../src/apps';

// Android, once the app is on Google Play: Play opens the app when it's
// installed (an intent: link; tardigeddon.com links inside tardigeddon.com
// never open apps by themselves), else the web game, which reminds them the
// app exists. Not for players who said "Don't remind me again" in the game.
document.addEventListener('click', (e) => {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || !/^\/play\/?$/.test(u.pathname)) return;
  if (mobileOs() !== 'android' || !APPS.android.live) return;
  try {
    if (localStorage.getItem('tardigeddon.appNudge')) return;
  } catch {
    /* storage blocked: offer the app */
  }
  e.preventDefault();
  location.href = androidOpenLink(`https://tardigeddon.com${u.pathname}${u.search}`, u.href);
});

// The build writes each page's HTML (site/prerender.mjs), so the page is
// usually on screen already; React then takes over and draws it afresh.
const root = document.getElementById('root')!;
noteStart(root.hasChildNodes());
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
