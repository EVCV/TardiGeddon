// A tiny client-side router: the site only has a handful of pages, so a
// path in state and a <Link> that uses the History API is all it needs.

import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { scrollToTop } from './motion/SmoothScroll';

const RouterContext = createContext<{ path: string; go: (to: string) => void }>({ path: '/', go: () => {} });

/** "/legal/terms/" and "/legal/terms" are the same page. */
function normalise(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => normalise(location.pathname));
  useEffect(() => {
    const onPop = () => setPath(normalise(location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (to: string) => {
    history.pushState(null, '', to);
    setPath(normalise(new URL(to, location.href).pathname));
    scrollToTop();
  };
  return <RouterContext.Provider value={{ path, go }}>{children}</RouterContext.Provider>;
}

export const usePath = () => useContext(RouterContext).path;

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** An ordinary link to another page of the site, without a full reload. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const { go } = useContext(RouterContext);
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Let the browser handle new tabs, downloads and the like.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(to);
  };
  return <a href={to} onClick={click} {...rest} />;
}
