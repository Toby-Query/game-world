import type * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';

/** What a level needs to build itself into the world. */
export interface LevelContext {
  scene: THREE.Scene;
  rapier: typeof RAPIER;
  world: RAPIER.World;
}

/** Per-frame information a level can react to (time of day, player position...). */
export interface LevelFrame {
  dt: number;
  elapsed: number;
  playerPosition: THREE.Vector3;
  camera: THREE.Camera;
}

export interface Level {
  /** Where the player spawns (feet position). */
  spawn: THREE.Vector3;
  update?(frame: LevelFrame): void;
}
