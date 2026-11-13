import * as THREE from 'three/webgpu';
import type { LootBag } from '@the-world/shared';
import { COMBAT } from '@the-world/shared';
import type { Interactions } from '../interact/Interactions';

/** Dropped loot: a glowing satchel on the ground that anyone can pick up with E. */
export class LootBags {
  private readonly meshes = new Map<string, THREE.Group>();
  private readonly geometry = new THREE.BoxGeometry(0.6, 0.4, 0.45);
  private readonly material = new THREE.MeshStandardMaterial({
    color: 0x8a5a2b,
    roughness: 0.7,
    emissive: 0xe7b54a,
    emissiveIntensity: 0.35,
  });
  bags: LootBag[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly interactions: Interactions,
    private readonly pickUp: (id: string) => void,
  ) {}

  /** Replaces the set of bags (the server sends the full list whenever it changes). */
  set(bags: LootBag[]): void {
    this.bags = bags;
    const ids = new Set(bags.map((b) => b.id));
    for (const [id, mesh] of this.meshes) {
      if (ids.has(id)) continue;
      this.scene.remove(mesh);
      this.meshes.delete(id);
      this.interactions.remove(`loot:${id}`);
    }
    for (const bag of bags) {
      if (this.meshes.has(bag.id)) {
        this.interactions.remove(`loot:${bag.id}`);
      } else {
        const group = new THREE.Group();
        const box = new THREE.Mesh(this.geometry, this.material);
        box.position.y = 0.2;
        box.castShadow = true;
        const glow = new THREE.PointLight(0xffc970, 6, 4, 2);
        glow.position.y = 0.8;
        group.add(box, glow);
        group.position.set(bag.at.x, bag.at.y, bag.at.z);
        this.scene.add(group);
        this.meshes.set(bag.id, group);
      }
      const names = bag.items.map((i) => i.name).join(', ');
      this.interactions.add({
        id: `loot:${bag.id}`,
        position: bag.at,
        radius: COMBAT.pickupRadius,
        prompt: `Pick up: ${names}`,
        onInteract: () => this.pickUp(bag.id),
      });
    }
  }

  update(elapsed: number): void {
    for (const group of this.meshes.values()) {
      group.rotation.y = elapsed * 0.8;
      group.children[0]!.position.y = 0.2 + Math.sin(elapsed * 2) * 0.05;
    }
  }
}
