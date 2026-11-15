// The Launch Giveaway: how to enter (the Sociamonials entry form, embedded),
// the prizes, and past winners. The contests are a plain list in
// site/src/giveaways.ts, so the page is reused for every future contest.
//
// The build renders this page at build time, so it first shows the state at
// that moment; in the browser it works out the state from the date straight
// away and keeps it right (the form appears when entries open, goes when they
// close).

import { useEffect, useState } from 'react';
import { Mascot } from '../components/Mascot';
import { Link } from '../router';
import {
  GIVEAWAYS,
  announceBy,
  closesAt,
  dayShortUK,
  dayTimeUK,
  dayUK,
  opensAt,
  viewAt,
  winnerTotal,
  type Giveaway as Contest,
  type GiveawayStatus,
} from '../giveaways';

const DISCLAIMER =
  'This promotion is in no way sponsored, endorsed or administered by, or associated with, Facebook, Instagram, Threads, TikTok, X, YouTube, Bluesky, Discord, Twitch, Reddit, itch.io, IGDB, Pinterest, Apple or Google.';

/** In development only: `?now=2026-12-05T12:00:00Z` pretends it is that moment, to see each state. */
function devNow(): number | null {
  if (!import.meta.env.DEV) return null;
  const t = Date.parse(new URLSearchParams(location.search).get('now') ?? '');
  return Number.isNaN(t) ? null : t;
}

/** The current time, kept up to date. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(devNow() ?? Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** How many players win in all. */

function Status({ g, status }: { g: Contest; status: GiveawayStatus }) {
  if (status === 'open') return <p className="promo-status">✅ Open now: closes {dayTimeUK(closesAt(g))}</p>;
  if (status === 'soon') return <p className="promo-status giveaway-soon">⏳ Opens {dayShortUK(opensAt(g))}</p>;
  return <p className="promo-status promo-ended">🔒 Entries are closed</p>;
}

