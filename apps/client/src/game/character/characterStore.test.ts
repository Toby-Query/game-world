import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '@the-world/shared';
import { loadAppearance, saveAppearance } from './characterStore';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('character store', () => {
  it('returns null when nothing is saved', () => {
    expect(loadAppearance(memoryStore())).toBeNull();
  });

  it('round-trips a character', () => {
    const store = memoryStore();
    const hero = { ...DEFAULT_APPEARANCE, name: 'Ayo', hair: 'bun' as const };
    expect(saveAppearance(hero, store)).toBe(true);
    expect(loadAppearance(store)).toEqual(hero);
  });

  it('survives a corrupted save', () => {
    const store = memoryStore();
    store.data.set('the-world:character', '{not json');
    expect(loadAppearance(store)).toBeNull();
  });

  it('reports when storage is unavailable', () => {
    expect(saveAppearance(DEFAULT_APPEARANCE, null)).toBe(false);
    expect(loadAppearance(null)).toBeNull();
  });
});
