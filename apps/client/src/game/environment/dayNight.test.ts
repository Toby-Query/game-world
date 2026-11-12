import { describe, expect, it } from 'vitest';
import { skyAt, wrapDay } from './dayNight';

describe('wrapDay', () => {
  it('wraps into 0..1', () => {
    expect(wrapDay(1.25)).toBeCloseTo(0.25);
    expect(wrapDay(-0.25)).toBeCloseTo(0.75);
  });
});

describe('skyAt', () => {
  it('is brightest at noon and darkest at midnight', () => {
    const noon = skyAt(0.5);
    const midnight = skyAt(0);
    expect(noon.daylight).toBe(1);
    expect(midnight.daylight).toBe(0);
    expect(noon.keyIntensity).toBeGreaterThan(midnight.keyIntensity);
    expect(noon.skyTop.b).toBeGreaterThan(midnight.skyTop.b);
  });

  it('keeps the light above the horizon so shadows stay sane', () => {
    for (let t = 0; t < 1; t += 0.05) {
      expect(skyAt(t).lightDirection.y).toBeGreaterThan(0);
    }
  });

  it('returns a unit light direction', () => {
    const { x, y, z } = skyAt(0.4).lightDirection;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
  });

  it('makes neon brighter at night', () => {
    expect(skyAt(0).neon).toBeGreaterThan(skyAt(0.5).neon);
  });

  it('warms the horizon at sunset', () => {
    const sunset = skyAt(0.75);
    expect(sunset.skyHorizon.r).toBeGreaterThan(sunset.skyHorizon.b);
  });
});
