// The shop: what can be unlocked, and with what. Shared by the game (shop UI,
// locked items) and the server (prices, ownership checks), so DOM-free.
//
// Two currencies, kept strictly apart:
// - Coins are bought with real money (coin packs, the only thing Stripe
//   sells). Coins buy cosmetics: they change how a team looks, never how it
//   plays.
// - Slime is earned by playing and can never be bought. Slime unlocks
//   weapons and some cosmetics.
// There is no way to turn coins into Slime: that would let money buy weapons.
//
// Anything not listed here is free for everyone. Never rename an item id
// once it has been sold or unlocked: inventories store it.

/** aim: how your aim marker and power bar look; fx: how your explosions look. */
export type ItemKind = 'hat' | 'skin' | 'aim' | 'fx' | 'weapon';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ShopItem {
  /** Stable id stored in inventories: `<kind>:<ref>`. */
  id: string;
  kind: ItemKind;
  /** The hat / skin / aim style / effect / weapon id it unlocks. */
  ref: string;
  name: string;
  blurb: string;
  rarity: Rarity;
  /** Price in coins (cosmetics only) ... */
  coins?: number;
  /** ... or in Slime (exactly one of the two). */
  slime?: number;
}

export interface CoinPack {
  id: string;
  coins: number;
  /** Extra coins on top, so bigger packs give more coins per pound. */
  bonus: number;
  /** Price in pence (CURRENCY), VAT included. */
  price: number;
}

export const CURRENCY = 'gbp';

/**
 * Bigger packs include bonus coins (Terms 5.1.2): from about 1p a coin in the
 * smallest pack to about 0.77p in the biggest. Never rename an id: purchase
 * records store it.
 */
export const COIN_PACKS: CoinPack[] = [
  { id: 'coins:200', coins: 200, bonus: 0, price: 199 },
  { id: 'coins:500', coins: 500, bonus: 50, price: 499 },
  { id: 'coins:1000', coins: 1000, bonus: 150, price: 999 },
  { id: 'coins:2000', coins: 2000, bonus: 400, price: 1999 },
  { id: 'coins:5000', coins: 5000, bonus: 1250, price: 4999 },
  { id: 'coins:10000', coins: 10000, bonus: 3000, price: 9999 },
];

/** All the coins a pack gives, bonus included. */
export function packTotal(p: CoinPack): number {
  return p.coins + p.bonus;
}

/** Pence per coin in a pack. */
export function pencePerCoin(p: CoinPack): number {
  return p.price / packTotal(p);
}

/** What some coins are worth in pounds: "£1.67–£1.99", from the biggest pack's rate to the smallest's. */
export function coinValue(coins: number): string {
  const rates = COIN_PACKS.map(pencePerCoin);
  const lo = formatPrice(Math.round(coins * Math.min(...rates)));
  const hi = formatPrice(Math.round(coins * Math.max(...rates)));
  return lo === hi ? lo : `${lo}–${hi}`;
}

const hat = (ref: string, name: string, blurb: string, rarity: Rarity, price: { coins?: number; slime?: number }): ShopItem => ({
  id: `hat:${ref}`, kind: 'hat', ref, name, blurb, rarity, ...price,
});
const skin = (ref: string, name: string, blurb: string, rarity: Rarity, price: { coins?: number; slime?: number }): ShopItem => ({
  id: `skin:${ref}`, kind: 'skin', ref, name, blurb, rarity, ...price,
});
const aim = (ref: string, name: string, blurb: string, rarity: Rarity, coins: number): ShopItem => ({
  id: `aim:${ref}`, kind: 'aim', ref, name, blurb, rarity, coins,
});
const fx = (ref: string, name: string, blurb: string, rarity: Rarity, coins: number): ShopItem => ({
  id: `fx:${ref}`, kind: 'fx', ref, name, blurb, rarity, coins,
});
const weapon = (ref: string, name: string, blurb: string, rarity: Rarity, slime: number): ShopItem => ({
  id: `weapon:${ref}`, kind: 'weapon', ref, name, blurb, rarity, slime,
});

