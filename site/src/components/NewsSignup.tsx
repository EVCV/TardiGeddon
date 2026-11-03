// "Keep up to date by email" on the website: an address and a 13+ tick; the
// game server emails a link, and only that link subscribes it (double opt-in,
// server/newsletter.ts). The same words as the game (Privacy Policy §8).

import { useState, type FormEvent } from 'react';
import { API_URL } from '../config';

const WORDING = 'Email me TardiGeddon news: new updates, events and offers, a few times a month at most. I can unsubscribe at any time.';

export function NewsSignup() {
  const [email, setEmail] = useState('');
  const [over13, setOver13] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!over13) {
      setError('Please tick the box first.');
      return;
    }
    if (!API_URL) {
      setError('Email news isn’t available just now. Please try again later.');
      return;
    }
    setState('sending');
    setError('');
    try {
      const r = await fetch(`${API_URL}/api/newsletter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, over13, source: 'website', lang: 'en' }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? 'Something went wrong. Please try again.');
      setState('sent');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="paper news-signup" aria-labelledby="news-signup-title">
      <h2 className="display" id="news-signup-title">
        📬 Keep up to date by email
      </h2>
      {state === 'sent' ? (
        <p className="news-signup-done" role="status">
          Check your inbox: click the link in our email to start getting the news.
        </p>
      ) : (
        <form className="news-signup-form" onSubmit={submit}>
          <p>New updates, events and offers, a few times a month at most.</p>
          <input type="email" required autoComplete="email" placeholder="Your email" aria-label="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="news-signup-check">
            <input type="checkbox" checked={over13} onChange={(e) => setOver13(e.target.checked)} />
            <span>
              I’m 13 or over. {WORDING} See the <a href="/legal/privacy-policy">Privacy Policy</a>.
            </span>
          </label>
          <button className="btn btn-play" type="submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : '📬 Sign me up'}
          </button>
          {error && (
            <p className="news-signup-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
