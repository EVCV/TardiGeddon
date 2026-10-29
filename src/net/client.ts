// Browser connection to the online game server.

import { tk } from '../i18n/tk';
import { PROTOCOL_VERSION, type ClientMsg, type LobbyTeam, type ServerMsg } from './protocol';
import { blockedPlayers } from './blocked';
import { usageAllowed } from '../usage/consent';

/** Tell the server when the player turned off anonymous statistics, so it doesn't count them either (docs/USAGE.md). */
const noStats = (): { noStats?: true } => (usageAllowed() ? {} : { noStats: true });

/** Where the game server lives, or null if online play isn't set up for this build. */
export function serverUrl(): string | null {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  // Local development (including a phone on the same Wi-Fi): the server runs next to Vite.
  const h = location.hostname;
  if (h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.endsWith('.local')) return `ws://${h}:8787`;
  return null;
}

type Handler = (msg: ServerMsg) => void;

let ticketSource: (() => Promise<string | null>) | null = null;

/** Where a one-use ticket to join as the signed-in player comes from (the iOS app: account/session.ts). */
export function setTicketSource(fn: () => Promise<string | null>): void {
  ticketSource = fn;
}

/** The server's address with a ticket to join as the signed-in player, if there is one. */
export function withTicket(url: string, ticket: string | null): string {
  if (!ticket) return url;
  const u = new URL(url);
  u.searchParams.set('ticket', ticket);
  return u.href;
}

export class NetClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  /** Called when the connection drops unexpectedly. */
  onDrop: (() => void) | null = null;
  private closing = false;
  /** The latest room (lobby) state: who is in which slot, with their player ids. */
  room: Extract<ServerMsg, { t: 'room' }> | null = null;

  constructor(private url: string) {}

  async connect(): Promise<void> {
    this.closing = false;
    // Without a ticket the player joins signed out (still a full game, just no shop items).
    const ticket = ticketSource ? await ticketSource().catch(() => null) : null;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(withTicket(this.url, ticket));
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(tk('Could not reach the game server.')));
      ws.onmessage = (e) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(e.data)) as ServerMsg;
        } catch {
          return;
        }
        if (msg.t === 'room') this.room = msg;
        for (const h of [...this.handlers]) h(msg);
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        if (!this.closing) this.onDrop?.();
      };
    });
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  create(team: LobbyTeam): void {
    this.send({ t: 'create', v: PROTOCOL_VERSION, team, ...noStats() });
  }

  quick(team: LobbyTeam): void {
    // Never matched with players we've blocked.
    this.send({ t: 'quick', v: PROTOCOL_VERSION, team, blocks: blockedPlayers().map((b) => b.pid), ...noStats() });
  }

  /** Spectate a room by its code. */
  watch(code: string): void {
    this.send({ t: 'watch', v: PROTOCOL_VERSION, code });
  }

  join(code: string, team: LobbyTeam, token?: string): void {
    this.send({ t: 'join', v: PROTOCOL_VERSION, code, team, token, ...noStats() });
  }

  /** Report the player in this slot. */
  report(idx: number, reason: string): void {
    this.send({ t: 'report', idx, reason });
  }

  /**
   * The connection has gone quiet (it can look open for a minute after the
   * signal goes): drop it now and let onDrop reconnect.
   */
  drop(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    ws.onclose = null;
    ws.onmessage = null;
    ws.close();
    if (!this.closing) this.onDrop?.();
  }

  close(): void {
    this.closing = true;
    this.send({ t: 'leave' });
    this.ws?.close();
    this.ws = null;
  }
}
