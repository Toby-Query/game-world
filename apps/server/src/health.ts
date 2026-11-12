import { GAME_TITLE } from '@the-world/shared';

export interface Health {
  ok: true;
  name: string;
  uptimeSeconds: number;
}

export function health(startedAt: number, now: number): Health {
  return { ok: true, name: GAME_TITLE, uptimeSeconds: Math.round((now - startedAt) / 1000) };
}
