// The scheduled social posts (docs/social/SCHEDULE.md): what each one says and
// what its picture shows. scripts/social-posts.ts draws the pictures and
// writes the Sociamonials bulk-import CSV.
//
// Rules (docs/social/README.md): never say "Worms"; money only buys looks;
// cheerful, short, British spelling; no "hurry" or countdowns.
//
// A post with no `date` goes into Sociamonials' queue under its category, so
// the queue's weekly slots decide when it goes out. Only posts tied to a day
// (launch, the Founder pack, the Supporter packs' end date, Christmas) have a
// `date`, in UK time.
//
// To add posts: give them a new `batch` number and run
//   npx tsx scripts/social-posts.ts <batch>
// Never change a post's `id` once its batch is imported (its picture's URL is
// built from it).

export type Category = 'Weapons' | 'Tips' | 'Tardigrade facts' | 'Worlds and modes' | 'Community' | 'Play' | 'Videos';

/** What the card's middle shows. */
export type Art =
  | { shot: string } // a screenshot from site/public/media
  | { weapon: string } // a weapon's icon and a tardi (src/sim/weapons.ts)
  | { stat: string } // a big number or word
  | { tardis: { color: number; hat: string; skin?: string }[] } // a row of tardis on the grass
  | { question: string }; // a big speech bubble

export interface Post {
  id: string;
  batch: number;
  category: Category;
  /** Card heading. */
  title: string;
  /** Card text: one or two short sentences. */
  text: string;
  art: Art;
  /** The post itself. The play link and hashtags are added after it. */
  message: string;
  /** Extra hashtags after #TardiGeddon (two at most). */
  tags?: string[];
  /** Describes the picture for screen readers. */
  alt: string;
  /** Fixed time (UK), "YYYY-MM-DD HH:MM", instead of the queue. */
  date?: string;
  /** A video instead of a picture: a file on tardigeddon.com, and its YouTube title. */
  video?: { url: string; youtubeTitle: string };
  /** Leave out the "Play free" line (e.g. a post that's all about a link already). */
  noPlayLink?: boolean;
}

const RED = 0xe04848;
const BLUE = 0x3a7be0;
const GREEN = 0x3cb34a;
const GOLD = 0xe0a020;
const PURPLE = 0x9a5ae0;
const PINK = 0xe06aa8;

/** Weapon posts: the card text comes from the weapon's own blurb (src/sim/weapons.ts). */
const weapon = (batch: number, id: string, message: string, tags = ['indiegame', 'gamedev']): Post => ({
  id: `weapon-${id}`,
  batch,
  category: 'Weapons',
  title: '', // filled in from the weapon's name
  text: '', // and blurb
  art: { weapon: id },
  message,
  tags,
  alt: '',
});

