// "Keep up to date by email" (server/newsletter.ts): on the News page and the
// Account page. Signed in, it's a switch for the account's email; signed
// out, an address and a 13+ tick, and we email a link that subscribes it.
// Never ticked for anyone: news only goes to people who ask for it.

import { account, askForNews, setNews, type NewsSource } from '../account/session';
import { legalLink, withNodes } from './account';
import type { HubContext } from './hub';
import { t } from '../i18n/i18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** What people agree to (the server keeps the English as proof of consent: NEWSLETTER_WORDING). */
export const newsWording = (): string => t('Email me TardiGeddon news: new updates, events and offers, a few times a month at most. I can unsubscribe at any time.');

export function newsSignupBox(ctx: HubContext, source: NewsSource): HTMLElement {
  const { me } = account();
  const box = el('section', 'card news-signup');
  box.append(el('h2', 'card-title', t('📬 Keep up to date by email')));
  if (!me) return box; // accounts off here: nothing to sign up to
  const note = el('p', 'account-note news-signup-note');
  note.setAttribute('role', 'status');

  if (me.user) {
    const status = me.newsletter?.status ?? 'no';
    box.append(
      el('p', 'news-signup-text', status === 'subscribed'
        ? t('You get TardiGeddon news at {email}.', { email: me.user.email })
        : status === 'pending'
          ? t('Nearly there: confirm your email (the link is in your inbox) and the news starts coming to {email}.', { email: me.user.email })
          : t('New updates, events and offers, a few times a month at most, to {email}.', { email: me.user.email })),
    );
    const b = el('button', status === 'no' ? 'big-btn news-signup-go' : 'hud-btn news-signup-go', status === 'no' ? t('📬 Yes, email me the news') : t('Stop emailing me the news'));
    b.disabled = ctx.busy;
    b.onclick = () => ctx.run(async () => {
      await setNews(status === 'no', source);
      ctx.notify(status === 'no' ? t('Done! TardiGeddon news is on its way.') : t('Done: no more news emails. (We still email you about your account.)'));
    });
    box.append(b, note);
    if (status === 'no') box.append(el('p', 'account-note', t('You can stop at any time, here or with the link in any email.')));
    return box;
  }

  // Signed out: an address, and a tick for 13+ (the same rule as accounts).
  box.append(el('p', 'news-signup-text', t('New updates, events and offers, a few times a month at most.')));
  const form = el('form', 'news-signup-form');
  const input = el('input', 'field');
  input.type = 'email';
  input.required = true;
  input.autocomplete = 'email';
  input.placeholder = t('Your email');
  input.setAttribute('aria-label', t('Your email'));
  const age = el('label', 'account-check');
  const tick = el('input');
  tick.type = 'checkbox';
  const words = el('span');
  words.append(...withNodes(t('I’m 13 or over. {wording} See the {privacy}.', { wording: newsWording() }), { privacy: legalLink('privacy-policy', t('Privacy Policy')) }));
  age.append(tick, words);
  const go = el('button', 'big-btn news-signup-go', t('📬 Sign me up'));
  go.type = 'submit';
  form.append(input, age, go);
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!tick.checked) {
      note.textContent = t('Please tick the box first.');
      return;
    }
    ctx.run(async () => {
      try {
        await askForNews(input.value.trim(), true, source);
        form.replaceWith(el('p', 'news-signup-done', t('Check your inbox: click the link in our email to start getting the news.')));
      } catch (err) {
        note.textContent = err instanceof Error ? err.message : String(err);
      }
    });
  };
  box.append(form, note);
  return box;
}
