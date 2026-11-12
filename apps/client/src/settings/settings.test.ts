import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  controlsSeen,
  loadSettings,
  markControlsSeen,
  qualityProfile,
  sanitizeSettings,
  saveSettings,
} from './settings';

function memoryStore(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('sanitizeSettings', () => {
  it('falls back to defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ quality: 'ultra', volume: 'loud' })).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numbers and keeps valid values', () => {
    const s = sanitizeSettings({ sensitivity: 99, volume: -1, invertY: true, quality: 'low' });
    expect(s).toEqual({ sensitivity: 3, volume: 0, invertY: true, quality: 'low' });
  });
});

describe('qualityProfile', () => {
  it('turns shadows off on low and caps pixel ratio on high', () => {
    expect(qualityProfile('low', 2).shadowMapSize).toBe(0);
    expect(qualityProfile('medium', 2)).toEqual({ pixelRatio: 1, shadowMapSize: 1024 });
    expect(qualityProfile('high', 3).pixelRatio).toBe(2);
    expect(qualityProfile('high', 1).pixelRatio).toBe(1);
  });
});

describe('storage', () => {
  it('round-trips settings', () => {
    const store = memoryStore();
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS, quality: 'medium', sensitivity: 1.5 }, store);
    expect(loadSettings(store)).toMatchObject({ quality: 'medium', sensitivity: 1.5 });
  });

  it('copes with corrupt data and missing storage', () => {
    const store = memoryStore();
    store.setItem('the-world:settings', '{not json');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, null)).toBe(false);
  });

  it('remembers that the controls overlay was seen', () => {
    const store = memoryStore();
    expect(controlsSeen(store)).toBe(false);
    markControlsSeen(store);
    expect(controlsSeen(store)).toBe(true);
  });
});
