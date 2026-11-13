// The Roadmap view of the News page: what's being worked on now, what's next and
// what's further off (the news posts that are "coming": src/news/roadmap.ts), what
// has recently shipped, a vote for each item and a private box to suggest ideas.
// Voting and sending an idea need an account and pass Cloudflare Turnstile first
// (src/ui/turnstile.ts, server/turnstile.ts). Posts are shown as text, never HTML.

import { account, roadmapVotes, sendSuggestion, turnstilePlatform, voteRoadmap, type MeResponse, type RoadmapVotes } from '../account/session';
import { lang, num, t } from '../i18n/i18n';
import { newsPosts } from '../news/feed';
import type { NewsPost, NewsStage } from '../news/news';
import { STAGES, roadmapOf, summaryOf } from '../news/roadmap';
import { SUGGESTION_CATEGORIES, SUGGESTION_MAX, SUGGESTION_MIN, cleanIdea, textLength, type SuggestionCategory } from '../news/suggest';
import { legalLink, withNodes } from './account';
import type { HubContext } from './hub';
import { preloadTurnstile, withTurnstile } from './turnstile';

/** What the view remembers while the hub redraws the page: the votes, and the idea being typed. */
export interface RoadmapState {
  /** Vote totals and this player's own, once loaded. */
  votes: RoadmapVotes | null;
  /** Who they were loaded for (so signing in or out loads them again), or 'loading'/'failed' while asking or if it didn't work. */
  loaded: 'none' | 'loading' | 'failed' | 'done';
  forUser: string | null;
  /** Which load is the latest: an answer to an older one (someone since signed in or out) is ignored. */
  req: number;
  category: SuggestionCategory;
  text: string;
  preloaded: boolean;
}