function Prizes({ g }: { g: Contest }) {
  return (
    <section className="giveaway-section" aria-labelledby="giveaway-prizes">
      <h2 className="display" id="giveaway-prizes">
        The prizes
      </h2>
      <p>
        {winnerTotal(g)} winners. Every prize is a look: they change how your tardigrades look
        and sound, and they never help you win.
      </p>
      <ul className="prize-grid">
        {g.prizes.map((p) => (
          <li key={p.tier} className="paper prize-card">
            <p className="prize-count">{p.count === 1 ? '1 winner' : `${p.count} winners`}</p>
            {p.image && <img className="prize-img" src={p.image} alt={p.alt ?? ''} width={1080} height={1080} loading="lazy" />}
            <h3>{p.tier}</h3>
            <p>{p.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Winners by prize tier (player names only). */
function WinnerList({ g }: { g: Contest }) {
  const known = g.prizes.map((p) => p.tier);
  const tiers = [...known, ...new Set(g.winners.map((w) => w.tier).filter((t) => !known.includes(t)))];
  return (
    <>
      {tiers.map((tier) => {
        const names = g.winners.filter((w) => w.tier === tier);
        if (!names.length) return null;
        return (
          <div key={tier} className="winner-tier">
            <h4>{tier}</h4>
            <ul className="winner-names">
              {names.map((w, i) => (
                <li key={`${w.playerName}-${i}`}>{w.playerName}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

/**
 * The Sociamonials entry form, loaded only when the visitor asks for it:
 * it's a third-party page that sets its own cookie, and the rest of the site
 * sets none (Cookie & Storage Policy 4.0.3).
 */
function EntryForm({ url, title }: { url: string; title: string }) {
  const [shown, setShown] = useState(false);
  if (shown) {
    return (
      <div className="giveaway-frame paper">
        <iframe src={url} title={`${title}: entry form`} />
      </div>
    );
  }
  return (
    <div className="giveaway-consent paper">
      <p>
        The entry form is run for us by Sociamonials, our giveaway service. Opening it here loads their page, which sets its own
        cookie to keep your entry together (see our <Link to="/legal/cookie-policy">Cookie &amp; Storage Policy</Link> and{' '}
        <Link to="/legal/privacy-policy">Privacy Policy</Link>, Section 2.7).
      </p>
      <p>
        <button type="button" className="btn btn-play" onClick={() => setShown(true)}>
          Show the entry form
        </button>
      </p>
    </div>
  );
}

export function Giveaway() {
  const now = useNow();
  const { current, status, past } = viewAt(now);
  // The contest on show, or (none running) the latest finished one, for the rules link and the prizes.
  const shown = current ?? past[0] ?? GIVEAWAYS[0];
  const rules = shown.rulesPath;
  const announced = current ? dayUK(announceBy(current)) : null;

  return (
    <div className="page giveaway-page">
      <h1 className="display section-title">{current ? current.title : 'TardiGeddon giveaways'}</h1>

      <section className="paper giveaway-hero" aria-label="About this giveaway">
        <Mascot className="giveaway-mascot" color={0x3a7be0} hat="crown" label="A tardigrade wearing a crown" />
        <div className="giveaway-hero-body">
          {current && status ? (
            <>
              <Status g={current} status={status} />
              <p className="giveaway-pitch">
                {status === 'closed'
                  ? 'Thank you to everyone who entered! We’re drawing the winners now.'
                  : `${winnerTotal(current)} players will win looks for their tardigrades. Tiny. Indestructible. Armed. And now very well dressed.`}
              </p>
            </>
          ) : (
            <p className="giveaway-pitch">There’s no giveaway on right now. Follow us to hear about the next one!</p>
          )}
          <p className="giveaway-buttons">
            {status === 'open' && (
              <a className="btn btn-play" href="#enter">
                Enter now
              </a>
            )}
            <Link className={status === 'open' ? 'btn' : 'btn btn-play'} to={rules}>
              Official Rules
            </Link>
          </p>
        </div>
      </section>

      {current && (
        <section className="giveaway-section" id="enter" aria-labelledby="giveaway-enter">
          <h2 className="display" id="giveaway-enter">
            {status === 'closed' ? 'Entries are closed' : 'Enter'}
          </h2>
          {status === 'open' && (
            <>
              <p>It’s free to enter. Fill in the form below, then use the bonus entries to boost your chances.</p>
              <EntryForm url={current.entryUrl} title={current.title} />
              <p className="giveaway-trouble">
                Trouble with the form?{' '}
                <a href={current.entryUrl} target="_blank" rel="noopener noreferrer">
                  Enter on the giveaway page
                </a>{' '}
                (opens in a new tab).
              </p>
            </>
          )}
          {status === 'soon' && (
            <div className="paper giveaway-notice">
              <p>
                <strong>Entries open on {dayTimeUK(opensAt(current))}.</strong> The entry form will appear right here, so
                come back then. Entries close on {dayTimeUK(closesAt(current))}.
              </p>
              <p>
                In the meantime, have a look at the prizes and read the <Link to={rules}>Official Rules</Link>.
              </p>
            </div>
          )}
          {status === 'closed' && (
            <div className="paper giveaway-notice">
              <p>
                <strong>Thank you to everyone who entered.</strong> Winners are drawn within 7 days after a giveaway closes,
                and we’ll announce them here by player name by {announced}.
              </p>
            </div>
          )}
        </section>
      )}

      {current && <Prizes g={current} />}

      <section className="giveaway-section" aria-labelledby="giveaway-how">
        <h2 className="display" id="giveaway-how">
          How it works
        </h2>
        <div className="paper guide-section">
          <ul>
            <li>
              <strong>Free to enter.</strong> No purchase necessary, and buying anything gives you no better chance.
            </li>
            <li>
              <strong>Ages 13 and over.</strong> If you’re under 18, ask a parent or guardian first.
            </li>
            <li>
              <strong>Worldwide</strong>, except Quebec, Italy, Brazil, Vietnam and anywhere a giveaway like this isn’t
              allowed.
            </li>
            <li>
              <strong>Bonus entries.</strong> Make a free account (+5), invite friends (+3 each), and follow us on YouTube, TikTok, Instagram, Facebook, X, Bluesky, Twitch, Reddit, itch.io, IGDB or Discord (+1 each).
            </li>
            <li>
              <strong>The draw.</strong> Winners are drawn within 7 days after the giveaway closes, and announced here by
              player name only.
            </li>
            <li>Entering does not sign you up for email news.</li>
          </ul>
          <p>
            Everything else, including who can’t enter and how winners are picked and told, is in the{' '}
            <Link to={rules}>Official Rules</Link>.
          </p>
        </div>
      </section>

      <section className="giveaway-section" aria-labelledby="giveaway-winners">
        <h2 className="display" id="giveaway-winners">
          Past winners
        </h2>
        {past.length ? (
          past.map((g) => (
            <article key={g.slug} className="paper guide-section winners-card" aria-labelledby={`winners-${g.slug}`}>
              <h3 id={`winners-${g.slug}`}>{g.title}</h3>
              <p className="winners-date">Closed {dayUK(closesAt(g))}</p>
              <WinnerList g={g} />
            </article>
          ))
        ) : (
          <p className="paper news-empty">
            Our first winners will be announced here{announced ? ` by ${announced}` : ' soon'}.
          </p>
        )}
      </section>

      <p className="giveaway-disclaimer small">{DISCLAIMER}</p>
    </div>
  );
}
