import { describe, expect, it } from 'vitest';
import { wrap } from './NewsScreen';

// One unit of width per character keeps the maths obvious.
const ctx = { measureText: (t: string) => ({ width: t.length }) as TextMetrics };

describe('wrap', () => {
  it('breaks lines on word boundaries', () => {
    expect(wrap(ctx, 'the quick brown fox', 10, 3)).toEqual(['the quick', 'brown fox']);
  });

  it('caps the number of lines and marks the cut', () => {
    const lines = wrap(ctx, 'one two three four five six seven', 9, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith('…')).toBe(true);
  });

  it('keeps a single word that is longer than the line', () => {
    expect(wrap(ctx, 'supercalifragilistic', 5, 2)).toEqual(['supercalifragilistic']);
  });
});