export function newRoadmapState(): RoadmapState {
  return { votes: null, loaded: 'none', forUser: null, req: 0, category: 'other', text: '', preloaded: false };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** "28 October 2026", in the player's language. */
export function day(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(lang() === 'en' ? 'en-GB' : lang(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const STAGE_TITLE: Record<NewsStage, () => string> = {
  now: () => t('Now'),
  next: () => t('Next'),
  later: () => t('Later'),
};

const STAGE_BLURB: Record<NewsStage, () => string> = {
  now: () => t('We’re building these.'),
  next: () => t('Coming after that.'),
  later: () => t('Ideas for one day.'),
};

const CATEGORY_LABEL: Record<SuggestionCategory, () => string> = {
  weapon: () => t('A weapon'),
  map: () => t('A map'),
  mode: () => t('A game mode'),
  looks: () => t('Looks'),
  other: () => t('Something else'),
};

/** What the player needs for a vote or an idea: signed in, and the check's site key for this device (the website's, or the apps'). */
function checkKey(): string | null {
  const { me } = account();
  return me?.user ? (me.turnstile?.[turnstilePlatform()] ?? null) : null;
}

/** Ask for the votes (once, and again when someone signs in or out). */
function loadVotes(ctx: HubContext, st: RoadmapState): void {
  // No accounts here (or not loaded yet): no server to ask.
  if (!account().me) return;
  const who = account().me?.user?.id ?? null;
  if (st.loaded !== 'none' && st.forUser === who) return;
  // Someone else (or nobody) now: their votes aren't these, so forget them until the new ones come.
  if (st.forUser !== who) st.votes = null;
  st.loaded = 'loading';
  st.forUser = who;
  const req = ++st.req;
  roadmapVotes()
    .then((v) => {
      if (req !== st.req) return;
      st.votes = v;
      st.loaded = 'done';
    })
    .catch(() => {
      if (req === st.req) st.loaded = 'failed';
    })
    .finally(() => {
      if (req === st.req) ctx.rerender();
    });
}

function itemCard(ctx: HubContext, st: RoadmapState, p: NewsPost, key: string | null): HTMLElement {
  const text = p.text[lang()] ?? p.text.en;
  const card = el('article', 'card roadmap-item');
  card.dataset.id = p.id;
  const heading = el('h3', 'card-title', text.title);
  heading.id = `roadmap-item-${p.id}`;
  card.append(heading);
  const about = summaryOf(text.body);
  if (about) card.append(el('p', 'news-text', about));
  const total = st.votes?.votes[p.id];
  const row = el('div', 'roadmap-vote-row');
  if (key) {
    const mine = st.votes?.mine?.includes(p.id) ?? false;
    const b = el('button', 'hud-btn roadmap-vote' + (mine ? ' on' : ''), mine ? t('✓ Voted') : t('👍 Vote'));
    b.setAttribute('aria-pressed', String(mine));
    // Says which item it is for, to a screen reader going from button to button.
    b.setAttribute('aria-describedby', heading.id);
    // Only once this player's own votes are in: until then "Vote" might really be a vote they already gave.
    b.disabled = ctx.busy || st.loaded !== 'done' || st.forUser !== (account().me?.user?.id ?? null);
    b.onclick = () =>
      ctx.run(async () => {
        const on = !mine;
        const req = st.req;
        const votes = await withTurnstile('roadmap_vote', key, (token) => voteRoadmap(p.id, on, token));
        // Signed in or out meanwhile: the votes shown now are someone else's, and are being loaded afresh.
        if (req !== st.req) return;
        const v = (st.votes ??= { votes: {}, mine: [] });
        v.votes[p.id] = votes;
        v.mine = on ? [...new Set([...(v.mine ?? []), p.id])] : (v.mine ?? []).filter((id) => id !== p.id);
      });
    row.append(b);
  }
  if (total !== undefined) row.append(el('span', 'roadmap-count', t('Votes: {n}', { n: num(total) })));
  if (row.childElementCount) card.append(row);
  return card;
}

function column(ctx: HubContext, st: RoadmapState, stage: NewsStage, items: NewsPost[], key: string | null): HTMLElement {
  const col = el('section', 'roadmap-col');
  col.dataset.stage = stage;
  col.append(el('h2', 'roadmap-col-title', STAGE_TITLE[stage]()), el('p', 'account-note roadmap-col-blurb', STAGE_BLURB[stage]()));
  if (items.length) col.append(...items.map((p) => itemCard(ctx, st, p, key)));
  else col.append(el('p', 'account-note roadmap-empty', t('Nothing here yet.')));
  return col;
}

function shippedCard(items: ReturnType<typeof roadmapOf>['shipped']): HTMLElement {
  const card = el('section', 'card roadmap-shipped');
  card.append(el('h2', 'card-title', t('🎉 Recently shipped')));
  const list = el('ul', 'roadmap-shipped-list');
  for (const s of items.slice(0, 6)) {
    const text = s.post.text[lang()] ?? s.post.text.en;
    const li = el('li');
    li.append(el('b', '', text.title), el('span', 'news-date', ` · ${t('Shipped {date}', { date: day(s.date) })}`));
    list.append(li);
  }
  card.append(list);
  return card;
}

/** Signed out: a line saying why the votes can't be used, and a way to sign in. */
function signInPrompt(ctx: HubContext): HTMLElement | null {
  const { me } = account();
  if (!me || me.user) return null;
  const box = el('p', 'account-note roadmap-signin');
  box.append(t('Sign in to vote and to suggest ideas. You can always see what we’re working on.'), ' ');
  const b = el('button', 'link-btn', t('Sign in'));
  b.onclick = () => ctx.go('account');
  box.append(b);
  return box;
}

function suggestCard(ctx: HubContext, st: RoadmapState, me: MeResponse, key: string | null): HTMLElement {
  const card = el('section', 'card roadmap-suggest');
  card.append(el('h2', 'card-title', t('💡 Suggest an idea')));
  if (!me.user) {
    card.append(el('p', 'news-text', t('Sign in to send us an idea.')));
    const b = el('button', 'big-btn', t('Sign in'));
    b.onclick = () => ctx.go('account');
    card.append(b);
    return card;
  }
  if (!me.user.emailVerified) {
    card.append(el('p', 'news-text', t('Confirm your email (on the Account page) to send us ideas.')));
    const b = el('button', 'hud-btn', t('Go to Account'));
    b.onclick = () => ctx.go('account');
    card.append(b);
    return card;
  }
  if (!key) {
    card.append(el('p', 'news-text', t('Ideas aren’t open right now. Please try again later.')));
    return card;
  }
  card.append(el('p', 'news-text', t('A weapon, a map, a mode, new looks: tell us what you’d love to see. Only we read these, and we can’t reply to each one.')));
  const form = el('form', 'roadmap-form');
  const catLabel = el('label', 'roadmap-label', t('My idea is about'));
  const select = el('select', 'field roadmap-category');
  select.id = 'roadmap-category';
  catLabel.htmlFor = select.id;
  for (const c of SUGGESTION_CATEGORIES) {
    const o = el('option', '', CATEGORY_LABEL[c]());
    o.value = c;
    o.selected = st.category === c;
    select.append(o);
  }
  select.onchange = () => (st.category = select.value as SuggestionCategory);
  const textLabel = el('label', 'roadmap-label', t('My idea'));
  const area = el('textarea', 'field roadmap-text');
  area.id = 'roadmap-text';
  textLabel.htmlFor = area.id;
  area.rows = 4;
  area.maxLength = SUGGESTION_MAX;
  area.value = st.text;
  const count = el('span', 'account-note roadmap-count-chars', `${textLength(st.text)}/${SUGGESTION_MAX}`);
  const note = el('p', 'account-note roadmap-note');
  note.setAttribute('role', 'status');
  area.oninput = () => {
    st.text = area.value;
    count.textContent = `${textLength(area.value)}/${SUGGESTION_MAX}`;
    note.textContent = '';
  };
  const go = el('button', 'big-btn roadmap-send', t('Send my idea'));
  go.type = 'submit';
  go.disabled = ctx.busy;
  form.append(catLabel, select, textLabel, area, count, go, note);
  form.onsubmit = (e) => {
    e.preventDefault();
    const idea = cleanIdea(area.value);
    if ('problem' in idea) {
      note.textContent =
        idea.problem === 'short'
          ? t('Please say a little more: an idea needs at least {n} characters.', { n: SUGGESTION_MIN })
          : idea.problem === 'long'
            ? t('That’s a bit long: ideas can be up to {n} characters.', { n: SUGGESTION_MAX })
            : t('Something went wrong. Please try again.');
      return;
    }
    ctx.run(async () => {
      await withTurnstile('suggestion', key, (token) => sendSuggestion(st.category, idea.text, token));
      st.text = '';
      ctx.notify(t('Thank you! We read every idea.'));
    });
  };
  const privacy = el('p', 'account-note');
  privacy.append(
    ...withNodes(t('Your idea is kept with your account, and only we can see it. A security check from Cloudflare runs when you send it. See the {privacy}.'), {
      privacy: legalLink('privacy-policy', t('Privacy Policy')),
    }),
  );
  card.append(form, privacy);
  return card;
}

/** The Roadmap view's cards, in the order they show. */
export function roadmapCards(ctx: HubContext, st: RoadmapState): HTMLElement[] {
  const { me } = account();
  const key = checkKey();
  // Signed in: start loading Cloudflare's script now, so the first vote doesn't wait for it.
  if (key && !st.preloaded) {
    st.preloaded = true;
    preloadTurnstile();
  }
  loadVotes(ctx, st);
  const plan = roadmapOf(newsPosts());

  const intro = el('section', 'card roadmap-intro');
  intro.append(el('p', 'news-text', t('Here’s what we’re working on, and what might come next. A vote helps us decide what comes first, but it isn’t a promise.')));
  const prompt = signInPrompt(ctx);
  if (prompt) intro.append(prompt);
  if (me?.user && !key) intro.append(el('p', 'account-note', t('Voting isn’t open right now. Please try again later.')));
  if (st.loaded === 'failed') {
    const retry = el('button', 'hud-btn', t('Try again'));
    retry.onclick = () => {
      st.loaded = 'none';
      ctx.rerender();
    };
    const p = el('p', 'account-note', t('Can’t show the votes right now.'));
    p.append(' ', retry);
    intro.append(p);
  }

  const cols = el('div', 'roadmap-cols');
  for (const stage of STAGES) cols.append(column(ctx, st, stage, plan[stage], key));
  const cards: HTMLElement[] = [intro, cols];
  if (plan.shipped.length) cards.push(shippedCard(plan.shipped));
  // Only where there are accounts to send ideas from.
  if (me) cards.push(suggestCard(ctx, st, me, key));
  return cards;
}
