import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from '@colyseus/sdk';
import {
  ARCHIVE_ROOM,
  COMBAT,
  DEFAULT_APPEARANCE,
  MSG,
  type DeathMessage,
  type HitMessage,
  type InventoryItem,
  type LootBag,
  type RespawnMessage,
  type WelcomeMessage,
} from '@the-world/shared';
import { AccountStore } from '../accounts/AccountStore';
import { connect } from '../db/connect';
import type { Sql } from '../db/sql';
import { ArchiveRoom } from './ArchiveRoom';

const PORT = 26670 + Math.floor(Math.random() * 1000);
let server: Server;
let sql: Sql;
let store: AccountStore;

beforeAll(async () => {
  sql = await connect({ dataDir: null });
  store = new AccountStore(sql);
  ArchiveRoom.accounts = store;
  server = new Server({ transport: new WebSocketTransport() });
  server.define(ARCHIVE_ROOM, ArchiveRoom).filterBy(['cell']);
  await server.listen(PORT);
}, 30_000);

afterAll(async () => {
  ArchiveRoom.accounts = null;
  await server.gracefullyShutdown(false);
  await sql.close();
});

function next<T>(room: Room, type: string, test: (m: T) => boolean = () => true, ms = 4000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
    const off = room.onMessage(type, (m: T) => {
      if (!test(m)) return;
      clearTimeout(timer);
      off();
      resolve(m);
    });
  });
}

/** A signed-in player (fresh account with the starter kit) in its own cell, to keep tests apart. */
async function fighter(name: string, cell: string) {
  const token = await store.createLoginToken(`${name.toLowerCase()}-${cell}@example.com`);
  const login = await store.verifyLogin(token);
  const room = await new Client(`ws://localhost:${PORT}`).joinOrCreate(ARCHIVE_ROOM, {
    appearance: { ...DEFAULT_APPEARANCE, name },
    cell,
    session: login!.session,
  });
  const welcome = await next<WelcomeMessage>(room, MSG.welcome);
  return { room, id: welcome.you, playerId: login!.me.playerId };
}

