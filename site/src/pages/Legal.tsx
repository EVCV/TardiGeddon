// A legal page, rendered from its markdown draft in site/legal/.

import { useEffect, useState } from 'react';
import { hasLegal, loadLegal, LEGAL_PAGES } from '../legal';
import { Link } from '../router';
import { NotFound } from './NotFound';

/** Mark the "[Company Legal Name]"-style blanks the owner still has to fill in. */
function markPlaceholders(html: string): string {
  return html.replace(/\[([^\]<>]{2,120})\]/g, '<mark class="placeholder">[$1]</mark>');
}

export function Legal({ slug }: { slug: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setHtml(null);
    const md = loadLegal(slug);
    if (!md) return;
    Promise.all([md, import('marked')]).then(([text, { marked }]) => {
      if (!live) return;
      const out = markPlaceholders(marked.parse(text, { async: false, breaks: true }));
      setHtml(out);
      // The page title comes from the document's own heading.
      const title = /^#\s+(.+)$/m.exec(text)?.[1];
      if (title) document.title = `${title} · TardiGeddon`;
    });
    return () => {
      live = false;
    };
  }, [slug]);

  if (!hasLegal(slug)) return <NotFound />;

  return (
    <div className="page legal-page">
      <article className="paper prose" aria-busy={html === null}>
        {html === null ? <p className="loading">Loading…</p> : <div dangerouslySetInnerHTML={{ __html: html }} />}
      </article>
      <nav className="legal-more paper" aria-label="Other legal pages">
        <h2>Other legal pages</h2>
        <ul>
          {LEGAL_PAGES.filter((p) => p.slug !== slug).map((p) => (
            <li key={p.slug}>
              <Link to={`/legal/${p.slug}`}>{p.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
