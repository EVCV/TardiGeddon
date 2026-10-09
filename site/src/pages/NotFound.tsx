import { useEffect } from 'react';
import { Link } from '../router';
import { Mascot } from '../components/Mascot';

export function NotFound() {
  useEffect(() => {
    document.title = 'Page not found · TardiGeddon';
  }, []);
  return (
    <div className="page not-found">
      <Mascot className="nf-mascot" color={0x7d8a99} hat="none" label="A lost tardigrade" />
      <h1 className="display">Glub glub…</h1>
      <p>This page sank without a trace.</p>
      <Link className="btn btn-play" to="/">
        Back to the home page
      </Link>
    </div>
  );
}
