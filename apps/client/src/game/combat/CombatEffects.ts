import * as THREE from 'three/webgpu';
import type { Vec3 } from '@the-world/shared';

interface Effect {
  object: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  total: number;
}

/** Short-lived visuals: ranged bolts and melee slashes. */
export class CombatEffects {
  private readonly effects: Effect[] = [];
  private readonly boltGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1, 6, 1, true);
  private readonly slashGeometry = new THREE.TorusGeometry(1.4, 0.05, 4, 24, Math.PI * 0.6);

  constructor(private readonly scene: THREE.Scene) {
    // The bolt geometry runs along +Z from 0 to 1, so it can be scaled to any length.
    this.boltGeometry.rotateX(Math.PI / 2);
    this.boltGeometry.translate(0, 0, 0.5);
  }

  /** A glowing bolt from the attacker's eye along `dir`. */
  bolt(origin: Vec3, dir: Vec3, length: number): void {
    const material = this.material(0x8ff6ff);
    const mesh = new THREE.Mesh(this.boltGeometry, material);
    mesh.position.set(origin.x, origin.y + 1.5, origin.z);
    mesh.lookAt(origin.x + dir.x, origin.y + 1.5 + dir.y, origin.z + dir.z);
    mesh.scale.set(1, 1, length);
    this.push(mesh, material, 0.3);
  }

  /** An arc in front of the attacker, facing `dir`. */
  slash(origin: Vec3, dir: Vec3): void {
    const material = this.material(0xffd27a);
    const mesh = new THREE.Mesh(this.slashGeometry, material);
    mesh.position.set(origin.x, origin.y + 1.1, origin.z);
    // Flat arc in front of the attacker: yaw to face `dir`, lay the ring down, centre the arc.
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.PI * 0.2;
    this.push(mesh, material, 0.25);
  }

  update(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      e.life -= dt;
      e.material.opacity = Math.max(0, e.life / e.total);
      if (e.life <= 0) {
        this.scene.remove(e.object);
        e.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  private material(color: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }

  private push(object: THREE.Mesh, material: THREE.MeshBasicMaterial, life: number): void {
    this.scene.add(object);
    this.effects.push({ object, material, life, total: life });
  }
}
