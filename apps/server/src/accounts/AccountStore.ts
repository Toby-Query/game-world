import { createHash, randomBytes } from 'node:crypto';
import {
  INVENTORY_SLOTS,
  LOGIN_LINK_MINUTES,
  SEED_MONEY,
  SESSION_DAYS,
  firstFreeSlot,
  sanitizeAppearance,
  type Appearance,
  type InventoryItem,
  type Me,
} from '@the-world/shared';
import type { Sql } from '../db/sql';

export class InsufficientFunds extends Error {
  constructor() {
    super('Not enough money');
  }
}

/** Tokens are random and only their hashes are stored, so a database leak can't sign anyone in. */
const newToken = (): string => randomBytes(32).toString('base64url');
const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Accounts, characters, wallets, inventories and the money ledger. Only the server calls this;
 * clients never write money or items directly.
 */
export class AccountStore {
  constructor(private readonly sql: Sql) {}

  /** Starts a magic-link sign-in; returns the token to put in the link. */
  async createLoginToken(email: string, now = new Date()): Promise<string> {
    const token = newToken();
    const expires = new Date(now.getTime() + LOGIN_LINK_MINUTES * 60_000);
    await this.sql.query(
      'insert into login_tokens (token_hash, email, expires_at) values ($1, $2, $3)',
      [hash(token), email, expires],
    );
    return token;
  }

  /**
   * Exchanges a sign-in token (once, before it expires) for a session. A first sign-in creates the
   * player with their seed money.
   */
  async verifyLogin(token: string, now = new Date()): Promise<{ session: string; me: Me } | null> {
    const playerId = await this.sql.transaction(async (tx) => {
      const { rows } = await tx.query<{ email: string }>(
        `update login_tokens set used_at = $2
         where token_hash = $1 and used_at is null and expires_at > $2
         returning email`,
        [hash(token), now],
      );
      const email = rows[0]?.email;
      if (!email) return null;
      return this.findOrCreatePlayer(tx, email);
    });
    if (!playerId) return null;
    const session = newToken();
    const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
    await this.sql.query(
      'insert into sessions (token_hash, player_id, expires_at) values ($1, $2, $3)',
      [hash(session), playerId, expires],
    );
    const me = await this.me(playerId);
    return me ? { session, me } : null;
  }

  async playerForSession(session: string, now = new Date()): Promise<string | null> {
    const { rows } = await this.sql.query<{ player_id: string }>(
      'select player_id from sessions where token_hash = $1 and expires_at > $2',
      [hash(session), now],
    );
    return rows[0]?.player_id ?? null;
  }

  async endSession(session: string): Promise<void> {
    await this.sql.query('delete from sessions where token_hash = $1', [hash(session)]);
  }

  async me(playerId: string): Promise<Me | null> {
    const { rows } = await this.sql.query<{
      email: string;
      appearance: unknown;
      balance: string | number | null;
    }>(
      `select p.email, c.appearance, w.balance
       from players p
       left join characters c on c.player_id = p.id
       left join wallets w on w.player_id = p.id
       where p.id = $1`,
      [playerId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      playerId,
      email: row.email,
      character: row.appearance ? sanitizeAppearance(row.appearance) : null,
      balance: Number(row.balance ?? 0),
      inventory: await this.inventory(playerId),
      slots: INVENTORY_SLOTS,
    };
  }

  async saveCharacter(playerId: string, appearance: Appearance): Promise<void> {
    await this.sql.query(
      `insert into characters (player_id, appearance) values ($1, $2)
       on conflict (player_id) do update set appearance = excluded.appearance, updated_at = now()`,
      [playerId, JSON.stringify(sanitizeAppearance(appearance))],
    );
  }

  async balance(playerId: string): Promise<number> {
    const { rows } = await this.sql.query<{ balance: string | number }>(
      'select balance from wallets where player_id = $1',
      [playerId],
    );
    return Number(rows[0]?.balance ?? 0);
  }

  /**
   * Moves money in (positive) or out (negative) of a wallet and records it in the ledger, in one
   * transaction. Throws InsufficientFunds rather than going below zero.
   */
  async adjustBalance(playerId: string, amount: number, reason: string, tx: Sql = this.sql) {
    if (!Number.isSafeInteger(amount) || amount === 0)
      throw new Error('Amount must be a whole number');
    return tx.transaction(async (t) => {
      const { rows } = await t.query<{ balance: string | number }>(
        'select balance from wallets where player_id = $1 for update',
        [playerId],
      );
      if (!rows[0]) throw new Error('No wallet');
      const next = Number(rows[0].balance) + amount;
      if (next < 0) throw new InsufficientFunds();
      await t.query('update wallets set balance = $2 where player_id = $1', [playerId, next]);
      await t.query(
        'insert into ledger (player_id, amount, balance_after, reason) values ($1, $2, $3, $4)',
        [playerId, amount, next, reason],
      );
      return next;
    });
  }

  async ledger(
    playerId: string,
  ): Promise<{ amount: number; balanceAfter: number; reason: string }[]> {
    const { rows } = await this.sql.query<{
      amount: string | number;
      balance_after: string | number;
      reason: string;
    }>('select amount, balance_after, reason from ledger where player_id = $1 order by id', [
      playerId,
    ]);
    return rows.map((r) => ({
      amount: Number(r.amount),
      balanceAfter: Number(r.balance_after),
      reason: r.reason,
    }));
  }

  async inventory(playerId: string): Promise<InventoryItem[]> {
    const { rows } = await this.sql.query<InventoryItem>(
      'select id, slot, kind, name, equipped from inventory where player_id = $1 order by slot',
      [playerId],
    );
    return rows;
  }

  /** Puts an item in the first free slot; returns null when the bag is full. */
  async addItem(
    playerId: string,
    item: { kind: string; name: string; equipped?: boolean },
  ): Promise<InventoryItem | null> {
    return this.sql.transaction(async (tx) => {
      // Lock the wallet row as a per-player mutex so two adds can't take the same slot.
      await tx.query('select 1 from wallets where player_id = $1 for update', [playerId]);
      const used = await tx.query<{ slot: number }>(
        'select slot from inventory where player_id = $1',
        [playerId],
      );
      const slot = firstFreeSlot(used.rows.map((r) => r.slot));
      if (slot === null) return null;
      const { rows } = await tx.query<InventoryItem>(
        `insert into inventory (player_id, slot, kind, name, equipped) values ($1, $2, $3, $4, $5)
         returning id, slot, kind, name, equipped`,
        [playerId, slot, item.kind, item.name, item.equipped ?? false],
      );
      return rows[0] ?? null;
    });
  }

  async removeItem(playerId: string, itemId: string): Promise<boolean> {
    const { rows } = await this.sql.query(
      'delete from inventory where player_id = $1 and id = $2 returning id',
      [playerId, itemId],
    );
    return rows.length > 0;
  }

  private async findOrCreatePlayer(tx: Sql, email: string): Promise<string> {
    const existing = await tx.query<{ id: string }>('select id from players where email = $1', [
      email,
    ]);
    if (existing.rows[0]) return existing.rows[0].id;
    const { rows } = await tx.query<{ id: string }>(
      'insert into players (email) values ($1) returning id',
      [email],
    );
    const id = rows[0]!.id;
    await tx.query('insert into wallets (player_id, balance) values ($1, 0)', [id]);
    await this.adjustBalance(id, SEED_MONEY, 'seed money', tx);
    return id;
  }
}
