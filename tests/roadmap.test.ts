import { describe, expect, it } from 'vitest';
import { NEWS, type NewsPost } from '../src/news/news';
import { comingIds, roadmapOf, shippedIds, stageOf, summaryOf } from '../src/news/roadmap';
import { postsIn } from '../src/news/sections';
import { cleanNews } from '../src/news/feed';
import { SUGGESTION_MAX, SUGGESTION_MIN, cleanIdea, cleanText, ideaKey, isSuggestionCategory, isSuggestionStatus, textLength } from '../src/news/suggest';
import { allow } from '../server/roadmap';

const text = NEWS[0].text;
const post = (id: string, kind: NewsPost['kind'], date: string, more: Partial<NewsPost> = {}): NewsPost => ({ id, kind, date, text, ...more });

describe('the roadmap (src/news/roadmap.ts)', () => {
  it('puts coming posts in their stage, and a post with no stage in Next', () => {
    expect(stageOf(post('a', 'coming', '2026-01-01', { stage: 'now' }))).toBe('now');
    expect(stageOf(post('a', 'coming', '2026-01-01', { stage: 'later' }))).toBe('later');
    expect(stageOf(post('a', 'coming', '2026-01-01'))).toBe('next');
    const r = roadmapOf([post('n', 'coming', '2026-03-01', { stage: 'now' }), post('x', 'coming', '2026-03-01'), post('l', 'coming', '2026-03-01', { stage: 'later' }), post('i', 'issue', '2026-03-01'), post('u', 'update', '2026-03-01')]);
    expect(r.now.map((p) => p.id)).toEqual(['n']);
    expect(r.next.map((p) => p.id)).toEqual(['x']);
    expect(r.later.map((p) => p.id)).toEqual(['l']);
    expect(r.shipped).toEqual([]);
  });

  it('shows what an update ships as Shipped, with the update’s date, not in its column', () => {
    const coming = [post('a', 'coming', '2026-05-01', { stage: 'now' }), post('b', 'coming', '2026-06-01', { stage: 'now' })];
    const update = post('2026-04-20-a', 'update', '2026-04-20', { ships: 'a' });
    const r = roadmapOf([update, ...coming]);
    expect(r.now.map((p) => p.id)).toEqual(['b']);
    expect(r.shipped).toEqual([{ post: coming[0], update, date: '2026-04-20' }]);
    expect([...shippedIds([update, ...coming])]).toEqual(['a']);
    // It's gone from "Coming soon" too, with nothing deleted by hand.
    expect(postsIn('coming', [update, ...coming]).map((p) => p.id)).toEqual(['b']);
  });

  it('ignores a ships that points at nothing, or at something that isn’t coming', () => {
    const posts = [post('a', 'coming', '2026-05-01'), post('i', 'issue', '2026-05-01'), post('u1', 'update', '2026-05-02', { ships: 'nope' }), post('u2', 'update', '2026-05-03', { ships: 'i' })];
    const r = roadmapOf(posts);
    expect(r.next.map((p) => p.id)).toEqual(['a']);
    expect(r.shipped).toEqual([]);
    expect([...comingIds(posts)]).toEqual(['a']);
  });

  it('orders each column soonest first (same day: as listed), and shipped newest first', () => {
    const posts = [
      post('late', 'coming', '2026-09-01', { stage: 'next' }),
      post('early', 'coming', '2026-03-01', { stage: 'next' }),
      post('tie1', 'coming', '2026-06-01', { stage: 'next' }),
      post('tie2', 'coming', '2026-06-01', { stage: 'next' }),
      post('s1', 'coming', '2026-01-01'),
      post('s2', 'coming', '2026-01-02'),
      post('u-s1', 'update', '2026-02-01', { ships: 's1' }),
      post('u-s2', 'update', '2026-02-10', { ships: 's2' }),
    ];
    const r = roadmapOf(posts);
    expect(r.next.map((p) => p.id)).toEqual(['early', 'tie1', 'tie2', 'late']);
    expect(r.shipped.map((s) => s.post.id)).toEqual(['s2', 's1']);
  });

  it('counts the newest update when two say they ship the same thing', () => {
    const r = roadmapOf([post('a', 'coming', '2026-01-01'), post('u1', 'update', '2026-02-01', { ships: 'a' }), post('u2', 'update', '2026-03-01', { ships: 'a' })]);
    expect(r.shipped).toHaveLength(1);
    expect(r.shipped[0].date).toBe('2026-03-01');
  });

  it('summarises an item by its first paragraph, never a bullet', () => {
    expect(summaryOf(['- a bullet', 'The paragraph.', 'Another.'])).toBe('The paragraph.');
    expect(summaryOf(['- only', '- bullets'])).toBe('');
  });
});

