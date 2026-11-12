import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import { resolveZoneRules } from '@the-world/shared';

/** Palette for the Archive: deep ocean, warm key light, neon accents (see spec, Art direction). */
export const PALETTE = {
  sky: 0x1b2c44,
  fog: 0x22344d,
  ocean: 0x0e4a63,
  stone: 0xd9d2c3,
  gold: 0xe7b54a,
  cyan: 0x3ee6ff,
  magenta: 0xff4fd8,
  keyLight: 0xffd9a8,
  fill: 0x6c8fd6,
} as const;

export interface PlaceholderScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
}

/**
 * A lit placeholder: a floating artifact on a pedestal above an endless-looking ocean,
 * plus a few physics-driven orbs so the Rapier integration is visibly working.
 */
export function createPlaceholderScene(rapier: typeof RAPIER): PlaceholderScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 30, 140);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(9, 6, 12);
  camera.lookAt(0, 2.5, 0);

  // Lighting: warm key, cool sky fill, rim light from behind.
  scene.add(new THREE.HemisphereLight(PALETTE.fill, PALETTE.ocean, 0.9));
  const key = new THREE.DirectionalLight(PALETTE.keyLight, 2.6);
  key.position.set(12, 18, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -15;
  key.shadow.camera.right = 15;
  key.shadow.camera.top = 15;
  key.shadow.camera.bottom = -15;
  scene.add(key);
  const rim = new THREE.DirectionalLight(PALETTE.cyan, 1.4);
  rim.position.set(-10, 6, -12);
  scene.add(rim);

  // Ocean: a large plane that fades into fog, so it reads as endless.
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600, 1, 1),
    new THREE.MeshStandardMaterial({ color: PALETTE.ocean, roughness: 0.35, metalness: 0.1 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.6;
  ocean.receiveShadow = true;
  scene.add(ocean);

  // Platform and pedestal.
  const stone = new THREE.MeshStandardMaterial({ color: PALETTE.stone, roughness: 0.8 });
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 1.2, 48), stone);
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 1.6, 24), stone);
  pedestal.position.y = 1.4;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  // Glowing ring around the pedestal (Archive neon accent).
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.06, 12, 96),
    new THREE.MeshStandardMaterial({
      color: PALETTE.cyan,
      emissive: PALETTE.cyan,
      emissiveIntensity: 2,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.65;
  scene.add(ring);

  // The rotating artifact.
  const artifact = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 0),
    new THREE.MeshStandardMaterial({
      color: PALETTE.gold,
      metalness: 0.85,
      roughness: 0.25,
      flatShading: true,
      emissive: PALETTE.gold,
      emissiveIntensity: 0.15,
    }),
  );
  artifact.position.y = 3.4;
  artifact.castShadow = true;
  scene.add(artifact);

  // Physics: a world using the shared default zone rules, with orbs dropping onto the platform.
  const rules = resolveZoneRules();
  const world = new rapier.World(rules.gravity);
  world.createCollider(rapier.ColliderDesc.cylinder(0.6, 7));
  world.createCollider(rapier.ColliderDesc.cylinder(0.8, 1.05).setTranslation(0, 1.4, 0));

  const orbMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.magenta,
    emissive: PALETTE.magenta,
    emissiveIntensity: 0.4,
    roughness: 0.4,
  });
  const orbGeometry = new THREE.SphereGeometry(0.35, 24, 16);
  const orbs: { mesh: THREE.Mesh; body: RAPIER.RigidBody }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const start = { x: Math.cos(angle) * 4, y: 6 + i * 1.5, z: Math.sin(angle) * 4 };
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z),
    );
    world.createCollider(rapier.ColliderDesc.ball(0.35).setRestitution(0.6), body);
    const mesh = new THREE.Mesh(orbGeometry, orbMaterial);
    mesh.castShadow = true;
    scene.add(mesh);
    orbs.push({ mesh, body });
  }

  let elapsed = 0;
  return {
    scene,
    camera,
    update(dt: number) {
      elapsed += dt;
      artifact.rotation.y += dt * 0.6;
      artifact.rotation.x = Math.sin(elapsed * 0.7) * 0.25;
      artifact.position.y = 3.4 + Math.sin(elapsed * 1.3) * 0.15;
      ring.rotation.z += dt * 0.2;

      world.timestep = Math.min(dt, 1 / 30) * rules.timeScale;
      world.step();
      for (const { mesh, body } of orbs) {
        const p = body.translation();
        // Respawn orbs that roll off into the sea.
        if (p.y < -5) {
          body.setTranslation(
            { x: (Math.random() - 0.5) * 6, y: 10, z: (Math.random() - 0.5) * 6 },
            true,
          );
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        mesh.position.set(p.x, p.y, p.z);
        const r = body.rotation();
        mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
    },
  };
}
