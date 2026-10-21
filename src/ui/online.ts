// Online play: create or join a room by code, wait in the lobby, and start
// a match. The match itself runs in main.ts (Match in online mode).

import { onlineGuide } from './guide';
import { otherPlayer, playerActions, slotName } from './safety';
import { mascotSvg } from './mascot';
import { emblemSvg } from '../render/emblems';
import { hex, shown } from '../render/palette';
import { SCHEME_PRESETS } from '../sim/schemes';
import { MAX_TEAMS } from '../sim/rosters';
import { loadProfiles, matchNames } from './teams';
import { savedScheme } from './menu';
import { NetClient, serverUrl } from '../net/client';
import { account, usableArenas, wornLooks } from '../account/session';
import { tierFor } from '../stats/rank';
import { friendsPanel, showInvite } from './friends';
import { myMaps } from './myMaps';
import { MAP_STYLES } from '../sim/terrain/generate';
import { arenaTheme } from '../render/arenas';
import { Lockstep } from '../net/lockstep';
import type { LobbyTeam, ServerMsg } from '../net/protocol';
import { webGameUrl } from '../native';
import { t } from '../i18n/i18n';

const REJOIN_KEY = 'tardigeddon.rejoin';

export interface OnlineHooks {
  onBack: () => void;
  onStart: (client: NetClient, ls: Lockstep) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The host's map and world picks for the room (kept while the page is open). */
const roomPick = { map: 'random', world: '' };

/** Our team (the first saved team profile), as sent to the server. */
function myTeam(): LobbyTeam {
  const p = loadProfiles()[0];
  return { name: p.name, color: p.color, ...wornLooks(p), names: matchNames(p, 0) };
}

/** Remember the room so a dropped connection (or reload) can rejoin our slot. */
export function saveRejoin(code: string, token: string): void {
  try {
    sessionStorage.setItem(REJOIN_KEY, JSON.stringify({ code, token }));
  } catch {
    /* ignore */
  }
}

export function loadRejoin(): { code: string; token: string } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(REJOIN_KEY) ?? 'null') as { code: string; token: string } | null;
    return v && typeof v.code === 'string' && typeof v.token === 'string' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Show the online screen. Pass `client` to return to an existing room's
 * lobby after a match; pass `code` to pre-fill (e.g. from a share link).
 */
