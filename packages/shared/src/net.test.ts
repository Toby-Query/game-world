import { describe, expect, it } from 'vitest';
import {
  NET,
  cellFor,
  checkMove,
  interpolatePose,
  parsePose,
  placementOf,
  playersNear,
  sanitizeJoinOptions,
  type TimedPose,
} from './net';

const pose = (t: number, x: number, facing = 0): TimedPose => ({
  t,
  x,
  y: 0,
  z: 0,
  facing,
  speed: 1,
  grounded: true,
  vy: 0,
});

describe('checkMove', () => {
  const origin = { x: 0, y: 0, z: 0 };

  it('accepts moves within top speed', () => {
    const r = checkMove(origin, { x: 0.6, y: 0, z: 0.3 }, 1 / 15);
    expect(r.ok).toBe(true);
    expect(r.position).toEqual({ x: 0.6, y: 0, z: 0.3 });
  });

  it('clamps speed hacks along the direction of travel', () => {
    const r = checkMove(origin, { x: 100, y: 0, z: 0 }, 1 / 15);
    expect(r.ok).toBe(false);
    expect(r.position.x).toBeCloseTo(NET.maxHorizontalSpeed / 15 + 0.5);
    expect(r.position.z).toBe(0);
  });

  it('clamps vertical teleports', () => {
    const r = checkMove(origin, { x: 0, y: 500, z: 0 }, 0.1);
    expect(r.ok).toBe(false);
    expect(r.position.y).toBeCloseTo(NET.maxVerticalSpeed * 0.1 + 0.5);
  });

  it('caps the time window so a long silence does not allow a teleport', () => {
    expect(checkMove(origin, { x: 200, y: 0, z: 0 }, 60).ok).toBe(false);
  });
});

describe('parsePose', () => {
  it('rejects malformed moves', () => {
    expect(parsePose(null)).toBeNull();
    expect(parsePose({ x: 1, y: 2, z: Number.NaN, facing: 0 })).toBeNull();
    expect(parsePose({ x: '1', y: 2, z: 3, facing: 0 })).toBeNull();
  });

  it('clamps animation fields', () => {
    const p = parsePose({ x: 1, y: 2, z: 3, facing: 0, speed: 999, vy: -999, grounded: 'yes' });
    expect(p).toMatchObject({ speed: NET.maxHorizontalSpeed, vy: -NET.maxVerticalSpeed });
    expect(p?.grounded).toBe(false);
  });
});

describe('playersNear', () => {
  it('keeps players inside the interest radius and leaves out yourself', () => {
    const me = { id: 'me', x: 0, z: 0 };
    const players = [me, { id: 'near', x: 30, z: 40 }, { id: 'far', x: 300, z: 0 }];
    expect(playersNear(players, me, 50).map((p) => p.id)).toEqual(['near']);
  });
});

describe('interpolatePose', () => {
  const buffer = [pose(0, 0, 3), pose(100, 10, -3)];

  it('blends between snapshots', () => {
    expect(interpolatePose(buffer, 50)?.x).toBeCloseTo(5);
  });

  it('turns the short way round', () => {
    const facing = interpolatePose(buffer, 50)!.facing;
    expect(Math.abs(Math.abs(facing) - Math.PI)).toBeLessThan(0.01);
  });

  it('holds the ends instead of extrapolating', () => {
    expect(interpolatePose(buffer, -50)?.x).toBe(0);
    expect(interpolatePose(buffer, 500)?.x).toBe(10);
    expect(interpolatePose([], 0)).toBeNull();
  });
});

describe('join options and cells', () => {
  it('sanitizes the joining character', () => {
    const j = sanitizeJoinOptions({ appearance: { name: '  Ayo  ', hair: 'nope' } });
    expect(j.name).toBe('Ayo');
    expect(j.appearance.hair).not.toBe('nope');
  });

  it('puts the Archive in cell 0:0', () => {
    expect(cellFor(0, 0)).toBe('0:0');
    expect(cellFor(30, -40)).toBe('0:0');
    expect(cellFor(600, 0)).toBe('1:0');
  });
});

describe('placementOf', () => {
  it('reads a whole, non-negative placement and defaults to 0', () => {
    expect(placementOf({ placement: 3 })).toBe(3);
    expect(placementOf({})).toBe(0);
    expect(placementOf(null)).toBe(0);
    expect(placementOf({ placement: -1 })).toBe(0);
    expect(placementOf({ placement: 1.5 })).toBe(0);
  });
});
