import { describe, expect, it } from 'vitest';
import { INVENTORY_SLOTS, firstFreeSlot, httpUrlFor, normalizeEmail } from './account';

describe('normalizeEmail', () => {
  it('lower-cases and trims valid addresses', () => {
    expect(normalizeEmail('  Ayo@Example.COM ')).toBe('ayo@example.com');
  });

  it('rejects things that are not addresses', () => {
    expect(normalizeEmail('ayo')).toBeNull();
    expect(normalizeEmail('a b@c.d')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(250)}@x.io`)).toBeNull();
  });
});

describe('httpUrlFor', () => {
  it('maps WebSocket URLs to HTTP', () => {
    expect(httpUrlFor('ws://localhost:2567')).toBe('http://localhost:2567');
    expect(httpUrlFor('wss://game.example.com/')).toBe('https://game.example.com');
  });
});

describe('firstFreeSlot', () => {
  it('fills gaps first and reports a full bag', () => {
    expect(firstFreeSlot([])).toBe(0);
    expect(firstFreeSlot([0, 1, 3])).toBe(2);
    const all = Array.from({ length: INVENTORY_SLOTS }, (_, i) => i);
    expect(firstFreeSlot(all)).toBeNull();
  });
});
