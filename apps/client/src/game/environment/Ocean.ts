import * as THREE from 'three/webgpu';

const TILE_METRES = 12;
const SIZE_METRES = 1600;
const TEXTURE_SIZE = 256;

/**
 * Endless ocean: a large plane that follows the camera (snapped to whole texture tiles so the
 * surface never swims) with two procedurally generated wave normal maps scrolling over it.
 */
export class Ocean {
  readonly mesh: THREE.Mesh;
  private readonly normalA: THREE.Texture;
  private readonly normalB: THREE.Texture;

  constructor(
    scene: THREE.Scene,
    readonly level: number,
    color = 0x0e5a73,
  ) {
    this.normalA = waveNormalTexture(1);
    this.normalB = waveNormalTexture(2);
    const repeat = SIZE_METRES / TILE_METRES;
    this.normalA.repeat.set(repeat, repeat);
    this.normalB.repeat.set(repeat * 0.6, repeat * 0.6);

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.18,
      metalness: 0.15,
      normalMap: this.normalA,
      normalScale: new THREE.Vector2(0.55, 0.55),
      // The second wave layer brightens and darkens the surface as it scrolls.
      roughnessMap: this.normalB,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE_METRES, SIZE_METRES), material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = level;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  update(elapsed: number, cameraPosition: THREE.Vector3): void {
    // Snap to whole tiles so the texture stays put in world space while the plane follows.
    this.mesh.position.x = Math.round(cameraPosition.x / TILE_METRES) * TILE_METRES;
    this.mesh.position.z = Math.round(cameraPosition.z / TILE_METRES) * TILE_METRES;
    this.normalA.offset.set(elapsed * 0.012, elapsed * 0.008);
    this.normalB.offset.set(-elapsed * 0.007, elapsed * 0.011);
  }
}

/** A tileable normal map built from a sum of sine waves. */
function waveNormalTexture(seed: number): THREE.DataTexture {
  const n = TEXTURE_SIZE;
  const heights = new Float32Array(n * n);
  const waves = Array.from({ length: 6 }, (_, i) => ({
    // Integer frequencies keep the texture tileable.
    fx: ((i * 3 + seed) % 5) + 1,
    fy: ((i * 2 + seed * 3) % 4) + 1,
    phase: (i + seed) * 1.7,
    amp: 1 / (i + 1.5),
  }));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let h = 0;
      for (const w of waves) {
        h += w.amp * Math.sin(((w.fx * x + w.fy * y) / n) * Math.PI * 2 + w.phase);
      }
      heights[y * n + x] = h;
    }
  }
  const data = new Uint8Array(n * n * 4);
  const at = (x: number, y: number): number => heights[((y + n) % n) * n + ((x + n) % n)] ?? 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 4;
      data[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
