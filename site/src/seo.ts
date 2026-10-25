// What each page tells search engines and social apps: its title, its
// description, its share picture, and its structured data (schema.org).
// The build writes these into each page's own HTML file (site/prerender.mjs),
// and the app keeps them up to date as you move between pages (App.tsx).
//
// Rules: titles under about 60 characters, descriptions about 150. Say what's
// on the page; schema must only describe what the page shows (Google treats
// anything else as spam), so no keywords that aren't in the copy.

import { PANEL_WEAPONS } from '../../src/sim/weapons';
import { MAP_STYLES } from '../../src/sim/terrain/generate';
import { LANGS } from '../../src/i18n/i18n';
import { MAX_TEAMS } from '../../src/sim/rosters';
import { EGGS } from '../../src/eggs';
import { SITE_URL } from './config';
import { LEGAL_PAGES } from './legal';
import { PROMO } from './promo';
import { SOCIAL } from './social';

const WEAPON_COUNT = PANEL_WEAPONS.filter((w) => w.id !== 'skip').length;

export interface PageMeta {
  title: string;
  description: string;
  /** Share picture, a path under the site (1200×630). */
  image: string;
  imageAlt: string;
  /** Keep out of search results. */
  noindex?: boolean;
  /** Its name in breadcrumbs (pages under Home). */
  crumb?: string;
}

const HOME_IMAGE = { image: '/media/og-home.jpg', imageAlt: 'TardiGeddon: a tardigrade in a red beanie and the game, a free turn-based artillery game.' };

export const PAGES: Record<string, PageMeta> = {
  '/': {
    title: 'TardiGeddon: Free Online Artillery Game, No Download',
    description: `A free turn-based artillery game starring tardigrades: ${WEAPON_COUNT} weapons, ${MAP_STYLES.length} map styles, daily challenges and online multiplayer. No ads, no download.`,
    ...HOME_IMAGE,
  },
  '/how-to-play': {
    title: 'How to Play TardiGeddon: Controls, Wind and Weapons',
    description: 'Learn TardiGeddon in five minutes: the controls on keyboard and touch, how a turn works, reading the wind, kinds of weapon, crates, mines and every game style.',
    image: '/media/og-how-to-play.jpg',
    imageAlt: 'How to play TardiGeddon: aiming, wind and the weapon panel.',
    crumb: 'How to play',
  },
  '/weapons': {
    title: `All ${WEAPON_COUNT} TardiGeddon Weapons and What They Do`,
    description: `Every weapon in TardiGeddon, from the Spore Bazooka to the Concrete Tun: how each one is used, what it does, which the wind pushes, and how much ammo you get.`,
    image: '/media/og-weapons.jpg',
    imageAlt: `All ${WEAPON_COUNT} TardiGeddon weapons.`,
    crumb: 'Weapons',
  },
  '/leaderboards': {
    title: 'Daily Challenge Leaderboards | TardiGeddon',
    description: 'Today’s best Target Smash and Rope Race runs. A new daily challenge every day, the same map for everyone, with every score checked on our server.',
    ...HOME_IMAGE,
    crumb: 'Leaderboards',
  },
  '/support': {
    title: 'TardiGeddon Help and FAQ: Accounts, Coins, Safety',
    description: 'Answers about playing TardiGeddon: what you need, accounts, coins and refunds, staying safe online, reporting players and deleting your account.',
    ...HOME_IMAGE,
    crumb: 'Help & support',
  },
  '/eggs': {
    title: `TardiGeddon Easter Eggs: ${EGGS.length} Secret Riddles`,
    description: `There are ${EGGS.length} easter eggs hidden in TardiGeddon. Here are the riddles that lead to them, with no answers. Can you find them all?`,
    ...HOME_IMAGE,
    crumb: 'Easter eggs',
  },
  '/press': {
    title: 'TardiGeddon Press Kit: Fact Sheet, Logo, Screenshots',
    description: 'Everything for writing about TardiGeddon: a fact sheet, descriptions to quote, the logo, screenshots and gameplay clips, and who to contact.',
    ...HOME_IMAGE,
    crumb: 'Press kit',
  },
  '/promo-codes': {
    title: `TardiGeddon Promo Codes: Free ${PROMO.hatName} Hat Code`,
    description: `The current TardiGeddon promo code: ${PROMO.code} unlocks the ${PROMO.hatName}, a free hat you can only get with this code. How to redeem it in the game.`,
    image: '/media/og-promo.jpg',
    imageAlt: `A tardigrade wearing the ${PROMO.hatName}, with the promo code ${PROMO.code}.`,
    crumb: 'Promo codes',
  },
};

export const NOT_FOUND: PageMeta = { title: 'Page not found | TardiGeddon', description: 'This page sank without a trace.', ...HOME_IMAGE, noindex: true };

