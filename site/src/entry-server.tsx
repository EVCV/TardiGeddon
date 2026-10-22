// Renders each page to HTML at build time (site/prerender.mjs), so search
// engines and social apps get the whole page and its own <head> without
// running any JavaScript. In the browser, React then draws it afresh.

import { renderToString } from 'react-dom/server';
import { marked } from 'marked';
import { Router } from './router';
import { Layout } from './components/Layout';
import { PageFor } from './routes';
import { markPlaceholders, renderedLegal } from './pages/Legal';
import { LEGAL_PAGES, loadLegal } from './legal';

export { pageMeta, pageSchema, INDEXED_PATHS, PAGES } from './seo';

/** Every legal page that exists: its address and its title (the document's own heading). */
export const LEGAL: { path: string; title: string }[] = [];
for (const p of LEGAL_PAGES) {
  const md = await loadLegal(p.slug);
  if (md === undefined || md === null) continue;
  renderedLegal[p.slug] = markPlaceholders(marked.parse(md, { async: false, breaks: true }));
  LEGAL.push({ path: `/legal/${p.slug}`, title: /^#\s+(.+)$/m.exec(md)?.[1] ?? p.label });
}

/** The markup inside #root for a page. */
export function render(path: string): string {
  return renderToString(
    <Router initialPath={path}>
      <Layout>
        <PageFor path={path} />
      </Layout>
    </Router>,
  );
}
