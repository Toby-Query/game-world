import * as THREE from 'three/webgpu';
import { DAY_LENGTH_SECONDS, mixRgb, skyAt, type Rgb } from './dayNight';
import { Ocean } from './Ocean';

const SHADOW_RANGE = 45;

/**
 * Sky dome, sun/moon key light, cool fill, rim light, fog and the endless ocean, all driven by a
 * day/night cycle. Shadows follow the player so they stay sharp across a large map.
 */
export class Environment {
  readonly ocean: Ocean;
  readonly key = new THREE.DirectionalLight(0xffffff, 2.5);
  readonly fill = new THREE.HemisphereLight(0x8fb0e6, 0x8a7d6a, 0.8);
  readonly rim = new THREE.DirectionalLight(0x3ee6ff, 0.9);
  private readonly sky: THREE.Mesh;
  private readonly skyColors: THREE.BufferAttribute;
  private readonly skyHeights: Float32Array;
  private readonly fog: THREE.Fog;
  /** Materials whose emissive intensity follows the time of day (neon, screens). */
  readonly neonMaterials: THREE.MeshStandardMaterial[] = [];
  /** 0..1 time of day; starts in the late morning. */
  timeOfDay = 0.42;

  constructor(
    private readonly scene: THREE.Scene,
    oceanLevel: number,
  ) {
    this.fog = new THREE.Fog(0x22344d, 60, 420);
    scene.fog = this.fog;
    scene.background = new THREE.Color(0x22344d);

    // Sky dome with a vertical gradient written into vertex colours.
    const geometry = new THREE.SphereGeometry(900, 32, 16);
    const count = geometry.attributes.position!.count;
    this.skyHeights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.skyHeights[i] = Math.max(0, geometry.attributes.position!.getY(i) / 900);
    }
    this.skyColors = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('color', this.skyColors);
    this.sky = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.03;
    Object.assign(this.key.shadow.camera, {
      left: -SHADOW_RANGE,
      right: SHADOW_RANGE,
      top: SHADOW_RANGE,
      bottom: -SHADOW_RANGE,
      near: 1,
      far: 260,
    });
    scene.add(this.key, this.key.target, this.fill, this.rim, this.rim.target);

    this.ocean = new Ocean(scene, oceanLevel);
  }

  update(dt: number, elapsed: number, camera: THREE.Camera, focus: THREE.Vector3): void {
    this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH_SECONDS) % 1;
    const s = skyAt(this.timeOfDay);

    // Key light sits along the light direction, aimed at the player.
    const d = s.lightDirection;
    this.key.position.set(focus.x + d.x * 120, focus.y + d.y * 120, focus.z + d.z * 120);
    this.key.target.position.copy(focus);
    this.key.intensity = s.keyIntensity;
    setColor(this.key.color, s.keyColor);
    // Rim light comes from roughly opposite the key, low, in Archive cyan.
    this.rim.position.set(focus.x - d.x * 60, focus.y + 20, focus.z - d.z * 60);
    this.rim.target.position.copy(focus);
    this.fill.intensity = s.ambientIntensity;
    setColor(this.fill.color, mixRgb(s.skyTop, s.skyHorizon, 0.6));

    this.sky.position.copy(camera.position);
    for (let i = 0; i < this.skyHeights.length; i++) {
      const t = Math.pow(this.skyHeights[i] ?? 0, 0.6);
      this.skyColors.setXYZ(
        i,
        s.skyHorizon.r + (s.skyTop.r - s.skyHorizon.r) * t,
        s.skyHorizon.g + (s.skyTop.g - s.skyHorizon.g) * t,
        s.skyHorizon.b + (s.skyTop.b - s.skyHorizon.b) * t,
      );
    }
    this.skyColors.needsUpdate = true;
    setColor(this.fog.color, s.fog);
    setColor(this.scene.background as THREE.Color, s.fog);

    for (const m of this.neonMaterials) m.emissiveIntensity = s.neon;
    this.ocean.update(elapsed, camera.position);
  }
}

function setColor(target: THREE.Color, c: Rgb): void {
  target.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
}
