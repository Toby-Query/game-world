import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseExhibit, parseExhibits } from './exhibits';

const base = {
  id: 'trident',
  name: "Poseidon's Trident",
  mythology: 'Greek',
  model: 'trident',
  plaque: 'Recovered intact.',
  island: 'Isle of Olympus',
  order: 1,
};

describe('parseExhibit', () => {
  it('accepts a valid exhibit', () => {
    expect(parseExhibit(base)).toEqual(base);
  });

  it('names the file and field when something is wrong', () => {
    expect(() => parseExhibit({ ...base, plaque: '' }, 'trident.json')).toThrow(
      /trident\.json: "plaque"/,
    );
    expect(() => parseExhibit({ ...base, order: 1.5 })).toThrow(/order/);
  });
});

describe('parseExhibits', () => {
  it('sorts by order and rejects duplicate ids', () => {
    const sorted = parseExhibits({ a: { ...base, order: 2 }, b: { ...base, id: 'x', order: 0 } });
    expect(sorted.map((e) => e.id)).toEqual(['x', 'trident']);
    expect(() => parseExhibits({ a: base, b: base })).toThrow(/Duplicate/);
  });

  it('accepts every shipped exhibit in content/exhibits', () => {
    const dir = new URL('../../../content/exhibits/', import.meta.url);
    const files = Object.fromEntries(
      readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => [f, JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as unknown]),
    );
    expect(parseExhibits(files)).toHaveLength(6);
  });
});
