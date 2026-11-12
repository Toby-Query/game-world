import { describe, expect, it } from 'vitest';
import { DEFAULT_ZONE_RULES, resolveZoneRules } from './zones';

describe('resolveZoneRules', () => {
  it('returns the defaults when nothing is overridden', () => {
    expect(resolveZoneRules()).toEqual(DEFAULT_ZONE_RULES);
  });

  it('overrides only the given fields', () => {
    const rules = resolveZoneRules({ jumpMultiplier: 3, flightAllowed: true });
    expect(rules.jumpMultiplier).toBe(3);
    expect(rules.flightAllowed).toBe(true);
    expect(rules.gravity).toEqual(DEFAULT_ZONE_RULES.gravity);
  });

  it('does not share the default gravity object', () => {
    const rules = resolveZoneRules();
    rules.gravity.y = -1;
    expect(DEFAULT_ZONE_RULES.gravity.y).toBe(-9.81);
  });
});
