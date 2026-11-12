import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, INVENTORY_SLOTS, SEED_MONEY } from '@the-world/shared';
import { connect } from '../db/connect';
import type { Sql } from '../db/sql';
import { AccountStore, InsufficientFunds } from './AccountStore';

let sql: Sql;
let store: AccountStore;

beforeAll(async () => {
  sql = await connect({ dataDir: null });
  store = new AccountStore(sql);
}, 30_000);

afterAll(async () => {
  await sql.close();
});

async function signIn(email: string) {
  const token = await store.createLoginToken(email);
  const result = await store.verifyLogin(token);
  if (!result) throw new Error('sign-in failed');
  return result;
}

describe('AccountStore', () => {
  it('creates a player with seed money on first sign-in, recorded in the ledger', async () => {
    const { me } = await signIn('ayo@example.com');
    expect(me.balance).toBe(SEED_MONEY);
    expect(me.character).toBeNull();
    expect(me.slots).toBe(INVENTORY_SLOTS);
    expect(await store.ledger(me.playerId)).toEqual([
      { amount: SEED_MONEY, balanceAfter: SEED_MONEY, reason: 'seed money' },
    ]);
  });

  it('signs the same email into the same player, without a second seed', async () => {
    const first = await signIn('bea@example.com');
    await store.saveCharacter(first.me.playerId, { ...DEFAULT_APPEARANCE, name: 'Bea' });
    const second = await signIn('bea@example.com');
    expect(second.me.playerId).toBe(first.me.playerId);
    expect(second.me.character?.name).toBe('Bea');
    expect(second.me.balance).toBe(SEED_MONEY);
    expect(second.session).not.toBe(first.session);
    expect(await store.playerForSession(second.session)).toBe(first.me.playerId);
  });

  it('accepts a sign-in link only once and only before it expires', async () => {
    const token = await store.createLoginToken('cy@example.com');
    expect(await store.verifyLogin(token)).not.toBeNull();
    expect(await store.verifyLogin(token)).toBeNull();

    const old = await store.createLoginToken('cy@example.com', new Date(Date.now() - 3_600_000));
    expect(await store.verifyLogin(old)).toBeNull();
    expect(await store.verifyLogin('not-a-token')).toBeNull();
  });

  it('never lets a balance go below zero and logs every movement', async () => {
    const { me } = await signIn('dee@example.com');
    expect(await store.adjustBalance(me.playerId, -40, 'bought rope')).toBe(SEED_MONEY - 40);
    await expect(store.adjustBalance(me.playerId, -1000, 'yacht')).rejects.toBeInstanceOf(
      InsufficientFunds,
    );
    expect(await store.balance(me.playerId)).toBe(SEED_MONEY - 40);
    const ledger = await store.ledger(me.playerId);
    expect(ledger.map((l) => l.reason)).toEqual(['seed money', 'bought rope']);
  });

  it('caps the inventory at the slot limit and reuses freed slots', async () => {
    const { me } = await signIn('eve@example.com');
    const items = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      items.push(await store.addItem(me.playerId, { kind: 'shell', name: `Shell ${i}` }));
    }
    expect(items.every(Boolean)).toBe(true);
    expect(await store.addItem(me.playerId, { kind: 'shell', name: 'One too many' })).toBeNull();

    expect(await store.removeItem(me.playerId, items[3]!.id)).toBe(true);
    const again = await store.addItem(me.playerId, { kind: 'pearl', name: 'Pearl' });
    expect(again?.slot).toBe(3);
  });

  it('ends sessions', async () => {
    const { session } = await signIn('fin@example.com');
    await store.endSession(session);
    expect(await store.playerForSession(session)).toBeNull();
  });
});
