import { Room, logger, type Client } from '@colyseus/core';

/**
 * The Archive hub room. Empty for now: players will be synced here in Phase 2 (#12).
 */
export class ArchiveRoom extends Room {
  override maxClients = 100;

  override onCreate(): void {
    logger.info(`Archive room ${this.roomId} created`);
  }

  override onJoin(client: Client): void {
    logger.info(`${client.sessionId} joined the Archive`);
  }

  override onLeave(client: Client): void {
    logger.info(`${client.sessionId} left the Archive`);
  }
}
