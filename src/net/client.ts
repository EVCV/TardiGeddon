// Browser connection to the online game server.

import { PROTOCOL_VERSION, type ClientMsg, type LobbyTeam, type ServerMsg } from './protocol';

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

export class NetClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  /** Called when the connection drops unexpectedly. */
  onDrop: (() => void) | null = null;
  private closing = false;

  constructor(private url: string) {}

  connect(): Promise<void> {
    this.closing = false;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Could not reach the game server.'));
      ws.onmessage = (e) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(e.data)) as ServerMsg;
        } catch {
          return;
        }
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
    this.send({ t: 'create', v: PROTOCOL_VERSION, team });
  }

  join(code: string, team: LobbyTeam, token?: string): void {
    this.send({ t: 'join', v: PROTOCOL_VERSION, code, team, token });
  }

  close(): void {
    this.closing = true;
    this.send({ t: 'leave' });
    this.ws?.close();
    this.ws = null;
  }
}
