// Sets up the TardiGeddon Discord server as docs/social/DISCORD.md describes:
// icon, roles, channels and their permissions, Community, AutoMod, emoji,
// onboarding, and the welcome / rules / FAQ messages (taken from the guide,
// so the guide stays the one place to change the text).
//
//   DISCORD_BOT_TOKEN=… DISCORD_GUILD_ID=… npx tsx scripts/discord-setup.ts
//   (DRY_RUN=1 to only print what it would do)
//
// The bot must be in the server with Administrator. Safe to run again: it
// reuses roles and channels with the same names and only posts a message into
// a channel that has none. What the API can't do is listed at the end.
// Behind a proxy (cloud sessions) run it with NODE_USE_ENV_PROXY=1.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.DISCORD_GUILD_ID;
const DRY = !!process.env.DRY_RUN;
if (!TOKEN || !GUILD) throw new Error('Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID');

// ---- Discord REST ----

const API = 'https://discord.com/api/v10';
type Json = Record<string, any>;

async function api(method: string, path: string, body?: unknown, reason = 'TardiGeddon setup'): Promise<any> {
  if (DRY && method !== 'GET') {
    console.log(`  [dry run] ${method} ${path}`);
    return { id: `dry-${path}`, ...(body as Json) };
  }
  for (;;) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bot ${TOKEN}`,
        'Content-Type': 'application/json',
        'X-Audit-Log-Reason': reason,
        'User-Agent': 'DiscordBot (https://tardigeddon.com, 1)',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = ((await res.json()) as Json).retry_after ?? 1;
      await new Promise((r) => setTimeout(r, wait * 1000 + 100));
      continue;
    }
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`);
    return data;
  }
}

/** Runs a step, and on failure notes it for the summary instead of stopping. */
const failed: string[] = [];
async function step<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`✗ ${name}: ${(e as Error).message}`);
    failed.push(name);
    return undefined;
  }
}

const png = (file: string) => `data:image/png;base64,${readFileSync(join(root, file)).toString('base64')}`;

// ---- Permissions ----

const P = {
  CREATE_INVITE: 1n << 0n,
  KICK: 1n << 1n,
  BAN: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  EXTERNAL_EMOJIS: 1n << 18n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  APP_COMMANDS: 1n << 31n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
  SEND_IN_THREADS: 1n << 38n,
  MODERATE_MEMBERS: 1n << 40n,
};
const bits = (...p: bigint[]) => p.reduce((a, b) => a | b, 0n).toString();

const EVERYONE = bits(
  P.VIEW_CHANNEL, P.SEND_MESSAGES, P.SEND_IN_THREADS, P.CREATE_PUBLIC_THREADS, P.EMBED_LINKS, P.ATTACH_FILES,
  P.ADD_REACTIONS, P.EXTERNAL_EMOJIS, P.READ_HISTORY, P.CONNECT, P.SPEAK, P.USE_VAD, P.STREAM, P.CHANGE_NICKNAME, P.APP_COMMANDS,
);
const MOD = bits(P.MANAGE_MESSAGES, P.MODERATE_MEMBERS, P.KICK, P.BAN, P.VIEW_AUDIT_LOG, P.MANAGE_THREADS, P.CREATE_INVITE);
const WRITE = bits(P.SEND_MESSAGES, P.SEND_IN_THREADS, P.CREATE_PUBLIC_THREADS, P.CREATE_PRIVATE_THREADS);

// ---- What to make (docs/social/DISCORD.md §5–6) ----

