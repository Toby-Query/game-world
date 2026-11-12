/**
 * Physics rules for an area of the world. Islands and sub-areas declare these as data;
 * the client and server read the active zone instead of hard-coding physics.
 */
export interface ZoneRules {
  /** Gravity vector in m/s^2. Earth-like is { x: 0, y: -9.81, z: 0 }. */
  gravity: { x: number; y: number; z: number };
  /** Linear air drag coefficient applied to free-moving bodies. */
  airDrag: number;
  /** Multiplier on the player's jump impulse. */
  jumpMultiplier: number;
  /** Simulation time scale (1 = real time). */
  timeScale: number;
  /** Whether free flight is allowed in this zone. */
  flightAllowed: boolean;
}

export const DEFAULT_ZONE_RULES: ZoneRules = {
  gravity: { x: 0, y: -9.81, z: 0 },
  airDrag: 0.01,
  jumpMultiplier: 1,
  timeScale: 1,
  flightAllowed: false,
};

/** Fills unspecified fields from the defaults so content files only list what they change. */
export function resolveZoneRules(partial: Partial<ZoneRules> = {}): ZoneRules {
  return {
    ...DEFAULT_ZONE_RULES,
    ...partial,
    gravity: { ...DEFAULT_ZONE_RULES.gravity, ...partial.gravity },
  };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** An axis-aligned box in the world where different rules apply. */
export interface ZoneVolume {
  id: string;
  /** Shown to the player on entry, e.g. "Orbital Wing". */
  name: string;
  min: Vec3;
  max: Vec3;
  /** Higher wins where volumes overlap (a room inside an island). */
  priority: number;
  rules: Partial<ZoneRules>;
  /** Metres inside the boundary over which the rules fade in, so entry is smooth. */
  blend?: number;
}

/** How deep `p` is inside `v`, in metres (negative when outside). */
export function depthInside(v: ZoneVolume, p: Vec3): number {
  return Math.min(
    p.x - v.min.x,
    v.max.x - p.x,
    p.y - v.min.y,
    v.max.y - p.y,
    p.z - v.min.z,
    v.max.z - p.z,
  );
}

/** The highest-priority volume containing `p` (ties: the smaller, more specific box). */
export function activeZone(volumes: readonly ZoneVolume[], p: Vec3): ZoneVolume | null {
  let best: ZoneVolume | null = null;
  for (const v of volumes) {
    if (depthInside(v, p) < 0) continue;
    if (
      !best ||
      v.priority > best.priority ||
      (v.priority === best.priority && volumeOf(v) < volumeOf(best))
    ) {
      best = v;
    }
  }
  return best;
}

export const lerpNumber = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Interpolates every numeric rule; booleans switch at the halfway point. */
export function blendRules(a: ZoneRules, b: ZoneRules, t: number): ZoneRules {
  const k = Math.min(1, Math.max(0, t));
  return {
    gravity: {
      x: lerpNumber(a.gravity.x, b.gravity.x, k),
      y: lerpNumber(a.gravity.y, b.gravity.y, k),
      z: lerpNumber(a.gravity.z, b.gravity.z, k),
    },
    airDrag: lerpNumber(a.airDrag, b.airDrag, k),
    jumpMultiplier: lerpNumber(a.jumpMultiplier, b.jumpMultiplier, k),
    timeScale: lerpNumber(a.timeScale, b.timeScale, k),
    flightAllowed: k >= 0.5 ? b.flightAllowed : a.flightAllowed,
  };
}

/**
 * The rules at point `p`: the active zone's rules, faded in from `base` over the zone's blend
 * distance so walking through a doorway eases gravity instead of snapping it.
 */
export function rulesAt(
  volumes: readonly ZoneVolume[],
  p: Vec3,
  base: ZoneRules = DEFAULT_ZONE_RULES,
): { rules: ZoneRules; zone: ZoneVolume | null } {
  const zone = activeZone(volumes, p);
  if (!zone) return { rules: base, zone: null };
  const target = resolveZoneRules({ ...base, ...zone.rules });
  const blend = zone.blend ?? 0;
  const t = blend > 0 ? depthInside(zone, p) / blend : 1;
  return { rules: blendRules(base, target, t), zone };
}

function volumeOf(v: ZoneVolume): number {
  return (v.max.x - v.min.x) * (v.max.y - v.min.y) * (v.max.z - v.min.z);
}

/** A zone file from `content/zones/`: a volume plus the level it belongs to. */
export interface ZoneDefinition extends ZoneVolume {
  /** Level id the zone is placed in, e.g. "archive". */
  level: string;
}

/** Validates a zone file. Throws a readable error on bad data. */
export function parseZone(value: unknown, source = 'zone'): ZoneDefinition {
  if (typeof value !== 'object' || value === null) throw new Error(`${source} must be an object`);
  const v = value as Record<string, unknown>;
  const text = (key: string): string => {
    const field = v[key];
    if (typeof field !== 'string' || field.trim() === '' || field.length > 60) {
      throw new Error(`${source}: "${key}" must be text of 1-60 characters`);
    }
    return field;
  };
  const num = (field: unknown, label: string, min = -1000, max = 1000): number => {
    if (typeof field !== 'number' || !Number.isFinite(field) || field < min || field > max) {
      throw new Error(`${source}: "${label}" must be a number from ${min} to ${max}`);
    }
    return field;
  };
  const vec = (key: string): Vec3 => {
    const field = v[key];
    if (typeof field !== 'object' || field === null)
      throw new Error(`${source}: "${key}" must be {x,y,z}`);
    const f = field as Record<string, unknown>;
    return { x: num(f.x, `${key}.x`), y: num(f.y, `${key}.y`), z: num(f.z, `${key}.z`) };
  };

  const id = text('id');
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`${source}: id must be lowercase-dashed`);
  const min = vec('min');
  const max = vec('max');
  if (min.x >= max.x || min.y >= max.y || min.z >= max.z) {
    throw new Error(`${source}: "min" must be below "max" on every axis`);
  }

  const raw = v.rules;
  if (typeof raw !== 'object' || raw === null)
    throw new Error(`${source}: "rules" must be an object`);
  const r = raw as Record<string, unknown>;
  const rules: Partial<ZoneRules> = {};
  if (r.gravity !== undefined) {
    if (typeof r.gravity !== 'object' || r.gravity === null) {
      throw new Error(`${source}: "rules.gravity" must be {x,y,z}`);
    }
    const g = r.gravity as Record<string, unknown>;
    rules.gravity = {
      x: num(g.x ?? 0, 'rules.gravity.x', -50, 50),
      y: num(g.y ?? 0, 'rules.gravity.y', -50, 50),
      z: num(g.z ?? 0, 'rules.gravity.z', -50, 50),
    };
  }
  if (r.airDrag !== undefined) rules.airDrag = num(r.airDrag, 'rules.airDrag', 0, 10);
  if (r.jumpMultiplier !== undefined) {
    rules.jumpMultiplier = num(r.jumpMultiplier, 'rules.jumpMultiplier', 0, 10);
  }
  if (r.timeScale !== undefined) rules.timeScale = num(r.timeScale, 'rules.timeScale', 0.1, 4);
  if (r.flightAllowed !== undefined) {
    if (typeof r.flightAllowed !== 'boolean') {
      throw new Error(`${source}: "rules.flightAllowed" must be true or false`);
    }
    rules.flightAllowed = r.flightAllowed;
  }

  const zone: ZoneDefinition = {
    id,
    name: text('name'),
    level: text('level'),
    min,
    max,
    priority: v.priority === undefined ? 0 : num(v.priority, 'priority'),
    rules,
  };
  if (v.blend !== undefined) zone.blend = num(v.blend, 'blend', 0, 50);
  return zone;
}

/** Parses every zone file and rejects duplicate ids. */
export function parseZones(files: Record<string, unknown>): ZoneDefinition[] {
  const zones = Object.entries(files).map(([path, json]) => parseZone(json, path));
  const ids = new Set<string>();
  for (const z of zones) {
    if (ids.has(z.id)) throw new Error(`Duplicate zone id "${z.id}"`);
    ids.add(z.id);
  }
  return zones;
}
