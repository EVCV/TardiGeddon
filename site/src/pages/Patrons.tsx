// Our patrons, by tier, and what each tier gets (site/src/patrons.ts). Every
// perk is outside the game: patrons never get anything that helps them win.

import { Mascot } from '../components/Mascot';
import { Link } from '../router';
import { PATREON_LIVE, PATREON_URL, PATRONS, TIERS } from '../patrons';

export function Patrons() {
  return (
    <div className="page patrons-page">
      <h1 className="display section-title">Our patrons</h1>
      <p className="lead">
        TardiGeddon is free, with no adverts and nothing to buy that wins matches. Our patrons help keep it that way: their
        support pays for the servers and the next worlds, weapons and music. Thank you!
      </p>
      {PATREON_LIVE ? (
        <p>
          <a className="btn btn-play" href={PATREON_URL} rel="noopener">
            Support us on Patreon
          </a>
        </p>
      ) : (
        <p className="paper patrons-soon">
          <strong>Our Patreon opens in January.</strong> Follow our <Link to="/news">News</Link> to hear when it does.
        </p>
      )}

      <section aria-labelledby="patrons-tiers">
        <h2 id="patrons-tiers" className="display faq-heading">
          Tiers
        </h2>
        <p>
          Every tier includes everything below it. Patrons never get anything inside the game: no looks, coins, Slime or
          weapons. Everything is here, on Patreon and in our Discord.
        </p>
        <ul className="patrons-tiers">
          {TIERS.map((t) => (
            <li key={t.name} className="paper patrons-tier">
              <Mascot className="patrons-mascot" color={t.color} hat={t.hat} label="" />
              <div>
                <h3 className="display">{t.name}</h3>
                <p className="patrons-price">
                  £{t.price} a month{t.limit ? ` · ${t.limit} places` : ''}
                </p>
                <p>{t.perks}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {PATREON_LIVE && (
        <section aria-labelledby="patrons-thanks">
          <h2 id="patrons-thanks" className="display faq-heading">
            Thank you
          </h2>
          {PATRONS.length === 0 ? (
            <p>No patrons yet. You could be the first!</p>
          ) : (
            TIERS.map((t) => {
              const names = PATRONS.filter((p) => p.tier === t.name).map((p) => p.name);
              if (!names.length) return null;
              return (
                <div key={t.name} className="paper guide-section">
                  <h3 className="display">{t.name}</h3>
                  <ul className="patrons-names">
                    {names.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}