export const SHOP_ITEMS: ShopItem[] = [
  // Hats for coins
  hat('wizard', 'Wizard hat', 'Pointy, starry, very wise.', 'rare', { coins: 200 }),
  hat('pirate', 'Pirate hat', 'Arr. Walk the plank, Moss Mob.', 'rare', { coins: 200 }),
  hat('viking', 'Viking helmet', 'Horns for headbutting the wind.', 'rare', { coins: 200 }),
  hat('chef', 'Chef hat', 'Cooks up a mean Spore Bazooka.', 'common', { coins: 100 }),
  hat('cowboy', 'Cowboy hat', 'Yeehaw, partner.', 'rare', { coins: 200 }),
  hat('party', 'Party hat', 'Every pop is a celebration.', 'common', { coins: 100 }),
  hat('propeller', 'Propeller cap', 'Does not help you fly. Sorry.', 'rare', { coins: 200 }),
  hat('mushroom', 'Toadstool', 'Spotty and suspiciously cute.', 'rare', { coins: 200 }),
  hat('bunny', 'Bunny ears', 'Hop it.', 'epic', { coins: 300 }),
  hat('fez', 'Fez', 'Fezzes are cool.', 'common', { coins: 100 }),
  hat('sombrero', 'Sombrero', 'Shade for the whole team.', 'rare', { coins: 200 }),
  hat('grad', 'Graduation cap', 'Top of the class at blowing things up.', 'common', { coins: 100 }),
  hat('bow', 'Big bow', 'Gift-wrapped for your enemies.', 'common', { coins: 100 }),
  hat('antennae', 'Alien antennae', 'Take me to your leader.', 'epic', { coins: 300 }),
  hat('tiara', 'Tiara', 'Royalty, but tiny.', 'epic', { coins: 300 }),
  hat('jester', 'Jester hat', 'Jingles when you miss.', 'epic', { coins: 300 }),
  hat('headphones', 'Headphones', 'Blocks out the sad trombone.', 'rare', { coins: 200 }),
  hat('deerstalker', 'Detective hat', 'Elementary, my dear tardi.', 'rare', { coins: 200 }),
  hat('eggshell', 'Eggshell', 'Freshly hatched and furious.', 'epic', { coins: 300 }),
  hat('catears', 'Cat ears', 'Purrfectly dangerous.', 'rare', { coins: 400 }),
  hat('beret', 'Beret', 'Très chic, très explosive.', 'rare', { coins: 400 }),
  hat('santa', 'Santa hat', 'Ho ho ka-boom.', 'rare', { coins: 500 }),
  hat('witch', 'Witch hat', 'Brews a mean potion of pain.', 'epic', { coins: 900 }),
  hat('unicorn', 'Unicorn horn', 'Magical. Pointy. Mostly magical.', 'legendary', { coins: 1800 }),
  hat('halo', 'Halo', 'Angelic. Until it is your turn.', 'legendary', { coins: 2000 }),
  hat('flame', 'Flame crown', 'Too hot to handle.', 'legendary', { coins: 2200 }),
  hat('astronaut', 'Space helmet', 'One small step for a tardi.', 'legendary', { coins: 2500 }),
  hat('dragon', 'Dragon hood', 'Spikes, scales, the lot.', 'legendary', { coins: 2500 }),
  hat('imperial', 'Imperial crown', 'Jewels on jewels on jewels.', 'legendary', { coins: 3000 }),
  // Hats for Slime
  hat('hardhat', 'Hard hat', 'Safety first. Explosions second.', 'common', { slime: 300 }),
  hat('sprout', 'Sprout', 'A little leaf for a little legend.', 'common', { slime: 200 }),
  hat('bucket', 'Bucket hat', 'Festival ready.', 'common', { slime: 250 }),
  hat('cone', 'Traffic cone', 'Found it on the way to the pond.', 'rare', { slime: 400 }),
  // Skins for coins
  skin('microscope', 'Under the Microscope', 'The realistic look: just how they appear under a lens.', 'epic', { coins: 300 }),
  skin('bubblegum', 'Bubblegum', 'Pink and chewy.', 'common', { coins: 200 }),
  skin('midnight', 'Midnight', 'Spotted with stars.', 'rare', { coins: 300 }),
  skin('ghost', 'Ghostly', 'Boo. Also: pop.', 'rare', { coins: 300 }),
  skin('lava', 'Lava', 'Hot stuff.', 'rare', { coins: 300 }),
  skin('strawberry', 'Strawberry', 'Seeds included.', 'rare', { coins: 300 }),
  skin('zebra', 'Zebra', 'Stripes in black and white.', 'epic', { coins: 400 }),
  skin('tiger', 'Tiger', 'Grr. (Very small grr.)', 'epic', { coins: 400 }),
  skin('robot', 'Robo-Tardi', 'Bolted together, beep boop.', 'legendary', { coins: 500 }),
  skin('gold', 'Solid Gold', 'Shiny. Absolutely no gameplay advantage.', 'legendary', { coins: 500 }),
  skin('mint', 'Mint', 'Fresh as a pond in spring.', 'common', { coins: 300 }),
  skin('chocolate', 'Chocolate', 'Do not eat.', 'common', { coins: 300 }),
  skin('camo', 'Camo', 'You cannot see me. (They can.)', 'rare', { coins: 500 }),
  skin('candy', 'Candy stripe', 'Sweet on the outside.', 'rare', { coins: 500 }),
  skin('panda', 'Panda', 'Black, white and ready to fight.', 'rare', { coins: 600 }),
  skin('leopard', 'Leopard', 'Spots before your eyes.', 'rare', { coins: 600 }),
  skin('neon', 'Neon', 'Glows in the dark. Probably.', 'epic', { coins: 900 }),
  skin('toxic', 'Toxic', 'Do not lick.', 'epic', { coins: 900 }),
  skin('frost', 'Frostbite', 'Cool under pressure.', 'epic', { coins: 1000 }),
  skin('galaxy', 'Galaxy', 'A universe of stars in one tiny body.', 'legendary', { coins: 2000 }),
  skin('diamond', 'Diamond', 'Sparkles. Absolutely no extra armour.', 'legendary', { coins: 2500 }),
  // Skins for Slime
  skin('moss', 'Mossy', 'Earned the hard way, in the moss.', 'rare', { slime: 500 }),
  skin('ocean', 'Deep Sea', 'Cool blue for cool heads.', 'rare', { slime: 500 }),
  skin('zombie', 'Zombie', 'Popped once too often.', 'epic', { slime: 800 }),
  // Aim styles: how your aim marker and power bar look. Coins.
  aim('candy', 'Candy cane', 'A striped power bar. Sweet shots only.', 'common', 400),
  aim('laser', 'Laser sight', 'A red beam from barrel to target.', 'rare', 500),
  aim('neon', 'Neon', 'A glowing pink and blue marker.', 'rare', 600),
  aim('hearts', 'Lovestruck', 'Aim with love. Fire with less love.', 'rare', 600),
  aim('rainbow', 'Rainbow aim', 'A marker and power bar in every colour.', 'epic', 1200),
  aim('sparkle', 'Sparkler', 'Sparkles fizz around your marker.', 'epic', 1500),
  aim('comet', 'Comet', 'A blazing comet tail as you power up.', 'legendary', 2000),
  aim('gold', 'Golden aim', 'A shining gold marker with glitter.', 'legendary', 2500),
  // Explosion effects: how your blasts look. Coins.
  fx('confetti', 'Party popper', 'Every blast is a celebration.', 'rare', 800),
  fx('slime', 'Slime splat', 'Gloopy green goo everywhere.', 'rare', 800),
  fx('frost', 'Ice blast', 'Snowflakes and frosty smoke.', 'rare', 800),
  fx('hearts', 'Love bomb', 'Explodes into hearts. Still hurts.', 'epic', 1000),
  fx('shadow', 'Shadow blast', 'Dark purple smoke. Very mysterious.', 'epic', 1200),
  fx('fireworks', 'Fireworks', 'Stars in every colour.', 'epic', 1800),
  fx('rainbow', 'Rainbow blast', 'Smoke in all the colours of the rainbow.', 'legendary', 2000),
  fx('gold', 'Golden blast', 'Showers of gold. Fancy.', 'legendary', 3000),
  // Season 1 weapons: Slime only
  weapon('pinball', 'Pollen Pinball', 'A super-bouncy grenade. Watch it ricochet!', 'rare', 600),
  weapon('megaspore', 'Mega Spore', 'A slow, heavy bazooka shell with a huge blast.', 'epic', 900),
  weapon('swarm', 'Spore Swarm', 'Splits into a swarm of eight little bomblets.', 'epic', 1200),
  weapon('balloon', 'Water Balloon', 'An enormous splash that soaks everyone nearby.', 'legendary', 1500),
];

