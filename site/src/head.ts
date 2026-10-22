// Keeps the page's <head> (title, description, share tags, structured data)
// right as you move between pages. The build writes the same tags into each
// page's HTML file (site/prerender.mjs), which is what search engines and
// social apps read.

import { SITE_URL } from './config';
import { NOT_FOUND, pageMeta, pageSchema } from './seo';

function meta(attr: 'name' | 'property', key: string, content: string | null): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.append(el);
  }
  el.content = content;
}

/** The questions and answers on the page (Help & support), as the build reads them. */
function faqOnPage(): { q: string; a: string }[] {
  const tidy = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('details.faq')].map((d) => ({
    q: tidy(d.querySelector('summary')?.textContent),
    a: tidy(d.querySelector('.faq-answer')?.textContent),
  }));
}

/** Call once the page is on screen (after React has drawn it). */
export function applyHead(path: string, legalTitle?: string): void {
  const m = pageMeta(path, legalTitle);
  const url = SITE_URL + (path === '/' ? '/' : path);
  document.title = m.title;
  meta('name', 'description', m.description);
  meta('name', 'robots', m.noindex ? 'noindex, follow' : null);
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel=canonical]');
  if (m === NOT_FOUND) canonical?.remove();
  else {
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = url;
  }
  meta('property', 'og:title', m.title);
  meta('property', 'og:description', m.description);
  meta('property', 'og:url', url);
  meta('property', 'og:image', SITE_URL + m.image);
  meta('property', 'og:image:alt', m.imageAlt);
  meta('name', 'twitter:title', m.title);
  meta('name', 'twitter:description', m.description);
  meta('name', 'twitter:image', SITE_URL + m.image);
  const ld = document.getElementById('ld-json');
  if (ld) ld.textContent = JSON.stringify(pageSchema(path, faqOnPage()));
}
