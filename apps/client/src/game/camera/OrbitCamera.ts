import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';

export interface CameraSettings {
  /** Radians per pixel of mouse movement. */
  sensitivity: number;
  invertY: boolean;
}

const MIN_PITCH = -1.2;
const MAX_PITCH = 0.9;
const MIN_DISTANCE = 2.5;
const MAX_DISTANCE = 12;

/**
 * Third-person orbit camera. Yaw and pitch come from the mouse; a ray from the target to the
 * camera keeps it from clipping into walls.
 */
export class OrbitCamera {
  yaw = 0;
  pitch = -0.25;
  distance = 6;
  private currentDistance = 6;
  private readonly target = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly rapier: typeof RAPIER,
    private readonly world: RAPIER.World,
    public settings: CameraSettings,
  ) {}

  look(dx: number, dy: number): void {
    const s = this.settings.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.settings.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, MIN_PITCH, MAX_PITCH);
  }

  zoom(steps: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + steps * 0.8, MIN_DISTANCE, MAX_DISTANCE);
  }

  /** Places the camera behind `focus` (usually the player's head). */
  update(focus: THREE.Vector3, dt: number, exclude?: RAPIER.Collider): void {
    this.target.copy(focus);
    const cosP = Math.cos(this.pitch);
    // Direction from target back to the camera.
    this.offset.set(Math.sin(this.yaw) * cosP, -Math.sin(this.pitch), Math.cos(this.yaw) * cosP);

    // Pull in when something is between the player and the camera; ease back out.
    let wanted = this.distance;
    const ray = new this.rapier.Ray(this.target, this.offset);
    const hit = this.world.castRay(ray, this.distance, true, undefined, undefined, exclude);
    if (hit) wanted = Math.max(0.6, hit.timeOfImpact - 0.25);
    const ease = wanted < this.currentDistance ? 1 : 1 - Math.exp(-dt * 6);
    this.currentDistance += (wanted - this.currentDistance) * ease;

    this.camera.position.copy(this.target).addScaledVector(this.offset, this.currentDistance);
    this.camera.lookAt(this.target);
  }
}
