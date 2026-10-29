import { describe, expect, it } from 'vitest';
import { NEWS, NEWS_LANGS } from '../src/news/news';
import { postsIn } from '../src/news/sections';
import { cleanNews } from '../src/news/feed';
import { LANGS } from '../src/i18n/i18n';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (d: string) => DATE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

describe('news posts (src/news/news.ts)', () => {
  it('covers every language the game has', () => {
    expect([...NEWS_LANGS].sort()).toEqual(LANGS.map((l) => l.id).sort());
  });

  it('has every post in every language, with the same shape as the English', () => {
    for (const p of NEWS) {
      const en = p.text.en;
      for (const l of NEWS_LANGS) {
        const tx = p.text[l];
        expect(tx, `${p.id} ${l}`).toBeDefined();
        expect(tx.title.trim(), `${p.id} ${l} title`).not.toBe('');
        expect(tx.body.length, `${p.id} ${l}: as many lines as the English`).toBe(en.body.length);
        // Bullet points in the same places.
        expect(
          tx.body.map((b) => b.startsWith('- ')),
          `${p.id} ${l}: bullets`,
        ).toEqual(en.body.map((b) => b.startsWith('- ')));
        for (const b of [tx.title, ...tx.body]) {
          expect(b.trim(), `${p.id} ${l}`).not.toBe('');
          // Plain text only: it is never shown as HTML, so markup would show as it is.
          expect(b, `${p.id} ${l}`).not.toMatch(/<[a-z/]/i);
        }
      }
    }
  });

  it('has unique, well-formed ids and real dates', () => {
    const ids = NEWS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of NEWS) {
      expect(p.id).toMatch(/^[a-z0-9-]{1,80}$/);
      expect(realDate(p.date), p.id).toBe(true);
      expect(['update', 'coming', 'issue']).toContain(p.kind);
      if (p.fixed !== undefined) {
        expect(p.kind, `${p.id}: only a problem can be fixed`).toBe('issue');
        expect(realDate(p.fixed), p.id).toBe(true);
        expect(p.fixed >= p.date, `${p.id}: fixed after it was reported`).toBe(true);
      }
    }
  });

  it('sorts each section', () => {
    const post = (id: string, date: string, kind: 'update' | 'coming' | 'issue', fixed?: string) => ({ id, date, kind, ...(fixed ? { fixed } : {}), text: NEWS[0].text });
    const all = [post('a', '2026-01-01', 'update'), post('b', '2026-03-01', 'update'), post('c', '2026-05-01', 'coming'), post('d', '2026-04-01', 'coming'), post('e', '2026-01-01', 'issue', '2026-01-05'), post('f', '2026-01-02', 'issue')];
    expect(postsIn('new', all).map((p) => p.id)).toEqual(['b', 'a']);
    expect(postsIn('coming', all).map((p) => p.id)).toEqual(['d', 'c']);
    // Problems still open come before fixed ones.
    expect(postsIn('fixing', all).map((p) => p.id)).toEqual(['f', 'e']);
  });
});

describe("the website's news list, as the game reads it (src/news/feed.ts)", () => {
  it('takes the list the website build writes, unchanged', () => {
    expect(cleanNews(JSON.parse(JSON.stringify({ v: 1, posts: NEWS })))).toEqual(NEWS);
  });

  it('drops anything malformed, and shows English where a language is missing', () => {
    const en = { title: 'Hello', body: ['- one', 'two'] };
    const got = cleanNews({
      posts: [
        { id: 'ok', date: '2026-11-01', kind: 'update', text: { en, de: { title: 'Hallo', body: ['- eins', 'zwei'] } } },
        { id: 'ok', date: '2026-11-01', kind: 'update', text: { en } }, // the same id again
        { id: 'Bad Id', date: '2026-11-01', kind: 'update', text: { en } },
        { id: 'no-date', date: 'soon', kind: 'update', text: { en } },
        { id: 'no-kind', date: '2026-11-01', kind: 'rumour', text: { en } },
        { id: 'no-english', date: '2026-11-01', kind: 'update', text: { de: en } },
        { id: 'bad-body', date: '2026-11-01', kind: 'update', text: { en: { title: 'x', body: 'not a list' } } },
        { id: 'bad-fixed', date: '2026-11-01', kind: 'issue', fixed: 'yesterday', text: { en } },
        'junk',
        null,
      ],
    });
    expect(got?.map((p) => p.id)).toEqual(['ok']);
    expect(got![0].text.de.title).toBe('Hallo');
    expect(got![0].text.ja).toEqual(en);
    expect(cleanNews(null)).toBeNull();
    expect(cleanNews({ posts: 'nope' })).toBeNull();
    expect(cleanNews({ posts: [] })).toEqual([]);
  });
});
