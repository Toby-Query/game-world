import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import {
  API,
  DEFAULT_APPEARANCE,
  SEED_MONEY,
  type AuthStartResponse,
  type AuthVerifyResponse,
  type Me,
} from '@the-world/shared';
import { connect } from '../db/connect';
import type { Sql } from '../db/sql';
import { AccountStore } from './AccountStore';
import { accountRoutes } from './routes';

let sql: Sql;
let http: Server;
let base: string;

beforeAll(async () => {
  sql = await connect({ dataDir: null });
  const app = express();
  accountRoutes(app, {
    store: new AccountStore(sql),
    exposeDevLinks: true,
    clientUrl: 'http://game.test',
  });
  await new Promise<void>((resolve) => {
    http = app.listen(0, () => resolve());
  });
  const address = http.address();
  base = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
}, 30_000);

afterAll(async () => {
  http.close();
  await sql.close();
});

const post = (path: string, body: unknown, session?: string, method = 'POST') =>
  fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(session ? { authorization: `Bearer ${session}` } : {}),
    },
    body: JSON.stringify(body),
  });

async function signIn(email: string): Promise<AuthVerifyResponse> {
  const start = (await (await post(API.authStart, { email })).json()) as AuthStartResponse;
  expect(start.devLink).toMatch(/^http:\/\/game\.test\/\?login=/);
  const token = new URL(start.devLink!).searchParams.get('login');
  return (await (await post(API.authVerify, { token })).json()) as AuthVerifyResponse;
}

describe('account routes', () => {
  it('signs in by link, saves the character, and shows the same account on another sign-in', async () => {
    const first = await signIn('Gus@Example.com');
    expect(first.me.email).toBe('gus@example.com');
    expect(first.me.balance).toBe(SEED_MONEY);

    const saved = (await (
      await post(
        API.character,
        { appearance: { ...DEFAULT_APPEARANCE, name: 'Gus' } },
        first.session,
        'PUT',
      )
    ).json()) as Me;
    expect(saved.character?.name).toBe('Gus');

    // "Another browser": a fresh link for the same email.
    const second = await signIn('gus@example.com');
    const me = (await (
      await fetch(base + API.me, { headers: { authorization: `Bearer ${second.session}` } })
    ).json()) as Me;
    expect(me.playerId).toBe(first.me.playerId);
    expect(me.character?.name).toBe('Gus');
    expect(me.balance).toBe(SEED_MONEY);
  });

  it('rejects bad emails, reused links and missing sessions', async () => {
    expect((await post(API.authStart, { email: 'nope' })).status).toBe(400);
    expect((await post(API.authVerify, { token: 'made-up' })).status).toBe(400);
    expect((await fetch(base + API.me)).status).toBe(401);
  });

  it('has no route for a client to change its own money', async () => {
    const { session } = await signIn('hal@example.com');
    const attempt = await post('/me/wallet', { balance: 1_000_000 }, session, 'PUT');
    expect(attempt.status).toBe(404);
  });
});