const hex = (h: string) => parseInt(h.slice(1), 16);
const ROLES: { name: string; color?: number; hoist?: boolean; permissions?: string; mentionable?: boolean }[] = [
  { name: 'Dev Team', color: hex('#ffd84a'), hoist: true, permissions: bits(P.ADMINISTRATOR) },
  { name: 'Moderator', color: hex('#e04848'), hoist: true, permissions: MOD },
  { name: 'Content Creator', color: hex('#a46be0'), hoist: true },
  { name: 'Tester', color: hex('#3cb34a') },
  { name: 'Red Team', color: hex('#e04848') },
  { name: 'Blue Team', color: hex('#3a7be0') },
  { name: 'Green Team', color: hex('#3cb34a') },
  { name: 'Gold Team', color: hex('#e0a020') },
  { name: 'Ping: News', mentionable: false },
  { name: 'Ping: Daily challenge', mentionable: false },
  { name: 'Ping: Looking for game', mentionable: false },
  { name: 'Español' },
  { name: 'Português' },
  { name: 'Deutsch' },
  { name: 'Français' },
  { name: '日本語' },
];

type Access = 'open' | 'readonly' | 'staff' | { role: string } | { writers: string };
type Chan = { name: string; type: 'text' | 'news' | 'forum' | 'voice'; topic?: string; slow?: number; access?: Access; limit?: number; tags?: string[]; guide?: string };
const CATEGORIES: { name: string; access?: Access; channels: Chan[] }[] = [
  {
    name: '👋 START HERE',
    channels: [
      { name: 'welcome', type: 'text', access: 'readonly', topic: 'Welcome to the official TardiGeddon server! Start here.' },
      { name: 'rules', type: 'text', access: 'readonly', topic: 'The rules. Breaking them gets a timeout or a ban.' },
      { name: 'announcements', type: 'news', access: 'readonly', topic: 'News, updates and new promo codes from the dev team.' },
      { name: 'faq', type: 'text', access: 'readonly', topic: 'Answers to the questions everyone asks.' },
    ],
  },
  {
    name: '🎮 COMMUNITY',
    channels: [
      { name: 'general', type: 'text', topic: 'Chat about TardiGeddon and anything else (keep it friendly).' },
      { name: 'looking-for-game', type: 'text', slow: 30, topic: 'Post your room code to find people for an online match.' },
      { name: 'screenshots-and-clips', type: 'text', slow: 10, topic: 'Your best shots, worst misses and luckiest wins.' },
      { name: 'fan-art', type: 'text', topic: "Draw a tardi! Original art only; say if it's AI-made." },
      { name: 'daily-challenge', type: 'text', topic: 'Share your daily challenge scores and how you did it.' },
      { name: 'tardigrade-facts', type: 'text', topic: 'Real water bears are amazing. Share facts (with a source).' },
      { name: 'creator-videos', type: 'text', access: { writers: 'Content Creator' }, topic: 'Videos and streams of TardiGeddon by the community.' },
    ],
  },
  {
    name: '🛠 FEEDBACK',
    channels: [
      { name: 'bug-reports', type: 'forum', guide: '`#bug-reports` post guidelines', tags: ['Desktop', 'Phone', 'Online', 'Offline', 'Fixed', "Can't reproduce"] },
      { name: 'suggestions', type: 'forum', guide: '`#suggestions` post guidelines', tags: ['Weapon', 'Map', 'Mode', 'Cosmetic', 'UI', 'Planned', 'Done'] },
      { name: 'help', type: 'forum', topic: 'Stuck? Ask here. One question per post.', tags: ['Controls', 'Account', 'Shop', 'Online', 'Solved'] },
    ],
  },
  {
    name: '🔊 VOICE',
    channels: [
      { name: 'Lobby', type: 'voice' },
      { name: 'Match 1', type: 'voice', limit: 10 },
      { name: 'Match 2', type: 'voice', limit: 10 },
    ],
  },
  {
    name: '🌍 INTERNATIONAL',
    channels: [
      { name: 'español', type: 'text', access: { role: 'Español' } },
      { name: 'português', type: 'text', access: { role: 'Português' } },
      { name: 'deutsch', type: 'text', access: { role: 'Deutsch' } },
      { name: 'français', type: 'text', access: { role: 'Français' } },
      { name: '日本語', type: 'text', access: { role: '日本語' } },
    ],
  },
  {
    name: '🔒 STAFF',
    access: 'staff',
    channels: [
      { name: 'mod-chat', type: 'text', access: 'staff' },
      { name: 'mod-log', type: 'text', access: 'staff' },
      { name: 'testing', type: 'text', access: { role: 'Tester' } },
    ],
  },
];

