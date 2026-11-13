import type { InventoryItem } from './account';
import type { Vec3 } from './zones';

/** Combat tuning, shared so the client can show what the server will decide. */
export const COMBAT = {
  maxHealth: 100,
  melee: { damage: 20, range: 2.4, arcDegrees: 110, cooldownMs: 600 },
  ranged: { damage: 12, range: 40, cooldownMs: 900, hitRadius: 0.45 },
  dodge: { invulnerableMs: 350, cooldownMs: 900, speed: 12, durationMs: 300 },
  /** Body as a vertical capsule for hit tests (feet at y = 0). */
  body: { radius: 0.4, height: 1.8 },
  respawnSeconds: 5,
  /** The server rewinds targets at most this far into the past for lag compensation. */
  lagCompensationMs: 250,
  /** Share of carried (non-equipped) items dropped on death. */
  lootShare: 0.5,
  /** Metres within which a loot bag can be picked up. */
  pickupRadius: 2.5,
} as const;

export type AttackKind = 'melee' | 'ranged';

/** client → server */
export interface AttackMessage {
  kind: AttackKind;
  /** Aim direction (any length); horizontal for melee. */
  dir: Vec3;
  /** Where the attacker was (the server checks it is close to where it thinks they are). */
  origin: Vec3;
  /** Server time (ms) of the world the attacker was looking at, for lag compensation. */
  seenAt: number;
}

/** server → clients: something landed. */
export interface HitMessage {
  attacker: string;
  target: string;
  kind: AttackKind;
  damage: number;
  health: number;
  at: Vec3;
}

/** server → clients: an attack was made (for swing and bolt effects, hit or miss). */
export interface AttackEvent {
  attacker: string;
  kind: AttackKind;
  origin: Vec3;
  dir: Vec3;
}

export interface LootBag {
  id: string;
  at: Vec3;
  items: { kind: string; name: string }[];
}

export interface DeathMessage {
  id: string;
  by: string;
  byName: string;
  respawnAt: number;
  loot: LootBag | null;
}

export interface RespawnMessage {
  id: string;
  at: Vec3;
  health: number;
}

const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

export function normalize(v: Vec3): Vec3 | null {
  const l = length(v);
  return l > 1e-6 && Number.isFinite(l) ? { x: v.x / l, y: v.y / l, z: v.z / l } : null;
}

export function parseAttack(value: unknown): AttackMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const vec = (x: unknown): Vec3 | null => {
    const o = x as Record<string, unknown> | null;
    return o && [o.x, o.y, o.z].every((n) => typeof n === 'number' && Number.isFinite(n))
      ? { x: o.x as number, y: o.y as number, z: o.z as number }
      : null;
  };
  const dir = normalize(vec(v.dir) ?? { x: 0, y: 0, z: 0 });
  const origin = vec(v.origin);
  if ((v.kind !== 'melee' && v.kind !== 'ranged') || !dir || !origin) return null;
  if (typeof v.seenAt !== 'number' || !Number.isFinite(v.seenAt)) return null;
  return { kind: v.kind, dir, origin, seenAt: v.seenAt };
}

/** Whether `target` (feet) is inside the melee arc in front of `attacker` (feet) facing `dir`. */
export function inMeleeArc(attacker: Vec3, dir: Vec3, target: Vec3): boolean {
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const dist = Math.hypot(dx, dz);
  if (dist > COMBAT.melee.range + COMBAT.body.radius) return false;
  if (Math.abs(target.y - attacker.y) > COMBAT.body.height) return false;
  if (dist < 0.3) return true;
  const flat = normalize({ x: dir.x, y: 0, z: dir.z });
  if (!flat) return false;
  const cos = (dx * flat.x + dz * flat.z) / dist;
  return cos >= Math.cos(((COMBAT.melee.arcDegrees / 2) * Math.PI) / 180);
}

/**
 * Distance along the ray `origin + t·dir` (dir unit length) to a body standing at `feet`, treated
 * as a vertical capsule; null on a miss or beyond `maxDistance`.
 */
export function rayHitsBody(
  origin: Vec3,
  dir: Vec3,
  feet: Vec3,
  maxDistance: number,
  radius: number = COMBAT.body.radius + COMBAT.ranged.hitRadius,
): number | null {
  // Closest approach of the ray to the body's vertical axis, in the ground plane.
  const ox = origin.x - feet.x;
  const oz = origin.z - feet.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  let t: number;
  if (a < 1e-9) {
    t = 0;
    if (ox * ox + oz * oz > radius * radius) return null;
  } else {
    const b = ox * dir.x + oz * dir.z;
    const c = ox * ox + oz * oz - radius * radius;
    const disc = b * b - a * c;
    if (disc < 0) return null;
    t = (-b - Math.sqrt(disc)) / a;
    if (t < 0) t = (-b + Math.sqrt(disc)) / a >= 0 ? 0 : -1;
    if (t < 0) return null;
  }
  if (t > maxDistance) return null;
  const y = origin.y + dir.y * t - feet.y;
  return y >= -radius && y <= COMBAT.body.height + radius ? t : null;
}

/** A recorded position at server time `t`. */
export interface Sample extends Vec3 {
  t: number;
}

/** Where a player was at `time`, blending their recorded positions (lag compensation). */
export function positionAt(history: readonly Sample[], time: number): Vec3 | null {
  const first = history[0];
  if (!first) return null;
  if (time <= first.t) return first;
  for (let i = 1; i < history.length; i++) {
    const b = history[i]!;
    if (time <= b.t) {
      const a = history[i - 1]!;
      const k = b.t === a.t ? 1 : (time - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  return history[history.length - 1]!;
}

/** The rewind time the server will use: what the attacker saw, but never too far back. */
export function rewindTime(seenAt: number, now: number): number {
  return Math.min(now, Math.max(seenAt, now - COMBAT.lagCompensationMs));
}

/**
 * Which carried items drop on death: a share of the non-equipped ones (rounded up, so carrying
 * anything means risking something), chosen by `random`.
 */
export function chooseLoot(
  items: readonly InventoryItem[],
  random: () => number = Math.random,
): InventoryItem[] {
  const carried = items.filter((i) => !i.equipped);
  const count = Math.ceil(carried.length * COMBAT.lootShare);
  const pool = [...carried];
  const out: InventoryItem[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
  }
  return out;
}

/** Simple per-action cooldown tracker. */
export class Cooldowns {
  private readonly ready = new Map<string, number>();

  /** True (and starts the cooldown) if `action` is ready at `now`. */
  use(action: string, cooldownMs: number, now: number): boolean {
    if ((this.ready.get(action) ?? 0) > now) return false;
    this.ready.set(action, now + cooldownMs);
    return true;
  }
}
