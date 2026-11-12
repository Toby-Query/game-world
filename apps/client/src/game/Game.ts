import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_ZONE_RULES,
  resolveZoneRules,
  rulesAt,
  type Appearance,
  type ZoneRules,
  type ZoneVolume,
} from '@the-world/shared';
import { OrbitCamera, type CameraSettings } from './camera/OrbitCamera';
import { CharacterModel } from './character/CharacterModel';
import { Hud } from '../ui/Hud';
import { Input } from './input';
import { Interactions } from './interact/Interactions';
import type { Level, LevelContext } from './level/Level';
import { FixedStep, type MoveInput } from './player/movement';
import { PlayerController } from './player/PlayerController';

export interface GameOptions {
  renderer: THREE.WebGPURenderer;
  rapier: typeof RAPIER;
  buildLevel: (ctx: LevelContext) => Level;
  appearance?: Appearance;
  camera?: CameraSettings;
}

const PHYSICS_STEP = 1 / 60;
const IDLE: MoveInput = { forward: 0, right: 0, sprint: false, jump: false };
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
  readonly interactions = new Interactions();
  readonly hud = new Hud();
  private readonly fixed = new FixedStep(PHYSICS_STEP);
  private readonly timer = new THREE.Timer();
  private readonly focus = new THREE.Vector3();
  private elapsed = 0;
  paused = false;
  /** While true the player stands still facing the camera, framed for the character creator. */
  private creatorMode = false;

  constructor(private readonly opts: GameOptions) {
    const { rapier, renderer } = opts;
    this.world = new rapier.World(resolveZoneRules().gravity);
    this.input = new Input(renderer.domElement);
    this.interactions.onFocusChange = (item) => this.hud.showPrompt(item?.prompt ?? null);
    this.level = opts.buildLevel({
      scene: this.scene,
      rapier,
      world: this.world,
      interactions: this.interactions,
      hud: this.hud,
    });

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

  /** Frames the character for the creator: movement off, camera in front, character on the right. */
  setCreatorMode(on: boolean): void {
    this.creatorMode = on;
    this.input.enabled = !on;
    if (on) {
      this.input.releasePointerLock();
      this.orbit.yaw = Math.PI;
      this.orbit.pitch = -0.08;
      this.orbit.distance = 3.6;
    } else {
      this.orbit.yaw = 0;
      this.orbit.pitch = -0.25;
      this.orbit.distance = 6;
    }
  }

  setAppearance(appearance: Appearance): void {
    this.avatar.setAppearance(appearance);
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
      if (!this.creatorMode) {
        const look = this.input.consumeLook();
        this.orbit.look(look.dx, look.dy);
        this.orbit.zoom(this.input.consumeWheel());
      }

      // Physics keeps running in the creator (with no input) so the character stays grounded.
      const steps = this.fixed.advance(dt);
      const move = this.creatorMode ? IDLE : this.input.move();
      for (let i = 0; i < steps; i++) {
        this.updateZone();
        this.player.fixedUpdate(PHYSICS_STEP, move, this.orbit.yaw, this.rules);
        this.world.timestep = PHYSICS_STEP;
        this.world.step();
      }
      if (this.player.position.y < FALL_LIMIT) this.player.teleport(this.level.spawn);
    }

    this.player.update(this.fixed.alpha, dt);
    this.avatar.root.position.copy(this.player.position);
    this.avatar.root.rotation.y = this.creatorMode
      ? Math.sin(this.elapsed * 0.6) * 0.5
      : this.player.facing;
    this.avatar.animate(
      dt,
      this.player.horizontalSpeed,
      this.player.grounded,
      this.player.motor.velocity.y,
    );

    this.updateInteractions();

    this.focus.copy(this.player.position).y += this.creatorMode ? 1.1 : 1.6;
    // In the creator the panel covers the left of the screen, so shift the character right.
    if (this.creatorMode) this.focus.x += 1.1;
    this.orbit.update(this.focus, dt, this.player.collider);
    this.level.update?.({
      dt,
      elapsed: this.elapsed,
      playerPosition: this.player.position,
      camera: this.camera,
    });

    this.opts.renderer.render(this.scene, this.camera);
  }

  /** The physics rules where the player stands, blended at zone edges. */
  rules: ZoneRules = DEFAULT_ZONE_RULES;
  /** The zone the player is in, or null in the open world. */
  zone: ZoneVolume | null = null;

  private updateZone(): void {
    const { rules, zone } = rulesAt(this.level.zones ?? [], this.player.feet);
    this.rules = rules;
    this.world.gravity = rules.gravity;
    if (zone?.id !== this.zone?.id) {
      this.zone = zone;
      this.hud.showZone(zone?.name ?? null);
    }
  }

  /** E uses the nearest interactable or closes an open panel; Esc and walking away also close it. */
  private updateInteractions(): void {
    this.interactions.update(this.player.position);
    const pressedE = this.input.wasPressed('KeyE');
    if (this.hud.panelOpen) {
      if (pressedE || this.input.wasPressed('Escape') || !this.interactions.current) {
        this.hud.closePanel();
        this.hud.showPrompt(this.interactions.current?.prompt ?? null);
      }
    } else if (pressedE) {
      this.interactions.interact();
    }
  }
}
