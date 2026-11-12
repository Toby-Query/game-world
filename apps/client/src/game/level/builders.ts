import * as THREE from 'three/webgpu';
import type { LevelContext } from './Level';

/** Adds a static box with a matching physics collider. Position is the box centre. */
export function staticBox(
  ctx: LevelContext,
  size: THREE.Vector3Like,
  position: THREE.Vector3Like,
  material: THREE.Material,
  rotation: THREE.EulerTuple = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);

  const q = mesh.quaternion;
  ctx.world.createCollider(
    ctx.rapier.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
  return mesh;
}

/** Adds a static vertical cylinder with a matching collider. Position is the cylinder centre. */
export function staticCylinder(
  ctx: LevelContext,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: THREE.Vector3Like,
  material: THREE.Material,
  segments = 32,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  ctx.world.createCollider(
    ctx.rapier.ColliderDesc.cylinder(height / 2, Math.max(radiusTop, radiusBottom)).setTranslation(
      position.x,
      position.y,
      position.z,
    ),
  );
  return mesh;
}

/** A flight of stairs rising along +Z from `start` (the bottom front edge, centred). */
export function stairs(
  ctx: LevelContext,
  start: THREE.Vector3Like,
  steps: number,
  stepHeight: number,
  stepDepth: number,
  width: number,
  material: THREE.Material,
  direction: 1 | -1 = 1,
): void {
  for (let i = 0; i < steps; i++) {
    const h = stepHeight * (i + 1);
    staticBox(
      ctx,
      { x: width, y: h, z: stepDepth },
      { x: start.x, y: start.y + h / 2, z: start.z + direction * (i + 0.5) * stepDepth },
      material,
    );
  }
}
