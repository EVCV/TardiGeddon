// What the shop sells. Cosmetic only: nothing here changes how a team plays
// (docs/GAME_PLAN.md §8). Shared by the game (shop UI, locked hats) and the
// server (checkout prices, ownership checks), so it must stay DOM-free.
//
// Anything not listed here is free for everyone.

export interface ShopItem {
  /** Stable id stored in players' inventories: `<kind>:<ref>`. Never rename. */
  id: string;
  kind: 'hat';
  /** The cosmetic's own id (e.g. the hat id in render/hats.ts). */
  ref: string;
  name: string;
  /** Price in the smallest unit of CURRENCY (pence). */
  price: number;
}

export const CURRENCY = 'gbp';

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'hat:wizard', kind: 'hat', ref: 'wizard', name: 'Wizard hat', price: 199 },
  { id: 'hat:pirate', kind: 'hat', ref: 'pirate', name: 'Pirate hat', price: 199 },
  { id: 'hat:viking', kind: 'hat', ref: 'viking', name: 'Viking helmet', price: 199 },
];

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

/** The shop item that sells this hat, if it isn't free. */
export function hatItem(hat: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.kind === 'hat' && i.ref === hat);
}

/** May someone who owns these items wear this hat? */
export function canWearHat(hat: string, owned: ReadonlySet<string> | readonly string[]): boolean {
  const item = hatItem(hat);
  if (!item) return true;
  return Array.isArray(owned) ? owned.includes(item.id) : (owned as ReadonlySet<string>).has(item.id);
}

export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
