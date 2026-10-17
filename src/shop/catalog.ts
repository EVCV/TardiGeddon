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

/**
 * aim: how your aim marker and power bar look; fx: how your explosions look;
 * arena: the sky, hills, water and ground you see (only you see it);
 * music: the soundtrack you hear in matches; sound: how your sound effects
 * sound (only you hear them).
 */
export type ItemKind = 'hat' | 'skin' | 'aim' | 'fx' | 'arena' | 'music' | 'sound' | 'weapon';
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
const arena = (ref: string, name: string, blurb: string, rarity: Rarity, coins: number): ShopItem => ({
  id: `arena:${ref}`, kind: 'arena', ref, name, blurb, rarity, coins,
});
const music = (ref: string, name: string, blurb: string, rarity: Rarity, coins: number): ShopItem => ({
  id: `music:${ref}`, kind: 'music', ref, name, blurb, rarity, coins,
});
const sound = (ref: string, name: string, blurb: string, rarity: Rarity, coins: number): ShopItem => ({
  id: `sound:${ref}`, kind: 'sound', ref, name, blurb, rarity, coins,
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
  skin('peach', 'Peachy', 'Soft, fuzzy and ready to rumble.', 'common', { coins: 300 }),
  skin('lavender', 'Lavender', 'Calm, relaxing, explosive.', 'common', { coins: 300 }),
  skin('cookie', 'Cookie', 'Chocolate chips included.', 'rare', { coins: 400 }),
  skin('ladybug', 'Ladybird', 'Lucky spots. Unlucky enemies.', 'rare', { coins: 500 }),
  skin('bee', 'Busy bee', 'Buzzing with bad intentions.', 'rare', { coins: 500 }),
  skin('mermaid', 'Mermaid', 'Shimmering scales from the deep.', 'epic', { coins: 900 }),
  skin('shadow', 'Shadow', 'Blends into the dark. Mostly.', 'epic', { coins: 1200 }),
  skin('ruby', 'Ruby', 'A precious, polished red gem.', 'legendary', { coins: 1500 }),
  // Skins for Slime
  skin('moss', 'Mossy', 'Earned the hard way, in the moss.', 'rare', { slime: 500 }),
  skin('ocean', 'Deep Sea', 'Cool blue for cool heads.', 'rare', { slime: 500 }),
  skin('zombie', 'Zombie', 'Popped once too often.', 'epic', { slime: 800 }),
  hat('sailor', 'Sailor hat', 'Ahoy! All hands on deck.', 'common', { coins: 300 }),
  hat('ninja', 'Ninja headband', 'Silent. Deadly. Slightly wobbly.', 'rare', { coins: 400 }),
  hat('chick', 'Baby chick', 'Cheep cheep, kaboom.', 'rare', { coins: 400 }),
  hat('pumpkin', 'Pumpkin', 'Spooky season, every season.', 'rare', { coins: 500 }),
  hat('frog', 'Froggy', 'Ribbit. Then run.', 'rare', { coins: 600 }),
  hat('mohawk', 'Mohawk', 'Punk rock tardi.', 'epic', { coins: 700 }),
  hat('knight', 'Knight helmet', 'For honour, and for the pond.', 'epic', { coins: 900 }),
  hat('crystal', 'Crystal crown', 'Carved from a single glittering gem.', 'legendary', { coins: 2400 }),
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
  // Arena themes: the world you play in. Only you see your arena. Coins.
  arena('sunset', 'Sunset Shore', 'Battle under a warm orange sky.', 'rare', 800),
  arena('autumn', 'Autumn Woods', 'Crunchy orange leaves on every hill.', 'rare', 800),
  arena('snow', 'Snowy Peaks', 'Snow-capped ground and falling flakes.', 'epic', 1200),
  arena('desert', 'Desert Dunes', 'Golden sand and a turquoise oasis.', 'epic', 1200),
  arena('candy', 'Candy Land', 'Pink skies and a strawberry sea.', 'epic', 1500),
  arena('night', 'Starry Night', 'Twinkling stars over moonlit hills.', 'legendary', 2000),
  arena('volcano', 'Volcano', 'A lava sea and glowing embers. Toasty.', 'legendary', 2500),
  arena('alien', 'Alien Planet', 'Purple skies, green moss, far from home.', 'legendary', 3000),
  // Match music: the soundtrack you hear in your matches. Only you hear it. Coins.
  music('chiptune', '8-Bit Puddle', 'Bleepy, boppy, straight out of an old console.', 'rare', 600),
  music('lofi', 'Lo-fi Lichen', 'Chill beats to pop tardigrades to.', 'rare', 600),
  music('shanty', 'Sea Shanty Slam', 'Heave ho, blow them all below.', 'rare', 800),
  music('spooky', 'Spooky Swamp', 'Something is lurking in the moss…', 'epic', 1000),
  music('disco', 'Disco Droplet', 'Funky bass and a four-on-the-floor kick.', 'epic', 1000),
  music('space', 'Cosmic Crawl', 'Dreamy echoes from the edge of the galaxy.', 'legendary', 1500),
  music('boss', 'Boss Battle', 'Fast, furious and very dramatic.', 'legendary', 1800),
  // Sound packs: your explosions, shots and squeaks, voiced differently. Only you hear them. Coins.
  sound('retro', 'Retro Bleeps', 'Every blast and squeak in 8-bit.', 'rare', 500),
  sound('squelch', 'Squishy Squelch', 'Low, wobbly and wonderfully wet.', 'rare', 500),
  sound('cartoon', 'Cartoon Boings', 'High, bouncy, silly. Very silly.', 'epic', 800),
  sound('boom', 'Big Booms', 'Deeper, longer, louder explosions.', 'epic', 900),
  sound('robot', 'Robo Tardi', 'Buzzy, metallic, beep boop.', 'legendary', 1200),
  // Season 1 weapons: Slime only
  weapon('pinball', 'Pollen Pinball', 'A super-bouncy grenade. Watch it ricochet!', 'rare', 600),
  weapon('megaspore', 'Mega Spore', 'A slow, heavy bazooka shell with a huge blast.', 'epic', 900),
  weapon('swarm', 'Spore Swarm', 'Splits into a swarm of eight little bomblets.', 'epic', 1200),
  weapon('balloon', 'Water Balloon', 'An enormous splash that soaks everyone nearby.', 'legendary', 1500),
  // Season 2 weapons: Slime only
  weapon('gloop', 'Gloop Bomb', 'Sticks wherever it lands, then goes off. Plant it and run!', 'rare', 700),
  weapon('drill', 'Earthworm Drill', 'Burrows into the ground before it blows. Great for hiding enemies.', 'epic', 1000),
  weapon('gale', 'Gale Gourd', 'A tiny bang with an enormous gust. Blow them into the pond!', 'epic', 1100),
  weapon('leech', 'Leech Lobber', 'Heals you by half the damage it does.', 'legendary', 1600),
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
  { id: 'bundle:winter', name: 'Winter Wonderland', blurb: 'Snowy hills, frosty blasts and a festive hat.', items: ['hat:santa', 'skin:frost', 'fx:frost', 'arena:snow'], coins: 2800 },
  { id: 'bundle:night', name: 'Night Ninja', blurb: 'Strike from the shadows under the stars.', items: ['hat:ninja', 'skin:shadow', 'fx:shadow', 'arena:night'], coins: 3850 },
  { id: 'bundle:volcano', name: 'Volcano Lair', blurb: 'Live dangerously beside the lava sea.', items: ['hat:knight', 'skin:ruby', 'aim:laser', 'arena:volcano'], coins: 4300 },
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

/**
 * Google Play product ids that differ from the usual pattern. A deleted Play
 * product's id can never be used again, so coins_200 became coins_200_1.
 */
const PLAY_PRODUCT_IDS: Record<string, string> = { 'coins:200': 'coins_200_1' };

/**
 * The pack's product id in Google Play (Play Console → Monetise with Play →
 * Products → One-time products): coins:500 → coins_500. Play ids can't contain ":".
 */
export function playProductId(pack: CoinPack): string {
  return PLAY_PRODUCT_IDS[pack.id] ?? pack.id.replace(':', '_');
}

/** The coin pack a Google Play product id sells, if any. */
export function packForPlayProduct(productId: string): CoinPack | undefined {
  return COIN_PACKS.find((p) => playProductId(p) === productId);
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

/**
 * Gifts: a player spends their own coins on a look or bundle for someone
 * else and gets a one-use code to pass on. Only these preset messages can go
 * with a gift (no free text between players).
 */
export const GIFT_MESSAGES: Record<string, string> = {
  none: '',
  birthday: 'Happy birthday! 🎂',
  gg: 'Good game! 🏆',
  thanks: 'Thank you! 💛',
  just: 'Just because 😊',
  luck: 'Good luck! 🍀',
  xmas: 'Merry Christmas! 🎄',
};
Object.setPrototypeOf(GIFT_MESSAGES, null);

/** Gifts a player may buy in any 24 hours. */
export const GIFTS_PER_DAY = 5;
/** An account must be this old (hours) and have a confirmed email to send gifts. */
export const GIFT_MIN_ACCOUNT_HOURS = 24;

/** What can be given: a coin look, or a bundle. Never weapons (Slime) or coins. */
export function giftable(id: string): { coins: number; items: string[]; name: string } | undefined {
  const set = bundle(id);
  if (set) return { coins: set.coins, items: set.items, name: `${set.name} bundle` };
  const item = shopItem(id);
  if (item && item.coins !== undefined) return { coins: item.coins, items: [item.id], name: item.name };
  return undefined;
}

/** Gift code letters: no I, L, O, 0 or 1, so codes can't be misread. */
export const GIFT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** A gift code as typed: dashes, spaces and case don't matter. */
export function normaliseGiftCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
