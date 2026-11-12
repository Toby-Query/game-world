import { Room, logger, type Client } from '@colyseus/core';
import {
  MSG,
  NET,
  checkMove,
  parsePose,
  playersNear,
  sanitizeJoinOptions,
  type Appearance,
  type PlayerProfile,
  type PlayerSnapshot,
  type Pose,
  type SnapshotMessage,
  type Vec3,
  type WelcomeMessage,
} from '@the-world/shared';
import type { AccountStore } from '../accounts/AccountStore';

/** Feet position new players start at: the Archive spawn on the plaza. */
export const ARCHIVE_SPAWN: Vec3 = { x: 0, y: 0, z: 22 };

interface ServerPlayer extends Pose {
  id: string;
  /** Account id when signed in; guests have none and nothing of theirs is saved. */
  playerId: string | null;
  name: string;
  appearance: Appearance;
  /** Server time (ms) of the last accepted move. */
  lastMoveAt: number;
}

export interface ArchiveRoomOptions {
  /** Allow the debug teleport message (tests, local development). */
  allowTeleport?: boolean;
}

/**
 * One Archive cell. The server owns positions: clients send their pose, the server checks the move
 * is physically possible, and every tick each client receives only the players near them.
 */
export class ArchiveRoom extends Room {
  /** Accounts, when the server has a database (set at startup). */
  static accounts: AccountStore | null = null;

  override maxClients = 100;
  // Seconds a reserved seat waits for the client to connect; generous for slow machines.
  override seatReservationTimeout = 60;
  readonly players = new Map<string, ServerPlayer>();
  private allowTeleport = false;

  override onCreate(options: ArchiveRoomOptions = {}): void {
    this.allowTeleport = options.allowTeleport ?? process.env.NODE_ENV !== 'production';
    this.setPatchRate(null);
    this.setSimulationInterval(() => this.broadcastSnapshots(), 1000 / NET.tickRate);

    this.onMessage(MSG.move, (client, message: unknown) => this.onMove(client, message));
    this.onMessage(MSG.respawn, (client) => this.place(client, ARCHIVE_SPAWN));
    this.onMessage(MSG.teleport, (client, message: unknown) => {
      if (!this.allowTeleport) return;
      const pose = parsePose({ facing: 0, ...(message as object) });
      if (pose) this.place(client, pose);
    });
    logger.info(`Archive room ${this.roomId} created`);
  }

  override async onJoin(client: Client, options: unknown): Promise<void> {
    let { name, appearance } = sanitizeJoinOptions(options);
    // Signed-in players appear as their saved character, whatever the client sent.
    const session = (options as { session?: unknown } | null)?.session;
    const accounts = ArchiveRoom.accounts;
    const playerId =
      accounts && typeof session === 'string' ? await accounts.playerForSession(session) : null;
    if (accounts && playerId) {
      const me = await accounts.me(playerId);
      if (me?.character) ({ name, appearance } = sanitizeJoinOptions({ appearance: me.character }));
    }
    const player: ServerPlayer = {
      id: client.sessionId,
      playerId,
      name,
      appearance,
      ...ARCHIVE_SPAWN,
      facing: 0,
      speed: 0,
      grounded: true,
      vy: 0,
      lastMoveAt: Date.now(),
    };
    this.players.set(client.sessionId, player);
    const welcome: WelcomeMessage = {
      you: client.sessionId,
      players: [...this.players.values()].map(profile),
      spawn: ARCHIVE_SPAWN,
    };
    client.send(MSG.welcome, welcome);
    this.broadcast(MSG.joined, profile(player), { except: client });
    logger.info(`${name} (${client.sessionId}) joined the Archive`);
  }

  override async onLeave(client: Client, code?: number): Promise<void> {
    const consented = code === 1000 || code === 4000;
    if (!consented) {
      try {
        // Hold the slot so a dropped connection can come back as the same player.
        await this.allowReconnection(client, NET.reconnectSeconds);
        logger.info(`${client.sessionId} reconnected`);
        const player = this.players.get(client.sessionId);
        if (player) player.lastMoveAt = Date.now();
        return;
      } catch {
        // Timed out: fall through and remove them.
      }
    }
    this.players.delete(client.sessionId);
    this.broadcast(MSG.left, { id: client.sessionId });
    logger.info(`${client.sessionId} left the Archive`);
  }

  private onMove(client: Client, message: unknown): void {
    const player = this.players.get(client.sessionId);
    const pose = parsePose(message);
    if (!player || !pose) return;
    const now = Date.now();
    const result = checkMove(player, pose, (now - player.lastMoveAt) / 1000);
    Object.assign(player, pose, result.position, { lastMoveAt: now });
    if (!result.ok) client.send(MSG.correction, result.position);
  }

  /** Server-side move without speed checks (spawn, respawn, debug teleport). */
  private place(client: Client, at: Vec3): void {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    Object.assign(player, { x: at.x, y: at.y, z: at.z, vy: 0, lastMoveAt: Date.now() });
  }

  private broadcastSnapshots(): void {
    const t = Date.now();
    const all = [...this.players.values()];
    for (const client of this.clients) {
      const self = this.players.get(client.sessionId);
      if (!self) continue;
      const message: SnapshotMessage = { t, players: playersNear(all, self).map(snapshot) };
      client.send(MSG.snapshot, message);
    }
  }
}

function profile(p: ServerPlayer): PlayerProfile {
  return { id: p.id, name: p.name, appearance: p.appearance };
}

function snapshot(p: ServerPlayer): PlayerSnapshot {
  return {
    id: p.id,
    x: round(p.x),
    y: round(p.y),
    z: round(p.z),
    facing: round(p.facing),
    speed: round(p.speed),
    grounded: p.grounded,
    vy: round(p.vy),
  };
}

const round = (n: number): number => Math.round(n * 100) / 100;
