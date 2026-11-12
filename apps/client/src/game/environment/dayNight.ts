/** Length of a full day in seconds of real time. */
export const DAY_LENGTH_SECONDS = 8 * 60;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface SkyState {
  /** Unit vector pointing from the scene toward the sun (or moon at night). */
  lightDirection: { x: number; y: number; z: number };
  /** 0 at night .. 1 at noon. */
  daylight: number;
  keyIntensity: number;
  keyColor: Rgb;
  ambientIntensity: number;
  skyTop: Rgb;
  skyHorizon: Rgb;
  fog: Rgb;
  /** Emissive boost for neon signs and screens (stronger at night). */
  neon: number;
}

const hex = (value: number): Rgb => ({
  r: ((value >> 16) & 255) / 255,
  g: ((value >> 8) & 255) / 255,
  b: (value & 255) / 255,
});

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

const PALETTE = {
  dayTop: hex(0x3d7cc9),
  dayHorizon: hex(0xbfdcf0),
  duskTop: hex(0x2b2f6b),
  duskHorizon: hex(0xff9a6b),
  nightTop: hex(0x050a1a),
  nightHorizon: hex(0x16244a),
  sun: hex(0xffe2b8),
  duskSun: hex(0xff8c5a),
  moon: hex(0x9fb6ff),
};

/** Wraps any time (in days) into 0..1. */
export function wrapDay(t: number): number {
  return ((t % 1) + 1) % 1;
}

/**
 * Sky and lighting for a time of day (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset).
 */
export function skyAt(timeOfDay: number): SkyState {
  const t = wrapDay(timeOfDay);
  const angle = (t - 0.25) * Math.PI * 2; // 0 at sunrise, PI/2 at noon
  const sunHeight = Math.sin(angle);
  const daylight = clamp01(sunHeight * 2.5 + 0.35);
  const dusk = clamp01(1 - Math.abs(sunHeight) * 4); // 1 near the horizon

  const sunUp = sunHeight > -0.05;
  // Sun arcs east to west, tilted south; the moon takes the opposite side at night.
  const dir = sunUp
    ? { x: Math.cos(angle), y: Math.max(sunHeight, 0.08), z: 0.35 }
    : { x: -Math.cos(angle), y: Math.max(-sunHeight, 0.15), z: 0.35 };
  const len = Math.hypot(dir.x, dir.y, dir.z);

  const top = mixRgb(
    mixRgb(PALETTE.nightTop, PALETTE.dayTop, daylight),
    PALETTE.duskTop,
    dusk * 0.5,
  );
  const horizon = mixRgb(
    mixRgb(PALETTE.nightHorizon, PALETTE.dayHorizon, daylight),
    PALETTE.duskHorizon,
    dusk * 0.7,
  );

  return {
    lightDirection: { x: dir.x / len, y: dir.y / len, z: dir.z / len },
    daylight,
    keyIntensity: sunUp ? lerp(0.6, 2.8, daylight) : 0.45,
    keyColor: sunUp ? mixRgb(PALETTE.sun, PALETTE.duskSun, dusk) : PALETTE.moon,
    ambientIntensity: lerp(0.5, 1.6, daylight),
    skyTop: top,
    skyHorizon: horizon,
    fog: mixRgb(horizon, top, 0.3),
    neon: lerp(3.5, 1.5, daylight),
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
