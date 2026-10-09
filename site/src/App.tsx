// The TardiGeddon website. Pages are picked by path; see docs/WEBSITE.md.

import { useEffect } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SmoothScroll } from './motion/SmoothScroll';
import { Router, usePath } from './router';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Legal } from './pages/Legal';
import { NotFound } from './pages/NotFound';
import { SITE_URL } from './config';

gsap.registerPlugin(useGSAP);

// Web fonts and images change the layout as they arrive: re-measure the
// scroll-triggered animations so they fire in the right places.
document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());

function Page() {
  const path = usePath();
  useEffect(() => {
    document.querySelector('link[rel=canonical]')?.setAttribute('href', SITE_URL + (path === '/' ? '/' : path));
    // New page, new layout: let ScrollTrigger re-measure.
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }, [path]);

  if (path === '/') return <Home />;
  const legal = /^\/legal\/([a-z-]+)$/.exec(path);
  if (legal) return <Legal slug={legal[1]} />;
  return <NotFound />;
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