const EMOJI = ['tardi', 'tardi_blue', 'tardi_green', 'tardi_gold', 'tardi_king', 'tardi_party', 'tardi_wizard', 'tardi_pirate', 'tardi_dev', 'tardi_ninja'];

// ---- Text from the guide ----

const guide = readFileSync(join(root, 'docs/social/DISCORD.md'), 'utf8').split('\n');
/** The blockquote under the "### …" heading that starts with `heading`, without its "> ". */
function quote(heading: string): string {
  const at = guide.findIndex((l) => l.startsWith(`### ${heading}`));
  if (at < 0) throw new Error(`No "${heading}" in DISCORD.md`);
  const out: string[] = [];
  for (const line of guide.slice(at + 1)) {
    if (line.startsWith('>')) out.push(line.replace(/^> ?/, ''));
    else if (out.length) break;
  }
  return out.join('\n').trim();
}
/** Splits text into Discord messages (2000 characters at most) at blank lines. */
function messages(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split('\n\n')) {
    const last = out[out.length - 1];
    if (last !== undefined && last.length + para.length + 2 <= 2000) out[out.length - 1] = `${last}\n\n${para}`;
    else out.push(para);
  }
  return out;
}

// ---- Run ----

const guild = await api('GET', `/guilds/${GUILD}`);
console.log(`Server: ${guild.name}${DRY ? ' (dry run)' : ''}`);

// Icon.
if (!guild.icon) await step('server icon', () => api('PATCH', `/guilds/${GUILD}`, { icon: png('store/social/discord-server-icon.png') }));

// Roles, then @everyone's permissions.
const roles: Json[] = await api('GET', `/guilds/${GUILD}/roles`);
const role: Record<string, string> = {};
for (const r of ROLES) {
  const have = roles.find((x) => x.name === r.name);
  const made = have ?? (await step(`role ${r.name}`, () => api('POST', `/guilds/${GUILD}/roles`, { permissions: '0', ...r })));
  if (made) role[r.name] = made.id;
  if (!have && made) console.log(`+ role ${r.name}`);
}
await step('@everyone permissions', () => api('PATCH', `/guilds/${GUILD}/roles/${GUILD}`, { permissions: EVERYONE }));
// Order: the list above, top to bottom, just under the bot's own role.
const me = await api('GET', '/users/@me');
const botMember = await api('GET', `/guilds/${GUILD}/members/${me.id}`);
const botTop = Math.max(0, ...roles.filter((r) => botMember.roles.includes(r.id)).map((r) => r.position));
const ordered = ROLES.map((r) => role[r.name]).filter(Boolean);
await step('role order', () =>
  api('PATCH', `/guilds/${GUILD}/roles`, ordered.map((id, i) => ({ id, position: Math.max(1, botTop - 1 - i) }))),
);

// Permission overwrites for each kind of access.
const VIEW = P.VIEW_CHANNEL.toString();
function overwrites(access: Access | undefined): Json[] {
  const staff = [role['Dev Team'], role['Moderator']].filter(Boolean);
  const allow = (id: string, allow: string) => ({ id, type: 0, allow, deny: '0' });
  if (!access || access === 'open') return [];
  if (access === 'readonly') return [{ id: GUILD, type: 0, allow: '0', deny: WRITE }, ...staff.map((id) => allow(id, WRITE))];
  if (access === 'staff') return [{ id: GUILD, type: 0, allow: '0', deny: VIEW }, ...staff.map((id) => allow(id, VIEW))];
  if ('role' in access) return [{ id: GUILD, type: 0, allow: '0', deny: VIEW }, ...[role[access.role], ...staff].filter(Boolean).map((id) => allow(id, VIEW))];
  return [{ id: GUILD, type: 0, allow: '0', deny: WRITE }, ...[role[access.writers], ...staff].filter(Boolean).map((id) => allow(id, WRITE))];
}

