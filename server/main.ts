// TardiGeddon online game server: rooms with invite codes, and lockstep
// matches simulated here at 50 Hz. Run with `npm run server`
// (PORT defaults to 8787).

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Room, type Member } from './room';
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

function newCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

const http = createServer((req, res) => {
  // Health check for the host platform.
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end(req.url === '/rooms' ? String(rooms.size) : 'TardiGeddon server ok');
});

const wss = new WebSocketServer({ server: http, maxPayload: 16 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null;
  let lastCreate = 0;
  let budget = MSG_PER_SEC;
  const refill = setInterval(() => (budget = MSG_PER_SEC), 1000);
  const member: Member = {
    send(msg: ServerMsg) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  const fail = (msg: string) => member.send({ t: 'error', msg });
  // Lobbies nobody is in are dropped at once (started matches wait for rejoins).
  const leaveRoom = () => {
    if (!room) return;
    room.leave(member);
    if (room.humansConnected === 0 && !room.started) rooms.delete(room.code);
    room = null;
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
    if (msg.t === 'create' || msg.t === 'join') {
      if (msg.v !== PROTOCOL_VERSION) return fail('Please reload the page: the game has been updated.');
      if (msg.t === 'create') {
        if (Date.now() - lastCreate < CREATE_COOLDOWN_MS) return fail('Please wait a moment before making another room.');
        if (rooms.size >= MAX_ROOMS) return fail('The server is full right now. Please try again soon.');
        lastCreate = Date.now();
      }
      leaveRoom();
      if (msg.t === 'create') {
        const r = new Room(newCode());
        rooms.set(r.code, r);
        r.join(member, msg.team);
        room = r;
      } else {
        const r = rooms.get(String(msg.code).toUpperCase().trim());
        if (!r) return fail('No room with that code.');
        if (!r.join(member, msg.team, typeof msg.token === 'string' ? msg.token : undefined)) {
          return fail(r.started ? 'That match has already started.' : 'That room is full.');
        }
        room = r;
      }
      return;
    }
    if (msg.t === 'leave') return leaveRoom();
    try {
      room?.handle(member, msg);
    } catch (e) {
      // Never let one bad message take the server down.
      console.error('bad message', e);
    }
  });

  ws.on('close', () => {
    clearInterval(refill);
    leaveRoom();
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
  for (const [code, r] of rooms) {
    if (r.humansConnected === 0 && (!r.started || (r.emptySince && Date.now() - r.emptySince > EMPTY_ROOM_MS))) rooms.delete(code);
  }
}, 10);

http.listen(PORT, () => console.log(`TardiGeddon server listening on :${PORT}`));
