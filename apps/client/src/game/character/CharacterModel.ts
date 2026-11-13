import * as THREE from 'three/webgpu';
import { DEFAULT_APPEARANCE, type Appearance } from '@the-world/shared';

const SWING_SECONDS = 0.35;
const FLASH_SECONDS = 0.25;

interface Limb {
  pivot: THREE.Group;
  lower: THREE.Group;
  upperMesh: THREE.Mesh;
  lowerMesh: THREE.Mesh;
}

interface Leg extends Limb {
  boot: THREE.Mesh;
  sandal: THREE.Group;
}

/**
 * Procedural stylized character: heroic proportions (big hands, head and boots) built from
 * primitives, with swappable hair, top, bottom and shoes and code-driven idle, walk, run and jump
 * poses. Stands with its feet at y = 0.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly arms: [Limb, Limb];
  private readonly legs: [Leg, Leg];
  private readonly hairStyles: Record<Appearance['hair'], THREE.Group>;
  private readonly tops: Record<Appearance['top'], THREE.Group>;
  private readonly skirt: THREE.Mesh;
  private readonly materials = {
    skin: new THREE.MeshStandardMaterial({ roughness: 0.65 }),
    // Hair and outfit include open shapes (long hair, robe hem, skirt), so render both sides.
    hair: new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }),
    outfit: new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }),
    trousers: new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.8 }),
    accent: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.8 }),
    eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.3 }),
  };
  private phase = 0;
  private time = 0;
  private lean = 0;
  /** Seconds left of an attack animation, and which. */
  private swingTime = 0;
  private swingKind: 'melee' | 'ranged' = 'melee';
  /** Seconds left of the red hit flash. */
  private flashTime = 0;
  private dead = false;

  constructor(appearance: Appearance = DEFAULT_APPEARANCE) {
    const m = this.materials;

    this.torso.position.y = 0.95;
    this.torso.add(mesh(new THREE.CapsuleGeometry(0.2, 0.12, 6, 14), m.outfit, 0, 0.02, 0));
    this.tops = {
      tunic: this.makeTop(false, false),
      jacket: this.makeTop(true, false),
      robe: this.makeTop(false, true),
    };
    const belt = mesh(new THREE.TorusGeometry(0.21, 0.035, 8, 24), m.accent, 0, 0.12, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.05, 0.85, 1);
    this.torso.add(belt);

    this.head.position.y = 0.78;
    this.head.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10), m.skin, 0, -0.08, 0));
    this.head.add(mesh(new THREE.SphereGeometry(0.2, 20, 16), m.skin, 0, 0.12, 0));
    // Face: eyes with light whites, brows in the hair colour, and a small nose.
    for (const side of [-1, 1]) {
      this.head.add(
        mesh(new THREE.SphereGeometry(0.042, 10, 8), m.eyeWhite, side * 0.075, 0.14, -0.17),
      );
      this.head.add(
        mesh(new THREE.SphereGeometry(0.024, 8, 8), m.dark, side * 0.075, 0.14, -0.205),
      );
      const brow = mesh(
        new THREE.BoxGeometry(0.07, 0.016, 0.02),
        m.hair,
        side * 0.075,
        0.2,
        -0.185,
      );
      brow.rotation.z = side * -0.12;
      this.head.add(brow);
    }
    this.head.add(mesh(new THREE.SphereGeometry(0.028, 8, 8), m.skin, 0, 0.09, -0.2));
    this.hairStyles = this.makeHairStyles();
    this.torso.add(this.head);

    this.arms = [this.makeArm(-1), this.makeArm(1)];
    this.legs = [this.makeLeg(-1), this.makeLeg(1)];
    this.skirt = mesh(
      new THREE.CylinderGeometry(0.22, 0.34, 0.42, 16, 1, true),
      m.outfit,
      0,
      0.72,
      0,
    );
    this.body.add(this.skirt);

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
    m.trousers.color.set(a.outfitColor).multiplyScalar(0.35);
    this.body.scale.set(a.build, a.height, a.build);
    this.head.scale.setScalar(a.headSize / a.build);

    for (const [style, group] of Object.entries(this.hairStyles)) group.visible = style === a.hair;
    for (const [top, group] of Object.entries(this.tops)) group.visible = top === a.top;

    // Bottoms: trousers cover both leg segments, shorts only the thigh, a skirt shows bare legs.
    const thigh = a.bottom === 'skirt' ? m.skin : m.trousers;
    const shin = a.bottom === 'trousers' ? m.trousers : m.skin;
    this.skirt.visible = a.bottom === 'skirt';
    for (const leg of this.legs) {
      leg.upperMesh.material = thigh;
      leg.lowerMesh.material = shin;
      leg.boot.visible = a.shoes === 'boots';
      leg.sandal.visible = a.shoes === 'sandals';
    }
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
      legL.lower.rotation.x = Math.max(0, -Math.sin(this.phase)) * 1.1 * stride;
      legR.lower.rotation.x = Math.max(0, Math.sin(this.phase)) * 1.1 * stride;
      armL.pivot.rotation.x = -swing * 0.8;
      armR.pivot.rotation.x = swing * 0.8;
      armL.pivot.rotation.z = -0.12;
      armR.pivot.rotation.z = 0.12;
      armL.lower.rotation.x = -0.25 - stride * 0.6;
      armR.lower.rotation.x = -0.25 - stride * 0.6;
      const bob = Math.abs(Math.sin(this.phase)) * 0.05 * stride;
      const breathe = Math.sin(this.time * 2) * 0.008 * (1 - stride);
      this.torso.position.y = 0.95 + bob + breathe;
    } else {
      // Airborne: knees up, arms out; a different pose rising vs falling.
      const rising = verticalSpeed > 0;
      legL.pivot.rotation.x = rising ? -0.7 : -0.2;
      legR.pivot.rotation.x = rising ? 0.2 : 0.3;
      legL.lower.rotation.x = rising ? 1.2 : 0.4;
      legR.lower.rotation.x = rising ? 0.5 : 0.3;
      armL.pivot.rotation.x = rising ? -2.4 : -0.6;
      armR.pivot.rotation.x = rising ? -2.4 : -0.6;
      armL.pivot.rotation.z = -0.6;
      armR.pivot.rotation.z = 0.6;
      this.torso.position.y = 0.95;
    }

    // Attack: the right arm sweeps across (melee) or points the bolt forward (ranged).
    if (this.swingTime > 0) {
      this.swingTime = Math.max(0, this.swingTime - dt);
      if (this.swingKind === 'melee') {
        const k = 1 - this.swingTime / SWING_SECONDS;
        armR.pivot.rotation.x = -2.4 + k * 2.9;
        armR.pivot.rotation.z = 0.5 - k * 0.9;
      } else {
        armR.pivot.rotation.x = -Math.PI / 2;
        armR.pivot.rotation.z = 0;
        armR.lower.rotation.x = 0;
      }
    }

    if (this.flashTime > 0) {
      this.flashTime = Math.max(0, this.flashTime - dt);
      const k = this.flashTime / FLASH_SECONDS;
      for (const m of [this.materials.skin, this.materials.outfit]) {
        m.emissive.setRGB(0.9 * k, 0.05 * k, 0.05 * k);
      }
    }

    if (this.dead) {
      // Lying on the ground; the pose is held while dead.
      this.body.rotation.x = Math.min(Math.PI / 2, this.body.rotation.x + dt * 6);
      return;
    }
    this.body.rotation.x = Math.max(0, this.body.rotation.x - dt * 6);

    const targetLean = grounded ? stride * 0.18 : 0.05;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);
    this.torso.rotation.x = -this.lean;
  }

  /** Plays an attack animation. */
  swing(kind: 'melee' | 'ranged'): void {
    this.swingKind = kind;
    this.swingTime = SWING_SECONDS;
  }

  /** Flashes red briefly: this character was hit. */
  flash(): void {
    this.flashTime = FLASH_SECONDS;
  }

  /** Falls over (dead) or gets back up. */
  setDead(dead: boolean): void {
    this.dead = dead;
  }

  private makeTop(jacket: boolean, robe: boolean): THREE.Group {
    const m = this.materials;
    const g = new THREE.Group();
    const chest = mesh(new THREE.CapsuleGeometry(0.25, 0.28, 6, 16), m.outfit, 0, 0.36, 0);
    chest.scale.set(1.15, 1, 0.8);
    g.add(chest);
    if (jacket) {
      // Upturned collar and a zip line in the accent colour.
      g.add(mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.12, 14, 1, true), m.outfit, 0, 0.66, 0));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.5, 0.02), m.accent, 0, 0.36, -0.2));
      for (const side of [-1, 1]) {
        g.add(mesh(new THREE.BoxGeometry(0.08, 0.06, 0.02), m.accent, side * 0.14, 0.3, -0.2));
      }
    }
    if (robe) {
      g.add(mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.8, 18, 1, true), m.outfit, 0, -0.3, 0));
      const trim = mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 24), m.accent, 0, -0.7, 0);
      trim.rotation.x = Math.PI / 2;
      g.add(trim);
    }
    this.torso.add(g);
    return g;
  }

  private makeHairStyles(): Record<Appearance['hair'], THREE.Group> {
    const m = this.materials;
    const cap = (): THREE.Mesh => {
      const c = mesh(
        new THREE.SphereGeometry(0.215, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        m.hair,
        0,
        0.15,
        0.02,
      );
      // Tilted back so the cap frames the face instead of covering the eyes.
      c.rotation.x = 0.45;
      return c;
    };
    const group = (...children: THREE.Object3D[]): THREE.Group => {
      const g = new THREE.Group();
      if (children.length > 0) g.add(...children);
      this.head.add(g);
      return g;
    };
    const long = mesh(
      new THREE.CylinderGeometry(0.2, 0.24, 0.42, 16, 1, true),
      m.hair,
      0,
      -0.02,
      0.05,
    );
    const mohawk = mesh(new THREE.BoxGeometry(0.06, 0.16, 0.4), m.hair, 0, 0.33, 0.02);
    return {
      short: group(cap()),
      long: group(cap(), long),
      bun: group(cap(), mesh(new THREE.SphereGeometry(0.09, 12, 10), m.hair, 0, 0.3, 0.16)),
      mohawk: group(mohawk),
      bald: group(),
    };
  }

  private makeArm(side: number): Limb {
    const m = this.materials;
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.36, 0.5, 0);
    pivot.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), m.accent, 0, 0, 0));
    const upperMesh = mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 10), m.outfit, 0, -0.17, 0);
    pivot.add(upperMesh);
    const lower = new THREE.Group();
    lower.position.y = -0.32;
    const lowerMesh = mesh(new THREE.CapsuleGeometry(0.06, 0.18, 4, 10), m.skin, 0, -0.12, 0);
    lower.add(lowerMesh);
    lower.add(mesh(new THREE.SphereGeometry(0.09, 12, 10), m.skin, 0, -0.3, 0)); // big hand
    pivot.add(lower);
    this.torso.add(pivot);
    return { pivot, lower, upperMesh, lowerMesh };
  }

  private makeLeg(side: number): Leg {
    const m = this.materials;
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.92, 0);
    const upperMesh = mesh(new THREE.CapsuleGeometry(0.09, 0.26, 4, 10), m.trousers, 0, -0.22, 0);
    pivot.add(upperMesh);
    const lower = new THREE.Group();
    lower.position.y = -0.44;
    const lowerMesh = mesh(new THREE.CapsuleGeometry(0.075, 0.24, 4, 10), m.trousers, 0, -0.18, 0);
    lower.add(lowerMesh);
    const boot = mesh(new THREE.BoxGeometry(0.17, 0.12, 0.3), m.accent, 0, -0.4, -0.05);
    lower.add(boot);
    const sandal = new THREE.Group();
    sandal.add(mesh(new THREE.BoxGeometry(0.15, 0.03, 0.28), m.dark, 0, -0.45, -0.05));
    sandal.add(mesh(new THREE.BoxGeometry(0.16, 0.02, 0.04), m.accent, 0, -0.41, -0.1));
    sandal.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), m.skin, 0, -0.39, -0.06));
    lower.add(sandal);
    pivot.add(lower);
    this.body.add(pivot);
    return { pivot, lower, upperMesh, lowerMesh, boot, sandal };
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