/**
 * Sets of coin items sold together for less than the items cost one by one.
 * If you already own some of them you pay only for the rest, at the same
 * discount (bundlePrice). Never rename an id.
 */
export interface Bundle {
  id: string;
  name: string;
  blurb: string;
  /** Shop item ids (coin items only). */
  items: string[];
  /** Price in coins with nothing owned yet. */
  coins: number;
}

export const BUNDLES: Bundle[] = [
  { id: 'bundle:sweet', name: 'Sweet Tooth', blurb: 'A candy-coated tardi from hat to blast.', items: ['hat:party', 'skin:candy', 'aim:candy', 'fx:confetti'], coins: 1450 },
  { id: 'bundle:spooky', name: 'Spooky', blurb: 'Witchy, ghostly and full of shadows.', items: ['hat:witch', 'skin:ghost', 'aim:neon', 'fx:shadow'], coins: 2400 },
  { id: 'bundle:inferno', name: 'Inferno', blurb: 'Red hot from head to blast.', items: ['hat:flame', 'skin:lava', 'aim:laser', 'fx:shadow'], coins: 3400 },
  { id: 'bundle:rainbow', name: 'Over the Rainbow', blurb: 'Every colour, all at once.', items: ['hat:unicorn', 'skin:neon', 'aim:rainbow', 'fx:rainbow'], coins: 4700 },
  { id: 'bundle:space', name: 'Space Explorer', blurb: 'Blast off with stars and comets.', items: ['hat:astronaut', 'skin:galaxy', 'aim:comet', 'fx:fireworks'], coins: 6600 },
  { id: 'bundle:royal', name: 'Royal Treasury', blurb: 'The finest things in the shop.', items: ['hat:imperial', 'skin:diamond', 'aim:gold', 'fx:gold'], coins: 8800 },
];

