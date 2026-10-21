// Help & support: how to reach us, and answers to the common questions.
// Anything about money, accounts or privacy must match the legal pages
// (site/legal/): link to them rather than restating the details.

import { useEffect, type ReactNode } from 'react';
import { Link } from '../router';
import { PLAY_URL } from '../config';

const EMAIL = 'support@tardigeddon.com';

function Q({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="faq paper">
      <summary>{q}</summary>
      <div className="faq-answer">{children}</div>
    </details>
  );
}

export function Support() {
  useEffect(() => {
    document.title = 'Help & support · TardiGeddon';
  }, []);
  return (
    <div className="page support-page">
      <h1 className="display section-title">Help &amp; support</h1>
      <section className="paper contact-card">
        <h2 className="display">Get in touch</h2>
        <p>
          Found a bug, stuck on something, or a problem with a purchase? Email us at{' '}
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. Tell us what happened, on which device and browser, and (for
          purchases) the email address on your account. We read every message.
        </p>
      </section>

      <h2 className="display faq-heading">The game</h2>
      <Q q="Is TardiGeddon free?">
        <p>
          Yes. The whole game is free to play, with no ads. You can buy coins for extra looks (hats, skins, worlds, music
          and more), but they never make you stronger.
        </p>
      </Q>
      <Q q="What do I need to play?">
        <p>
          A recent browser on a computer, phone or tablet: Chrome, Edge, Firefox or Safari. <a href={PLAY_URL}>Open the
          game</a> and press Play. An Android app is coming soon to Google Play (Android 7 and newer).
        </p>
      </Q>
      <Q q="Do I need an account?">
        <p>
          No. Everything in the game works without one. A free account (13 or over) keeps your stats, earns Slime, puts you
          on the daily challenge leaderboards, lets you add friends and keeps what you unlock on every device.
        </p>
      </Q>
      <Q q="Does it work without the internet?">
        <p>
          Once it has loaded, matches against the computer, hot-seat games, practice and the map editor work offline. Online
          play, accounts and the shop need a connection.
        </p>
      </Q>
      <Q q="What languages is it in?">
        <p>
          The game plays in English, Spanish, Brazilian Portuguese, German, French and Japanese. It follows your device’s
          language, and you can change it in Settings.
        </p>
      </Q>
      <Q q="Is there anything for accessibility?">
        <p>
          Yes: a colour-blind palette with a symbol for each team, a high-contrast mode, calmer effects, bigger text, captions
          for sounds, Tap to fire, bigger touch buttons, and every key can be changed. See our{' '}
          <Link to="/legal/accessibility-statement">Accessibility Statement</Link>, and tell us what else would help.
        </p>
      </Q>
      <Q q="My online game is lagging or keeps dropping out.">
        <p>
          If your connection struggles, the game shows ⚠️ Slow connection, and if it drops for a few seconds it reconnects by
          itself and puts you back in your place (the computer plays your turns meanwhile). A steadier Wi-Fi signal
          usually fixes it. If it keeps happening, email us with the time and your room code.
        </p>
      </Q>

      <h2 className="display faq-heading">Coins, Slime and the shop</h2>
      <Q q="Is it pay-to-win?">
        <p>
          Never. Money only buys coins, and coins only buy looks. Weapons are unlocked with Slime, which you earn by playing
          and can never buy or swap coins for.
        </p>
      </Q>
      <Q q="How do I earn Slime?">
        <p>
          Sign in and play: you earn Slime for every online match (more for a win and for each pop), and for games against
          the computer, up to a daily limit.
        </p>
      </Q>
      <Q q="I bought coins but they haven’t arrived.">
        <p>
          Coins normally appear within a few seconds. Make sure you’re signed in to the same account. If they haven’t
          appeared within an hour, email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
        </p>
      </Q>
      <Q q="Can I get a refund?">
        <p>
          If something you bought is faulty or didn’t arrive, email us and we’ll put it right. Coins aren’t refunded just
          because you stop playing or don’t spend them, but we consider every request fairly. In the Android app, purchases
          are made through Google Play, so refunds are asked for from Google Play. The details are in our{' '}
          <Link to="/legal/terms-of-service">Terms of Service</Link> (Section 5).
        </p>
      </Q>
      <Q q="Do children need permission to buy coins?">
        <p>
          Yes. Anyone under 18 needs a parent or carer’s permission, and every purchase asks you to confirm it. Parents, our{' '}
          <Link to="/legal/childrens-privacy">Children’s Privacy</Link> page explains what we keep and why.
        </p>
      </Q>

      <h2 className="display faq-heading">Safety and your account</h2>
      <Q q="Can other players talk to me?">
        <p>
          No. There is no chat. Names are checked for anything rude or personal, and in Quick play everyone gets a made-up
          team name. See our <Link to="/legal/community-guidelines">Community Guidelines</Link>.
        </p>
      </Q>
      <Q q="How do I report or block a player?">
        <p>
          In an online room, use ⚑ Report or 🚫 Block next to their name, or the 👥 button during a match. Blocked players
          never join your Quick play games. Reports come straight to us.
        </p>
      </Q>
      <Q q="How do I delete my account?">
        <p>
          In the game: Account → Delete account. Your coins, Slime and everything you unlocked are deleted with it. See{' '}
          <Link to="/legal/delete-account">Delete your account</Link> for the details, or if you can’t sign in.
        </p>
      </Q>
      <Q q="What do you keep about me?">
        <p>
          As little as we can. No ads and no tracking. Our <Link to="/legal/privacy-policy">Privacy Policy</Link> and{' '}
          <Link to="/legal/cookie-policy">Cookies &amp; Storage</Link> pages list everything.
        </p>
      </Q>
    </div>
  );
}
