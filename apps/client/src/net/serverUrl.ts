import { DEFAULT_SERVER_PORT } from '@the-world/shared';

/**
 * The game server's WebSocket URL: `VITE_SERVER_URL` when set (see `.env.example`), otherwise the
 * page's own host on the default port, so another machine on your network can join too.
 */
export function resolveServerUrl(
  configured: string | undefined,
  page: { hostname: string; protocol: string },
): string {
  const url = configured?.trim();
  if (url) return url;
  const scheme = page.protocol === 'https:' ? 'wss' : 'ws';
  const host = page.hostname.includes(':') ? `[${page.hostname}]` : page.hostname || 'localhost';
  return `${scheme}://${host}:${DEFAULT_SERVER_PORT}`;
}

/** Delay before reconnect attempt `n` (0-based): 1s, 2s, 4s ... capped at 15s. */
export function reconnectDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 15_000);
}
