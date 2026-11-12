/**
 * Measurements of the Archive in metres. Other systems (news screens, exhibits, zones) place
 * themselves using these, so the layout can change in one place.
 */
export const ARCHIVE = {
  /** Walkable plaza: a disc at y = 0. */
  plazaRadius: 42,
  oceanLevel: -7,
  spawn: { x: 0, y: 0, z: 22 },

  /** The museum, entered through a gap in its front (+Z) wall. */
  museum: {
    centre: { x: 0, z: -22 },
    width: 34,
    depth: 24,
    height: 11,
    wall: 0.8,
    doorWidth: 7,
    doorHeight: 6,
  },

  /** East annex reached through a door in the museum's east wall (low-gravity hall, #10). */
  annex: {
    centre: { x: 22.5, z: -22 },
    width: 11,
    depth: 12,
    height: 14,
    doorWidth: 4,
  },

  /** Towers around the plaza edge: angle in degrees from +X, counter-clockwise seen from above. */
  towers: [
    { angle: -15, height: 46, size: 7 },
    { angle: -55, height: 62, size: 8 },
    { angle: -125, height: 56, size: 8 },
    { angle: -165, height: 38, size: 6 },
    { angle: 150, height: 34, size: 7 },
  ],
  towerRing: 32,

  /** Piers reaching out over the ocean from the plaza edge. */
  piers: [
    { angle: 0, length: 22, width: 5 },
    { angle: 180, length: 22, width: 5 },
    { angle: -90, length: 16, width: 6 },
  ],
} as const;

export interface TowerPlacement {
  x: number;
  z: number;
  height: number;
  size: number;
  /** Yaw so the tower's front face looks at the plaza centre. */
  facing: number;
}

export function towerPlacements(): TowerPlacement[] {
  return ARCHIVE.towers.map((t) => {
    const a = (t.angle * Math.PI) / 180;
    const x = Math.cos(a) * ARCHIVE.towerRing;
    const z = -Math.sin(a) * ARCHIVE.towerRing;
    return { x, z, height: t.height, size: t.size, facing: Math.atan2(-x, -z) + Math.PI };
  });
}
