import type { Appearance } from './appearance';

/** How many items a player can carry. Full bags force a sale (or a drop). */
export const INVENTORY_SLOTS = 20;

/** What every new player starts with besides their seed money: one equipped, two carried. */
export const STARTER_KIT: readonly { kind: string; name: string; equipped: boolean }[] = [
  { kind: 'weapon', name: 'Driftwood club', equipped: true },
  { kind: 'tool', name: 'Salvage net', equipped: false },
  { kind: 'trinket', name: 'Brass compass', equipped: false },
];

/** Minutes a sign-in link stays valid. */
export const LOGIN_LINK_MINUTES = 15;

/** Days a session lasts before signing in again. */
export const SESSION_DAYS = 30;

/** HTTP routes on the game server. */
export const API = {
  authStart: '/auth/start',
  authVerify: '/auth/verify',
  logout: '/auth/logout',
  me: '/me',
  character: '/me/character',
} as const;

export interface InventoryItem {
  id: string;
  slot: number;
  kind: string;
  name: string;
  equipped: boolean;
}

/** The signed-in player's account as the server sees it. */
export interface Me {
  playerId: string;
  email: string;
  character: Appearance | null;
  balance: number;
  inventory: InventoryItem[];
  slots: number;
}

export interface AuthStartResponse {
  sent: true;
  /** Local development only: the sign-in link, since no email is sent. */
  devLink?: string;
}

export interface AuthVerifyResponse {
  session: string;
  me: Me;
}

/** Lower-cased, trimmed email, or null if it isn't plausibly an address. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** The game server's HTTP base URL for a WebSocket URL (ws → http, wss → https). */
export function httpUrlFor(wsUrl: string): string {
  return wsUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/$/, '');
}

/** First free inventory slot, or null when the bag is full. */
export function firstFreeSlot(used: Iterable<number>, slots = INVENTORY_SLOTS): number | null {
  const taken = new Set(used);
  for (let i = 0; i < slots; i++) if (!taken.has(i)) return i;
  return null;
}
