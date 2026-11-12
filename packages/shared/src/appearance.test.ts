import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  NAME_MAX_LENGTH,
  sanitizeAppearance,
  sanitizeName,
} from './appearance';

describe('sanitizeAppearance', () => {
  it('returns the defaults for garbage', () => {
    expect(sanitizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(sanitizeAppearance('nope')).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps valid values and drops unknown fields', () => {
    const a = sanitizeAppearance({
      ...DEFAULT_APPEARANCE,
      hair: 'mohawk',
      top: 'robe',
      skinColor: '#AABBCC',
      admin: true,
    });
    expect(a.hair).toBe('mohawk');
    expect(a.top).toBe('robe');
    expect(a.skinColor).toBe('#aabbcc');
    expect(a).not.toHaveProperty('admin');
  });

  it('clamps sliders and rejects unknown parts and bad colours', () => {
    const a = sanitizeAppearance({ height: 9, build: -1, hair: 'wig', skinColor: 'red' });
    expect(a.height).toBe(1.15);
    expect(a.build).toBe(0.8);
    expect(a.hair).toBe(DEFAULT_APPEARANCE.hair);
    expect(a.skinColor).toBe(DEFAULT_APPEARANCE.skinColor);
  });
});

describe('sanitizeName', () => {
  it('trims, collapses spaces and caps length', () => {
    expect(sanitizeName('  Thor   Odinson ')).toBe('Thor Odinson');
    expect(sanitizeName('x'.repeat(50))).toHaveLength(NAME_MAX_LENGTH);
  });

  it('strips control characters and falls back when empty', () => {
    expect(sanitizeName('A\u0000B\nC')).toBe('ABC');
    expect(sanitizeName('   ')).toBe(DEFAULT_APPEARANCE.name);
  });
});
