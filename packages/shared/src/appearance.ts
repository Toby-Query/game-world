export const HAIR_STYLES = ['short', 'long', 'bun', 'mohawk', 'bald'] as const;
export const TOPS = ['tunic', 'jacket', 'robe'] as const;
export const BOTTOMS = ['trousers', 'shorts', 'skirt'] as const;
export const SHOES = ['boots', 'sandals'] as const;

export type HairStyle = (typeof HAIR_STYLES)[number];
export type Top = (typeof TOPS)[number];
export type Bottom = (typeof BOTTOMS)[number];
export type Shoes = (typeof SHOES)[number];

/** How a player's character looks. Saved locally now; stored by the server once accounts exist. */
export interface Appearance {
  name: string;
  /** Overall height scale. */
  height: number;
  /** Shoulder and limb thickness. */
  build: number;
  /** Head size relative to the body (stylized proportions). */
  headSize: number;
  hair: HairStyle;
  top: Top;
  bottom: Bottom;
  shoes: Shoes;
  skinColor: string;
  hairColor: string;
  outfitColor: string;
  accentColor: string;
}

/** Slider ranges for the body proportions. */
export const APPEARANCE_RANGES = {
  height: { min: 0.85, max: 1.15 },
  build: { min: 0.8, max: 1.25 },
  headSize: { min: 0.9, max: 1.2 },
} as const;

export const NAME_MAX_LENGTH = 20;

export const DEFAULT_APPEARANCE: Appearance = {
  name: 'Salvager',
  height: 1,
  build: 1,
  headSize: 1.05,
  hair: 'short',
  top: 'tunic',
  bottom: 'trousers',
  shoes: 'boots',
  skinColor: '#8d5a3b',
  hairColor: '#1d1410',
  outfitColor: '#2f5d8a',
  accentColor: '#e7b54a',
};

/**
 * Turns anything (a saved file, a server message, a hand-edited value) into a valid Appearance:
 * unknown fields are dropped, numbers are clamped to their ranges, bad values fall back to the
 * defaults. Never throws, so a corrupted save can't lock a player out.
 */
export function sanitizeAppearance(value: unknown): Appearance {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const d = DEFAULT_APPEARANCE;
  const num = (key: keyof typeof APPEARANCE_RANGES): number => {
    const n = v[key];
    const { min, max } = APPEARANCE_RANGES[key];
    return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d[key];
  };
  const pick = <T extends string>(key: string, options: readonly T[], fallback: T): T =>
    options.includes(v[key] as T) ? (v[key] as T) : fallback;
  const colour = (key: keyof Appearance, fallback: string): string => {
    const c = v[key];
    return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : fallback;
  };
  return {
    name: sanitizeName(v.name),
    height: num('height'),
    build: num('build'),
    headSize: num('headSize'),
    hair: pick('hair', HAIR_STYLES, d.hair),
    top: pick('top', TOPS, d.top),
    bottom: pick('bottom', BOTTOMS, d.bottom),
    shoes: pick('shoes', SHOES, d.shoes),
    skinColor: colour('skinColor', d.skinColor),
    hairColor: colour('hairColor', d.hairColor),
    outfitColor: colour('outfitColor', d.outfitColor),
    accentColor: colour('accentColor', d.accentColor),
  };
}

/** Trims, collapses spaces, strips control characters and caps the length of a display name. */
export function sanitizeName(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_APPEARANCE.name;
  const cleaned = value
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : DEFAULT_APPEARANCE.name;
}