/** A page's metadata (legal pages: the title from the document's own heading, if known). */
export function pageMeta(path: string, legalTitle?: string): PageMeta {
  if (PAGES[path]) return PAGES[path];
  const legal = /^\/legal\/([a-z-]+)$/.exec(path);
  const page = legal && LEGAL_PAGES.find((p) => p.slug === legal[1]);
  if (page) {
    return {
      title: `${legalTitle ?? page.label} | TardiGeddon`,
      description: `TardiGeddon’s ${page.label}.`,
      ...HOME_IMAGE,
      noindex: true,
    };
  }
  return NOT_FOUND;
}

/** Pages for the sitemap: the ones search engines should list. */
export const INDEXED_PATHS = Object.keys(PAGES);

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const GAME_ID = `${SITE_URL}/#game`;

const abs = (path: string) => SITE_URL + path;

/** The company. */
const organization = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: 'EVCV Limited',
  alternateName: 'EVCV Studios',
  url: SITE_URL,
  logo: { '@type': 'ImageObject', url: abs('/media/logo.png'), width: 1200, height: 400 },
  email: 'support@tardigeddon.com',
  // The game's social accounts (site/src/social.ts).
  sameAs: SOCIAL.map((s) => s.profile ?? s.href),
  vatID: 'GB389265053',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '28 Oak Tree Lane, Cookhill',
    addressLocality: 'Alcester',
    addressRegion: 'Warwickshire',
    postalCode: 'B49 5LH',
    addressCountry: 'GB',
  },
};

const website = {
  '@type': 'WebSite',
  '@id': SITE_ID,
  name: 'TardiGeddon',
  url: abs('/'),
  inLanguage: 'en-GB',
  publisher: { '@id': ORG_ID },
};

/** The game itself. */
const game = {
  '@type': 'VideoGame',
  '@id': GAME_ID,
  name: 'TardiGeddon',
  url: abs('/'),
  description: `TardiGeddon is a free turn-based artillery game starring tardigrades. Teams take turns to aim and fire ${WEAPON_COUNT} weapons across destructible maps, with the wind to allow for. Play against the computer, with up to ${MAX_TEAMS} teams on one device, or online.`,
  image: abs('/media/og-home.jpg'),
  screenshot: ['/media/shot-crater.webp', '/media/shot-realm-sky.webp', '/media/shot-emblem.webp', '/media/shot-challenge.webp'].map(abs),
  genre: ['Artillery', 'Turn-based strategy', 'Party'],
  gamePlatform: ['Web browser'],
  operatingSystem: 'Any (plays in a web browser)',
  applicationCategory: 'Game',
  playMode: ['SinglePlayer', 'MultiPlayer'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: MAX_TEAMS },
  gameItem: PANEL_WEAPONS.filter((w) => w.id !== 'skip').map((w) => ({ '@type': 'Thing', name: w.name })),
  inLanguage: LANGS.map((l) => l.id),
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: 0, priceCurrency: 'GBP', availability: 'https://schema.org/InStock', url: abs('/play/') },
  author: { '@id': ORG_ID },
  publisher: { '@id': ORG_ID },
  trailer: {
    '@type': 'VideoObject',
    name: 'TardiGeddon gameplay: the Concrete Tun',
    description: 'A Concrete Tun smashes down through the ground onto a huddle of tardigrades, knocking one into the sea, and the other team lobs a grenade back.',
    thumbnailUrl: abs('/media/clip-tun-poster.webp'),
    contentUrl: abs('/media/clip-tun.mp4'),
    uploadDate: '2026-10-22',
    duration: 'PT13S',
  },
};

/** The structured data for a page: a schema.org graph. `faq`: its questions and answers, as plain text. */
export function pageSchema(path: string, faq?: { q: string; a: string }[]): object {
  const meta = pageMeta(path);
  const graph: object[] = [organization, website];
  if (path === '/' || path === '/press') graph.push(game);
  const page: Record<string, unknown> = {
    '@type': path === '/support' && faq?.length ? ['WebPage', 'FAQPage'] : 'WebPage',
    '@id': `${abs(path)}#webpage`,
    url: abs(path),
    name: meta.title,
    description: meta.description,
    isPartOf: { '@id': SITE_ID },
    inLanguage: 'en-GB',
    primaryImageOfPage: { '@type': 'ImageObject', url: abs(meta.image) },
  };
  if (path === '/' || path === '/press') page.about = { '@id': GAME_ID };
  if (faq?.length) {
    page.mainEntity = faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }));
  }
  if (meta.crumb) {
    page.breadcrumb = {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: abs('/') },
        { '@type': 'ListItem', position: 2, name: meta.crumb, item: abs(path) },
      ],
    };
  }
  graph.push(page);
  return { '@context': 'https://schema.org', '@graph': graph };
}
