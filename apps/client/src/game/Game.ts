import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import { DEFAULT_APPEARANCE, resolveZoneRules, type Appearance } from '@the-world/shared';
import { OrbitCamera, type CameraSettings } from './camera/OrbitCamera';
import { CharacterModel } from './character/CharacterModel';
import { Input } from './input';
import type { Level, LevelContext } from './level/Level';
import { FixedStep } from './player/movement';
import { PlayerController } from './player/PlayerController';

export interface GameOptions {
  renderer: THREE.WebGPURenderer;
  rapier: typeof RAPIER;
  buildLevel: (ctx: LevelContext) => Level;
  appearance?: Appearance;
  camera?: CameraSettings;
}

const PHYSICS_STEP = 1 / 60;
const FALL_LIMIT = -30;

/** Owns the world simulation: physics, the local player, camera and the current level. */
export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  readonly world: RAPIER.World;
  readonly input: Input;
  readonly player: PlayerController;
  readonly avatar: CharacterModel;
  readonly orbit: OrbitCamera;
  readonly level: Level;
  private readonly fixed = new FixedStep(PHYSICS_STEP);
  private readonly timer = new THREE.Timer();
  private readonly focus = new THREE.Vector3();
  private elapsed = 0;
  paused = false;

  constructor(private readonly opts: GameOptions) {
    const { rapier, renderer } = opts;
    this.world = new rapier.World(resolveZoneRules().gravity);
    this.input = new Input(renderer.domElement);
    this.level = opts.buildLevel({ scene: this.scene, rapier, world: this.world });

    this.player = new PlayerController(rapier, this.world, this.level.spawn);
    this.avatar = new CharacterModel(opts.appearance ?? DEFAULT_APPEARANCE);
    this.scene.add(this.avatar.root);

    this.orbit = new OrbitCamera(
      this.camera,
      rapier,
      this.world,
      opts.camera ?? { sensitivity: 0.0025, invertY: false },
    );
    // Colliders are created on the first step; step once so ray casts work immediately.
    this.world.step();
    this.timer.connect(document);
  }

  resize(width: number, height: number): void {
    this.opts.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Called every animation frame with the rAF timestamp. */
  frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.elapsed += dt;

    if (!this.paused) {
      const look = this.input.consumeLook();
      this.orbit.look(look.dx, look.dy);
      this.orbit.zoom(this.input.consumeWheel());

      const rules = resolveZoneRules();
      const steps = this.fixed.advance(dt);
      const move = this.input.move();
      for (let i = 0; i < steps; i++) {
        this.player.fixedUpdate(PHYSICS_STEP, move, this.orbit.yaw, rules);
        this.world.timestep = PHYSICS_STEP;
        this.world.step();
      }
      if (this.player.position.y < FALL_LIMIT) this.player.teleport(this.level.spawn);
    }

    this.player.update(this.fixed.alpha, dt);
    this.avatar.root.position.copy(this.player.position);
    this.avatar.root.rotation.y = this.player.facing;
    this.avatar.animate(
      dt,
      this.player.horizontalSpeed,
      this.player.grounded,
      this.player.motor.velocity.y,
    );

    this.focus.copy(this.player.position).y += 1.6;
    this.orbit.update(this.focus, dt, this.player.collider);
    this.level.update?.({
      dt,
      elapsed: this.elapsed,
      playerPosition: this.player.position,
      camera: this.camera,
    });

    this.opts.renderer.render(this.scene, this.camera);
  }
}
