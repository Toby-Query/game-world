import * as THREE from 'three/webgpu';
import { parseExhibits, type Exhibit } from '@the-world/shared';
import { staticCylinder } from '../level/builders';
import type { LevelContext } from '../level/Level';
import { buildArtifact } from './artifactModels';

const files = import.meta.glob('@content/exhibits/*.json', { eager: true, import: 'default' });

/** Every exhibit in `content/exhibits/`, validated and in display order. */
export function loadExhibits(): Exhibit[] {
  return parseExhibits(files);
}

export interface ExhibitHall {
  exhibits: Exhibit[];
  update(elapsed: number): void;
}

interface Slot {
  x: number;
  z: number;
}

/**
 * Places each exhibit on a pedestal with a light beam and a slowly turning model, and registers a
 * "Read plaque" interaction that opens the exhibit's text in the HUD.
 */
export function buildExhibitHall(
  ctx: LevelContext,
  slots: Slot[],
  hallCentreZ: number,
): ExhibitHall {
  const { interactions, hud } = ctx;
  const exhibits = loadExhibits();
  const stone = new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 0.6 });
  const brass = new THREE.MeshStandardMaterial({
    color: 0xb08d57,
    metalness: 0.7,
    roughness: 0.35,
  });
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x9fe9ff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const spinners: { model: THREE.Object3D; base: number; phase: number }[] = [];

  // Warm gallery lighting under the roof (no shadows, to keep the cost low).
  for (const x of [-9, 9]) {
    const lamp = new THREE.PointLight(0xffe2b8, 120, 26, 2);
    lamp.position.set(x, 8, hallCentreZ);
    ctx.scene.add(lamp);
  }

  exhibits.forEach((exhibit, i) => {
    const slot = slots[i];
    if (!slot) {
      console.warn(`No museum slot for exhibit "${exhibit.id}"`);
      return;
    }
    staticCylinder(ctx, 0.75, 0.9, 1.1, { x: slot.x, y: 0.55, z: slot.z }, stone, 24);
    const trimRing = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 8, 32), brass);
    trimRing.rotation.x = Math.PI / 2;
    trimRing.position.set(slot.x, 1.1, slot.z);
    ctx.scene.add(trimRing);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.75, 5, 24, 1, true),
      beamMaterial,
    );
    beam.position.set(slot.x, 3.6, slot.z);
    ctx.scene.add(beam);

    const model = buildArtifact(exhibit.model);
    model.position.set(slot.x, 2, slot.z);
    ctx.scene.add(model);
    spinners.push({ model, base: 2, phase: i * 1.3 });

    // A small brass plaque on a stand in front of the pedestal (toward the hall's centre line).
    const towardCentre = Math.sign(hallCentreZ - slot.z) || 1;
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), brass);
    plaque.position.set(slot.x, 0.9, slot.z + towardCentre * 1.15);
    plaque.rotation.x = -0.5 * towardCentre;
    if (towardCentre < 0) plaque.rotation.y = Math.PI;
    ctx.scene.add(plaque);

    interactions.add({
      id: exhibit.id,
      position: { x: slot.x, y: 0, z: slot.z },
      radius: 2.6,
      prompt: `Read: ${exhibit.name}`,
      onInteract: () =>
        hud.openPanel({
          kicker: 'Archive Museum',
          title: exhibit.name,
          meta: `${exhibit.mythology} · recovered from ${exhibit.island}`,
          body: exhibit.plaque,
        }),
    });
  });

  return {
    exhibits,
    update(elapsed) {
      for (const s of spinners) {
        s.model.rotation.y = elapsed * 0.5 + s.phase;
        s.model.position.y = s.base + Math.sin(elapsed * 1.2 + s.phase) * 0.06;
      }
    },
  };
}
