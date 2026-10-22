// Header (with the site menu) and footer around every page.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, usePath } from '../router';
import { Mascot } from './Mascot';
import { PLAY_URL } from '../config';
import { LEGAL_PAGES } from '../legal';
import { holdScroll } from '../motion/SmoothScroll';
import { RopeSwinger } from './RopeSwinger';

/** The site's pages, in menu order. */
export const NAV = [
  { to: '/', label: 'Home' },
  { to: '/how-to-play', label: 'How to play' },
  { to: '/weapons', label: 'Weapons' },
  { to: '/leaderboards', label: 'Leaderboards' },
  { to: '/support', label: 'Help & support' },
];

function NavLinks({ onGo }: { onGo?: () => void }) {
  const path = usePath();
  return (
    <ul>
      {NAV.map((n) => (
        <li key={n.to}>
          <Link to={n.to} aria-current={path === n.to ? 'page' : undefined} onClick={onGo}>
            {n.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Phones: a ☰ button that slides the menu in from the side. */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const path = usePath();

  // A new page closes it.
  useEffect(() => setOpen(false), [path]);

  // So does a screen wide enough for the header menu (a tablet turned
  // sideways): the panel hides there, and must not keep the page locked.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 980px)');
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('menu-open');
    holdScroll(true);
    panel.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
      // Keep Tab inside the menu while it's open.
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>('a, button')];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('menu-open');
      holdScroll(false);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button ref={button} className="menu-button" aria-label="Menu" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(true)}>
        <span aria-hidden="true">☰</span> <span className="menu-word">Menu</span>
      </button>
      <div className={`menu-scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        ref={panel}
        id="site-menu"
        className={`menu-panel paper${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!open}
      >
        <button className="menu-close" aria-label="Close the menu" onClick={() => setOpen(false)}>
          ✕
        </button>
        <Mascot className="menu-mascot" hat="crown" label="" />
        <nav aria-label="Site">
          <NavLinks onGo={() => setOpen(false)} />
        </nav>
        <a className="btn btn-play" href={PLAY_URL}>
          Play now
        </a>
      </div>
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="TardiGeddon home">
          <Mascot className="brand-mascot" label="" />
          <span className="brand-name">
            Tardi<span>Geddon</span>
          </span>
        </Link>
        <nav className="site-nav paper" aria-label="Site">
          <NavLinks />
        </nav>
        <div className="header-actions">
          <a className="btn btn-play btn-small" href={PLAY_URL}>
            Play now
          </a>
          <MobileMenu />
        </div>
      </header>
      <main id="main">{children}</main>
      <RopeSwinger />
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Mascot className="footer-mascot" color={0x3a7be0} hat="tophat" label="" />
            <p>
              <strong>TardiGeddon</strong>
              <br />
              Tiny. Indestructible. Armed.
              <br />
              Free to play in your browser. Coming soon to Android.
            </p>
          </div>
          <nav aria-label="Game">
            <h2>Game</h2>
            <ul>
              <li>
                <a href={PLAY_URL}>Play now</a>
              </li>
              {NAV.slice(1).map((n) => (
                <li key={n.to}>
                  <Link to={n.to}>{n.label}</Link>
                </li>
              ))}
              <li>
                <Link to="/eggs">Easter eggs</Link>
              </li>
              <li>
                <Link to="/promo-codes">Promo codes</Link>
              </li>
              <li>
                <Link to="/press">Press kit</Link>
              </li>
              <li>
                <a href="mailto:support@tardigeddon.com">support@tardigeddon.com</a>
              </li>
            </ul>
          </nav>
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
        </div>
        <div className="footer-notices">
          <p>
            <strong>Accessibility.</strong> The game has colour-blind, high-contrast and calmer-effects settings, and more
            is on the way. Read our <Link to="/legal/accessibility-statement">Accessibility Statement</Link>.
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
