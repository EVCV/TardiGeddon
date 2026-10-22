// Today's daily challenge leaderboards, read from the game server's public
// /api/challenge/board (the scores there were checked by playing each run
// back on the server). See src/challenge/daily.ts.

import { useEffect, useState } from 'react';
import { API_URL, PLAY_URL } from '../config';
import { CHALLENGE_KINDS, TARGET_COUNT, TARGET_TURNS, challengeDay, type ChallengeKind } from '../../../src/challenge/meta';

interface Row {
  rank: number;
  name: string;
  value: number;
  ticks: number;
}

const INFO: Record<ChallengeKind, { title: string; blurb: string }> = {
  targets: { title: '🎯 Target Smash', blurb: `Most of the ${TARGET_COUNT} targets popped in ${TARGET_TURNS} turns (ties: quickest).` },
  rope: { title: '🕸️ Rope Race', blurb: 'Fastest swing from the start to the flag on today’s course (best of three tries).' },
};

const TICKS = 50;

function result(kind: ChallengeKind, r: Row): string {
  if (kind === 'rope') return `${(r.value / TICKS).toFixed(2)}s`;
  return `${r.value}/${TARGET_COUNT} in ${(r.ticks / TICKS).toFixed(1)}s`;
}

function Board({ kind, day }: { kind: ChallengeKind; day: string }) {
  const [rows, setRows] = useState<Row[] | null | 'offline'>(null);
  useEffect(() => {
    let live = true;
    setRows(null);
    if (!API_URL) return setRows('offline');
    fetch(`${API_URL}/api/challenge/board?kind=${kind}&day=${day}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { rows: Row[] }) => live && setRows(d.rows))
      .catch(() => live && setRows('offline'));
    return () => {
      live = false;
    };
  }, [kind, day]);
  return (
    <section className="paper board-card" aria-labelledby={`board-${kind}`}>
      <h2 id={`board-${kind}`} className="display">
        {INFO[kind].title}
      </h2>
      <p>{INFO[kind].blurb}</p>
      {rows === null && <p className="loading">Loading…</p>}
      {rows === 'offline' && <p>The leaderboard can’t be reached right now. Try again soon.</p>}
      {Array.isArray(rows) && rows.length === 0 && <p>Nobody has played this one yet today. Be the first!</p>}
      {Array.isArray(rows) && rows.length > 0 && (
        <ol className="board">
          {rows.map((r) => (
            <li key={`${r.rank}-${r.name}`}>
              <span className="board-rank">{r.rank}</span>
              <span className="board-name">{r.name}</span>
              <span className="board-value">{result(kind, r)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Leaderboards() {
  const today = challengeDay();
  const yesterday = challengeDay(new Date(Date.now() - 86_400_000));
  const [day, setDay] = useState(today);
  return (
    <div className="page leaderboards">
      <h1 className="display section-title">Leaderboards</h1>
      <p className="lead">
        A new <strong>daily challenge</strong> every day at midnight (UTC): the same map for everyone. Play it from the
        lobby (🏆 Daily challenge) and sign in to get on the board. Every score is checked by playing the run back on
        our server.
      </p>
      <div className="board-days" role="group" aria-label="Which day">
        <button className={`btn btn-small${day === today ? ' btn-play' : ''}`} aria-pressed={day === today} onClick={() => setDay(today)}>
          Today
        </button>
        <button className={`btn btn-small${day === yesterday ? ' btn-play' : ''}`} aria-pressed={day === yesterday} onClick={() => setDay(yesterday)}>
          Yesterday
        </button>
      </div>
      <div className="boards">
        {CHALLENGE_KINDS.map((k) => (
          <Board key={k} kind={k} day={day} />
        ))}
      </div>
      <p>
        <a className="btn btn-play" href={PLAY_URL}>
          Play today’s challenge
        </a>
      </p>
    </div>
  );
}
