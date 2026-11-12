import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNewsFeed, parseNewsItem } from './news';

const item = { id: 'a', headline: 'Hello', body: 'World', tags: ['lore'] };

describe('parseNewsFeed', () => {
  it('accepts the shipped feed in content/news', () => {
    const raw = readFileSync(new URL('../../../content/news/feed.json', import.meta.url), 'utf8');
    const feed = parseNewsFeed(JSON.parse(raw));
    expect(feed.items.length).toBeGreaterThanOrEqual(20);
  });

  it('rejects duplicate ids', () => {
    expect(() => parseNewsFeed({ channel: 'ANN', items: [item, item] })).toThrow(/Duplicate/);
  });

  it('rejects an empty feed', () => {
    expect(() => parseNewsFeed({ channel: 'ANN', items: [] })).toThrow();
  });
});

describe('parseNewsItem', () => {
  it('rejects headlines that will not fit on a screen', () => {
    expect(() => parseNewsItem({ ...item, headline: 'x'.repeat(91) })).toThrow(/headline/);
  });

  it('keeps optional fields only when valid', () => {
    expect(parseNewsItem({ ...item, image: 'a.png', live: true })).toEqual({
      ...item,
      image: 'a.png',
      live: true,
    });
    expect(parseNewsItem({ ...item, live: 'yes' })).toEqual(item);
  });
});