export const POSTS: Post[] = [
  // ── Weapons (two a week) ────────────────────────────────────────────────
  weapon(1, 'bazooka', 'Meet the Spore Bazooka 🚀 The classic: aim, hold Fire, let go. It flies in a curve and the wind pushes it, so check the arrow before you fire.'),
  weapon(1, 'tun', 'The Concrete Tun 🗿 Pick a spot, and a giant concrete tun drops from the sky and smashes down through the rock. Tiny tardigrades, very big problem.', ['indiegame', 'tardigrade']),
  weapon(1, 'rope', 'The Silk Rope 🕸️ Fire a line at the rock, swing across the map, climb with ▲▼ and let go with Jump. Hard to master, brilliant when you do.'),
  weapon(1, 'grenade', 'The Pebble Grenade 💣 It bounces, and the wind leaves it alone. Set the fuse from 1 to 5 seconds and bank it off the rocks.'),
  weapon(1, 'homing', 'The Homing Spore 🎯 Tap a target first, then fire: it steers itself there. For when the wind just won’t behave.'),
  weapon(1, 'dynamite', 'Sticky Dynamite 🧨 Drop it at your feet and run. Five seconds later: a very big bang.'),
  weapon(1, 'holywater', 'The Holy Water Droplet 💦 A superweapon: it bounces, then a giant blast 3 seconds later. Throw it and stand well back.'),
  weapon(1, 'firepunch', 'The Fire Punch 👊 Walk up close and punch the tardigrade next to you into the air. Best near a cliff edge… or the water.'),
  weapon(1, 'rotifer', 'The Rotifer Roller 🌀 It walks along the ground and over small steps, then blows up with a big blast. Point it the right way first!'),
  weapon(1, 'airstrike', 'The Raindrop Strike 💧 Pick a spot and five raindrops fall on it from the sky. The wind pushes them, so aim a little upwind.'),
  weapon(1, 'slideslam', 'The Microscope Slide Slam 🔬 Glass shards rain down all over the map. Anyone can be hit… including you. Use with care (or don’t).'),
  weapon(1, 'teleport', 'The Teleport ✨ Pick a spot and you’re there. It ends your go, so use it to escape, or to get the perfect angle for next time.'),
  weapon(1, 'cluster', 'The Algae Cluster 🟢 It bounces, then bursts into five little bomblets. Great for tardigrades huddled together.'),
  weapon(1, 'cyanobloom', 'The Cyanobloom Cloud ☁️ It leaves a poison cloud, and poisoned tardigrades lose a little health every turn. Slow, but it adds up.'),
  weapon(1, 'shotgun', 'The Claw Shotgun 🔫 Fires straight, twice, with no wind to worry about. Two small blasts: one to knock them, one to finish.'),
  weapon(1, 'sapbomb', 'The Hot Sap Bomb 🔥 It spills burning sap, and anyone who touches it gets hurt. Lovely for blocking a path.'),
  weapon(1, 'acidrain', 'Acid Rain 🌧️ Pick a spot and five acid drops fall on it. Mind the wind: it carries them.'),
  weapon(1, 'mortar', 'The Mortar Pod 🌰 It blows up where it hits and throws out four fragments. Good for reaching round corners.'),
  weapon(1, 'bacteria', 'The Bacteria Bomb 🦠 Bounces, then bursts into five germs. Microscopic, but they still pack a punch.'),
  weapon(1, 'parachute', 'The Leaf Parachute 🍃 Jump off something, then press Fire: you float down safely and can steer. Falls hurt, leaves don’t.'),
  weapon(1, 'girder', 'The Twig Girder 🪵 Build a little bridge to cross a gap, or a wall to hide behind. ▲▼ turns it.'),
  weapon(1, 'gale', 'The Gale Gourd 🌬️ Small damage, big push: it blows tardigrades a long way… ideally into the water. A season weapon, unlocked with Slime you earn by playing.'),
  weapon(1, 'drill', 'The Earthworm Drill 🪱 It burrows into the ground before it blows up: perfect for tardigrades hiding under cover. A season weapon, unlocked with Slime you earn by playing.'),
  weapon(1, 'leech', 'The Leech Lobber 💚 It blows up where it hits and heals you by half the damage it does. A season weapon, unlocked with Slime you earn by playing.'),
  weapon(2, 'megaspore', 'The Mega Spore 🍄 Slow, with a huge blast. The wind pushes it a lot, so it’s a real test of aim. A season weapon, unlocked with Slime you earn by playing.'),
  weapon(2, 'balloon', 'The Water Balloon 🎈 A wide splash for a little damage. The wind pushes it a lot. A season weapon, unlocked with Slime you earn by playing.'),
  weapon(2, 'gloop', 'The Gloop Bomb 🟣 It sticks where it lands, then blows up 3 seconds later. No bouncing away! A season weapon, unlocked with Slime you earn by playing.'),
  weapon(2, 'swarm', 'The Spore Swarm 🫧 Bounces, then bursts into eight little bomblets. A season weapon, unlocked with Slime you earn by playing.'),
  weapon(2, 'pinball', 'The Pollen Pinball 🟡 Very bouncy: it pings off the walls until its fuse runs out. Where will it end up? Nobody knows. A season weapon, unlocked with Slime you earn by playing.'),

  // ── Tips (one a week) ───────────────────────────────────────────────────
  {
    id: 'tip-wind', batch: 1, category: 'Tips',
    title: 'Check the wind', text: 'It pushes the Spore Bazooka and strikes from the sky, but never grenades or bombs.',
    art: { shot: 'shot-aim.webp' },
    message: 'Tip 💨 Check the wind before you fire. It pushes the Spore Bazooka and anything that falls from the sky, but it leaves grenades and bombs alone.',
    tags: ['gamingtips', 'indiegame'], alt: 'A tardigrade aiming a shot across the map, with the wind arrow at the top of the screen.',
  },
  {
    id: 'tip-fuse', batch: 1, category: 'Tips',
    title: 'Set the fuse', text: 'Grenades and bombs go off when their fuse runs out. Pick 1 to 5 seconds (keys 1–5).',
    art: { stat: '1–5 s' },
    message: 'Tip 💣 Grenades and bombs bounce, then go off when the fuse runs out. Set it from 1 to 5 seconds (keys 1–5 on a keyboard). Short fuse for a direct throw, long fuse to bounce it in.',
    tags: ['gamingtips', 'indiegame'], alt: 'The words 1 to 5 seconds in big yellow letters, with a tardigrade beside them.',
  },
  {
    id: 'tip-dots', batch: 1, category: 'Tips',
    title: 'Follow the dots', text: 'The yellow dots show where your shot starts to fly. Hold Fire to charge, let go to throw.',
    art: { shot: 'shot-aim.webp' },
    message: 'Tip 🎯 The yellow dots show where your shot starts to fly. Hold Fire to charge it, let go to throw. A little power goes a long way!',
    tags: ['gamingtips', 'indiegame'], alt: 'A tardigrade aiming, with yellow dots showing the start of the shot’s path.',
  },
  {
    id: 'tip-upwind', batch: 1, category: 'Tips',
    title: 'Aim upwind', text: 'Strikes from the sky land on your spot with no wind, and drift when there is some.',
    art: { shot: 'shot-crater.webp' },
    message: 'Tip 🌧️ Strikes from the sky land right on your spot when there’s no wind, and drift when there is. Pick a spot a little upwind of your target.',
    tags: ['gamingtips', 'indiegame'], alt: 'A big crater blasted into the map.',
  },
  {
    id: 'tip-mines', batch: 1, category: 'Tips',
    title: 'Mind the mines', text: 'Mines arm when a tardigrade comes close, then go off a few seconds later. Some are duds!',
    art: { tardis: [{ color: BLUE, hat: 'hardhat' }] },
    message: 'Tip 💥 Mines arm when a tardigrade comes close and go off a few seconds later. Some are duds… but would you bet on it? Knock your rivals into them instead.',
    tags: ['gamingtips', 'indiegame'], alt: 'A tardigrade in a hard hat, looking careful.',
  },
  {
    id: 'tip-crates', batch: 1, category: 'Tips',
    title: 'Grab the crates', text: 'Weapon crates give you ammo. Health crates heal you and cure poison.',
    art: { tardis: [{ color: GREEN, hat: 'propeller' }] },
    message: 'Tip 📦 Crates float down on parachutes. Walk into one: weapon crates give you ammo, health crates heal you and cure poison.',
    tags: ['gamingtips', 'indiegame'], alt: 'A tardigrade in a propeller cap.',
  },
  {
    id: 'tip-phone', batch: 1, category: 'Tips',
    title: 'Playing on a phone?', text: 'Drag from your tardigrade to aim. Settings can make the buttons bigger, or set Tap to fire.',
    art: { shot: 'shot-phone.webp' },
    message: 'Tip 📱 On a phone or tablet, drag from your tardigrade to aim and drag the map to look around. In Settings you can make the buttons bigger, swap sides, or choose Tap to fire.',
    tags: ['mobilegames', 'browsergame'], alt: 'TardiGeddon on a phone, with the on-screen buttons.',
  },
  {
    id: 'tip-rope', batch: 1, category: 'Tips',
    title: 'Swing like a pro', text: 'Fire the Silk Rope at the rock, climb with ▲▼, and let go with Jump at the top of the swing.',
    art: { shot: 'clip-rope-poster.webp' },
    message: 'Tip 🕸️ Silk Rope: fire it at the rock, climb with ▲▼, and let go with Jump at the top of your swing to fly furthest. Practise in a Rope Race!',
    tags: ['gamingtips', 'indiegame'], alt: 'A tardigrade swinging across the map on a silk rope.',
  },
  {
    id: 'tip-practice', batch: 1, category: 'Tips',
    title: 'Practise first', text: 'New? The tutorial teaches the basics, and Practice gives you targets with unlimited ammo.',
    art: { shot: 'shot-home.webp' },
    message: 'Tip 🎓 New to TardiGeddon? Press “New? Learn to play” in the lobby for a short tutorial, then try Practice: targets to hit with unlimited ammo.',
    tags: ['gamingtips', 'browsergame'], alt: 'The game’s lobby with Learn to play and Practice buttons.',
  },
  {
    id: 'tip-poison', batch: 1, category: 'Tips',
    title: 'Poisoned?', text: 'Poison takes a little health every turn, but never finishes a tardigrade on its own. A health crate cures it.',
    art: { tardis: [{ color: PURPLE, hat: 'wizard', skin: 'toxic' }] },
    message: 'Tip ☠️ Poison takes a little health every turn, but it never finishes a tardigrade off on its own. Grab a health crate to cure it.',
    tags: ['gamingtips', 'indiegame'], alt: 'A green, slightly poisoned tardigrade in a wizard hat.',
  },
  {
    id: 'tip-replays', batch: 1, category: 'Tips',
    title: 'Watch it again', text: 'Every match is kept in 🎬 Replays, and the results screen can replay the winning shot.',
    art: { tardis: [{ color: GOLD, hat: 'headphones' }] },
    message: 'Tip 🎬 Every match is kept in Replays, and the results screen can play the winning shot again. Perfect for that once-in-a-lifetime throw.',
    tags: ['gamingtips', 'indiegame'], alt: 'A tardigrade wearing headphones.',
  },
  {
    id: 'tip-controls', batch: 1, category: 'Tips',
    title: 'Your keys, your way', text: 'Change any key or mouse button in Settings → Controls. Signed in, they follow you to any device.',
    art: { tardis: [{ color: BLUE, hat: 'grad' }] },
    message: 'Tip ⌨️ Every key and mouse button can be changed in Settings → Controls. Sign in and your controls follow you to any device.',
    tags: ['gamingtips', 'pcgaming'], alt: 'A tardigrade in a graduation cap.',
  },
  {
    id: 'tip-drums', batch: 2, category: 'Tips',
    title: 'Brine drums go bang', text: 'Hit a brine drum hard and it bursts: a big bang and a spray of salty blobs.',
    art: { tardis: [{ color: RED, hat: 'pirate' }] },
    message: 'Tip 🛢️ Brine drums burst when they’re hit hard: a big bang and a spray of salty blobs. Is a rival standing next to one? You know what to do.',
    tags: ['gamingtips', 'indiegame'], alt: 'A tardigrade in a pirate hat.',
  },
  {
    id: 'tip-teleport', batch: 2, category: 'Tips',
    title: 'Teleport ends your go', text: 'Use it to escape a tight spot, or to line up the perfect shot for next turn.',
    art: { weapon: 'teleport' },
    message: 'Tip ✨ The Teleport ends your go. Use it to escape a tight spot, or to get to the perfect place for next turn’s shot.',
    tags: ['gamingtips', 'indiegame'], alt: 'The Teleport’s sparkle icon next to a tardigrade.',
  },

  // ── Tardigrade facts (one a week) ───────────────────────────────────────
  {
    id: 'fact-water-bears', batch: 1, category: 'Tardigrade facts',
    title: 'Water bears', text: 'Tardigrades are nicknamed water bears (and moss piglets) for the way they lumber about on eight stubby legs.',
    art: { stat: '8 legs' },
    message: 'Tardigrade fact 🐻 Tardigrades are nicknamed “water bears” (and “moss piglets”) for the way they lumber about on eight stubby, clawed legs. Ours carry bazookas.',
    tags: ['tardigrade', 'sciencefacts'], alt: 'The words 8 legs in big letters next to a cartoon tardigrade.',
  },
  {
    id: 'fact-size', batch: 1, category: 'Tardigrade facts',
    title: 'Tiny', text: 'Most tardigrades are about half a millimetre long: you can just about see one with the naked eye.',
    art: { stat: '0.5 mm' },
    message: 'Tardigrade fact 🔬 Most tardigrades are about half a millimetre long. Tiny. Indestructible. (In our game, also armed.)',
    tags: ['tardigrade', 'sciencefacts'], alt: 'The words 0.5 millimetres in big letters next to a cartoon tardigrade.',
  },
  {
    id: 'fact-tun', batch: 1, category: 'Tardigrade facts',
    title: 'The tun', text: 'When they dry out, tardigrades curl up into a “tun” and almost stop living, until water brings them back.',
    art: { weapon: 'tun' },
    message: 'Tardigrade fact 💧 When their home dries out, tardigrades curl into a little barrel called a “tun” and almost stop living. Add water and they wake up. (Hence our Concrete Tun.)',
    tags: ['tardigrade', 'sciencefacts'], alt: 'The Concrete Tun superweapon icon next to a tardigrade.',
  },
  {
    id: 'fact-space', batch: 1, category: 'Tardigrade facts',
    title: 'Space travellers', text: 'In 2007, dried-out tardigrades rode outside a spacecraft in orbit, and some survived.',
    art: { tardis: [{ color: BLUE, hat: 'astronaut' }] },
    message: 'Tardigrade fact 🚀 In 2007, dried-out tardigrades spent days in open space, outside a spacecraft in orbit. When they got back to Earth, some of them came back to life.',
    tags: ['tardigrade', 'space'], alt: 'A cartoon tardigrade in an astronaut helmet.',
  },
  {
    id: 'fact-1773', batch: 1, category: 'Tardigrade facts',
    title: 'Since 1773', text: 'A German pastor first described them in 1773 and called them “little water bears”.',
    art: { stat: '1773' },
    message: 'Tardigrade fact 📜 Tardigrades were first described in 1773 by Johann Goeze, a German pastor, who called them “kleiner Wasserbär”: little water bear. The name stuck.',
    tags: ['tardigrade', 'sciencefacts'], alt: 'The year 1773 in big letters next to a cartoon tardigrade.',
  },
  {
    id: 'fact-slow-stepper', batch: 1, category: 'Tardigrade facts',
    title: 'Slow steppers', text: '“Tardigrade” means “slow stepper”, from the Latin. They’re not quick. Our tardis aren’t either.',
    art: { tardis: [{ color: GREEN, hat: 'sprout' }] },
    message: 'Tardigrade fact 🐢 “Tardigrade” means “slow stepper”, a name given in 1777 by the Italian scientist Lazzaro Spallanzani. Which is why in our game, it’s turn-based.',
    tags: ['tardigrade', 'sciencefacts'], alt: 'A cartoon tardigrade with a little sprout on its head.',
  },
  {
    id: 'fact-everywhere', batch: 1, category: 'Tardigrade facts',
    title: 'Everywhere', text: 'From mountain tops to the deep sea and Antarctica, and quite possibly the moss in your garden.',
    art: { shot: 'shot-realm-mainland.webp' },
    message: 'Tardigrade fact 🌍 Tardigrades live almost everywhere: on mountains, in the deep sea, in Antarctica, and quite possibly in the moss on your garden wall.',
    tags: ['tardigrade', 'nature'], alt: 'Rolling green hills in TardiGeddon’s Mainland map.',
  },
  {
    id: 'fact-30-years', batch: 1, category: 'Tardigrade facts',
    title: '30 years on ice', text: 'Tardigrades from a frozen Antarctic moss sample were brought back to life after more than 30 years.',
    art: { stat: '30 years' },
    message: 'Tardigrade fact ❄️ Japanese scientists revived tardigrades from a sample of Antarctic moss that had been frozen for over 30 years. One of them went on to lay eggs.',
    tags: ['tardigrade', 'sciencefacts'], alt: 'The words 30 years in big letters next to a cartoon tardigrade.',
  },
  {
    id: 'fact-species', batch: 1, category: 'Tardigrade facts',
    title: '1,300+ kinds', text: 'Scientists have described well over a thousand species of tardigrade, and they keep finding more.',
    art: { tardis: [{ color: RED, hat: 'beanie' }, { color: BLUE, hat: 'tophat' }, { color: GREEN, hat: 'crown' }] },
    message: 'Tardigrade fact 🧬 Scientists have described more than 1,300 species of tardigrade, and they keep finding new ones. We’ve only made one, but it has 50 hats.',
    tags: ['tardigrade', 'sciencefacts'], alt: 'Three cartoon tardigrades in a beanie, a top hat and a crown.',
  },
  {
    id: 'fact-dsup', batch: 1, category: 'Tardigrade facts',
    title: 'Built-in shield', text: 'One tardigrade makes a protein called Dsup that helps shield its DNA from radiation.',
    art: { tardis: [{ color: GOLD, hat: 'knight' }] },
    message: 'Tardigrade fact 🛡️ One kind of tardigrade makes a protein, named Dsup, that helps protect its DNA from radiation. Scientists are still working out how.',
    tags: ['tardigrade', 'science'], alt: 'A cartoon tardigrade in a knight’s helmet.',
  },
  {
    id: 'fact-moon', batch: 1, category: 'Tardigrade facts',
    title: 'Moon landing', text: 'In 2019 a lunar lander carrying dried tardigrades crash-landed on the Moon. They may still be there.',
    art: { tardis: [{ color: PURPLE, hat: 'antennae' }] },
    message: 'Tardigrade fact 🌕 In 2019, a spacecraft carrying dried-out tardigrades crash-landed on the Moon. Scientists think they probably didn’t survive the crash… but they’re still up there.',
    tags: ['tardigrade', 'space'], alt: 'A cartoon tardigrade with alien antennae.',
  },
  {
    id: 'fact-pressure', batch: 1, category: 'Tardigrade facts',
    title: 'Under pressure', text: 'Dried tardigrades have survived pressure about six times that of the deepest ocean.',
    art: { stat: '6×' },
    message: 'Tardigrade fact 🌊 In the lab, dried-out tardigrades have survived pressures about six times greater than at the bottom of the deepest ocean.',
    tags: ['tardigrade', 'sciencefacts'], alt: 'Six times in big letters next to a cartoon tardigrade.',
  },
  {
    id: 'fact-food', batch: 2, category: 'Tardigrade facts',
    title: 'Snack time', text: 'Tardigrades pierce plant cells with tiny needle-like teeth and suck out the insides. Some eat other tiny animals.',
    art: { tardis: [{ color: GREEN, hat: 'chef' }] },
    message: 'Tardigrade fact 🥬 Most tardigrades eat by piercing moss and algae cells with tiny needle-like “stylets” and sucking out the insides. Some hunt other tiny animals.',
    tags: ['tardigrade', 'nature'], alt: 'A cartoon tardigrade in a chef’s hat.',
  },
  {
    id: 'fact-moult', batch: 2, category: 'Tardigrade facts',
    title: 'New clothes', text: 'Tardigrades moult as they grow, and some lay their eggs inside the skin they’ve shed.',
    art: { tardis: [{ color: PINK, hat: 'eggshell' }] },
    message: 'Tardigrade fact 🥚 Tardigrades shed their skin as they grow, and some lay their eggs inside the old skin they’ve just stepped out of.',
    tags: ['tardigrade', 'nature'], alt: 'A cartoon tardigrade wearing an eggshell.',
  },

  // ── Worlds and modes (one a week) ───────────────────────────────────────
  {
    id: 'world-islands', batch: 1, category: 'Worlds and modes',
    title: 'Twin Isles', text: 'The classic: a couple of big islands over the water.',
    art: { shot: 'shot-realm-islands.webp' },
    message: 'Map style: Twin Isles 🏝️ The classic. Two big islands, a lot of water, and every match a brand-new map.',
    tags: ['indiegame', 'browsergame'], alt: 'Two big grassy islands over the water.',
  },
  {
    id: 'world-sky', batch: 1, category: 'Worlds and modes',
    title: 'Sky Realms', text: 'Realms on realms: floating islands stacked over a low shore.',
    art: { shot: 'shot-realm-sky.webp' },
    message: 'Map style: Sky Realms ☁️ Floating islands stacked over a low shore. Bring a Leaf Parachute.',
    tags: ['indiegame', 'browsergame'], alt: 'Floating islands stacked above a low shore.',
  },
  {
    id: 'mode-online', batch: 1, category: 'Worlds and modes',
    title: 'Play online', text: 'Quick play finds you a match, or make a room and send friends its 5-letter code.',
    art: { shot: 'shot-online.webp' },
    message: 'Play online 🌐 Quick play finds you a match with other players, or make a room and send your friends its 5-letter code. You can watch a room without playing, too.',
    tags: ['multiplayer', 'browsergame'], alt: 'The online lobby with Quick play and a room code.',
  },
  {
    id: 'world-caverns', batch: 1, category: 'Worlds and modes',
    title: 'Caverns', text: 'A great hollow hill, riddled with tunnels.',
    art: { shot: 'shot-realm-caverns.webp' },
    message: 'Map style: Caverns 🕳️ A great hollow hill riddled with tunnels. Bouncy grenades love it. Your tardigrades might not.',
    tags: ['indiegame', 'browsergame'], alt: 'A hollow hill full of tunnels.',
  },
  {
    id: 'mode-challenge', batch: 1, category: 'Worlds and modes',
    title: 'Daily challenge', text: 'Target Smash and Rope Race: the same map for everyone each day, with leaderboards.',
    art: { shot: 'shot-challenge.webp' },
    message: 'Daily challenge 🏆 Every day: Target Smash and Rope Race, on the same map for everyone, with leaderboards. How high can you get today?',
    tags: ['dailychallenge', 'browsergame'], alt: 'The daily challenge screen with its leaderboard.',
  },
  {
    id: 'world-canyon', batch: 1, category: 'Worlds and modes',
    title: 'Canyon', text: 'High cliffs either side of a deep valley, with a bridge of rock.',
    art: { shot: 'shot-realm-canyon.webp' },
    message: 'Map style: Canyon 🏜️ High cliffs either side of a deep valley, with a bridge of rock in between. Who’s brave enough to cross it?',
    tags: ['indiegame', 'browsergame'], alt: 'High cliffs either side of a deep valley.',
  },
  {
    id: 'mode-hotseat', batch: 1, category: 'Worlds and modes',
    title: 'Up to 10 teams', text: 'Hot-seat: up to 10 teams taking turns on one device. Pass the phone!',
    art: { tardis: [{ color: RED, hat: 'party' }, { color: BLUE, hat: 'cowboy' }, { color: GREEN, hat: 'viking' }, { color: GOLD, hat: 'crown' }] },
    message: 'Hot-seat 🛋️ Up to 10 teams taking turns on one computer, phone or tablet. Perfect for the sofa. Less perfect for friendships.',
    tags: ['couchcoop', 'partygames'], alt: 'Four tardigrades in a party hat, a cowboy hat, a viking helmet and a crown.',
  },
  {
    id: 'world-spires', batch: 1, category: 'Worlds and modes',
    title: 'Spires', text: 'Tall rock towers rising from the sea.',
    art: { shot: 'shot-realm-spires.webp' },
    message: 'Map style: Spires 🗼 Tall rock towers rising out of the sea. One good push and it’s a long way down.',
    tags: ['indiegame', 'browsergame'], alt: 'Tall rock towers rising out of the sea.',
  },
  {
    id: 'mode-styles', batch: 1, category: 'Worlds and modes',
    title: 'Game styles', text: 'Standard, Quick, Pro, Chaos, Armoured, Artillery, Rope Race… or make your own.',
    art: { shot: 'shot-lobby.webp' },
    message: 'Game styles 🎛️ Standard, Quick, Pro, Chaos (a superweapon each!), Armoured, Artillery, Bazookas & Grenades and Rope Race. Or make your own rules in Customise.',
    tags: ['indiegame', 'strategygame'], alt: 'The match setup screen with the game styles.',
  },
  {
    id: 'world-archipelago', batch: 1, category: 'Worlds and modes',
    title: 'Archipelago', text: 'Lots of little islands. Mind the gaps.',
    art: { shot: 'shot-realm-archipelago.webp' },
    message: 'Map style: Archipelago 🏝️🏝️🏝️ Lots of little islands. Mind the gaps.',
    tags: ['indiegame', 'browsergame'], alt: 'Lots of small islands dotted over the water.',
  },
  {
    id: 'mode-cpu', batch: 1, category: 'Worlds and modes',
    title: 'Beat the computer', text: 'Five levels, from Super easy to Expert. Tougher ones read the wind better and miss less.',
    art: { stat: '5 levels' },
    message: 'Against the computer 🤖 Five levels, from Super easy to Expert. The tougher ones read the wind better and miss less. Have you beaten Expert yet?',
    tags: ['indiegame', 'singleplayer'], alt: 'The words 5 levels in big letters next to a tardigrade.',
  },
  {
    id: 'world-mainland', batch: 1, category: 'Worlds and modes',
    title: 'Mainland', text: 'One long stretch of rolling hills, with caves to hide in.',
    art: { shot: 'shot-realm-mainland.webp' },
    message: 'Map style: Mainland ⛰️ One long stretch of rolling hills, with caves to hide in. A good one for long throws.',
    tags: ['indiegame', 'browsergame'], alt: 'A long stretch of rolling green hills.',
  },
  {
    id: 'mode-editor', batch: 2, category: 'Worlds and modes',
    title: 'Map editor', text: 'Draw your own map, play on it, and share it with friends as a file.',
    art: { tardis: [{ color: PINK, hat: 'beret' }] },
    message: 'Map editor 🎨 Draw your own map, play on it, and share it with friends as a file. Show us what you make!',
    tags: ['indiegame', 'leveldesign'], alt: 'A tardigrade in an artist’s beret.',
  },
  {
    id: 'mode-weather', batch: 2, category: 'Worlds and modes',
    title: 'Weather', text: 'Rain, snow, sunshine, fog and storms are just for looks… except the very rare tornado.',
    art: { tardis: [{ color: BLUE, hat: 'bucket' }] },
    message: 'Weather ⛈️ Rain, snow, sunshine, fog and storms are just for looks: they never move your shots. Except the very rare tornado, which picks every tardigrade up and drops them somewhere new.',
    tags: ['indiegame', 'gamedev'], alt: 'A tardigrade in a bucket hat, ready for rain.',
  },

  // ── Community (one a week): questions that start a conversation ─────────
  {
    id: 'ask-favourite-weapon', batch: 1, category: 'Community',
    title: 'Your favourite?', text: 'Which weapon do you reach for first?',
    art: { shot: 'shot-weapons.webp' },
    message: 'Question time 🤔 Which weapon do you reach for first? Tell us in the comments!',
    tags: ['indiegame', 'gaming'], alt: 'The weapon panel, full of weapons.',
  },
  {
    id: 'ask-name-tardi', batch: 1, category: 'Community',
    title: 'Name this tardi', text: 'What should we call this one?',
    art: { tardis: [{ color: GOLD, hat: 'cowboy', skin: 'moss' }] },
    message: 'This tardigrade needs a name 🤠 Best one in the comments wins our undying respect.',
    tags: ['indiegame', 'tardigrade'], alt: 'A mossy green tardigrade in a cowboy hat.',
  },
  {
    id: 'ask-superweapon', batch: 1, category: 'Community',
    title: 'Superweapon showdown', text: 'Concrete Tun, Holy Water Droplet or Microscope Slide Slam?',
    art: { question: '🗿 💦 🔬' },
    message: 'Superweapon showdown 💥 Concrete Tun 🗿, Holy Water Droplet 💦 or Microscope Slide Slam 🔬? Pick one in the comments.',
    tags: ['indiegame', 'gaming'], alt: 'The icons of the three superweapons.',
  },
  {
    id: 'ask-own-goal', batch: 1, category: 'Community',
    title: 'Own goals', text: 'What’s the worst own goal you’ve ever scored?',
    art: { tardis: [{ color: RED, hat: 'cone' }] },
    message: 'Confession time 😅 What’s the worst own goal you’ve ever scored in TardiGeddon? Ours involved a Pebble Grenade, a wall, and a 5-second fuse.',
    tags: ['indiegame', 'gaming'], alt: 'A tardigrade wearing a traffic cone.',
  },
  {
    id: 'ask-map', batch: 1, category: 'Community',
    title: 'Pick a map', text: 'Twin Isles, Mainland, Archipelago, Sky Realms, Caverns, Canyon or Spires?',
    art: { shot: 'shot-realm-canyon.webp' },
    message: 'Which map style is your favourite? 🗺️ Twin Isles, Mainland, Archipelago, Sky Realms, Caverns, Canyon or Spires?',
    tags: ['indiegame', 'gaming'], alt: 'The Canyon map: cliffs either side of a valley.',
  },
  {
    id: 'ask-next-world', batch: 1, category: 'Community',
    title: 'What next?', text: 'What kind of world should we build next?',
    art: { question: '🌋 ❄️ 🌌' },
    message: 'We’re thinking about new worlds 🌍 Volcano? Ice? Outer space? Somewhere else? Tell us what you’d like to fight on next.',
    tags: ['indiegame', 'gamedev'], alt: 'A volcano, a snowflake and a galaxy.',
  },
  {
    id: 'ask-bazooka-grenade', batch: 1, category: 'Community',
    title: 'Which are you?', text: 'Team Bazooka 🚀 or Team Grenade 💣?',
    art: { question: '🚀 or 💣' },
    message: 'Settle this once and for all 🚀💣 Are you Team Bazooka or Team Grenade?',
    tags: ['indiegame', 'gaming'], alt: 'A rocket and a bomb.',
  },
  {
    id: 'ask-hat', batch: 1, category: 'Community',
    title: 'Hat ideas', text: 'Over 50 hats so far. What should the next one be?',
    art: { tardis: [{ color: RED, hat: 'jester' }, { color: BLUE, hat: 'sombrero' }, { color: GREEN, hat: 'frog' }] },
    message: 'Our tardigrades have over 50 hats 🎩 What should the next one be? The best ideas might just end up in the game.',
    tags: ['indiegame', 'gamedev'], alt: 'Three tardigrades in a jester hat, a sombrero and a frog hat.',
  },
  {
    id: 'ask-team-name', batch: 1, category: 'Community',
    title: 'Team names', text: 'What do you call your team?',
    art: { tardis: [{ color: PURPLE, hat: 'ninja' }, { color: PURPLE, hat: 'ninja' }] },
    message: 'What do you call your team? 🏷️ We’ve seen “The Moss Bosses” and “Tun Squad”. Beat that!',
    tags: ['indiegame', 'gaming'], alt: 'Two tardigrades in ninja masks.',
  },
  {
    id: 'ask-fan-art', batch: 1, category: 'Community',
    title: 'Draw a tardi', text: 'Show us your tardigrade drawings!',
    art: { tardis: [{ color: PINK, hat: 'beret' }] },
    message: 'Calling all artists 🎨 Draw a tardigrade (in a hat, ideally) and share it with us. We’d love to see them.',
    tags: ['fanart', 'tardigrade'], alt: 'A tardigrade in an artist’s beret.',
  },
  {
    id: 'ask-cpu', batch: 1, category: 'Community',
    title: 'Too good?', text: 'Which computer level do you play against?',
    art: { stat: 'Expert?' },
    message: 'Which computer level do you play against? 🤖 Super easy, Easy, Normal, Hard, or are you brave enough for Expert?',
    tags: ['indiegame', 'gaming'], alt: 'The word Expert with a question mark.',
  },
  {
    id: 'ask-rope-time', batch: 1, category: 'Community',
    title: 'Rope Race', text: 'What’s your best Rope Race time?',
    art: { shot: 'clip-rope-poster.webp' },
    message: 'Rope Race 🕸️⏱️ What’s your best time? Today’s daily challenge has a leaderboard: show us where you are on it.',
    tags: ['indiegame', 'speedrun'], alt: 'A tardigrade swinging on a silk rope.',
  },
  {
    id: 'ask-caption', batch: 2, category: 'Community',
    title: 'Caption this', text: 'What just happened here?',
    art: { shot: 'shot-crater.webp' },
    message: 'Caption this 💥 What just happened here? Best caption in the comments!',
    tags: ['indiegame', 'gaming'], alt: 'A huge crater blasted into the map.',
  },

  // ── Play (one a week): reasons to play now ──────────────────────────────
  {
    id: 'play-teaser', batch: 1, category: 'Videos',
    title: 'Tiny. Indestructible. Armed.', text: 'Free turn-based artillery, starring tardigrades.',
    art: { shot: 'clip-tun-poster.webp' },
    video: { url: 'https://tardigeddon.com/social/teaser.mp4', youtubeTitle: 'TardiGeddon: tiny, indestructible, armed #shorts' },
    message: 'Tiny. Indestructible. Armed. 🐻💥 TardiGeddon is a free turn-based artillery game starring tardigrades.',
    tags: ['indiegame', 'browsergame'], alt: 'Gameplay: a tardigrade swings on a rope, a Concrete Tun falls, a team wins.',
  },
  {
    id: 'play-free', batch: 1, category: 'Play',
    title: 'Free and fair', text: 'No ads. No download. Nothing to buy that helps you win: money only buys looks.',
    art: { tardis: [{ color: GREEN, hat: 'halo' }] },
    message: 'Free and fair 💚 No ads, nothing to download, and nothing to buy that helps you win. Money only buys looks; weapons unlock with Slime you earn by playing.',
    tags: ['indiegame', 'freetoplay'], alt: 'A tardigrade with a halo.',
  },
  {
    id: 'play-rope-clip', batch: 1, category: 'Videos',
    title: 'Swing!', text: 'The Silk Rope in action.',
    art: { shot: 'clip-rope-poster.webp' },
    video: { url: 'https://tardigeddon.com/media/clip-rope.mp4', youtubeTitle: 'Swinging across the map with the Silk Rope | TardiGeddon' },
    message: 'Swing across the map with the Silk Rope 🕸️ Then drop something heavy on someone.',
    tags: ['indiegame', 'gameplay'], alt: 'A tardigrade swinging across the map on a silk rope.',
  },
  {
    id: 'play-hats', batch: 1, category: 'Play',
    title: '50+ hats', text: 'Top hats, crowns, Viking helmets, frogs… dress your team your way.',
    art: { tardis: [{ color: RED, hat: 'tophat' }, { color: BLUE, hat: 'viking' }, { color: GREEN, hat: 'unicorn' }, { color: GOLD, hat: 'chick' }] },
    message: 'Over 50 hats 🎩👑 Dress your team your way: top hats, crowns, Viking helmets, unicorns, and one that’s just a chick.',
    tags: ['indiegame', 'cute'], alt: 'Four tardigrades in a top hat, a Viking helmet, a unicorn horn and a chick hat.',
  },
  {
    id: 'play-browser', batch: 1, category: 'Play',
    title: 'Play anywhere', text: 'In any modern browser on a computer, phone or tablet. Nothing to install.',
    art: { shot: 'shot-quickplay.webp' },
    message: 'No download, no account needed 🌐 TardiGeddon plays in any modern browser on a computer, phone or tablet. Open it and play in seconds.',
    tags: ['browsergame', 'indiegame'], alt: 'A TardiGeddon match in progress.',
  },
  {
    id: 'play-tun-clip', batch: 1, category: 'Videos',
    title: 'Incoming!', text: 'The Concrete Tun.',
    art: { shot: 'clip-tun-poster.webp' },
    video: { url: 'https://tardigeddon.com/media/clip-tun.mp4', youtubeTitle: 'Dropping a Concrete Tun | TardiGeddon' },
    message: 'Incoming! 🗿 The Concrete Tun smashes down through the rock. Nowhere is safe.',
    tags: ['indiegame', 'gameplay'], alt: 'A giant concrete tun falling on the map.',
  },
  {
    id: 'play-emblem', batch: 1, category: 'Play',
    title: 'Your emblem', text: 'Design your team’s own emblem: shapes, colours, the lot.',
    art: { shot: 'shot-emblem.webp' },
    message: 'Make it yours 🛡️ Design your team’s own emblem and pick their hats, skins and graves. Your team, your style.',
    tags: ['indiegame', 'gamedev'], alt: 'The emblem builder.',
  },
  {
    id: 'play-friends', batch: 1, category: 'Play',
    title: 'Bring a friend', text: 'Share your invite code: you both get free coins when they join.',
    art: { tardis: [{ color: RED, hat: 'party' }, { color: BLUE, hat: 'party' }] },
    message: 'Better with friends 🎉 Share your invite code from your account page: when a friend joins with it, you both get free coins for looks.',
    tags: ['multiplayer', 'indiegame'], alt: 'Two tardigrades in party hats.',
  },
  {
    id: 'play-victory-clip', batch: 1, category: 'Videos',
    title: 'Last tardi standing', text: 'Victory!',
    art: { shot: 'clip-victory-poster.webp' },
    video: { url: 'https://tardigeddon.com/media/clip-victory.mp4', youtubeTitle: 'Last tardigrade standing wins | TardiGeddon' },
    message: 'Last tardi standing wins 🏆 Will it be yours?',
    tags: ['indiegame', 'gameplay'], alt: 'The winning team celebrating.',
  },
  {
    id: 'play-languages', batch: 1, category: 'Play',
    title: 'Six languages', text: 'English, Español, Português, Deutsch, Français and 日本語.',
    art: { stat: '6' },
    message: 'TardiGeddon speaks six languages 🌍 English, Español, Português, Deutsch, Français and 日本語. Tell your friends abroad!',
    tags: ['indiegame', 'browsergame'], alt: 'The number 6 next to a tardigrade.',
  },
  {
    id: 'play-access', batch: 1, category: 'Play',
    title: 'Play your way', text: 'Bigger text, dark mode, captions for sounds, and controls you can change.',
    art: { tardis: [{ color: BLUE, hat: 'headphones' }] },
    message: 'Play your way ♿ Bigger text, dark mode, captions for the sounds, bigger touch buttons, and every key changeable. Find them all in Settings.',
    tags: ['accessiblegaming', 'indiegame'], alt: 'A tardigrade wearing headphones.',
  },
  {
    id: 'play-promo', batch: 1, category: 'Play',
    title: 'Free hat', text: 'Sign in, open the Shop’s 🎀 Gifts tab and type WATERBEAR for the Water bear hat.',
    art: { tardis: [{ color: RED, hat: 'waterbear' }] },
    message: 'A free hat 🐻 Sign in, open the Shop’s 🎀 Gifts tab and type WATERBEAR for the Water bear hat. All the codes: tardigeddon.com/promo-codes',
    tags: ['freebies', 'indiegame'], alt: 'A tardigrade in the Water bear hat.',
  },

  {
    id: 'play-quick', batch: 1, category: 'Play',
    title: 'Got 5 minutes?', text: 'The Quick style: short turns, less health, and sudden death after 5 minutes.',
    art: { tardis: [{ color: BLUE, hat: 'propeller' }] },
    message: 'Got five minutes? ⏱️ Pick the Quick style: short turns, less health, and sudden death after 5 minutes. Made for the bus, the queue, or the advert break.',
    tags: ['mobilegames', 'browsergame'], alt: 'A tardigrade in a propeller cap.',
  },
  {
    id: 'play-chaos', batch: 1, category: 'Play',
    title: 'Chaos', text: 'Mines everywhere, drums galore, a crate every turn and a superweapon each.',
    art: { tardis: [{ color: RED, hat: 'jester' }, { color: GOLD, hat: 'flame' }] },
    message: 'Feeling brave? 🤪 The Chaos style: mines everywhere, drums galore, a crate every turn, and a superweapon for everyone. Nobody is safe. Nobody.',
    tags: ['indiegame', 'partygames'], alt: 'Two tardigrades in a jester hat and a flame hat.',
  },
  {
    id: 'play-rope-race', batch: 1, category: 'Play',
    title: 'Rope Race', text: 'No fighting: swing from the start to the flag, dodging mines. Fastest time wins.',
    art: { shot: 'clip-rope-poster.webp' },
    message: 'Not in a fighting mood? 🕸️🏁 Try Rope Race: swing on the Silk Rope from the start to the flag, dodging the mines. Fastest time wins.',
    tags: ['indiegame', 'speedrun'], alt: 'A tardigrade swinging on a silk rope.',
  },
  {
    id: 'play-armoured', batch: 1, category: 'Play',
    title: 'Armoured', text: 'Armour plates take every hit until they crack. Long, tough battles.',
    art: { tardis: [{ color: GOLD, hat: 'knight' }, { color: BLUE, hat: 'knight' }] },
    message: 'Fancy a long one? 🛡️ In the Armoured style, every tardigrade wears armour plates that take every hit until they crack. Only then does health go down.',
    tags: ['indiegame', 'strategygame'], alt: 'Two tardigrades in knights’ helmets.',
  },

  // ── Dated posts (UK time) ───────────────────────────────────────────────
  {
    id: 'dated-founder-1', batch: 1, category: 'Play', date: '2026-11-14 11:00',
    title: 'Founder pack', text: 'Make a free account by 30 November for the Founder pack: a hat, a grave, a dance, a world and music.',
    art: { tardis: [{ color: GOLD, hat: 'founder' }] },
    message: 'Make a free TardiGeddon account by 30 November and get the Founder pack 👑 a hat, a grave, a victory dance, a golden world and its own music. Free, and it’s yours to keep.',
    tags: ['indiegame', 'freebies'], alt: 'A tardigrade in the Founder hat.',
  },
  {
    id: 'dated-founder-2', batch: 1, category: 'Play', date: '2026-11-28 11:00',
    title: 'Founder pack', text: 'The Founder pack is for accounts made by 30 November.',
    art: { tardis: [{ color: GOLD, hat: 'founder' }, { color: RED, hat: 'earlybird' }] },
    message: 'The free Founder pack 👑 is for accounts made by 30 November. Make yours at tardigeddon.com/play (Account page), and the first 1,000 players also get the Early bird pack 🐣',
    tags: ['indiegame', 'freebies'], alt: 'Two tardigrades in the Founder hat and the Early bird hat.',
  },
  {
    id: 'dated-launch', batch: 1, category: 'Play', date: '2026-12-01 10:00',
    title: 'We’re open!', text: 'TardiGeddon is out today: in your browser, and on Android, iPhone and iPad.',
    art: { tardis: [{ color: RED, hat: 'party' }, { color: BLUE, hat: 'crown' }, { color: GREEN, hat: 'tophat' }] },
    message: 'TardiGeddon is out today! 🎉🐻💥 A free turn-based artillery game starring tardigrades, in your browser and on Android, iPhone and iPad. Thank you to everyone who played along the way.',
    tags: ['indiegame', 'newgame'], alt: 'Three tardigrades celebrating in party hats and crowns.',
  },
  {
    id: 'dated-supporter-1', batch: 1, category: 'Play', date: '2026-12-05 11:00',
    title: 'Supporter packs', text: 'Back the game at launch: looks only, on sale until 31 January.',
    art: { tardis: [{ color: GOLD, hat: 'supporter', skin: 'sunshine' }] },
    message: 'Want to back TardiGeddon? 💛 The launch Supporter packs are looks only (a hat, a skin, a badge; the Patron pack adds a world, music and an aim). On sale until 31 January, then never again.',
    tags: ['indiegame', 'indiedev'], alt: 'A sunshine-yellow tardigrade in the Supporter heart cap.',
  },
  {
    id: 'dated-christmas', batch: 1, category: 'Play', date: '2026-12-25 10:00',
    title: 'Merry Christmas!', text: 'From all the tardigrades at TardiGeddon.',
    art: { tardis: [{ color: RED, hat: 'santa' }, { color: GREEN, hat: 'santa' }] },
    message: 'Merry Christmas from all the tardigrades 🎄 Hope your day is full of family, food and the occasional friendly Concrete Tun.',
    tags: ['merrychristmas', 'indiegame'], alt: 'Two tardigrades in Santa hats.',
  },
  {
    id: 'dated-new-year', batch: 1, category: 'Play', date: '2027-01-01 11:00',
    title: 'Happy New Year!', text: 'Thank you for a brilliant first month.',
    art: { tardis: [{ color: BLUE, hat: 'party' }, { color: GOLD, hat: 'party' }, { color: PINK, hat: 'party' }] },
    message: 'Happy New Year! 🎆 Thank you for a brilliant first month of TardiGeddon. New worlds, weapons and hats are on the way in 2027.',
    tags: ['happynewyear', 'indiegame'], alt: 'Three tardigrades in party hats.',
  },
  {
    id: 'dated-supporter-2', batch: 1, category: 'Play', date: '2027-01-24 16:00',
    title: 'Supporter packs', text: 'On sale until 31 January, then never again. Looks only.',
    art: { tardis: [{ color: GOLD, hat: 'supporter', skin: 'sunshine' }] },
    message: 'A reminder 💛 The launch Supporter packs are on sale until 31 January, and won’t be sold again after that. Looks only, never power. Thank you to everyone who has backed us!',
    tags: ['indiegame', 'indiedev'], alt: 'A sunshine-yellow tardigrade in the Supporter heart cap.',
  },
];
