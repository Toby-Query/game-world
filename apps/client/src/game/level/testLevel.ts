import * as THREE from 'three/webgpu';
import { staticBox, staticCylinder, stairs } from './builders';
import type { Level, LevelContext } from './Level';

/**
 * Movement test course: flat ground, ramps at walkable and too-steep angles, stairs,
 * jump boxes and pillars (camera collision). Replaced by the Archive as the default level.
 */
export function buildTestLevel(ctx: LevelContext): Level {
  const { scene } = ctx;
  scene.background = new THREE.Color(0x1b2c44);
  scene.fog = new THREE.Fog(0x22344d, 40, 160);

  scene.add(new THREE.HemisphereLight(0x8fb0e6, 0x2a3a2a, 1.1));
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.4);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 120 });
  scene.add(sun);

  const ground = new THREE.MeshStandardMaterial({ color: 0x5b6b5a, roughness: 0.95 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.8 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x3ee6ff, roughness: 0.4 });
  const warn = new THREE.MeshStandardMaterial({ color: 0xff7a59, roughness: 0.6 });

  staticBox(ctx, { x: 120, y: 1, z: 120 }, { x: 0, y: -0.5, z: 0 }, ground);

  // Ramps: 20 and 35 degrees are walkable; 60 degrees is too steep and should be slid off.
  const ramp = (angleDeg: number, x: number, material: THREE.Material): void => {
    const a = (angleDeg * Math.PI) / 180;
    const length = 8;
    staticBox(
      ctx,
      { x: 3, y: 0.3, z: length },
      { x, y: (Math.sin(a) * length) / 2, z: -10 },
      material,
      [a, 0, 0],
    );
  };
  ramp(20, -8, stone);
  ramp(35, -4, stone);
  ramp(60, 0, warn);

  // Stairs with 25 cm steps (autostep handles them).
  stairs(ctx, { x: 6, y: 0, z: -6 }, 8, 0.25, 0.45, 3, stone, -1);
  staticBox(ctx, { x: 3, y: 2, z: 4 }, { x: 6, y: 1, z: -11.6 }, stone);

  // Jump boxes of increasing height.
  [0.6, 1.0, 1.4, 1.8].forEach((h, i) =>
    staticBox(ctx, { x: 1.6, y: h, z: 1.6 }, { x: -10 + i * 2.6, y: h / 2, z: 6 }, accent),
  );

  // Pillars for camera collision.
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    staticCylinder(
      ctx,
      0.6,
      0.7,
      5,
      { x: 12 + Math.cos(angle) * 6, y: 2.5, z: 8 + Math.sin(angle) * 6 },
      stone,
    );
  }

  return { spawn: new THREE.Vector3(0, 0, 4) };
}