export function showOnline(
  root: HTMLElement,
  hooks: OnlineHooks,
  opts: { client?: NetClient; code?: string; room?: Extract<ServerMsg, { t: 'room' }> } = {},
): { back: () => void } {
  root.innerHTML = '';
  const menu = el('div', 'menu');
  const card = el('div', 'menu-card online');
  menu.append(card);
  root.append(menu);

  const url = serverUrl();
  let client = opts.client ?? null;
  let off: (() => void) | null = null;
  const status = el('p', 'online-status');

  const leave = () => {
    stopQueueClock();
    off?.();
    client?.close();
    try {
      sessionStorage.removeItem(REJOIN_KEY);
    } catch {
      /* ignore */
    }
    hooks.onBack();
  };
  /** What the phone's back button does on the current screen. */
  let backAction = leave;

  const listen = (c: NetClient) => {
    off?.();
    off = c.on((msg: ServerMsg) => {
      if (msg.t === 'error') status.textContent = t(msg.msg);
      else if (msg.t === 'invite') showInvite(msg.from, () => void joinRoom(msg.code));
      else if (msg.t === 'queue') renderQueue(msg.waiting);
      else if (msg.t === 'room') {
        stopQueueClock();
        // Watchers have no slot to come back to.
        if (msg.you >= 0) saveRejoin(msg.code, msg.token);
        if (!msg.started) renderLobby(msg);
      } else if (msg.t === 'start') {
        stopQueueClock();
        off?.();
        hooks.onStart(c, Lockstep.start(msg.seed, msg.scheme, msg.teams, msg.you));
      } else if (msg.t === 'snapshot') {
        // Rejoined a match in progress.
        off?.();
        hooks.onStart(c, Lockstep.fromSnapshot(msg.state, msg.you));
      }
    });
    c.onDrop = () => {
      status.textContent = t('Lost connection to the game server.');
    };
  };

  /** Join a room by its code (a friend's, or an invite). */
  const joinRoom = async (code: string) => {
    const c = await connect();
    const re = loadRejoin();
    c?.join(code, myTeam(), re && re.code === code ? re.token : undefined);
  };

  const connect = async (): Promise<NetClient | null> => {
    if (client?.connected) return client;
    if (!url) return null;
    status.textContent = t('Connecting…');
    const c = new NetClient(url);
    try {
      await c.connect();
    } catch (e) {
      status.textContent = t((e as Error).message);
      return null;
    }
    status.textContent = '';
    client = c;
    listen(c);
    return c;
  };

  /**
   * Two columns for phones, side by side in landscape (CSS: .online-col). On
   * bigger screens they don't exist as boxes (display: contents): one column.
   */
  const columns = (): [HTMLElement, HTMLElement] => {
    const a = el('div', 'online-col');
    const b = el('div', 'online-col');
    card.append(a, b);
    return [a, b];
  };

  const renderEntry = () => {
    backAction = leave;
    card.innerHTML = '';
    card.dataset.screen = 'entry';
    card.append(el('h1', 'title-small', t('Play online')));
    if (!url) {
      card.append(el('p', 'online-note', t('Online play isn’t switched on for this version of the game yet.')));
      const back = el('button', 'big-btn secondary', t('Back'));
      back.onclick = leave;
      card.append(back);
      return;
    }
    const team = myTeam();
    const who = el('div', 'online-me');
    who.innerHTML = mascotSvg(shown(team.color), team.hat, team.skin);
    const name = el('span', 'online-me-name', team.name);
    name.style.color = hex(team.color);
    who.append(name);
    const heading = card.firstElementChild!;
    const [colA, colB] = columns();
    colA.append(heading, who, el('p', 'online-note', t('You play as your first team. Edit it from the main menu.')));

    const quick = el('button', 'big-btn', t('⚡ Quick play'));
    quick.onclick = async () => {
      const c = await connect();
      c?.quick(myTeam());
    };
    const or = el('p', 'online-note', t('or play with friends:'));
    const create = el('button', 'big-btn secondary', t('Create a room'));
    create.onclick = async () => {
      const c = await connect();
      c?.create(myTeam());
    };
    const joinRow = el('div', 'join-row');
    const code = el('input', 'code-input');
    code.placeholder = t('Room code');
    code.maxLength = 5;
    code.autocapitalize = 'characters';
    code.value = opts.code ?? '';
    const join = el('button', 'big-btn secondary', t('Join'));
    join.onclick = async () => {
      const v = code.value.trim().toUpperCase();
      if (v.length < 5) {
        status.textContent = t('Enter the 5-letter room code.');
        return;
      }
      const c = await connect();
      const re = loadRejoin();
      c?.join(v, myTeam(), re && re.code === v ? re.token : undefined);
    };
    code.onkeydown = (e) => {
      if (e.key === 'Enter') join.click();
    };
    // Spectate: watch a room's match without playing in it.
    const watch = el('button', 'hud-btn', t('👀 Watch'));
    watch.title = t('Watch this room’s match without playing');
    watch.onclick = async () => {
      const v = code.value.trim().toUpperCase();
      if (v.length < 5) {
        status.textContent = t('Enter the 5-letter room code.');
        return;
      }
      const c = await connect();
      c?.watch(v);
    };
    joinRow.append(code, join, watch);
    const back = el('button', 'hud-btn online-back', t('← Back'));
    back.onclick = leave;
    const help = el('button', 'hud-btn', t('❓ How online play works'));
    help.onclick = () => {
      const overlay = el('div', 'editor-overlay');
      const box = el('div', 'editor guide-box');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-label', t('How online play works'));
      const done = el('button', 'big-btn', t('Got it'));
      const close = () => overlay.remove();
      done.onclick = close;
      overlay.onclick = (e) => {
        if (e.target === overlay) close();
      };
      box.append(onlineGuide(), done);
      overlay.append(box);
      root.append(overlay);
      done.focus();
    };
    colA.append(help, back);
    colB.append(quick, or, create, joinRow, status);
    // Signed in: friends, and a connection so friends see you online and can invite you.
    if (account().me?.user) {
      colB.append(friendsPanel({ inRoom: false, onJoin: (c) => void joinRoom(c) }));
      void connect();
    }
    if (opts.code) join.click();
  };

  // Quick play: waiting to be matched.
  let queueClock = 0;
  let queueSince = 0;
  const stopQueueClock = () => {
    clearInterval(queueClock);
    queueClock = 0;
  };
  const renderQueue = (waiting: number) => {
    if (!queueClock) {
      queueSince = performance.now();
      queueClock = window.setInterval(() => {
        const secs = Math.floor((performance.now() - queueSince) / 1000);
        const el2 = card.querySelector('.queue-time');
        if (el2) el2.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
        else stopQueueClock();
      }, 500);
    }
    card.innerHTML = '';
    card.dataset.screen = 'queue';
    card.append(el('h1', 'title-small', t('Quick play')));
    const spin = el('div', 'queue-spin');
    spin.innerHTML = mascotSvg(shown(myTeam().color), myTeam().hat, myTeam().skin);
    card.append(spin, el('p', 'online-note', waiting > 1 ? t('{n} players waiting… starting soon!', { n: waiting }) : t('Looking for players…')), el('div', 'queue-time', '0:00'));
    const stats = account().me?.user ? account().me?.stats : null;
    if (stats?.ratedGames) {
      const tier = tierFor(stats.rating);
      card.append(el('p', 'online-note', t('Looking for players near your rank ({tier}) first.', { tier: `${tier.emoji} ${t(tier.name)}` })));
    }
    const cpu = el('button', 'big-btn secondary', t('Play a CPU instead'));
    cpu.onclick = () => client?.send({ t: 'quickCpu' });
    const cancel = el('button', 'hud-btn', t('Cancel'));
    cancel.onclick = () => {
      client?.send({ t: 'quickCancel' });
      stopQueueClock();
      renderEntry();
    };
    backAction = () => cancel.click();
    card.append(cpu, status, cancel);
  };

  const renderLobby = (room: Extract<ServerMsg, { t: 'room' }>) => {
    backAction = leave;
    card.innerHTML = '';
    card.dataset.screen = 'room';
    const isHost = room.slots[room.you]?.host === true;
    const [colA, colB] = columns();
    colA.append(el('h1', 'title-small', t('Room')));
    const codeBox = el('div', 'room-code', room.code);
    const share = el('button', 'hud-btn', t('🔗 Copy invite link'));
    share.onclick = async () => {
      const link = `${webGameUrl()}?room=${room.code}`;
      try {
        await navigator.clipboard.writeText(link);
        share.textContent = t('✓ Link copied');
      } catch {
        share.textContent = link;
      }
    };
    colA.append(codeBox, share);

    const list = el('div', 'lobby-slots');
    room.slots.forEach((s, i) => {
      const row = el('div', 'lobby-slot' + (s.connected ? '' : ' gone'));
      row.style.setProperty('--team', hex(shown(s.team.color)));
      const pic = el('span', 'lobby-pic');
      pic.innerHTML = mascotSvg(shown(s.team.color), s.team.hat, s.team.skin);
      const name = el('span', 'lobby-name', slotName(s)); // player text: never innerHTML
      const tag = el('span', 'lobby-tag', s.cpu ? t('🤖 CPU') : s.host ? t('👑 Host') : i === room.you ? t('You') : '👤');
      if (i === room.you && !s.cpu) tag.textContent = s.host ? t('👑 You') : t('You');
      const badge = el('span', 'team-emblem');
      badge.innerHTML = emblemSvg(s.team.emblem, t('{name} emblem', { name: slotName(s) }));
      row.append(pic, badge, name, tag);
      if (otherPlayer(s, i, room.you)) row.append(playerActions(root, s, (reason) => client?.report(i, reason), () => renderLobby(client?.room ?? room)));
      if (isHost && s.cpu) {
        const rm = el('button', 'slot-edit', '✕');
        rm.setAttribute('aria-label', t('Remove CPU'));
        rm.onclick = () => client?.send({ t: 'removeSlot', idx: i });
        row.append(rm);
      }
      list.append(row);
    });
    colB.append(list);

    if (isHost) {
      const add = el('button', 'hud-btn', t('+ Add CPU'));
      add.disabled = room.slots.length >= MAX_TEAMS;
      add.onclick = () => client?.send({ t: 'addCpu' });
      const styleRow = el('label', 'online-style', t('Game style') + ' ');
      const sel = el('select');
      const saved = savedScheme();
      for (const p of SCHEME_PRESETS) sel.append(new Option(t(p.name), p.id));
      sel.append(new Option(t('My custom style'), 'custom'));
      sel.value = saved.style;
      styleRow.append(sel);
      // The map and the world everyone in the room sees (a free world, or one the host owns).
      const mapRow = el('label', 'online-style', t('Map') + ' ');
      const mapSel = el('select');
      mapSel.append(new Option(t('Surprise me'), 'random'));
      for (const m of MAP_STYLES) mapSel.append(new Option(t(m.name), m.id));
      // Maps from the host's map editor travel with the rules (the server checks them).
      const mine = myMaps();
      for (const m of mine) mapSel.append(new Option(`🗺️ ${m.name}`, `my:${m.name}`));
      if (![...mapSel.options].some((o) => o.value === roomPick.map)) roomPick.map = 'random';
      mapSel.value = roomPick.map;
      mapSel.onchange = () => (roomPick.map = mapSel.value);
      mapRow.append(mapSel);
      const worldRow = el('label', 'online-style', t('World') + ' ');
      const worldSel = el('select');
      worldSel.append(new Option(t('Each player’s own'), ''));
      for (const id of usableArenas()) worldSel.append(new Option(t(arenaTheme(id).name), id));
      worldSel.value = usableArenas().includes(roomPick.world) ? roomPick.world : '';
      worldSel.onchange = () => (roomPick.world = worldSel.value);
      worldRow.append(worldSel);
      const start = el('button', 'big-btn', t('Start match'));
      start.disabled = room.slots.length < 2;
      start.onclick = () => {
        const base = sel.value === 'custom' ? saved.custom : SCHEME_PRESETS.find((p) => p.id === sel.value)!.scheme;
        const custom = roomPick.map.startsWith('my:') ? mine.find((m) => `my:${m.name}` === roomPick.map)?.map : undefined;
        const scheme = { ...base, mapStyle: roomPick.map === 'random' || custom ? undefined : roomPick.map, customMap: custom, arena: roomPick.world || undefined };
        client?.send({ t: 'start', scheme });
      };
      colB.append(add, styleRow, mapRow, worldRow, start);
      if (room.slots.length < 2) colB.append(el('p', 'online-note', t('Share the code, or add a CPU, to start.')));
    } else {
      colB.append(el('p', 'online-note', room.you < 0 ? t('👀 You’re watching. The match shows here when the host starts it.') : t('Waiting for the host to start the match…')));
    }
    if (room.you >= 0 && account().me?.user) colB.append(friendsPanel({ inRoom: true, onJoin: (c) => void joinRoom(c) }));
    const back = el('button', 'hud-btn online-back', room.you < 0 ? t('Stop watching') : t('Leave room'));
    back.onclick = leave;
    colA.append(status, back);
  };

  if (client) {
    // Back from a match to the same room.
    listen(client);
    if (opts.room && !opts.room.started) renderLobby(opts.room);
    else card.append(el('p', 'online-note', t('Back to the room…')));
  } else {
    renderEntry();
  }
  return { back: () => backAction() };
}
