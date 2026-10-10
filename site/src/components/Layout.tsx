// Header and footer around every page.

import type { ReactNode } from 'react';
import { Link } from '../router';
import { Mascot } from './Mascot';
import { PLAY_URL } from '../config';
import { LEGAL_PAGES } from '../legal';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="TardiGeddon home">
          <Mascot className="brand-mascot" label="" />
          <span className="brand-name">TardiGeddon</span>
        </Link>
        <a className="btn btn-play btn-small" href={PLAY_URL}>
          Play now
        </a>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Mascot className="footer-mascot" color={0x3a7be0} hat="tophat" label="" />
            <p>
              <strong>TardiGeddon</strong>
              <br />
              Tiny. Indestructible. Armed.
              <br />
              Free to play in your browser.
            </p>
          </div>
          <nav aria-label="Legal">
            <h2>Legal</h2>
            <ul>
              {LEGAL_PAGES.map((p) => (
                <li key={p.slug}>
                  <Link to={`/legal/${p.slug}`}>{p.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Game">
            <h2>Game</h2>
            <ul>
              <li>
                <a href={PLAY_URL}>Play now</a>
              </li>
              <li>
                <a href="mailto:support@tardigeddon.com">support@tardigeddon.com</a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="footer-notices">
          <p>
            <strong>Accessibility.</strong> Accessibility features are still in development. Read our{' '}
            <Link to="/legal/accessibility-statement">Accessibility Statement</Link>.
          </p>
          <p>
            <strong>Made with AI.</strong> This website and the game were made with the help of AI tools, checked by
            people. Read our <Link to="/legal/ai-policy">AI Policy</Link>.
          </p>
        </div>
        <p className="footer-small">
          TardiGeddon is a game developed by EVCV Limited, registered in England and Wales, company number 13570383.
          Registered office: 28 Oak Tree Lane, Cookhill, Alcester, Warwickshire, B49 5LH, United Kingdom. VAT number
          GB389265053. ICO registration number ZB232228.
          <br />© {new Date().getFullYear()} EVCV Limited. No ads, no tracking.
        </p>
      </footer>
    </>
  );
}
