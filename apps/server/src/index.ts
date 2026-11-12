import { Server, logger } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ARCHIVE_ROOM, GAME_TITLE } from '@the-world/shared';
import { AccountStore } from './accounts/AccountStore';
import { accountRoutes } from './accounts/routes';
import { resolvePort } from './config';
import { connect } from './db/connect';
import { health } from './health';
import { ArchiveRoom } from './rooms/ArchiveRoom';

const port = resolvePort(process.env.PORT);
const startedAt = Date.now();
const production = process.env.NODE_ENV === 'production';

// Postgres at DATABASE_URL (e.g. Neon) when set; otherwise an embedded Postgres in .data/.
const sql = await connect({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.DATA_DIR ?? '.data/pglite',
});
const accounts = new AccountStore(sql);
ArchiveRoom.accounts = accounts;

const server = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    // Plain HTTP health check for local tooling, tests and (later) the host's load balancer.
    app.get('/health', (_req, res) => {
      res.json(health(startedAt, Date.now()));
    });
    accountRoutes(app, {
      store: accounts,
      clientUrl: process.env.CLIENT_URL,
      exposeDevLinks: !production,
    });
  },
});
// One room per Archive cell; clients pass { cell } and land in that cell's room.
server.define(ARCHIVE_ROOM, ArchiveRoom).filterBy(['cell']);

await server.listen(port);
logger.info(`${GAME_TITLE} server listening on ws://localhost:${port} (health: /health)`);
