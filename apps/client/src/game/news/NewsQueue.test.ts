import { describe, expect, it } from 'vitest';
import type { NewsItem } from '@the-world/shared';
import { BULLETIN_SECONDS, NewsQueue } from './NewsQueue';

const item = (id: string): NewsItem => ({ id, headline: id.toUpperCase(), body: '', tags: [] });

describe('NewsQueue', () => {
  it('rotates through items and loops forever', () => {
    const q = new NewsQueue([item('a'), item('b')]);
    expect(q.at(0).item.id).toBe('a');
    expect(q.at(BULLETIN_SECONDS).item.id).toBe('b');
    expect(q.at(BULLETIN_SECONDS * 2).item.id).toBe('a');
  });

  it('reports progress through the current bulletin', () => {
    const q = new NewsQueue([item('a'), item('b')]);
    expect(q.at(BULLETIN_SECONDS / 2).progress).toBeCloseTo(0.5);
  });

  it('airs pushed live items immediately, then keeps them in rotation', () => {
    const q = new NewsQueue([item('a'), item('b')]);
    q.at(1);
    q.push(item('breaking'));
    const now = q.at(2);
    expect(now.item.id).toBe('breaking');
    expect(now.item.live).toBe(true);
    expect(q.tickerText()).toContain('BREAKING');
  });

  it('joins headlines for the ticker', () => {
    expect(new NewsQueue([item('a'), item('b')]).tickerText()).toBe('A   ///   B');
  });
});