// Community first: announcement and forum channels need it, and it needs a rules channel.
let channels: Json[] = await api('GET', `/guilds/${GUILD}/channels`);
const TYPE = { text: 0, voice: 2, category: 4, news: 5, forum: 15 } as const;
const find = (name: string, type: number, parent?: string) =>
  channels.find((c) => c.name === name && c.type === type && (parent === undefined || c.parent_id === parent)) ??
  channels.find((c) => c.name === name && c.type === type);

const chan: Record<string, Json> = {};
async function ensure(c: Chan, parent: string, position: number): Promise<void> {
  // Without Community, an announcement channel falls back to a plain text one.
  const type = c.type === 'news' && !community() ? TYPE.text : TYPE[c.type];
  const body: Json = {
    name: c.name,
    type,
    parent_id: parent,
    position,
    permission_overwrites: overwrites(c.access),
  };
  if (c.topic && c.type !== 'voice') body.topic = c.topic;
  if (c.guide) body.topic = quote(c.guide).slice(0, 4096);
  if (c.slow) body.rate_limit_per_user = c.slow;
  if (c.limit) body.user_limit = c.limit;
  if (c.tags) {
    body.available_tags = c.tags.map((name) => ({ name }));
    body.flags = 1 << 4; // REQUIRE_TAG
  }
  const have = find(c.name, type) ?? (c.type === 'news' ? find(c.name, TYPE.text) : undefined);
  if (have) {
    if (have.type === TYPE.text && type === TYPE.news) body.type = TYPE.news;
    else delete body.type;
    if (have.available_tags?.length) delete body.available_tags;
    chan[c.name] = (await step(`channel ${c.name}`, () => api('PATCH', `/channels/${have.id}`, body))) ?? have;
  } else {
    const made = await step(`channel ${c.name}`, () => api('POST', `/guilds/${GUILD}/channels`, body));
    if (made) {
      chan[c.name] = made;
      console.log(`+ #${c.name}`);
    }
  }
}
let features: string[] = guild.features;
const community = () => features.includes('COMMUNITY');

const category: Record<string, string> = {};
async function ensureCategory(name: string, position: number, access?: Access) {
  const have = find(name, TYPE.category);
  const body = { name, type: TYPE.category, position, permission_overwrites: overwrites(access) };
  const c = have ? await step(`category ${name}`, () => api('PATCH', `/channels/${have.id}`, body)) : await step(`category ${name}`, () => api('POST', `/guilds/${GUILD}/channels`, body));
  if (c) category[name] = c.id;
}

// Pass 1: categories and the two channels Community needs.
for (const [i, cat] of CATEGORIES.entries()) await ensureCategory(cat.name, i, cat.access);
const start = CATEGORIES[0];
const staffCat = CATEGORIES[CATEGORIES.length - 1];
await ensure(start.channels[1], category[start.name], 1); // rules
await ensure(staffCat.channels[1], category[staffCat.name], 1); // mod-log

if (!community() && chan.rules && chan['mod-log']) {
  const g = await step('turn on Community', () =>
    api('PATCH', `/guilds/${GUILD}`, {
      features: [...features, 'COMMUNITY'],
      rules_channel_id: chan.rules.id,
      public_updates_channel_id: chan['mod-log'].id,
      verification_level: Math.max(2, guild.verification_level),
      explicit_content_filter: 2,
      default_message_notifications: 1,
      preferred_locale: 'en-GB',
      description: 'The official community for TardiGeddon, the free turn-based artillery game starring tardigrades.',
    }),
  );
  if (g) {
    features = g.features ?? [...features, 'COMMUNITY'];
    console.log('+ Community');
  }
} else if (community()) {
  await step('default notifications', () => api('PATCH', `/guilds/${GUILD}`, { default_message_notifications: 1 }));
}