const forward = { x: 0, y: 0, z: -1 };
const attack = (room: Room, kind: 'melee' | 'ranged', dir = forward) =>
  room.send(MSG.attack, { kind, dir, origin: { x: 0, y: 0, z: 22 }, seenAt: Date.now() });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('PvP', () => {
  it('melee kills, drops half the carried items as loot, the killer picks it up, the victim respawns', async () => {
    const a = await fighter('Ares', 'pvp-1');
    const b = await fighter('Bia', 'pvp-1');
    b.room.send(MSG.teleport, { x: 0, y: 0, z: 20.6 }); // 1.4 m in front of A at the spawn
    await sleep(100);

    const hits = Math.ceil(COMBAT.maxHealth / COMBAT.melee.damage);
    const died = next<DeathMessage>(a.room, MSG.died, undefined, hits * 1000 + 4000);
    const bInventory = next<InventoryItem[]>(b.room, MSG.inventory, undefined, hits * 1000 + 4000);
    let last: HitMessage | null = null;
    for (let i = 0; i < hits; i++) {
      const hit = next<HitMessage>(a.room, MSG.hit);
      attack(a.room, 'melee');
      last = await hit;
      expect(last.target).toBe(b.id);
      await sleep(COMBAT.melee.cooldownMs + 20);
    }
    expect(last?.health).toBe(0);

    const death = await died;
    expect(death).toMatchObject({ id: b.id, by: a.id, byName: 'Ares' });
    // Starter kit: two carried items, so one drops; the equipped club never does.
    expect(death.loot?.items).toHaveLength(1);
    expect((await bInventory).map((i) => i.name)).toContain('Driftwood club');
    expect(await bInventory).toHaveLength(2);

    // Dead players can't attack.
    const noHit = next<HitMessage>(a.room, MSG.hit, undefined, 800).catch(() => null);
    attack(b.room, 'melee', { x: 0, y: 0, z: 1 });
    expect(await noHit).toBeNull();

    const aInventory = next<InventoryItem[]>(a.room, MSG.inventory);
    const bags = next<LootBag[]>(a.room, MSG.loot, (l) => l.length === 0);
    a.room.send(MSG.pickup, { id: death.loot!.id });
    expect(await aInventory).toHaveLength(4);
    expect(await bags).toEqual([]);

    const back = await next<RespawnMessage>(
      a.room,
      MSG.respawned,
      undefined,
      COMBAT.respawnSeconds * 1000 + 2000,
    );
    expect(back).toMatchObject({ id: b.id, health: COMBAT.maxHealth, placement: 1 });

    // A move B sent before hearing about the respawn (old placement, old spot) is ignored, not
    // treated as a too-fast move that drags B away from the spawn.
    const noCorrection = next(b.room, MSG.correction, undefined, 600).catch(() => null);
    const stale = { x: 0, y: 0, z: 20.6, facing: 0, speed: 0, grounded: true, vy: 0 };
    b.room.send(MSG.move, { ...stale, z: 12, placement: 0 });
    expect(await noCorrection).toBeNull();
    // Moves with the new placement are checked as usual.
    const corrected = next(b.room, MSG.correction);
    b.room.send(MSG.move, { ...stale, z: 12, placement: 1 });
    expect(await corrected).toBeTruthy();

    await a.room.leave();
    await b.room.leave();
  }, 30_000);

  it('ranged hits the first body along the aim, and dodging makes you briefly untouchable', async () => {
    const a = await fighter('Artemis', 'pvp-2');
    const b = await fighter('Brontes', 'pvp-2');
    b.room.send(MSG.teleport, { x: 0, y: 0, z: 10 });
    await sleep(100);

    const hit = next<HitMessage>(a.room, MSG.hit);
    attack(a.room, 'ranged');
    expect(await hit).toMatchObject({ target: b.id, kind: 'ranged', damage: COMBAT.ranged.damage });

    // Off to the side: a miss.
    await sleep(COMBAT.ranged.cooldownMs + 20);
    const miss = next<HitMessage>(a.room, MSG.hit, undefined, 600).catch(() => null);
    attack(a.room, 'ranged', { x: 0.6, y: 0, z: -0.8 });
    expect(await miss).toBeNull();

    // Dodge, then get shot during the invulnerable window: no damage.
    await sleep(COMBAT.ranged.cooldownMs + 20);
    b.room.send(MSG.dodge);
    await sleep(30);
    const dodged = next<HitMessage>(a.room, MSG.hit, undefined, 600).catch(() => null);
    attack(a.room, 'ranged');
    expect(await dodged).toBeNull();

    await a.room.leave();
    await b.room.leave();
  }, 20_000);

  it('hits where the attacker saw the target (lag compensation), within limits', async () => {
    const a = await fighter('Apollo', 'pvp-3');
    const b = await fighter('Boreas', 'pvp-3');
    b.room.send(MSG.teleport, { x: 0, y: 0, z: 20.6 });
    await sleep(100);
    // Clients send their position every tick, so the server has a sample from standing still.
    const still = { x: 0, y: 0, z: 20.6, facing: 0, speed: 0, grounded: true, vy: 0 };
    b.room.send(MSG.move, still);
    await sleep(50);
    const seenAt = Date.now();
    b.room.send(MSG.move, still);
    await sleep(20);
    // B steps out of reach; A swings at where B was 100 ms ago, as seen on A's screen.
    b.room.send(MSG.move, { x: 0, y: 0, z: 16, facing: 0, speed: 5, grounded: true, vy: 0 });
    await sleep(100);
    const hit = next<HitMessage>(a.room, MSG.hit);
    a.room.send(MSG.attack, { kind: 'melee', dir: forward, origin: { x: 0, y: 0, z: 22 }, seenAt });
    expect((await hit).target).toBe(b.id);

    await a.room.leave();
    await b.room.leave();
  }, 20_000);
});
