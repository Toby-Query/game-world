import * as THREE from 'three/webgpu';
import type { ZoneDefinition } from '@the-world/shared';
import { staticBox } from '../builders';
import type { LevelContext } from '../Level';
import { ARCHIVE } from './layout';

export interface OrbitalWing {
  update(elapsed: number): void;
}

interface WingMaterials {
  stone: THREE.Material;
  cyan: THREE.Material;
  magenta: THREE.Material;
  trim: THREE.Material;
}

/** Floating platforms inside the annex, low enough to need low gravity to chain. */
export const ORBITAL_PLATFORMS = [
  { x: 20.2, y: 2.6, z: -25.2, size: 2.6 },
  { x: 25.2, y: 5, z: -23.6, size: 2.4 },
  { x: 24.6, y: 7.4, z: -18.8, size: 2.4 },
  { x: 20, y: 9.6, z: -19.4, size: 3 },
] as const;

/**
 * The Orbital Wing: the museum annex fitted out as a low-gravity hall, a teaser for the Orbital
 * Station island. The physics change itself comes from the zone in `content/zones/`; this only
 * builds what the player sees and climbs.
 */
export function buildOrbitalWing(
  ctx: LevelContext,
  m: WingMaterials,
  zone: ZoneDefinition | undefined,
): OrbitalWing {
  const { centre, width, depth, height } = ARCHIVE.annex;

  // Dark starfield floor with a cyan ring, so the room reads differently from the museum.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(Math.min(width, depth) / 2 - 0.6, 48),
    new THREE.MeshStandardMaterial({ color: 0x101a2e, roughness: 0.3, metalness: 0.4 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centre.x, 0.02, centre.z);
  floor.receiveShadow = true;
  ctx.scene.add(floor);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(Math.min(width, depth) / 2 - 0.9, Math.min(width, depth) / 2 - 0.6, 64),
    m.cyan,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(centre.x, 0.03, centre.z);
  ctx.scene.add(ring);

  // Night-sky lining on the inside of the walls and ceiling (visual only; the shell collides).
  const sky = new THREE.MeshStandardMaterial({
    color: 0x0a1222,
    roughness: 0.95,
    emissive: 0xffffff,
    emissiveMap: starTexture(),
    emissiveIntensity: 1.2,
  });
  const inset = 0.42;
  const lining: [number, number, number, number, number, number][] = [
    // [width, height, depth, x, y, z]
    [0.02, height, depth - 0.8, centre.x + width / 2 - inset, height / 2, centre.z],
    [width - 0.8, height, 0.02, centre.x, height / 2, centre.z - depth / 2 + inset],
    [width - 0.8, height, 0.02, centre.x, height / 2, centre.z + depth / 2 - inset],
    [width - 0.8, 0.02, depth - 0.8, centre.x, height - 0.02, centre.z],
  ];
  for (const [w, h, d, x, y, z] of lining) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), sky);
    panel.position.set(x, y, z);
    ctx.scene.add(panel);
  }
  // The door wall: two panels either side of the doorway, plus the lintel above it.
  const side = (depth - ARCHIVE.annex.doorWidth) / 2 - 0.4;
  const doorWallX = centre.x - width / 2 + inset;
  for (const dir of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, height, side), sky);
    panel.position.set(
      doorWallX,
      height / 2,
      centre.z + dir * (ARCHIVE.annex.doorWidth / 2 + side / 2),
    );
    ctx.scene.add(panel);
  }
  const lintelHeight = height - ARCHIVE.museum.doorHeight;
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, lintelHeight, ARCHIVE.annex.doorWidth),
    sky,
  );
  lintel.position.set(doorWallX, ARCHIVE.museum.doorHeight + lintelHeight / 2, centre.z);
  ctx.scene.add(lintel);

  // Floating platforms with neon undersides.
  for (const p of ORBITAL_PLATFORMS) {
    const slab = staticBox(
      ctx,
      { x: p.size, y: 0.4, z: p.size },
      { x: p.x, y: p.y, z: p.z },
      m.stone,
    );
    const glow = new THREE.Mesh(new THREE.BoxGeometry(p.size - 0.4, 0.06, p.size - 0.4), m.cyan);
    glow.position.y = -0.23;
    slab.add(glow);
  }

  // A small planet with a ring hanging in the middle of the room (decoration, no collider).
  const planet = new THREE.Group();
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xe0a35a, roughness: 0.6, emissive: 0x3a1c06 }),
  );
  const rings = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.06, 6, 64), m.magenta);
  rings.rotation.x = Math.PI / 2.4;
  planet.add(globe, rings);
  planet.position.set(centre.x + 0.6, 11.5, centre.z + 1);
  ctx.scene.add(planet);

  // Drifting dust motes so the low gravity is visible even when standing still.
  const count = 160;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = centre.x + (Math.random() - 0.5) * (width - 1.5);
    positions[i * 3 + 1] = Math.random() * (height - 1);
    positions[i * 3 + 2] = centre.z + (Math.random() - 0.5) * (depth - 1.5);
    seeds[i] = Math.random() * Math.PI * 2;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({ color: 0x9feeff, size: 0.08, transparent: true, opacity: 0.8 }),
  );
  ctx.scene.add(dust);

  // Cool light so the hall reads as "space".
  const light = new THREE.PointLight(0x7fd8ff, 60, 18, 1.6);
  light.position.set(centre.x, height - 2, centre.z);
  ctx.scene.add(light);

  // Sign over the doorway (on the museum side) and a plaque explaining the room.
  const doorX = centre.x - width / 2;
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.35, ARCHIVE.annex.doorWidth + 0.6),
    m.cyan,
  );
  sign.position.set(doorX - 0.5, ARCHIVE.museum.doorHeight - 0.4, centre.z);
  ctx.scene.add(sign);
  const plinth = staticBox(
    ctx,
    { x: 0.6, y: 1, z: 0.6 },
    { x: doorX + 1.6, y: 0.5, z: centre.z + 3.4 },
    m.trim,
  );
  plinth.castShadow = false;
  ctx.interactions.add({
    id: 'orbital-wing-plaque',
    position: { x: doorX + 1.6, y: 0, z: centre.z + 3.4 },
    radius: 2.4,
    prompt: 'Read: Orbital Wing',
    onInteract: () =>
      ctx.hud.openPanel({
        kicker: 'Archive Museum',
        title: zone?.name ?? 'Orbital Wing',
        meta: 'Teaser · Orbital Station',
        body:
          'Salvagers found this room drifting loose from the Orbital Station and bolted it to the ' +
          'museum. Its gravity came with it. Jump and you will float; climb the platforms to the ' +
          'top. Walk back through the door and the world pulls on you again.',
      }),
  });

  return {
    update(elapsed) {
      planet.rotation.y = elapsed * 0.15;
      planet.position.y = 11.5 + Math.sin(elapsed * 0.4) * 0.3;
      const attr = dustGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        let y = attr.getY(i) + 0.004 + Math.sin(elapsed + (seeds[i] ?? 0)) * 0.002;
        if (y > height - 1) y = 0.2;
        attr.setY(i, y);
      }
      attr.needsUpdate = true;
    },
  };
}

/** A small tiling texture of white star specks for the hall's lining. */
function starTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < 420; i++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const v = 120 + Math.floor(Math.random() * 135);
    const o = (y * size + x) * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = Math.min(255, v + 30);
  }
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
