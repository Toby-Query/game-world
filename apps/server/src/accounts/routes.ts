import express, { type Application, type Request, type Response } from 'express';
import { logger } from '@colyseus/core';
import {
  API,
  normalizeEmail,
  sanitizeAppearance,
  type AuthStartResponse,
  type AuthVerifyResponse,
} from '@the-world/shared';
import type { AccountStore } from './AccountStore';

export interface AccountRoutesOptions {
  store: AccountStore;
  /** Base URL of the game client, used in sign-in links. Defaults to the request's Origin. */
  clientUrl?: string | undefined;
  /** Return the sign-in link in the response (local development: no email is sent). */
  exposeDevLinks: boolean;
}

const bearer = (req: Request): string | null => {
  const header = req.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

/** Sign-in by magic link and the signed-in player's account. */
export function accountRoutes(app: Application, opts: AccountRoutesOptions): void {
  const { store } = opts;

  // The client runs on another port, so allow cross-origin calls. Auth is a bearer header, not a
  // cookie, so this doesn't open the door to cross-site request forgery.
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'authorization, content-type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    if (req.method === 'OPTIONS') res.status(204).end();
    else next();
  });
  app.use(express.json({ limit: '16kb' }));

  const signedIn = async (req: Request, res: Response): Promise<string | null> => {
    const token = bearer(req);
    const playerId = token ? await store.playerForSession(token) : null;
    if (!playerId) res.status(401).json({ error: 'Not signed in' });
    return playerId;
  };

  app.post(API.authStart, async (req, res) => {
    const email = normalizeEmail((req.body as { email?: unknown } | undefined)?.email);
    if (!email) {
      res.status(400).json({ error: 'Enter a valid email address' });
      return;
    }
    const token = await store.createLoginToken(email);
    const base = opts.clientUrl ?? req.get('origin') ?? 'http://localhost:5173';
    const link = `${base.replace(/\/$/, '')}/?login=${encodeURIComponent(token)}`;
    // No email provider yet: the link is printed for local play (and returned in development).
    logger.info(`Sign-in link for ${email}: ${link}`);
    const body: AuthStartResponse = opts.exposeDevLinks
      ? { sent: true, devLink: link }
      : { sent: true };
    res.json(body);
  });

  app.post(API.authVerify, async (req, res) => {
    const token = (req.body as { token?: unknown } | undefined)?.token;
    const result = typeof token === 'string' ? await store.verifyLogin(token) : null;
    if (!result) {
      res.status(400).json({ error: 'That sign-in link has expired or was already used' });
      return;
    }
    const body: AuthVerifyResponse = result;
    res.json(body);
  });

  app.post(API.logout, async (req, res) => {
    const token = bearer(req);
    if (token) await store.endSession(token);
    res.status(204).end();
  });

  app.get(API.me, async (req, res) => {
    const playerId = await signedIn(req, res);
    if (playerId) res.json(await store.me(playerId));
  });

  app.put(API.character, async (req, res) => {
    const playerId = await signedIn(req, res);
    if (!playerId) return;
    const appearance = sanitizeAppearance(
      (req.body as { appearance?: unknown } | undefined)?.appearance,
    );
    await store.saveCharacter(playerId, appearance);
    res.json(await store.me(playerId));
  });
}
