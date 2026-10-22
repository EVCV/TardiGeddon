// The TardiGeddon website. Pages are picked by path; see docs/WEBSITE.md.

import { useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SmoothScroll } from './motion/SmoothScroll';
import { Router, usePath } from './router';
import { Layout } from './components/Layout';
import { PageFor } from './routes';
import { applyHead } from './head';

gsap.registerPlugin(useGSAP);

// Web fonts and images change the layout as they arrive: re-measure the
// scroll-triggered animations so they fire in the right places.
document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());

function Page() {
  const path = usePath();
  useEffect(() => {
    // Title, description, share tags and structured data for the new page.
    // Legal pages also get an X-Robots-Tag header (site/public/_headers).
    applyHead(path);
    // New page, new layout: let ScrollTrigger re-measure.
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }, [path]);
  return <PageFor path={path} />;
}

export function App() {
  return (
    <SmoothScroll>
      <Router>
        <Layout>
          <Page />
        </Layout>
      </Router>
    </SmoothScroll>
  );
}
