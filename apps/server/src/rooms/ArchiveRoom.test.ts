import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import {
  ARCHIVE_ROOM,
  DEFAULT_APPEARANCE,
  MSG,
  type SnapshotMessage,
  type Vec3,
  type WelcomeMessage,
} from '@the-world/shared';
import { ArchiveRoom } from './ArchiveRoom';

const PORT = 25670 + Math.floor(Math.random() * 1000);
let server: Server;

beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport() });
  server.define(ARCHIVE_ROOM, ArchiveRoom).filterBy(['cell']);
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

async function join(name: string, cell = '0:0'): Promise<{ room: Room; welcome: WelcomeMessage }> {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate(ARCHIVE_ROOM, {
    appearance: { ...DEFAULT_APPEARANCE, name },
    cell,
  });
  const welcome = await next<WelcomeMessage>(room, MSG.welcome);
  return { room, welcome };
}

function next<T>(room: Room, type: string, test: (m: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type}`)), 4000);
    const off = room.onMessage(type, (m: T) => {
      if (!test(m)) return;
      clearTimeout(timer);
      off();
      resolve(m);
    });
  });
}

const pose = (p: Vec3) => ({ ...p, facing: 0, speed: 3, grounded: true, vy: 0 });

describe('ArchiveRoom', () => {
  it('shows each player to the other and relays movement', async () => {
    const a = await join('Ayo');
    const b = await join('Bea');
    expect(b.welcome.players.map((p) => p.name).sort()).toEqual(['Ayo', 'Bea']);

    a.room.send(MSG.move, pose({ x: 0.5, y: 0, z: 22 }));
    const seen = await next<SnapshotMessage>(b.room, MSG.snapshot, (s) =>
      s.players.some((p) => p.id === a.welcome.you && p.x === 0.5),
    );
    expect(seen.players.find((p) => p.id === b.welcome.you)).toBeUndefined();

    await a.room.leave();
    await b.room.leave();
  });

  it('corrects impossible moves', async () => {
    const a = await join('Speedy');
    a.room.send(MSG.move, pose({ x: 300, y: 0, z: 22 }));
    const fix = await next<Vec3>(a.room, MSG.correction);
    expect(fix.x).toBeLessThan(10);
    await a.room.leave();
  });

  it('only sends players inside the interest radius', async () => {
    const a = await join('Near');
    const b = await join('Far');
    b.room.send(MSG.teleport, { x: 400, y: 0, z: 22 });
    await new Promise((r) => setTimeout(r, 200));
    const snap = await next<SnapshotMessage>(a.room, MSG.snapshot);
    expect(snap.players.some((p) => p.id === b.welcome.you)).toBe(false);
    await a.room.leave();
    await b.room.leave();
  });

  it('keeps different cells in different rooms', async () => {
    const a = await join('Here', '0:0');
    const b = await join('There', '1:0');
    expect(a.room.roomId).not.toBe(b.room.roomId);
    await a.room.leave();
    await b.room.leave();
  });
});
