// The News page of the menu hub: what's new (release notes), what's coming,
// and known problems being fixed (src/news/news.ts, kept up to date from the
// website by src/news/feed.ts). Posts come in the player's language; they are
// only ever shown as text, never as HTML.

import { lang, t } from '../i18n/i18n';
import { markNewsRead, newsPosts } from '../news/feed';
import type { NewsPost } from '../news/news';
import { postsIn, type NewsSection } from '../news/sections';
import type { HubContext } from './hub';

export interface NewsState {
  section: NewsSection;
}

export function newNewsState(): NewsState {
  return { section: 'new' };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** "28 October 2026", in the player's language. */
function day(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(lang() === 'en' ? 'en-GB' : lang(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function postCard(p: NewsPost): HTMLElement {
  const text = p.text[lang()] ?? p.text.en;
  const c = el('article', 'card news-post');
  c.dataset.kind = p.fixed ? 'fixed' : p.kind;
  const when =
    p.kind === 'coming'
      ? t('Expected {date}', { date: day(p.date) })
      : p.kind === 'issue'
        ? p.fixed
          ? t('✅ Fixed {date}', { date: day(p.fixed) })
          : t('🔧 Being fixed · reported {date}', { date: day(p.date) })
        : day(p.date);
  c.append(el('p', 'news-date', when), el('h2', 'card-title', text.title));
  // Paragraphs, and runs of "- " lines as bullet lists.
  let list: HTMLUListElement | null = null;
  for (const line of text.body) {
    if (line.startsWith('- ')) {
      if (!list) c.append((list = el('ul', 'news-list')));
      list.append(el('li', '', line.slice(2)));
    } else {
      list = null;
      c.append(el('p', 'news-text', line));
    }
  }
  return c;
}

export function renderNewsPage(ctx: HubContext, state: NewsState): HTMLElement {
  markNewsRead();
  const page = el('div', 'page page-news');
  const head = el('section', 'card news-head');
  head.append(el('h2', 'card-title', t('📰 News')));
  const pills = el('div', 'seg news-pills');
  const all = newsPosts();
  const sections: [NewsSection, string][] = [
    ['new', t('What’s new')],
    ['coming', t('Coming soon')],
    ['fixing', t('Being fixed')],
  ];
  for (const [id, label] of sections) {
    const b = el('button', 'seg-btn' + (state.section === id ? ' on' : ''), label);
    b.setAttribute('aria-pressed', String(state.section === id));
    b.onclick = () => {
      state.section = id;
      ctx.rerender();
    };
    pills.append(b);
  }
  head.append(pills);
  page.append(head);

  const shown = postsIn(state.section, all);
  if (shown.length) page.append(...shown.map(postCard));
  else {
    const empty = el('section', 'card news-empty');
    empty.append(
      el(
        'p',
        'account-note',
        state.section === 'fixing'
          ? t('No known problems right now. Found one? Email support@tardigeddon.com and tell us what happened and on which device.')
          : state.section === 'coming'
            ? t('Nothing announced just now. Check back soon!')
            : t('No updates yet.'),
      ),
    );
    page.append(empty);
  }
  if (state.section === 'fixing' && shown.length) {
    page.append(el('p', 'account-note news-foot', t('Found another problem? Email support@tardigeddon.com and tell us what happened and on which device.')));
  }
  return page;
}
