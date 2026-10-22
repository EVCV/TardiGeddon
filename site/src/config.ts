// Where things live. The site is served from tardigeddon.com with the game
// at /play/ (see docs/WEBSITE.md). In development the game runs on its own
// Vite server, so "Play" links point there instead.

export const SITE_URL = 'https://tardigeddon.com';

export const PLAY_URL = import.meta.env.DEV ? `http://${location.hostname}:5173/` : '/play/';

/**
 * The game server's HTTP address, for the public leaderboards: from
 * VITE_SERVER_URL (the same setting the game is built with), or the local
 * server in development. Null if neither: the boards then say they're offline.
 */
export const API_URL: string | null = (() => {
  const ws = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (ws) return ws.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '');
  return import.meta.env.DEV ? `http://${location.hostname}:8787` : null;
})();
