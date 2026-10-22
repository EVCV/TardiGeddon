// The promo code the website shows (/promo-codes, the home page): the game's
// current one (src/shop/catalog.ts PROMOS), so the two can't disagree.

import { PROMOS, PROMO_ITEMS, promoFor } from '../../src/shop/catalog';

// The first code that still works (the newest ended one if none do).
const promo = PROMOS.find((p) => promoFor(p.code)) ?? PROMOS[PROMOS.length - 1];
const item = PROMO_ITEMS.find((i) => i.id === promo.items[0])!;

export const PROMO = {
  code: promo.code,
  /** The hat it unlocks. */
  hatId: item.ref,
  hatName: item.name,
  /** Last day it works, if it ends. */
  until: promo.until,
};

/** Does the code still work? (Ask when drawing the page: it can end while the site stays up.) */
export const promoWorks = (): boolean => !!promoFor(PROMO.code);
