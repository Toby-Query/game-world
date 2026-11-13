import { describe, expect, it } from 'vitest';
import {
  COMBAT,
  Cooldowns,
  chooseLoot,
  inMeleeArc,
  parseAttack,
  positionAt,
  rayHitsBody,
  rewindTime,
} from './combat';
import type { InventoryItem } from './account';

const at = (x: number, z: number, y = 0) => ({ x, y, z });
const forward = { x: 0, y: 0, z: -1 };

describe('inMeleeArc', () => {
  it('hits targets close in front, not behind, beside or far away', () => {
    expect(inMeleeArc(at(0, 0), forward, at(0, -1.5))).toBe(true);
    expect(inMeleeArc(at(0, 0), forward, at(1, -1.5))).toBe(true);
    expect(inMeleeArc(at(0, 0), forward, at(0, 1.5))).toBe(false);
    expect(inMeleeArc(at(0, 0), forward, at(2, 0.2))).toBe(false);
    expect(inMeleeArc(at(0, 0), forward, at(0, -5))).toBe(false);
    expect(inMeleeArc(at(0, 0), forward, at(0, -1.5, 3))).toBe(false);
  });
});

describe('rayHitsBody', () => {
  const eye = { x: 0, y: 1.5, z: 0 };

  it('hits a body in the line of fire and reports the distance', () => {
    const d = rayHitsBody(eye, forward, at(0, -10), 40);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(10);
  });

  it('misses to the side, over the head, behind and out of range', () => {
    expect(rayHitsBody(eye, forward, at(3, -10), 40)).toBeNull();
    expect(rayHitsBody(eye, { x: 0, y: 0.6, z: -0.8 }, at(0, -10), 40)).toBeNull();
    expect(rayHitsBody(eye, forward, at(0, 10), 40)).toBeNull();
    expect(rayHitsBody(eye, forward, at(0, -60), 40)).toBeNull();
  });
});

describe('lag compensation', () => {
  const history = [
    { t: 1000, ...at(0, 0) },
    { t: 1100, ...at(1, 0) },
    { t: 1200, ...at(2, 0) },
  ];

  it('rewinds positions to the time the attacker saw', () => {
    expect(positionAt(history, 1150)?.x).toBeCloseTo(1.5);
    expect(positionAt(history, 5000)?.x).toBe(2);
  });

  it('never rewinds further than the limit, or into the future', () => {
    expect(rewindTime(0, 10_000)).toBe(10_000 - COMBAT.lagCompensationMs);
    expect(rewindTime(9_900, 10_000)).toBe(9_900);
    expect(rewindTime(20_000, 10_000)).toBe(10_000);
  });
});

describe('chooseLoot', () => {
  const item = (id: string, equipped = false): InventoryItem => ({
    id,
    slot: 0,
    kind: 'x',
    name: id,
    equipped,
  });

  it('drops half the carried items, rounded up, never equipped ones', () => {
    const items = [item('a'), item('b'), item('c'), item('sword', true)];
    const loot = chooseLoot(items, () => 0);
    expect(loot.map((i) => i.id)).toEqual(['a', 'b']);
    expect(chooseLoot([item('only')]).length).toBe(1);
    expect(chooseLoot([item('sword', true)])).toEqual([]);
  });
});

describe('parseAttack', () => {
  it('normalises the aim and rejects junk', () => {
    const ok = parseAttack({
      kind: 'ranged',
      dir: { x: 0, y: 0, z: -5 },
      origin: at(0, 0),
      seenAt: 1,
    });
    expect(ok?.dir).toEqual({ x: 0, y: 0, z: -1 });
    expect(parseAttack({ kind: 'nuke', dir: forward, origin: at(0, 0), seenAt: 1 })).toBeNull();
    expect(parseAttack({ kind: 'melee', dir: at(0, 0), origin: at(0, 0), seenAt: 1 })).toBeNull();
  });
});

describe('Cooldowns', () => {
  it('blocks an action until its cooldown passes', () => {
    const c = new Cooldowns();
    expect(c.use('melee', 600, 0)).toBe(true);
    expect(c.use('melee', 600, 300)).toBe(false);
    expect(c.use('ranged', 900, 300)).toBe(true);
    expect(c.use('melee', 600, 600)).toBe(true);
  });
});
