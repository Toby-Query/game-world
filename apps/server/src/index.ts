import { Server, logger } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ARCHIVE_ROOM, GAME_TITLE } from '@the-world/shared';
import { resolvePort } from './config';
import { ArchiveRoom } from './rooms/ArchiveRoom';

const port = resolvePort(process.env.PORT);

const server = new Server({ transport: new WebSocketTransport() });
server.define(ARCHIVE_ROOM, ArchiveRoom);

await server.listen(port);
logger.info(`${GAME_TITLE} server listening on ws://localhost:${port}`);
