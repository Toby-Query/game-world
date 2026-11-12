import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ZONE_RULES,
  activeZone,
  blendRules,
  depthInside,
  parseZone,
  parseZones,
  resolveZoneRules,
  rulesAt,
  type ZoneVolume,
} from './zones';

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

const box = (id: string, size: number, priority: number, gravityY: number): ZoneVolume => ({
  id,
  name: id,
  min: { x: -size, y: -size, z: -size },
  max: { x: size, y: size, z: size },
  priority,
  rules: { gravity: { x: 0, y: gravityY, z: 0 } },
});

describe('zone resolution', () => {
  const island = box('island', 100, 1, -5);
  const room = box('room', 10, 2, -1);

  it('measures depth inside a volume', () => {
    expect(depthInside(room, { x: 0, y: 0, z: 0 })).toBe(10);
    expect(depthInside(room, { x: 12, y: 0, z: 0 })).toBe(-2);
  });

  it('uses the default rules outside every zone', () => {
    expect(rulesAt([island, room], { x: 500, y: 0, z: 0 })).toEqual({
      rules: DEFAULT_ZONE_RULES,
      zone: null,
    });
  });

  it('lets a higher-priority nested zone win', () => {
    expect(activeZone([island, room], { x: 0, y: 0, z: 0 })?.id).toBe('room');
    expect(activeZone([island, room], { x: 50, y: 0, z: 0 })?.id).toBe('island');
  });

  it('prefers the smaller zone when priorities tie', () => {
    const big = box('big', 50, 1, -2);
    const small = box('small', 5, 1, -3);
    expect(activeZone([big, small], { x: 0, y: 0, z: 0 })?.id).toBe('small');
  });

  it('fades rules in over the blend distance', () => {
    const blended = { ...room, blend: 4 };
    const edge = rulesAt([blended], { x: 8, y: 0, z: 0 }).rules; // 2 m inside = halfway
    expect(edge.gravity.y).toBeCloseTo((-9.81 + -1) / 2);
    const deep = rulesAt([blended], { x: 0, y: 0, z: 0 }).rules;
    expect(deep.gravity.y).toBeCloseTo(-1);
  });
});

describe('blendRules', () => {
  it('switches booleans at the halfway point', () => {
    const flying = resolveZoneRules({ flightAllowed: true });
    expect(blendRules(DEFAULT_ZONE_RULES, flying, 0.4).flightAllowed).toBe(false);
    expect(blendRules(DEFAULT_ZONE_RULES, flying, 0.6).flightAllowed).toBe(true);
  });
});

describe('parseZone', () => {
  const valid = {
    id: 'orbital-wing',
    name: 'Orbital Wing',
    level: 'archive',
    min: { x: 0, y: 0, z: 0 },
    max: { x: 10, y: 10, z: 10 },
    priority: 5,
    blend: 2,
    rules: { gravity: { y: -2 }, jumpMultiplier: 1.2 },
  };

  it('reads a valid zone and fills missing gravity axes with zero', () => {
    const zone = parseZone(valid);
    expect(zone.rules.gravity).toEqual({ x: 0, y: -2, z: 0 });
    expect(zone.rules.jumpMultiplier).toBe(1.2);
    expect(zone.rules).not.toHaveProperty('airDrag');
    expect(zone.blend).toBe(2);
  });

  it('rejects inverted boxes, wild values and bad ids', () => {
    expect(() => parseZone({ ...valid, max: { x: -1, y: 10, z: 10 } })).toThrow(/min/);
    expect(() => parseZone({ ...valid, rules: { gravity: { y: -500 } } })).toThrow(/gravity/);
    expect(() => parseZone({ ...valid, id: 'Bad Id' })).toThrow(/id/);
    expect(() => parseZone({ ...valid, rules: { flightAllowed: 'yes' } })).toThrow(/flight/);
  });

  it('rejects duplicate ids across files', () => {
    expect(() => parseZones({ 'a.json': valid, 'b.json': valid })).toThrow(/Duplicate/);
  });
});
