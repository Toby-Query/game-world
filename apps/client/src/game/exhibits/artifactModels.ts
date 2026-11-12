import * as THREE from 'three/webgpu';

const gold = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0xe7b54a, metalness: 0.9, roughness: 0.25 });
const metal = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.3 });
const matte = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
const glow = (color: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.5 });

function part(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  return m;
}

/**
 * Procedural placeholder models for exhibits, keyed by the exhibit's `model` field.
 * Each fits in roughly a 1.4 m box centred on the origin.
 */
const BUILDERS: Record<string, () => THREE.Object3D> = {
  'winged-sandals': () => {
    const g = new THREE.Group();
    const leather = matte(0x8a5a32);
    for (const side of [-1, 1]) {
      const sole = part(new THREE.BoxGeometry(0.22, 0.06, 0.55), leather);
      sole.position.set(side * 0.18, -0.2, 0);
      g.add(sole);
      const strap = part(new THREE.TorusGeometry(0.11, 0.025, 6, 16, Math.PI), gold());
      strap.position.set(side * 0.18, -0.15, 0.05);
      strap.rotation.y = Math.PI / 2;
      g.add(strap);
      for (let f = 0; f < 3; f++) {
        const feather = part(new THREE.ConeGeometry(0.05, 0.38 - f * 0.06, 4), matte(0xf4efe4));
        feather.position.set(side * (0.32 + f * 0.02), -0.05 + f * 0.05, -0.1 - f * 0.08);
        feather.rotation.set(-0.6, 0, side * (1.1 + f * 0.2));
        g.add(feather);
      }
    }
    return g;
  },
  trident: () => {
    const g = new THREE.Group();
    const shaft = part(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 10), metal(0x7fa7b8));
    g.add(shaft);
    const head = new THREE.Group();
    head.position.y = 0.75;
    const bar = part(new THREE.BoxGeometry(0.42, 0.05, 0.05), gold());
    head.add(bar);
    for (const x of [-0.19, 0, 0.19]) {
      const prong = part(new THREE.ConeGeometry(0.035, x === 0 ? 0.45 : 0.35, 8), gold());
      prong.position.set(x, x === 0 ? 0.22 : 0.17, 0);
      head.add(prong);
    }
    g.add(head);
    const gem = part(new THREE.OctahedronGeometry(0.06), glow(0x3ee6ff));
    gem.position.y = 0.6;
    g.add(gem);
    return g;
  },
  staff: () => {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 12), matte(0x8b2a1e)));
    for (const y of [-0.8, 0.8]) {
      const cap = part(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 12), gold());
      cap.position.y = y;
      g.add(cap);
    }
    const ring = part(new THREE.TorusGeometry(0.07, 0.015, 6, 20), gold());
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    g.rotation.z = 0.35;
    return g;
  },
  hammer: () => {
    const g = new THREE.Group();
    const head = part(new THREE.BoxGeometry(0.55, 0.3, 0.3), metal(0x9aa3ad));
    head.position.y = 0.3;
    g.add(head);
    for (const x of [-0.29, 0.29]) {
      const rune = part(new THREE.BoxGeometry(0.02, 0.2, 0.2), glow(0x6fb6ff));
      rune.position.set(x, 0.3, 0);
      g.add(rune);
    }
    const handle = part(new THREE.CylinderGeometry(0.035, 0.04, 0.6, 10), matte(0x5a3a22));
    handle.position.y = -0.15;
    g.add(handle);
    const pommel = part(new THREE.SphereGeometry(0.05, 10, 8), gold());
    pommel.position.y = -0.47;
    g.add(pommel);
    return g;
  },
  horn: () => {
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.45, -0.2, 0),
      new THREE.Vector3(-0.15, 0.05, 0),
      new THREE.Vector3(0.2, 0.15, 0),
      new THREE.Vector3(0.45, 0.4, 0),
    ]);
    const radius = (t: number): number => 0.03 + t * t * 0.13;
    const tube = new THREE.TubeGeometry(curve, 32, 1, 12, false);
    // Flare the tube toward the bell by scaling each ring around the curve.
    const pos = tube.attributes.position!;
    const rings = 33;
    const perRing = pos.count / rings;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.floor(i / perRing) / (rings - 1);
      const centre = curve.getPoint(t);
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).sub(centre);
      v.multiplyScalar(radius(t)).add(centre);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    tube.computeVertexNormals();
    g.add(part(tube, matte(0xe8dcc2)));
    for (const t of [0.25, 0.6, 0.9]) {
      const band = part(new THREE.TorusGeometry(radius(t) + 0.01, 0.012, 6, 20), metal(0x9fb6ff));
      const p = curve.getPoint(t);
      band.position.copy(p);
      band.lookAt(p.clone().add(curve.getTangent(t)));
      g.add(band);
    }
    return g;
  },
  lantern: () => {
    const g = new THREE.Group();
    const iron = metal(0x3a3f45);
    const top = part(new THREE.ConeGeometry(0.22, 0.2, 6), iron);
    top.position.y = 0.35;
    g.add(top);
    const base = part(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 6), iron);
    base.position.y = -0.3;
    g.add(base);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bar = part(new THREE.CylinderGeometry(0.012, 0.012, 0.58, 4), iron);
      bar.position.set(Math.cos(a) * 0.19, 0.02, Math.sin(a) * 0.19);
      g.add(bar);
    }
    const flame = part(new THREE.SphereGeometry(0.09, 12, 10), glow(0xffd27a));
    flame.scale.y = 1.6;
    g.add(flame);
    const ring = part(new THREE.TorusGeometry(0.06, 0.012, 6, 16), iron);
    ring.position.y = 0.5;
    g.add(ring);
    return g;
  },
};

/** Builds the model for an exhibit; unknown keys get a generic glowing relic. */
export function buildArtifact(model: string): THREE.Object3D {
  const builder = BUILDERS[model];
  if (builder) return builder();
  const relic = part(new THREE.IcosahedronGeometry(0.4, 0), gold());
  relic.add(part(new THREE.IcosahedronGeometry(0.15, 0), glow(0x3ee6ff)));
  return relic;
}

export const KNOWN_MODELS = Object.keys(BUILDERS);
