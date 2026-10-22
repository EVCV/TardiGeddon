// Which page each address shows. Used by the app (App.tsx) and by the build,
// which renders every page to its own HTML file (entry-server.tsx).

import { Home } from './pages/Home';
import { Legal } from './pages/Legal';
import { NotFound } from './pages/NotFound';
import { Leaderboards } from './pages/Leaderboards';
import { Eggs } from './pages/Eggs';
import { HowToPlay } from './pages/HowToPlay';
import { Weapons } from './pages/Weapons';
import { Support } from './pages/Support';
import { Press } from './pages/Press';
import { PromoCodes } from './pages/PromoCodes';

export function PageFor({ path }: { path: string }) {
  if (path === '/') return <Home />;
  if (path === '/leaderboards') return <Leaderboards />;
  if (path === '/eggs') return <Eggs />;
  if (path === '/how-to-play') return <HowToPlay />;
  if (path === '/weapons') return <Weapons />;
  if (path === '/support') return <Support />;
  if (path === '/press') return <Press />;
  if (path === '/promo-codes') return <PromoCodes />;
  const legal = /^\/legal\/([a-z-]+)$/.exec(path);
  if (legal) return <Legal slug={legal[1]} />;
  return <NotFound />;
}
