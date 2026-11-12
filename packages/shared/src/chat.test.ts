import { describe, expect, it } from 'vitest';
import blocked from '../../../content/chat/blocked-words.json';
import {
  CHAT,
  RateLimiter,
  maskProfanity,
  parseBlockedWords,
  parseChatSend,
  sanitizeChatText,
} from './chat';

const words = parseBlockedWords(blocked);

describe('sanitizeChatText', () => {
  it('trims, collapses whitespace and strips control characters', () => {
    expect(sanitizeChatText('  hi \n\n there\u0007 ')).toBe('hi there');
  });

  it('caps the length and rejects empty messages', () => {
    expect(sanitizeChatText('x'.repeat(500))).toHaveLength(CHAT.maxLength);
    expect(sanitizeChatText('   ')).toBeNull();
    expect(sanitizeChatText(42)).toBeNull();
  });
});

describe('parseChatSend', () => {
  it('accepts known channels only', () => {
    expect(parseChatSend({ channel: 'global', text: 'hi' })).toEqual({
      channel: 'global',
      text: 'hi',
    });
    expect(parseChatSend({ channel: 'admin', text: 'hi' })).toBeNull();
    expect(parseChatSend({ channel: 'nearby', text: ' ' })).toBeNull();
  });
});

describe('maskProfanity', () => {
  it('masks blocked words, keeping length', () => {
    expect(maskProfanity('well shit, a kraken', words)).toBe('well ****, a kraken');
  });

  it('sees through case, letter swaps, repeats and endings', () => {
    expect(maskProfanity('SH1IIIT', words)).toBe('*******');
    expect(maskProfanity('$hitty', words)).toBe('******');
    expect(maskProfanity('fucking hell', words)).toBe('******* hell');
  });

  it('leaves innocent words that contain a blocked one', () => {
    const fine = 'class assess Scunthorpe dickens shitake grass';
    expect(maskProfanity(fine, words)).toBe(fine);
  });
});

describe('RateLimiter', () => {
  it('allows a burst, then refills over time', () => {
    const limiter = new RateLimiter(3, 2, 0);
    expect([0, 0, 0, 0].map(() => limiter.allow(0))).toEqual([true, true, true, false]);
    expect(limiter.waitSeconds()).toBeCloseTo(2);
    expect(limiter.allow(1000)).toBe(false);
    expect(limiter.allow(2100)).toBe(true);
    expect(limiter.allow(2200)).toBe(false);
  });
});

describe('parseBlockedWords', () => {
  it('rejects malformed lists', () => {
    expect(() => parseBlockedWords({ words: [1] })).toThrow();
    expect(() => parseBlockedWords(null)).toThrow();
  });
});
