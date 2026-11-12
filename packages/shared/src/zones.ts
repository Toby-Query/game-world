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
