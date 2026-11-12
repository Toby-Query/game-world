/** One bulletin shown on the in-world news screens. */
export interface NewsItem {
  id: string;
  headline: string;
  body: string;
  tags: string[];
  /** Optional image URL; screens draw a tag emblem when it is missing. */
  image?: string;
  /** Live items (pushed by the server) jump the queue and air first. */
  live?: boolean;
}

export interface NewsFeed {
  channel: string;
  items: NewsItem[];
}

/** Validates feed JSON from `content/news/` (or a live server message). Throws on bad data. */
export function parseNewsFeed(value: unknown): NewsFeed {
  if (!isRecord(value)) throw new Error('News feed must be an object');
  const { channel, items } = value;
  if (typeof channel !== 'string' || channel.trim() === '') {
    throw new Error('News feed needs a channel name');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('News feed needs at least one item');
  }
  const seen = new Set<string>();
  const parsed = items.map((item, index) => {
    const parsedItem = parseNewsItem(item, index);
    if (seen.has(parsedItem.id)) throw new Error(`Duplicate news id "${parsedItem.id}"`);
    seen.add(parsedItem.id);
    return parsedItem;
  });
  return { channel, items: parsed };
}

export function parseNewsItem(value: unknown, index = 0): NewsItem {
  const where = `news item ${index}`;
  if (!isRecord(value)) throw new Error(`${where} must be an object`);
  const { id, headline, body, tags, image, live } = value;
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`${where}: id must be lowercase letters, digits and dashes`);
  }
  if (typeof headline !== 'string' || headline.length === 0 || headline.length > 90) {
    throw new Error(`${where} (${id}): headline must be 1-90 characters`);
  }
  if (typeof body !== 'string' || body.length > 200) {
    throw new Error(`${where} (${id}): body must be at most 200 characters`);
  }
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')) {
    throw new Error(`${where} (${id}): tags must be a list of strings`);
  }
  const item: NewsItem = { id, headline, body, tags: tags as string[] };
  if (typeof image === 'string') item.image = image;
  if (live === true) item.live = true;
  return item;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
