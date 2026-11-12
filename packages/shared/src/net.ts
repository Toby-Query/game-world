import { sanitizeAppearance, sanitizeName, type Appearance } from './appearance';
import type { Vec3 } from './zones';

/** Networking constants shared by client and server. */
export const NET = {
  /** Server snapshots and client move updates per second. */
  tickRate: 15,
  /** Only players within this many metres of you are sent to you. */
  interestRadius: 80,
  /** Fastest legal horizontal speed (sprint plus slack for lag), m/s. */
  maxHorizontalSpeed: 11,
  /** Fastest legal vertical speed (falls and jumps), m/s. */
  maxVerticalSpeed: 45,
  /** Remote players are drawn this far in the past so there are always two snapshots to blend. */
  interpolationDelayMs: 120,
  /** Seconds the server keeps a dropped player's slot for them to reconnect. */
  reconnectSeconds: 20,
  /** Archive cells are this many metres square; one room per cell. */
  cellSize: 512,
} as const;

/** Message types sent over the room. */
export const MSG = {
  /** client → server: my position (MoveMessage). */
  move: 'move',
  /** client → server: I fell or died; put me back at the spawn. */
  respawn: 'respawn',
  /** client → server, development only: move me anywhere (tests and debugging). */
  teleport: 'teleport',
  /** server → client: who you are, and everyone's profile (WelcomeMessage). */
  welcome: 'welcome',
  /** server → client: a player joined (PlayerProfile). */
  joined: 'joined',
  /** server → client: a player left ({ id }). */
  left: 'left',
  /** server → client: nearby players' positions (SnapshotMessage). */
  snapshot: 'snapshot',
  /** server → client: the server rejected your move; snap here (Vec3). */
  correction: 'correction',
} as const;

/** Body pose sent with every move so remote characters animate. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Yaw the character faces, radians. */
  facing: number;
  /** Horizontal speed, m/s (drives the walk/run cycle). */
  speed: number;
  grounded: boolean;
  /** Vertical speed, m/s (drives jump/fall poses). */
  vy: number;
}

export type MoveMessage = Pose;

export interface PlayerProfile {
  id: string;
  name: string;
  appearance: Appearance;
}

export interface WelcomeMessage {
  you: string;
  players: PlayerProfile[];
  /** Where the server placed you. */
  spawn: Vec3;
}

export interface PlayerSnapshot extends Pose {
  id: string;
}

export interface SnapshotMessage {
  /** Server time in milliseconds. */
  t: number;
  players: PlayerSnapshot[];
}

/** Options a client passes when joining a room. */
export interface JoinOptions {
  appearance: Appearance;
  cell?: string;
  /** Account session; signed-in players appear as their saved character. */
  session?: string;
}

export function sanitizeJoinOptions(value: unknown): { name: string; appearance: Appearance } {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const appearance = sanitizeAppearance(v.appearance);
  return { name: sanitizeName(appearance.name), appearance };
}

/** The room cell id for a world position, e.g. "0:0" for the Archive. */
export function cellFor(x: number, z: number): string {
  return `${Math.floor(x / NET.cellSize + 0.5)}:${Math.floor(z / NET.cellSize + 0.5)}`;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Reads a move message, or null if it is malformed. */
export function parsePose(value: unknown): Pose | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!finite(v.x) || !finite(v.y) || !finite(v.z) || !finite(v.facing)) return null;
  return {
    x: v.x,
    y: v.y,
    z: v.z,
    facing: v.facing,
    speed: finite(v.speed) ? Math.min(Math.max(v.speed, 0), NET.maxHorizontalSpeed) : 0,
    grounded: v.grounded === true,
    vy: finite(v.vy) ? Math.min(Math.max(v.vy, -NET.maxVerticalSpeed), NET.maxVerticalSpeed) : 0,
  };
}

export interface MoveCheck {
  /** True when the move was accepted as sent. */
  ok: boolean;
  /** Where the server now believes the player is. */
  position: Vec3;
}

/**
 * Authoritative movement check: a player can't move further than their top speed allows in the
 * time since their last accepted update (plus a small tolerance for jitter). Illegal moves are
 * clamped along the direction of travel and reported so the client can be corrected.
 */
export function checkMove(from: Vec3, to: Vec3, elapsedSeconds: number): MoveCheck {
  const dt = Math.min(Math.max(elapsedSeconds, 0), 1);
  const tolerance = 0.5;
  const maxH = NET.maxHorizontalSpeed * dt + tolerance;
  const maxV = NET.maxVerticalSpeed * dt + tolerance;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dy = to.y - from.y;
  const h = Math.hypot(dx, dz);
  if (h <= maxH && Math.abs(dy) <= maxV) return { ok: true, position: { ...to } };
  const k = h > maxH ? maxH / h : 1;
  return {
    ok: false,
    position: {
      x: from.x + dx * k,
      y: from.y + Math.sign(dy) * Math.min(Math.abs(dy), maxV),
      z: from.z + dz * k,
    },
  };
}

/** The players within the interest radius of `self` (never including `self`). */
export function playersNear<T extends { id: string; x: number; z: number }>(
  players: Iterable<T>,
  self: { id: string; x: number; z: number },
  radius: number = NET.interestRadius,
): T[] {
  const r2 = radius * radius;
  const out: T[] = [];
  for (const p of players) {
    if (p.id === self.id) continue;
    const dx = p.x - self.x;
    const dz = p.z - self.z;
    if (dx * dx + dz * dz <= r2) out.push(p);
  }
  return out;
}

/** A timestamped pose for interpolation. */
export interface TimedPose extends Pose {
  t: number;
}

/**
 * The pose at `time`, blended between the two buffered snapshots around it. Before the first
 * snapshot it holds the first; after the last it holds the last (no extrapolation).
 */
export function interpolatePose(buffer: readonly TimedPose[], time: number): Pose | null {
  const first = buffer[0];
  if (!first) return null;
  if (time <= first.t) return first;
  for (let i = 1; i < buffer.length; i++) {
    const b = buffer[i]!;
    if (time <= b.t) {
      const a = buffer[i - 1]!;
      const k = b.t === a.t ? 1 : (time - a.t) / (b.t - a.t);
      let df = b.facing - a.facing;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        z: a.z + (b.z - a.z) * k,
        facing: a.facing + df * k,
        speed: a.speed + (b.speed - a.speed) * k,
        vy: a.vy + (b.vy - a.vy) * k,
        grounded: k < 0.5 ? a.grounded : b.grounded,
      };
    }
  }
  return buffer[buffer.length - 1]!;
}
