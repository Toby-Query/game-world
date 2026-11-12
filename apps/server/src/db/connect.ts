import { mkdirSync } from 'node:fs';
import { logger } from '@colyseus/core';
import { SCHEMA } from './schema';
import type { Sql } from './sql';

/**
 * Opens the database: Postgres at `DATABASE_URL` when set (e.g. Neon), otherwise an embedded
 * Postgres (PGlite) stored in `dataDir`, or in memory when `dataDir` is null (tests).
 */
export async function connect(options: {
  databaseUrl?: string | undefined;
  dataDir: string | null;
}): Promise<Sql> {
  const sql = options.databaseUrl
    ? await connectPostgres(options.databaseUrl)
    : await connectPglite(options.dataDir);
  await sql.query(SCHEMA);
  return sql;
}

async function connectPglite(dataDir: string | null): Promise<Sql> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  logger.info(`Database: embedded Postgres (${dataDir ?? 'in memory'})`);

  type Queryable = Pick<PGliteInstance, 'query' | 'exec'>;
  type PGliteInstance = InstanceType<typeof PGlite>;
  const wrap = (q: Queryable): Sql => ({
    // Parameterless multi-statement text (the schema) goes through exec.
    query: async <T>(text: string, params?: unknown[]) => {
      if (params === undefined && text.includes(';')) {
        const results = await q.exec(text);
        return { rows: (results.at(-1)?.rows ?? []) as T[] };
      }
      const result = await q.query<T>(text, params);
      return { rows: result.rows };
    },
    // Nested transactions run inside the outer one.
    transaction: (fn) => fn(wrap(q)),
    close: async () => {},
  });

  return {
    ...wrap(db),
    transaction: (fn) => db.transaction((tx) => fn(wrap(tx))),
    close: () => db.close(),
  };
}

async function connectPostgres(url: string): Promise<Sql> {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  logger.info('Database: Postgres (DATABASE_URL)');
  return {
    query: async <T>(text: string, params?: unknown[]) =>
      (await pool.query(text, params)) as unknown as { rows: T[] },
    transaction: async (fn) => {
      const client = await pool.connect();
      const tx: Sql = {
        query: async <T>(text: string, params?: unknown[]) =>
          (await client.query(text, params)) as unknown as { rows: T[] },
        transaction: (inner) => inner(tx),
        close: async () => {},
      };
      try {
        await client.query('begin');
        const result = await fn(tx);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
