import type { NewsItem } from '@the-world/shared';

/** Seconds each bulletin stays on screen. */
export const BULLETIN_SECONDS = 9;

/**
 * Decides what airs when. Bulletins rotate in order; live items pushed at runtime (later from
 * the server) jump the queue, air once at the front, then join the rotation.
 */
export class NewsQueue {
  private readonly rotation: NewsItem[];
  private readonly pending: NewsItem[] = [];
  private index = 0;
  private current: NewsItem;
  private shownAt = 0;

  constructor(items: NewsItem[]) {
    if (items.length === 0) throw new Error('NewsQueue needs at least one item');
    this.rotation = [...items];
    this.current = this.rotation[0]!;
  }

  /** Adds a breaking item; it airs next. */
  push(item: NewsItem): void {
    this.pending.push({ ...item, live: true });
  }

  /** The item on air at `time` (seconds) and how far through it we are (0..1). */
  at(time: number): { item: NewsItem; progress: number } {
    if (time - this.shownAt >= BULLETIN_SECONDS || this.pending.length > 0) {
      if (time - this.shownAt >= BULLETIN_SECONDS || !this.current.live) this.advance(time);
    }
    return { item: this.current, progress: Math.min(1, (time - this.shownAt) / BULLETIN_SECONDS) };
  }

  /** Every headline joined for the scrolling ticker. */
  tickerText(): string {
    return this.rotation.map((i) => i.headline.toUpperCase()).join('   ///   ');
  }

  private advance(time: number): void {
    const breaking = this.pending.shift();
    if (breaking) {
      this.current = breaking;
      this.rotation.splice(this.index, 0, { ...breaking, live: false });
    } else {
      this.index = (this.index + 1) % this.rotation.length;
      this.current = this.rotation[this.index]!;
    }
    this.shownAt = time;
  }
}
