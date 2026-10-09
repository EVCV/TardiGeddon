// TardiGeddon online game server: rooms with invite codes, and lockstep
// matches simulated here at 50 Hz. Run with `npm run server`
// (PORT defaults to 8787).

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room, wearableTeam, type Member } from './room';
import { createAccounts, type Accounts } from './accounts';
import { Matchmaker } from './matchmaker';
import { SCHEME_PRESETS } from '../src/sim/schemes';
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from '../src/net/protocol';
import { TICK_RATE } from '../src/sim/types';

const PORT = Number(process.env.PORT) || 8787;
/** Close rooms nobody has been in for this long. */
const EMPTY_ROOM_MS = 2 * 60_000;
/** Inputs allowed per second per connection (frames are 50/s; leave headroom). */
const MSG_PER_SEC = 120;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Hard cap on rooms, and how often one connection may create one. */
const MAX_ROOMS = 2000;
const CREATE_COOLDOWN_MS = 5000;

const rooms = new Map<string, Room>();
/** Which room each connection is in. */
const roomOf = new Map<Member, Room>();

/** Leave whatever room this connection is in; lobbies nobody is in go at once. */
function leaveRoom(member: Member): void {
  const room = roomOf.get(member);
  if (!room) return;
  roomOf.delete(member);
  room.leave(member);
  if (room.humansConnected === 0 && !room.started) rooms.delete(room.code);
}

/** Quick play uses the short-turn style, which suits strangers on phones. */
const QUICK_SCHEME = SCHEME_PRESETS.find((p) => p.id === 'quick')!.scheme;
const matchmaker = new Matchmaker((players, cpu) => {
  if (rooms.size >= MAX_ROOMS) {
    for (const p of players) p.member.send({ t: 'error', msg: 'The server is full right now. Please try again soon.' });
    return;
  }
  const r = newRoom();
  rooms.set(r.code, r);
  for (const p of players) {
    leaveRoom(p.member);
    if (r.join(p.member, p.team)) roomOf.set(p.member, r);
  }
  if (cpu) r.addCpu();
  r.start(QUICK_SCHEME);
});

/** A new room; finished matches count towards signed-in players' stats. */
function newRoom(): Room {
  const r = new Room(newCode());
  r.onResult = (results) => void accounts?.recordResults(results).catch((e) => console.error('stats failed', e));
  return r;
}

function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

// Accounts and the shop need a database; without one the server just runs games.
let accounts: Accounts | null = null;
if (process.env.DATABASE_URL) {
  try {
    accounts = await createAccounts(process.env);
    console.log('Accounts enabled');
  } catch (e) {
    console.error('Accounts disabled: could not set up the database', e);
  }
} else {
  console.log('Accounts disabled (no DATABASE_URL)');
}

const http = createServer(async (req, res) => {
  if (accounts && (await accounts.handle(req, res))) return;
  if (req.url?.startsWith('/api/')) {
    // The game asks /api/me (with cookies) on every load: answer "no accounts" quietly.
    const me = req.url.split('?')[0] === '/api/me';
    res.writeHead(me ? 200 : 503, {
      'content-type': 'application/json',
      'access-control-allow-origin': req.headers.origin ?? '*',
      'access-control-allow-credentials': 'true',
      vary: 'origin',
    });
    res.end(JSON.stringify(me ? { accounts: false } : { error: 'Accounts are not enabled on this server.' }));
    return;
  }
  // Health check for the host platform.
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end(req.url === '/rooms' ? String(rooms.size) : req.url === '/queue' ? String(matchmaker.waiting) : 'TardiGeddon server ok');
});

const wss = new WebSocketServer({ server: http, maxPayload: 16 * 1024 });

wss.on('connection', (ws: WebSocket, req) => {
  // Shop items this player owns, from their sign-in cookie (none if signed out).
  const player = accounts ? accounts.playerFor(req.headers).catch(() => ({ owned: [] as string[] })) : Promise.resolve({ owned: [] as string[] });
  const owned = player.then((p) => {
    member.userId = 'userId' in p ? p.userId : undefined;
    return p.owned;
  });
  // Messages are handled in order, once we know what the player owns.
  let queue: Promise<void> = owned.then(() => undefined);
  let lastCreate = 0;
  let budget = MSG_PER_SEC;
  const refill = setInterval(() => (budget = MSG_PER_SEC), 1000);
  const member: Member = {
    send(msg: ServerMsg) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  const fail = (msg: string) => member.send({ t: 'error', msg });
  /** Rate-limit making rooms, and cap the total. */
  const mayCreate = (): boolean => {
    if (Date.now() - lastCreate < CREATE_COOLDOWN_MS) {
      fail('Please wait a moment and try again.');
      return false;
    }
    if (rooms.size >= MAX_ROOMS) {
      fail('The server is full right now. Please try again soon.');
      return false;
    }
    lastCreate = Date.now();
    return true;
  };

  ws.on('message', (data) => {
    if (--budget < 0) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data)) as ClientMsg;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    queue = queue
      .then(async () => {
        // The player may have gone while we looked up what they own.
        if (ws.readyState === ws.OPEN) handle(msg, await owned);
      })
      .catch((e) => console.error('bad message', e));
  });

  const handle = (msg: ClientMsg, ownedItems: string[]): void => {
    if (msg.t === 'create' || msg.t === 'join' || msg.t === 'quick') {
      if (msg.v !== PROTOCOL_VERSION) return fail('Please reload the page: the game has been updated.');
      // Shop hats only for players who own them.
      msg.team = wearableTeam(msg.team, ownedItems);
      if (msg.t === 'create' && !mayCreate()) return;
      leaveRoom(member);
      matchmaker.remove(member);
      if (msg.t === 'quick') {
        matchmaker.add(member, msg.team);
      } else if (msg.t === 'create') {
        const r = newRoom();
        rooms.set(r.code, r);
        r.join(member, msg.team);
        roomOf.set(member, r);
      } else {
        const r = rooms.get(String(msg.code).toUpperCase().trim());
        if (!r) return fail('No room with that code.');
        if (!r.join(member, msg.team, typeof msg.token === 'string' ? msg.token : undefined)) {
          return fail(r.started ? 'That match has already started.' : 'That room is full.');
        }
        roomOf.set(member, r);
      }
      return;
    }
    if (msg.t === 'quickCancel') return matchmaker.remove(member);
    if (msg.t === 'quickCpu') return mayCreate() ? matchmaker.vsCpu(member) : undefined;
    if (msg.t === 'leave') {
      matchmaker.remove(member);
      return leaveRoom(member);
    }
    try {
      roomOf.get(member)?.handle(member, msg);
    } catch (e) {
      // Never let one bad message take the server down.
      console.error('bad message', e);
    }
  };

  ws.on('close', () => {
    clearInterval(refill);
    matchmaker.remove(member);
    leaveRoom(member);
  });
});

// One clock drives every room's simulation.
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += Math.min(1000, now - last);
  last = now;
  const tickMs = 1000 / TICK_RATE;
  while (acc >= tickMs) {
    acc -= tickMs;
    for (const r of rooms.values()) r.step();
  }
  matchmaker.tick();
  for (const [code, r] of rooms) {
    if (r.humansConnected === 0 && (!r.started || (r.emptySince && Date.now() - r.emptySince > EMPTY_ROOM_MS))) rooms.delete(code);
  }
}, 10);

http.listen(PORT, () => console.log(`TardiGeddon server listening on :${PORT}`));
