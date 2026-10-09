// Online play: create or join a room by code, wait in the lobby, and start
// a match. The match itself runs in main.ts (Match in online mode).

import { mascotSvg } from './mascot';
import { hex } from '../render/palette';
import { SCHEME_PRESETS } from '../sim/schemes';
import { MAX_TEAMS } from '../sim/world';
import { loadProfiles, matchNames } from './teams';
import { savedScheme } from './menu';
import { NetClient, serverUrl } from '../net/client';
import { wearHat } from '../account/session';
import { Lockstep } from '../net/lockstep';
import type { LobbyTeam, ServerMsg } from '../net/protocol';

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

/** Our team (the first saved team profile), as sent to the server. */
function myTeam(): LobbyTeam {
  const p = loadProfiles()[0];
  return { name: p.name, color: p.color, hat: wearHat(p.hat), names: matchNames(p, 0) };
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
): void {
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

  const listen = (c: NetClient) => {
    off?.();
    off = c.on((msg: ServerMsg) => {
      if (msg.t === 'error') status.textContent = msg.msg;
      else if (msg.t === 'queue') renderQueue(msg.waiting);
      else if (msg.t === 'room') {
        stopQueueClock();
        saveRejoin(msg.code, msg.token);
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
      status.textContent = 'Lost connection to the game server.';
    };
  };

  const connect = async (): Promise<NetClient | null> => {
    if (client?.connected) return client;
    if (!url) return null;
    status.textContent = 'Connecting…';
    const c = new NetClient(url);
    try {
      await c.connect();
    } catch (e) {
      status.textContent = (e as Error).message;
      return null;
    }
    status.textContent = '';
    client = c;
    listen(c);
    return c;
  };

  const renderEntry = () => {
    card.innerHTML = '';
    card.append(el('h1', 'title-small', 'Play online'));
    if (!url) {
      card.append(el('p', 'online-note', 'Online play isn’t switched on for this version of the game yet.'));
      const back = el('button', 'big-btn secondary', 'Back');
      back.onclick = leave;
      card.append(back);
      return;
    }
    const team = myTeam();
    const who = el('div', 'online-me');
    who.innerHTML = mascotSvg(team.color, team.hat);
    const name = el('span', 'online-me-name', team.name);
    name.style.color = hex(team.color);
    who.append(name);
    card.append(who, el('p', 'online-note', 'You play as your first team. Edit it from the main menu.'));

    const quick = el('button', 'big-btn', '⚡ Quick play');
    quick.onclick = async () => {
      const c = await connect();
      c?.quick(myTeam());
    };
    const or = el('p', 'online-note', 'or play with friends:');
    const create = el('button', 'big-btn secondary', 'Create a room');
    create.onclick = async () => {
      const c = await connect();
      c?.create(myTeam());
    };
    const joinRow = el('div', 'join-row');
    const code = el('input', 'code-input');
    code.placeholder = 'Room code';
    code.maxLength = 5;
    code.autocapitalize = 'characters';
    code.value = opts.code ?? '';
    const join = el('button', 'big-btn secondary', 'Join');
    join.onclick = async () => {
      const v = code.value.trim().toUpperCase();
      if (v.length < 5) {
        status.textContent = 'Enter the 5-letter room code.';
        return;
      }
      const c = await connect();
      const re = loadRejoin();
      c?.join(v, myTeam(), re && re.code === v ? re.token : undefined);
    };
    code.onkeydown = (e) => {
      if (e.key === 'Enter') join.click();
    };
    joinRow.append(code, join);
    const back = el('button', 'hud-btn', '← Back');
    back.onclick = leave;
    card.append(quick, or, create, joinRow, status, back);
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
    card.append(el('h1', 'title-small', 'Quick play'));
    const spin = el('div', 'queue-spin');
    spin.innerHTML = mascotSvg(myTeam().color, myTeam().hat);
    card.append(spin, el('p', 'online-note', waiting > 1 ? `${waiting} players waiting… starting soon!` : 'Looking for players…'), el('div', 'queue-time', '0:00'));
    const cpu = el('button', 'big-btn secondary', 'Play a CPU instead');
    cpu.onclick = () => client?.send({ t: 'quickCpu' });
    const cancel = el('button', 'hud-btn', 'Cancel');
    cancel.onclick = () => {
      client?.send({ t: 'quickCancel' });
      stopQueueClock();
      renderEntry();
    };
    card.append(cpu, status, cancel);
  };

  const renderLobby = (room: Extract<ServerMsg, { t: 'room' }>) => {
    card.innerHTML = '';
    const isHost = room.slots[room.you]?.host === true;
    card.append(el('h1', 'title-small', 'Room'));
    const codeBox = el('div', 'room-code', room.code);
    const share = el('button', 'hud-btn', '🔗 Copy invite link');
    share.onclick = async () => {
      const link = `${location.origin}${location.pathname}?room=${room.code}`;
      try {
        await navigator.clipboard.writeText(link);
        share.textContent = '✓ Link copied';
      } catch {
        share.textContent = link;
      }
    };
    card.append(codeBox, share);

    const list = el('div', 'lobby-slots');
    room.slots.forEach((s, i) => {
      const row = el('div', 'lobby-slot' + (s.connected ? '' : ' gone'));
      row.style.setProperty('--team', hex(s.team.color));
      const pic = el('span', 'lobby-pic');
      pic.innerHTML = mascotSvg(s.team.color, s.team.hat);
      const name = el('span', 'lobby-name', s.team.name); // player text: never innerHTML
      const tag = el('span', 'lobby-tag', s.cpu ? '🤖 CPU' : s.host ? '👑 Host' : i === room.you ? 'You' : '👤');
      if (i === room.you && !s.cpu) tag.textContent = s.host ? '👑 You' : 'You';
      row.append(pic, name, tag);
      if (isHost && s.cpu) {
        const rm = el('button', 'slot-edit', '✕');
        rm.setAttribute('aria-label', 'Remove CPU');
        rm.onclick = () => client?.send({ t: 'removeSlot', idx: i });
        row.append(rm);
      }
      list.append(row);
    });
    card.append(list);

    if (isHost) {
      const add = el('button', 'hud-btn', '+ Add CPU');
      add.disabled = room.slots.length >= MAX_TEAMS;
      add.onclick = () => client?.send({ t: 'addCpu' });
      const styleRow = el('label', 'online-style', 'Game style ');
      const sel = el('select');
      const saved = savedScheme();
      for (const p of SCHEME_PRESETS) sel.append(new Option(p.name, p.id));
      sel.append(new Option('My custom style', 'custom'));
      sel.value = saved.style;
      styleRow.append(sel);
      const start = el('button', 'big-btn', 'Start match');
      start.disabled = room.slots.length < 2;
      start.onclick = () => {
        const scheme = sel.value === 'custom' ? saved.custom : SCHEME_PRESETS.find((p) => p.id === sel.value)!.scheme;
        client?.send({ t: 'start', scheme });
      };
      card.append(add, styleRow, start);
      if (room.slots.length < 2) card.append(el('p', 'online-note', 'Share the code, or add a CPU, to start.'));
    } else {
      card.append(el('p', 'online-note', 'Waiting for the host to start the match…'));
    }
    const back = el('button', 'hud-btn', 'Leave room');
    back.onclick = leave;
    card.append(status, back);
  };

  if (client) {
    // Back from a match to the same room.
    listen(client);
    if (opts.room && !opts.room.started) renderLobby(opts.room);
    else card.append(el('p', 'online-note', 'Back to the room…'));
  } else {
    renderEntry();
  }
}
