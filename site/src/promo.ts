// The promo code the website shows (/promo-codes, the home page): the game's
// current one (src/shop/catalog.ts PROMOS), so the two can't disagree.

import { PROMOS, PROMO_ITEMS } from '../../src/shop/catalog';

const promo = PROMOS[0];
const item = PROMO_ITEMS.find((i) => i.id === promo.items[0])!;

export const PROMO = {
  code: promo.code,
  /** The hat it unlocks. */
  hatId: item.ref,
  hatName: item.name,
  /** Last day it works, if it ends. */
  until: promo.until,
};
