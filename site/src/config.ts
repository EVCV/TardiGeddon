// Where things live. The site is served from tardigeddon.com with the game
// at /play/ (see docs/WEBSITE.md). In development the game runs on its own
// Vite server, so "Play" links point there instead.

export const SITE_URL = 'https://tardigeddon.com';

export const PLAY_URL = import.meta.env.DEV ? `http://${location.hostname}:5173/` : '/play/';
