// The current promo code and how to use it. The code and its hat come from
// the game itself (src/shop/catalog.ts PROMOS, via site/src/promo.ts).

import { useState } from 'react';
import { Mascot } from '../components/Mascot';
import { Link } from '../router';
import { PLAY_URL } from '../config';
import { PROMO, promoWorks } from '../promo';

export function PromoCodes() {
  const [copied, setCopied] = useState(false);
  const works = promoWorks();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMO.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard (an old browser, or blocked): the code is on screen to type.
    }
  };
  return (
    <div className="page promo-page">
      <h1 className="display section-title">TardiGeddon promo codes</h1>
      <p className="lead">
        Codes for free looks in TardiGeddon. They’re always free: no purchase needed, and they never give anything that
        helps you win.
      </p>

      <section className="promo-card paper" aria-labelledby="promo-now">
        <Mascot className="promo-mascot" color={0x3a7be0} hat={PROMO.hatId} label={`A tardigrade wearing the ${PROMO.hatName}`} />
        <div className="promo-body">
          {works ? (
            <p className="promo-status">✅ Working now{PROMO.until ? ` (until ${PROMO.until})` : ''}</p>
          ) : (
            <p className="promo-status promo-ended">⌛ This code has ended. Watch this page for the next one.</p>
          )}
          <h2 id="promo-now" className="display">
            Free {PROMO.hatName}
          </h2>
          <p>
            Tardigrades are water bears, so here are some bear ears. You can only get this hat with this code: it isn’t
            in the shop.
          </p>
          <div className="promo-code-row">
            <code className="promo-code" aria-label={`Promo code: ${PROMO.code}`}>
              {PROMO.code}
            </code>
            {works && (
              <button className="btn btn-play btn-small" onClick={copy}>
                {copied ? 'Copied!' : 'Copy code'}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="paper guide-section" aria-labelledby="promo-how">
        <h2 id="promo-how" className="display">
          How to use a code
        </h2>
        <ol className="steps">
          <li>
            <a href={PLAY_URL}>Open the game</a> and sign in. Accounts are free (you need to be 13 or over).
          </li>
          <li>
            Go to the <strong>Shop</strong> and open the <strong>🎀 Gifts</strong> tab.
          </li>
          <li>
            Type the code in the box and press <strong>Claim gift</strong>. Capitals, spaces and dashes don’t matter.
          </li>
          <li>
            Wear it: in the lobby, press <strong>✎ Customise team</strong> and pick the hat.
          </li>
        </ol>
        <p>
          It’s yours on every device you sign in on, in the browser and in the Android app when it comes out. Everyone you
          play online sees it too.
        </p>
      </section>

      <section className="paper guide-section" aria-labelledby="promo-faq">
        <h2 id="promo-faq" className="display">
          Good to know
        </h2>
        <ul>
          <li>Each code works once per account.</li>
          <li>
            Codes never give coins, Slime or weapons: only looks. Coins are only ever bought, and nothing you can buy helps
            you win.
          </li>
          <li>We post new codes here first. A code can stop working when its promotion ends; anything you’ve claimed stays yours.</li>
          <li>
            The rules are in our <Link to="/legal/terms-of-service">Terms of Service</Link> (Section 5.9).
          </li>
        </ul>
      </section>

      <p className="page-cta">
        <a className="btn btn-play btn-huge" href={PLAY_URL}>
          Play and claim it
        </a>
      </p>
    </div>
  );
}