// Pass 2: every channel, in order.
channels = await api('GET', `/guilds/${GUILD}/channels`);
for (const cat of CATEGORIES) {
  for (const [i, c] of cat.channels.entries()) {
    if (c.type === 'forum' && !community()) {
      failed.push(`forum #${c.name} (needs Community)`);
      continue;
    }
    await ensure(c, category[cat.name], i);
  }
}

// Discord's starter channels: the voice "General" and the empty default categories.
channels = await api('GET', `/guilds/${GUILD}/channels`);
for (const c of channels) {
  if (c.type === TYPE.voice && c.name === 'General') await step('remove starter voice channel', () => api('DELETE', `/channels/${c.id}`));
}
channels = await api('GET', `/guilds/${GUILD}/channels`);
for (const c of channels) {
  const starter = c.type === TYPE.category && ['Text Channels', 'Voice Channels'].includes(c.name);
  if (starter && !channels.some((x) => x.parent_id === c.id)) await step(`remove empty category ${c.name}`, () => api('DELETE', `/channels/${c.id}`));
}

// Emoji.
const emojis: Json[] = await api('GET', `/guilds/${GUILD}/emojis`);
for (const name of EMOJI) {
  if (emojis.some((e) => e.name === name)) continue;
  const e = await step(`emoji ${name}`, () => api('POST', `/guilds/${GUILD}/emojis`, { name, image: png(`store/social/emoji/${name}.png`) }));
  if (e) emojis.push(e);
}
const tardi = emojis.find((e) => e.name === 'tardi');

// AutoMod (docs §3).
const rules: Json[] = await api('GET', `/guilds/${GUILD}/auto-moderation/rules`);
const staffRoles = [role['Dev Team'], role['Moderator']].filter(Boolean);
const block = { type: 1, metadata: { custom_message: 'Blocked by TardiGeddon AutoMod. See #rules.' } };
const alert = chan['mod-log'] ? [{ type: 2, metadata: { channel_id: chan['mod-log'].id } }] : [];
const AUTOMOD: Json[] = [
  { name: 'Mention spam', trigger_type: 5, trigger_metadata: { mention_total_limit: 5, mention_raid_protection_enabled: true }, actions: [block, { type: 3, metadata: { duration_seconds: 600 } }, ...alert] },
  { name: 'Suspected spam', trigger_type: 3, actions: [block, ...alert] },
  { name: 'Commonly flagged words', trigger_type: 4, trigger_metadata: { presets: [1, 2, 3] }, actions: [block] },
  {
    name: 'Scams',
    trigger_type: 1,
    trigger_metadata: { keyword_filter: ['*free nitro*', '*nitro gift*', '*steam gift*', '*steamcommunity.gift*', '*discord.gift*', '*@everyone free*', 'airdrop*', 'crypto*', 'onlyfans*'] },
    actions: [block, ...alert],
  },
  {
    name: 'Invite links',
    trigger_type: 1,
    trigger_metadata: { regex_patterns: ['discord(?:\\.gg|(?:app)?\\.com/invite)/\\S+'] },
    actions: [block],
  },
];
for (const r of AUTOMOD) {
  if (rules.some((x) => x.trigger_type === r.trigger_type && (x.name === r.name || r.trigger_type !== 1))) continue;
  const made = await step(`AutoMod ${r.name}`, () =>
    api('POST', `/guilds/${GUILD}/auto-moderation/rules`, { event_type: 1, enabled: true, exempt_roles: staffRoles, ...r }),
  );
  if (made) console.log(`+ AutoMod: ${r.name}`);
}

