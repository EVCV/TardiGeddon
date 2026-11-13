// The roadmap: what we're working on now, what's next and what's further off,
// and what has recently shipped. The same news posts as the game's Roadmap view
// (src/news/roadmap.ts), in English like the rest of the site, with each item's
// public vote count from the game server. Read-only: voting and suggesting ideas
// happen in the game, where players have accounts (src/ui/roadmap.ts).
// The page renders without the counts if the server can't be reached.

import { useEffect, useState } from 'react';
import { NEWS, type NewsPost, type NewsStage } from '../../../src/news/news';
import { STAGES, roadmapOf, summaryOf } from '../../../src/news/roadmap';
import { API_URL, PLAY_URL } from '../config';
import { newsDay } from './News';

const COLUMNS: Record<NewsStage, { title: string; blurb: string }> = {
  now: { title: 'Now', blurb: 'We’re building these.' },
  next: { title: 'Next', blurb: 'Coming after that.' },
  later: { title: 'Later', blurb: 'Ideas for one day.' },
};

/** Votes per item from the game server (null until they arrive, or if they can't). */
function useVotes(): Record<string, number> | null {
  const [votes, setVotes] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!API_URL) return;
    let live = true;
    fetch(`${API_URL}/api/roadmap/votes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { votes?: Record<string, number> }) => live && d.votes && setVotes(d.votes))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return votes;
}

function Item({ p, votes }: { p: NewsPost; votes: Record<string, number> | null }) {
  const n = votes?.[p.id];
  const about = summaryOf(p.text.en.body);
  return (
    <article className="paper roadmap-item" id={p.id}>
      <h3>{p.text.en.title}</h3>
      {about && <p>{about}</p>}
      {typeof n === 'number' && (
        <p className="roadmap-votes">
          <span aria-hidden="true">👍</span> {n} {n === 1 ? 'vote' : 'votes'}
        </p>
      )}
    </article>
  );
}

export function Roadmap() {
  const plan = roadmapOf(NEWS);
  const votes = useVotes();
  return (
    <div className="page page-wide roadmap-page">
      <h1 className="display section-title">Roadmap</h1>
      <p className="lead">
        What we’re working on in TardiGeddon, what’s coming after that, and what we’d like to do one day. Players vote on
        what they want most, inside the game. A vote helps us decide what comes first, but nothing here is a promise or a
        date. For what has already changed, see the <a href="/news">News</a>.
      </p>
      <p>
        <a className="btn btn-play" href={PLAY_URL}>
          Vote and suggest ideas in the game
        </a>
      </p>
      <div className="roadmap-board">
        {STAGES.map((stage) => (
          <section key={stage} className="roadmap-col" aria-labelledby={`roadmap-${stage}`} data-stage={stage}>
            <h2 className="display" id={`roadmap-${stage}`}>
              {COLUMNS[stage].title}
            </h2>
            <p className="roadmap-blurb">{COLUMNS[stage].blurb}</p>
            {plan[stage].length ? plan[stage].map((p) => <Item key={p.id} p={p} votes={votes} />) : <p className="paper roadmap-empty">Nothing here yet.</p>}
          </section>
        ))}
      </div>
      {plan.shipped.length > 0 && (
        <section className="paper roadmap-shipped" aria-labelledby="roadmap-shipped">
          <h2 className="display" id="roadmap-shipped">
            🎉 Recently shipped
          </h2>
          <ul>
            {plan.shipped.slice(0, 6).map((s) => (
              <li key={s.post.id}>
                <b>{s.post.text.en.title}</b> <span className="news-date">· Shipped {newsDay(s.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="page-cta">
        <a className="btn btn-play" href={PLAY_URL}>
          Vote and suggest ideas in the game
        </a>
      </p>
    </div>
  );
}