describe('the roadmap fields in the news posts', () => {
  it('only has a stage on coming posts, and ships on updates that point at a coming post', () => {
    const coming = comingIds(NEWS);
    for (const p of NEWS) {
      if (p.stage !== undefined) {
        expect(p.kind, `${p.id}: only a coming post has a stage`).toBe('coming');
        expect(['now', 'next', 'later']).toContain(p.stage);
      }
      if (p.ships !== undefined) {
        expect(p.kind, `${p.id}: only an update ships something`).toBe('update');
        expect(coming.has(p.ships), `${p.id} ships "${p.ships}", which isn't a coming post`).toBe(true);
      }
    }
  });

  it('gives every coming post a stage', () => {
    for (const p of NEWS.filter((n) => n.kind === 'coming')) expect(p.stage, p.id).toBeDefined();
  });

  it('survives the trip through /news.json, and drops what is malformed', () => {
    const sent = [post('c', 'coming', '2026-01-01', { stage: 'later' }), post('u', 'update', '2026-02-01', { ships: 'c' })];
    expect(cleanNews(JSON.parse(JSON.stringify({ v: 1, posts: sent })))).toEqual(sent);
    const got = cleanNews({
      posts: [
        { ...post('bad-stage', 'coming', '2026-01-01'), stage: 'soon' },
        { ...post('stage-on-update', 'update', '2026-01-01'), stage: 'now' },
        { ...post('ships-bad', 'update', '2026-01-01'), ships: 'Bad Id!' },
        { ...post('ships-on-coming', 'coming', '2026-01-01'), ships: 'x' },
        { ...post('ships-number', 'update', '2026-01-01'), ships: 5 },
      ],
    })!;
    // The posts stay; only the field that makes no sense goes.
    expect(got.map((p) => p.id)).toEqual(['bad-stage', 'stage-on-update', 'ships-bad', 'ships-on-coming', 'ships-number']);
    for (const p of got) {
      expect(p.stage, p.id).toBeUndefined();
      expect(p.ships, p.id).toBeUndefined();
    }
  });
});