// Messages, only into empty channels.
async function post(name: string, text: string) {
  const c = chan[name];
  if (!c) return;
  const last = DRY ? [] : await api('GET', `/channels/${c.id}/messages?limit=1`);
  if (last.length) return;
  for (const content of messages(text)) {
    await step(`message in #${name}`, () => api('POST', `/channels/${c.id}/messages`, { content, allowed_mentions: { parse: [] } }));
  }
  console.log(`+ posted in #${name}`);
}
// Turn "#name" into a channel link and the emoji placeholder into the real emoji.
const link = (text: string) =>
  text
    .replace(/<:tardi:>/g, tardi ? `<:tardi:${tardi.id}>` : '🐻')
    .replace(/#([a-z-]+)/g, (m, n: string) => (chan[n] ? `<#${chan[n].id}>` : m));
await step('welcome', () => post('welcome', link(quote('`#welcome`'))));
await step('rules', () => post('rules', link(quote('`#rules`'))));
await step('faq', () => post('faq', link(quote('`#faq`'))));

// Onboarding (docs §8): pick a team, pings, languages.
let n = 0n;
const snowflake = () => (((BigInt(Date.now()) - 1420070400000n) << 22n) + n++).toString();
const option = (title: string, emoji: string, roleName: string, channelName?: string) => ({
  id: snowflake(),
  title,
  emoji: { name: emoji },
  role_ids: role[roleName] ? [role[roleName]] : [],
  channel_ids: channelName && chan[channelName] ? [chan[channelName].id] : [],
});
if (community()) {
  const defaults = ['welcome', 'rules', 'announcements', 'faq', 'general', 'looking-for-game', 'screenshots-and-clips', 'fan-art', 'daily-challenge', 'help']
    .map((c) => chan[c]?.id)
    .filter(Boolean);
  await step('onboarding', () =>
    api('PUT', `/guilds/${GUILD}/onboarding`, {
      enabled: true,
      mode: 0,
      default_channel_ids: defaults,
      prompts: [
        {
          id: snowflake(), type: 0, title: 'Pick your team!', single_select: true, required: true, in_onboarding: true,
          options: [option('Red Team', '🔴', 'Red Team'), option('Blue Team', '🔵', 'Blue Team'), option('Green Team', '🟢', 'Green Team'), option('Gold Team', '🟡', 'Gold Team')],
        },
        {
          id: snowflake(), type: 0, title: 'What do you want to hear about?', single_select: false, required: false, in_onboarding: true,
          options: [
            option('News and updates', '📰', 'Ping: News'),
            option('Daily challenge reminders', '📅', 'Ping: Daily challenge'),
            option('People looking for a game', '🎮', 'Ping: Looking for game'),
          ],
        },
        {
          id: snowflake(), type: 0, title: 'Do you speak another language?', single_select: false, required: false, in_onboarding: true,
          options: [
            option('Español', '🇪🇸', 'Español', 'español'),
            option('Português', '🇧🇷', 'Português', 'português'),
            option('Deutsch', '🇩🇪', 'Deutsch', 'deutsch'),
            option('Français', '🇫🇷', 'Français', 'français'),
            option('日本語', '🇯🇵', '日本語', '日本語'),
          ],
        },
      ],
    }),
  );
}

console.log(`\nDone${failed.length ? `, except: ${failed.join('; ')}` : ''}.`);
console.log(`
Still to do by hand (the API can't), from docs/social/DISCORD.md:
- Server Settings → Onboarding → Server Guide: welcome message, to-dos and resource pages (§8)
- Server Settings → Rules Screening, if your server shows it (§4)
- Safety Setup → Activity Alerts on, channel #mod-log (§3)
- AutoMod → "Block words in member profiles" (§3)
- Give yourself and your personal account the Dev Team role (§5)
- The invite link (§9), and the first #announcements post (§7) from your own account
- Remove this bot when you're happy: Server Settings → Integrations`);
