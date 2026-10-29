// News: what's new (release notes), what's coming, and known problems being
// fixed. The same posts as the game's News page (src/news/news.ts), in
// English like the rest of the site. The build also writes them to /news.json
// (for the game and the apps) and /news.xml (an RSS feed).

import type { ReactNode } from 'react';
import { NEWS, type NewsPost } from '../../../src/news/news';
import { postsIn, type NewsSection } from '../../../src/news/sections';
import { PLAY_URL } from '../config';

const EMAIL = 'support@tardigeddon.com';

/** "28 October 2026". */
export function newsDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function when(p: NewsPost): string {
  if (p.kind === 'coming') return `Expected ${newsDay(p.date)}`;
  if (p.kind === 'issue') return p.fixed ? `✅ Fixed ${newsDay(p.fixed)}` : `🔧 Being fixed · reported ${newsDay(p.date)}`;
  return newsDay(p.date);
}

/** Paragraphs, and runs of "- " lines as bullet lists. */
function Body({ lines }: { lines: string[] }) {
  const blocks: (string | string[])[] = [];
  for (const line of lines) {
    const last = blocks[blocks.length - 1];
    if (line.startsWith('- ')) {
      if (Array.isArray(last)) last.push(line.slice(2));
      else blocks.push([line.slice(2)]);
    } else blocks.push(line);
  }
  return (
    <>
      {blocks.map((b, i) =>
        Array.isArray(b) ? (
          <ul key={i} className="news-list">
            {b.map((li, j) => (
              <li key={j}>{li}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b}</p>
        ),
      )}
    </>
  );
}

function Post({ p }: { p: NewsPost }) {
  return (
    <article className="paper news-post" id={p.id} data-kind={p.fixed ? 'fixed' : p.kind}>
      <p className="news-date">{when(p)}</p>
      <h3>{p.text.en.title}</h3>
      <Body lines={p.text.en.body} />
    </article>
  );
}

const SECTIONS: { id: NewsSection; title: string; empty: ReactNode }[] = [
  { id: 'coming', title: 'Coming soon', empty: 'Nothing announced just now. Check back soon!' },
  {
    id: 'fixing',
    title: 'Being fixed',
    empty: (
      <>
        No known problems right now. Found one? Email <a href={`mailto:${EMAIL}`}>{EMAIL}</a> and tell us what happened
        and on which device.
      </>
    ),
  },
  { id: 'new', title: 'What’s new', empty: 'No updates yet.' },
];

export function News() {
  return (
    <div className="page news-page">
      <h1 className="display section-title">News</h1>
      <p className="lead">
        What’s coming to TardiGeddon, problems we’re fixing, and what changed in each update. The game shows the same
        news, in your language: <b>📰 News</b> in the lobby. Follow along with the <a href="/news.xml">RSS feed</a>.
      </p>
      {SECTIONS.map((s) => {
        const posts = postsIn(s.id, NEWS);
        return (
          <section key={s.id} className="news-section" aria-labelledby={`news-${s.id}`}>
            <h2 className="display" id={`news-${s.id}`}>
              {s.title}
            </h2>
            {posts.length ? posts.map((p) => <Post key={p.id} p={p} />) : <p className="paper news-empty">{s.empty}</p>}
          </section>
        );
      })}
      <p>
        <a className="btn btn-play" href={PLAY_URL}>
          Play now
        </a>
      </p>
    </div>
  );
}
