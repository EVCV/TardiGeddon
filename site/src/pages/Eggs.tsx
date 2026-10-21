// The easter eggs, as riddles only (src/eggs.ts). Players tick them off in
// the game's Guide.

import { useEffect } from 'react';
import { EGGS } from '../../../src/eggs';
import { PLAY_URL } from '../config';

export function Eggs() {
  useEffect(() => {
    document.title = 'Easter eggs · TardiGeddon';
  }, []);
  return (
    <div className="page eggs">
      <h1 className="display section-title">Easter eggs</h1>
      <p className="lead">
        There are {EGGS.length} secrets hidden in TardiGeddon. Here are the riddles: no answers! The game’s Guide (in
        the lobby) ticks off the ones you’ve found. Just for fun: no prizes, only bragging rights.
      </p>
      <ol className="egg-riddles">
        {EGGS.map((e, i) => (
          <li key={e.id} className="paper">
            <span className="egg-no" aria-hidden="true">
              🥚 {i + 1}
            </span>
            <p>{e.riddle}</p>
          </li>
        ))}
      </ol>
      <p>
        <a className="btn btn-play" href={PLAY_URL}>
          Go egg hunting
        </a>
      </p>
    </div>
  );
}