export function bundle(id: string): Bundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}

/** What the bundle's items cost bought one by one (only those not owned yet). */
export function bundleValue(b: Bundle, owned: readonly string[] = []): number {
  return b.items.filter((id) => !owned.includes(id)).reduce((sum, id) => sum + (shopItem(id)?.coins ?? 0), 0);
}

/**
 * The bundle's price for someone who already owns some of it: the same
 * discount, on just the items they don't have. 0 when they own it all.
 */
export function bundlePrice(b: Bundle, owned: readonly string[] = []): number {
  const full = bundleValue(b);
  const left = bundleValue(b, owned);
  return left === 0 ? 0 : Math.max(1, Math.round((b.coins * left) / full));
}

export function shopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

export function coinPack(id: string): CoinPack | undefined {
  return COIN_PACKS.find((p) => p.id === id);
}

/** The shop item that unlocks this hat / skin / weapon, if it isn't free. */
export function itemFor(kind: ItemKind, ref: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.kind === kind && i.ref === ref);
}

/** May someone who owns these items use this hat / skin / weapon? */
export function canUse(kind: ItemKind, ref: string, owned: readonly string[]): boolean {
  const item = itemFor(kind, ref);
  return !item || owned.includes(item.id);
}

/** Back-compat helper for hats. */
export function canWearHat(hat: string, owned: readonly string[]): boolean {
  return canUse('hat', hat, owned);
}

/** Weapons unlocked by these items, for the match rules (Scheme.unlocked). */
export function unlockedWeapons(owned: readonly string[]): string[] {
  return SHOP_ITEMS.filter((i) => i.kind === 'weapon' && owned.includes(i.id)).map((i) => i.ref);
}

export function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-GB');
}
