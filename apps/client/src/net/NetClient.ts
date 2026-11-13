import { Client, type Room } from '@colyseus/sdk';
import {
  ARCHIVE_ROOM,
  MSG,
  cellFor,
  type ChatMessage,
  type JoinOptions,
  type PlayerProfile,
  type SnapshotMessage,
  type Vec3,
  type WelcomeMessage,
} from '@the-world/shared';
import { reconnectDelay } from './serverUrl';

export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface NetHandlers {
  welcome(message: WelcomeMessage): void;
  joined(profile: PlayerProfile): void;
  left(id: string): void;
  snapshot(message: SnapshotMessage): void;
  correction(position: Vec3): void;
  chat(message: ChatMessage): void;
  notice(text: string): void;
  status(status: NetStatus): void;
}

/**
 * Connection to the game server. Joins the Archive cell room, keeps the connection alive (the SDK
 * resumes a dropped session; if that fails we join again with backoff) and routes messages.
 */
export class NetClient {
  private readonly client: Client;
  private room: Room | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  status: NetStatus = 'connecting';
  you: string | null = null;
  /** The server's placement number for us, echoed in every move (see MoveMessage). */
  placement = 0;
  private readonly listeners = new Map<string, ((message: never) => void)[]>();

  constructor(
    url: string,
    private readonly join: Omit<JoinOptions, 'cell'>,
    private readonly handlers: NetHandlers,
  ) {
    this.client = new Client(url);
  }

  async connect(): Promise<void> {
    if (this.closed) return;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    try {
      const options: JoinOptions = { ...this.join, cell: cellFor(0, 0) };
      const room = await this.client.joinOrCreate(ARCHIVE_ROOM, options);
      this.attach(room);
      this.attempt = 0;
    } catch {
      this.scheduleRetry();
    }
  }

  /** Listens for a message type on the current and any future room (survives rejoins). */
  on<T>(type: string, listener: (message: T) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener as (message: never) => void);
    this.listeners.set(type, list);
    this.room?.onMessage(type, listener);
  }

  send(type: string, message?: unknown): void {
    if (this.status === 'online') this.room?.send(type, message);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.retryTimer);
    void this.room?.leave();
  }

  private attach(room: Room): void {
    this.room = room;
    room.onMessage(MSG.welcome, (m: WelcomeMessage) => {
      this.you = m.you;
      this.placement = 0;
      this.handlers.welcome(m);
      this.setStatus('online');
    });
    room.onMessage(MSG.joined, (m: PlayerProfile) => this.handlers.joined(m));
    room.onMessage(MSG.left, (m: { id: string }) => this.handlers.left(m.id));
    room.onMessage(MSG.snapshot, (m: SnapshotMessage) => this.handlers.snapshot(m));
    room.onMessage(MSG.correction, (m: Vec3) => this.handlers.correction(m));
    room.onMessage(MSG.chatMessage, (m: ChatMessage) => this.handlers.chat(m));
    room.onMessage(MSG.chatNotice, (m: { text: string }) => this.handlers.notice(m.text));
    for (const [type, list] of this.listeners) {
      for (const listener of list) room.onMessage(type, listener);
    }
    // The SDK tries to resume the same session first; `onLeave` means that gave up.
    room.onDrop(() => this.setStatus('reconnecting'));
    room.onReconnect(() => this.setStatus('online'));
    room.onLeave(() => {
      if (this.room !== room) return;
      this.room = null;
      if (!this.closed) this.scheduleRetry();
    });
  }

  private scheduleRetry(): void {
    this.setStatus('offline');
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.connect(), reconnectDelay(this.attempt));
    this.attempt++;
  }

  private setStatus(status: NetStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.handlers.status(status);
  }
}
