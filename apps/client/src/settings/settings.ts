export const QUALITIES = ['low', 'medium', 'high'] as const;
export type Quality = (typeof QUALITIES)[number];

/** Player preferences, saved in this browser. */
export interface Settings {
  /** Mouse sensitivity multiplier (1 = default). */
  sensitivity: number;
  invertY: boolean;
  /** Master volume, 0..1. */
  volume: number;
  quality: Quality;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  volume: 0.7,
  quality: 'high',
};

export const SENSITIVITY_RANGE = { min: 0.2, max: 3 } as const;

/** Radians of camera turn per pixel of mouse movement at sensitivity 1. */
export const BASE_LOOK_SPEED = 0.0025;

const KEY = 'the-world:settings';
const CONTROLS_SEEN_KEY = 'the-world:controls-seen';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Keeps known fields with valid values and fills the rest from the defaults. */
export function sanitizeSettings(value: unknown): Settings {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const clamp = (n: unknown, min: number, max: number, fallback: number): number =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  return {
    sensitivity: clamp(
      v.sensitivity,
      SENSITIVITY_RANGE.min,
      SENSITIVITY_RANGE.max,
      DEFAULT_SETTINGS.sensitivity,
    ),
    invertY: typeof v.invertY === 'boolean' ? v.invertY : DEFAULT_SETTINGS.invertY,
    volume: clamp(v.volume, 0, 1, DEFAULT_SETTINGS.volume),
    quality: QUALITIES.includes(v.quality as Quality)
      ? (v.quality as Quality)
      : DEFAULT_SETTINGS.quality,
  };
}

export interface QualityProfile {
  pixelRatio: number;
  /** Shadow map size in pixels, or 0 for no shadows. */
  shadowMapSize: number;
}

/** What each graphics quality level means for the renderer. */
export function qualityProfile(quality: Quality, devicePixelRatio: number): QualityProfile {
  switch (quality) {
    case 'low':
      return { pixelRatio: 0.75, shadowMapSize: 0 };
    case 'medium':
      return { pixelRatio: 1, shadowMapSize: 1024 };
    case 'high':
      return { pixelRatio: Math.min(Math.max(devicePixelRatio, 1), 2), shadowMapSize: 2048 };
  }
}

function defaultStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSettings(store: KeyValueStore | null = defaultStore()): Settings {
  try {
    const raw = store?.getItem(KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  settings: Settings,
  store: KeyValueStore | null = defaultStore(),
): boolean {
  try {
    if (!store) return false;
    store.setItem(KEY, JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

/** Whether this browser has already seen the controls overlay. */
export function controlsSeen(store: KeyValueStore | null = defaultStore()): boolean {
  try {
    return store?.getItem(CONTROLS_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markControlsSeen(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.setItem(CONTROLS_SEEN_KEY, '1');
  } catch {
    // Storage unavailable: the overlay simply shows again next time.
  }
}