describe('what counts as an idea (src/news/suggest.ts)', () => {
  const good = 'Please add a bouncy mushroom weapon.';

  it('knows its categories and statuses', () => {
    for (const c of ['weapon', 'map', 'mode', 'looks', 'other']) expect(isSuggestionCategory(c)).toBe(true);
    for (const c of ['', 'WEAPON', 'weapons', 'constructor', 'toString', 7, null, undefined, ['weapon']]) expect(isSuggestionCategory(c)).toBe(false);
    for (const s of ['new', 'planned', 'declined', 'done']) expect(isSuggestionStatus(s)).toBe(true);
    for (const s of ['', 'open', 'NEW', 'constructor', null]) expect(isSuggestionStatus(s)).toBe(false);
  });

  it('takes ideas of 10 to 500 characters, counted after cleaning', () => {
    expect(cleanIdea(good)).toEqual({ text: good });
    expect(cleanIdea('x'.repeat(SUGGESTION_MIN))).toEqual({ text: 'x'.repeat(SUGGESTION_MIN) });
    expect(cleanIdea('x'.repeat(SUGGESTION_MIN - 1))).toEqual({ problem: 'short' });
    expect(cleanIdea('x'.repeat(SUGGESTION_MAX))).toEqual({ text: 'x'.repeat(SUGGESTION_MAX) });
    expect(cleanIdea('x'.repeat(SUGGESTION_MAX + 1))).toEqual({ problem: 'long' });
    // Padding doesn't count: spaces around, or only spaces.
    expect(cleanIdea('   short    ')).toEqual({ problem: 'short' });
    expect(cleanIdea(' '.repeat(100))).toEqual({ problem: 'short' });
    expect(cleanIdea('')).toEqual({ problem: 'short' });
    // An emoji is one character, not two.
    expect(cleanIdea('🍄'.repeat(SUGGESTION_MAX))).toEqual({ text: '🍄'.repeat(SUGGESTION_MAX) });
    expect(textLength('🍄🍄')).toBe(2);
  });

  it('refuses what isn’t text, and absurdly long text', () => {
    for (const v of [undefined, null, 42, {}, ['a long enough idea'], true]) expect(cleanIdea(v), String(v)).toEqual({ problem: 'bad' });
    expect(cleanIdea('x'.repeat(1_000_000))).toEqual({ problem: 'bad' });
  });

  it('strips control characters, invisible ones and text-direction tricks', () => {
    expect(cleanIdea('A\u0000bouncy\u0007 mushroom\u001b[31m weapon\u007f please')).toEqual({ text: 'Abouncy mushroom[31m weapon please' });
    expect(cleanIdea('zero\u200Bwidth\u200D joiners\uFEFF and\u202Ebidi\u2066 tricks')).toEqual({ text: 'zerowidth joiners andbidi tricks' });
    expect(cleanIdea('soft\u00ADhyphen and C1\u0085 controls here')).toEqual({ text: 'softhyphen and C1 controls here' });
    // Tabs are spaces; new lines stay (but not a wall of them), carriage returns become new lines.
    expect(cleanIdea('one\ttwo\r\nthree\rfour\n\n\n\n\nfive and more words')).toEqual({ text: 'one two\nthree\nfour\n\nfive and more words' });
    // Ordinary text from every language and emoji survives.
    expect(cleanIdea('Más armas, 武器もっと, Ärger über Löwen 🦁🔥 please!')).toEqual({ text: 'Más armas, 武器もっと, Ärger über Löwen 🦁🔥 please!' });
  });

  it('cleans notes the same way', () => {
    expect(cleanText('  a\u0000 note \n')).toBe('a note');
    expect(cleanText(7)).toBeNull();
  });

  it('knows the same idea sent twice, however it is spaced or capitalised', () => {
    expect(ideaKey('  Add   a MUSHROOM\nweapon ')).toBe(ideaKey('add a mushroom weapon'));
    expect(ideaKey('add a mushroom weapon')).not.toBe(ideaKey('add a mushroom map'));
  });
});

describe('allow(): so many tries in a time (server/roadmap.ts)', () => {
  it('lets max through in the window, then no more until it passes', () => {
    const tries = new Map<string, number[]>();
    for (const at of [0, 100, 200]) expect(allow(tries, 'a', 1000, 3, at)).toBe(true);
    expect(allow(tries, 'a', 1000, 3, 500)).toBe(false);
    // Another key has its own allowance.
    expect(allow(tries, 'b', 1000, 3, 500)).toBe(true);
    // Once the first has aged out of the window, one more fits; the others are still counted.
    expect(allow(tries, 'a', 1000, 3, 1001)).toBe(true);
    expect(allow(tries, 'a', 1000, 3, 1002)).toBe(false);
    expect(allow(tries, 'a', 1000, 3, 1101)).toBe(true);
  });
});
