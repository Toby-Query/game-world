import type * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { ZoneVolume } from '@the-world/shared';
import type { QualityProfile } from '../../settings/settings';
import type { Hud } from '../../ui/Hud';
import type { Interactions } from '../interact/Interactions';

/** What a level needs to build itself into the world. */
export interface LevelContext {
  scene: THREE.Scene;
  rapier: typeof RAPIER;
  world: RAPIER.World;
  /** Register things the player can use with E. */
  interactions: Interactions;
  hud: Hud;
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
  /** Physics zones placed in this level (from `content/zones/`). */
  zones?: readonly ZoneVolume[];
  update?(frame: LevelFrame): void;
  /** Applies a graphics quality level (shadows and similar). */
  setQuality?(profile: QualityProfile): void;
}
