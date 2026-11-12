import * as THREE from 'three/webgpu';
import { DEFAULT_APPEARANCE, type Appearance } from '@the-world/shared';

interface Limb {
  pivot: THREE.Group;
  lower?: THREE.Group;
}

/**
 * Procedural stylized character: heroic proportions (big hands, head and boots) built from
 * primitives, with code-driven idle, walk, run and jump poses. Stands with its feet at y = 0.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly torso: THREE.Group;
  private readonly head: THREE.Group;
  private readonly arms: [Limb, Limb];
  private readonly legs: [Limb, Limb];
  private readonly materials: {
    skin: THREE.MeshStandardMaterial;
    hair: THREE.MeshStandardMaterial;
    outfit: THREE.MeshStandardMaterial;
    accent: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
  };
  private phase = 0;
  private time = 0;
  private lean = 0;

  constructor(appearance: Appearance = DEFAULT_APPEARANCE) {
    this.materials = {
      skin: new THREE.MeshStandardMaterial({ roughness: 0.65 }),
      hair: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      outfit: new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      accent: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.8 }),
    };
    const m = this.materials;

    // Torso: pelvis + chest, with a belt in the accent colour.
    this.torso = new THREE.Group();
    this.torso.position.y = 0.95;
    this.torso.add(mesh(new THREE.CapsuleGeometry(0.2, 0.12, 6, 14), m.outfit, 0, 0.02, 0));
    const chest = mesh(new THREE.CapsuleGeometry(0.25, 0.28, 6, 16), m.outfit, 0, 0.36, 0);
    chest.scale.set(1.15, 1, 0.8);
    this.torso.add(chest);
    const belt = mesh(new THREE.TorusGeometry(0.21, 0.035, 8, 24), m.accent, 0, 0.12, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.05, 0.85, 1);
    this.torso.add(belt);

    // Head with hair cap and eyes.
    this.head = new THREE.Group();
    this.head.position.y = 0.78;
    this.head.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10), m.skin, 0, -0.08, 0));
    this.head.add(mesh(new THREE.SphereGeometry(0.2, 20, 16), m.skin, 0, 0.12, 0));
    const hair = mesh(
      new THREE.SphereGeometry(0.215, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      m.hair,
      0,
      0.14,
      0.01,
    );
    hair.rotation.x = -0.25;
    this.head.add(hair);
    for (const side of [-1, 1]) {
      this.head.add(mesh(new THREE.SphereGeometry(0.03, 8, 8), m.dark, side * 0.075, 0.14, -0.17));
    }
    this.torso.add(this.head);

    this.arms = [this.makeArm(-1), this.makeArm(1)];
    this.legs = [this.makeLeg(-1), this.makeLeg(1)];

    this.body.add(this.torso);
    this.root.add(this.body);
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.setAppearance(appearance);
  }

  setAppearance(a: Appearance): void {
    const m = this.materials;
    m.skin.color.set(a.skinColor);
    m.hair.color.set(a.hairColor);
    m.outfit.color.set(a.outfitColor);
    m.accent.color.set(a.accentColor);
    this.body.scale.set(a.build, a.height, a.build);
    this.head.scale.setScalar(a.headSize / a.build);
  }

  /**
   * Updates the procedural animation.
   * @param speed horizontal speed in m/s
   * @param grounded whether the character is on the ground
   * @param verticalSpeed m/s, positive when rising
   */
  animate(dt: number, speed: number, grounded: boolean, verticalSpeed: number): void {
    this.time += dt;
    const stride = Math.min(speed / 7.5, 1);
    this.phase += dt * (3 + speed * 1.6);
    const swing = Math.sin(this.phase) * 0.9 * stride;
    const [armL, armR] = this.arms;
    const [legL, legR] = this.legs;

    if (grounded) {
      legL.pivot.rotation.x = swing;
      legR.pivot.rotation.x = -swing;
      legL.lower!.rotation.x = Math.max(0, -Math.sin(this.phase)) * 1.1 * stride;
      legR.lower!.rotation.x = Math.max(0, Math.sin(this.phase)) * 1.1 * stride;
      armL.pivot.rotation.x = -swing * 0.8;
      armR.pivot.rotation.x = swing * 0.8;
      armL.pivot.rotation.z = -0.12;
      armR.pivot.rotation.z = 0.12;
      armL.lower!.rotation.x = -0.25 - stride * 0.6;
      armR.lower!.rotation.x = -0.25 - stride * 0.6;
      const bob = Math.abs(Math.sin(this.phase)) * 0.05 * stride;
      const breathe = Math.sin(this.time * 2) * 0.008 * (1 - stride);
      this.torso.position.y = 0.95 + bob + breathe;
    } else {
      // Airborne: knees up, arms out; a different pose rising vs falling.
      const rising = verticalSpeed > 0;
      legL.pivot.rotation.x = rising ? -0.7 : -0.2;
      legR.pivot.rotation.x = rising ? 0.2 : 0.3;
      legL.lower!.rotation.x = rising ? 1.2 : 0.4;
      legR.lower!.rotation.x = rising ? 0.5 : 0.3;
      armL.pivot.rotation.x = rising ? -2.4 : -0.6;
      armR.pivot.rotation.x = rising ? -2.4 : -0.6;
      armL.pivot.rotation.z = -0.6;
      armR.pivot.rotation.z = 0.6;
      this.torso.position.y = 0.95;
    }

    const targetLean = grounded ? stride * 0.18 : 0.05;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);
    this.torso.rotation.x = -this.lean;
  }

  private makeArm(side: number): Limb {
    const m = this.materials;
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.36, 0.5, 0);
    pivot.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), m.accent, 0, 0, 0));
    pivot.add(mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 10), m.outfit, 0, -0.17, 0));
    const lower = new THREE.Group();
    lower.position.y = -0.32;
    lower.add(mesh(new THREE.CapsuleGeometry(0.06, 0.18, 4, 10), m.skin, 0, -0.12, 0));
    lower.add(mesh(new THREE.SphereGeometry(0.09, 12, 10), m.skin, 0, -0.3, 0)); // big hand
    pivot.add(lower);
    this.torso.add(pivot);
    return { pivot, lower };
  }

  private makeLeg(side: number): Limb {
    const m = this.materials;
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.92, 0);
    pivot.add(mesh(new THREE.CapsuleGeometry(0.09, 0.26, 4, 10), m.dark, 0, -0.22, 0));
    const lower = new THREE.Group();
    lower.position.y = -0.44;
    lower.add(mesh(new THREE.CapsuleGeometry(0.075, 0.24, 4, 10), m.dark, 0, -0.18, 0));
    const boot = mesh(new THREE.BoxGeometry(0.17, 0.12, 0.3), m.accent, 0, -0.4, -0.05);
    lower.add(boot);
    pivot.add(lower);
    this.body.add(pivot);
    return { pivot, lower };
  }
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const out = new THREE.Mesh(geometry, material);
  out.position.set(x, y, z);
  return out;
}
