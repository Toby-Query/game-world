import { Server, logger } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ARCHIVE_ROOM, GAME_TITLE } from '@the-world/shared';
import { resolvePort } from './config';
import { health } from './health';
import { ArchiveRoom } from './rooms/ArchiveRoom';

const port = resolvePort(process.env.PORT);
const startedAt = Date.now();

const server = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    // Plain HTTP health check for local tooling, tests and (later) the host's load balancer.
    app.get('/health', (_req: unknown, res: { json(body: unknown): void }) => {
      res.json(health(startedAt, Date.now()));
    });
  },
});
// One room per Archive cell; clients pass { cell } and land in that cell's room.
server.define(ARCHIVE_ROOM, ArchiveRoom).filterBy(['cell']);

await server.listen(port);
logger.info(`${GAME_TITLE} server listening on ws://localhost:${port} (health: /health)`);
