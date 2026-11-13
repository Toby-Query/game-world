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
import { SpeechBubble } from './character/SpeechBubble';
import { Hud } from '../ui/Hud';
import { Input } from './input';
import { Interactions } from './interact/Interactions';
import type { Level, LevelContext } from './level/Level';
import { FixedStep, type MoveInput } from './player/movement';
import { PlayerController } from './player/PlayerController';
import { BASE_LOOK_SPEED, qualityProfile, type Settings } from '../settings/settings';

/** What the game is showing: the title fly-by, the character creator, or normal play. */
export type GameMode = 'title' | 'creator' | 'play';

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
  private mode: GameMode = 'play';
  private menuOpen = false;
  /** Extra per-frame updates (networking, remote players), run before rendering. */
  readonly systems: ((dt: number, elapsed: number) => void)[] = [];
  /** Called when the player fell out of the world and was put back at the spawn. */
  onRespawn: (() => void) | null = null;
  /** Called after a debug teleport, so the server can follow. */
  onTeleport: ((feet: THREE.Vector3) => void) | null = null;
  /** True while a text box (chat) has the keyboard: menus and Esc leave it alone. */
  textInputActive = false;
  /** While dead the player can't move or act (they still see the world). */
  private dead = false;
  /** What the local player last said nearby. */
  readonly bubble = new SpeechBubble(2.3);

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
    this.avatar.root.add(this.bubble.sprite);

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

  /**
   * Title: the camera flies around the Archive and the player idles. Creator: movement off, camera
   * in front of the character. Play: normal control.
   */
  setMode(mode: GameMode): void {
    const from = this.mode;
    this.mode = mode;
    this.updateInputEnabled();
    if (mode === 'creator') {
      this.orbit.yaw = Math.PI;
      this.orbit.pitch = -0.08;
      this.orbit.distance = 3.6;
    } else if (mode === 'play' && from !== 'play') {
      this.orbit.yaw = 0;
      this.orbit.pitch = -0.25;
      this.orbit.distance = 6;
    }
  }

  get currentMode(): GameMode {
    return this.mode;
  }

  /** A menu (pause, settings) is over the game: input off, world keeps running. */
  setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    this.updateInputEnabled();
  }

  private updateInputEnabled(): void {
    this.input.enabled = this.mode === 'play' && !this.menuOpen && !this.dead;
  }

  setDead(dead: boolean): void {
    this.dead = dead;
    this.avatar.setDead(dead);
    this.updateInputEnabled();
  }

  get isDead(): boolean {
    return this.dead;
  }

  applySettings(settings: Settings): void {
    this.orbit.settings = {
      sensitivity: BASE_LOOK_SPEED * settings.sensitivity,
      invertY: settings.invertY,
    };
    const profile = qualityProfile(settings.quality, window.devicePixelRatio);
    this.opts.renderer.setPixelRatio(profile.pixelRatio);
    this.level.setQuality?.(profile);
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
      if (this.mode === 'play') {
        const look = this.input.consumeLook();
        this.orbit.look(look.dx, look.dy);
        this.orbit.zoom(this.input.consumeWheel());
      }

      // Physics keeps running in the creator (with no input) so the character stays grounded.
      const steps = this.fixed.advance(dt);
      const move = this.input.enabled ? this.input.move() : IDLE;
      for (let i = 0; i < steps; i++) {
        this.updateZone();
        this.player.fixedUpdate(PHYSICS_STEP, move, this.orbit.yaw, this.rules);
        this.world.timestep = PHYSICS_STEP;
        this.world.step();
      }
      if (this.player.position.y < FALL_LIMIT) {
        this.player.teleport(this.level.spawn);
        this.onRespawn?.();
      }
    }

    this.player.update(this.fixed.alpha, dt);
    this.avatar.root.position.copy(this.player.position);
    this.avatar.root.rotation.y =
      this.mode === 'creator' ? Math.sin(this.elapsed * 0.6) * 0.5 : this.player.facing;
    this.avatar.animate(
      dt,
      this.player.horizontalSpeed,
      this.player.grounded,
      this.player.motor.velocity.y,
    );

    this.updateInteractions();

    if (this.mode === 'title') {
      this.flyBy();
    } else {
      const creator = this.mode === 'creator';
      this.focus.copy(this.player.position).y += creator ? 1.1 : 1.6;
      // In the creator the panel covers the left of the screen, so shift the character right.
      if (creator) this.focus.x += 1.1;
      this.orbit.update(this.focus, dt, this.player.collider);
    }
    this.level.update?.({
      dt,
      elapsed: this.elapsed,
      playerPosition: this.player.position,
      camera: this.camera,
    });

    this.bubble.update(performance.now());
    for (const system of this.systems) system(dt, this.elapsed);

    this.opts.renderer.render(this.scene, this.camera);
  }

  /** Debug/test teleport (feet position); tells the server when connected. */
  teleport(feet: THREE.Vector3): void {
    this.player.teleport(feet);
    this.onTeleport?.(feet);
  }

  /** Slow circle out over the sea, looking back at the Archive skyline (title screen). */
  private flyBy(): void {
    const a = 0.35 + this.elapsed * 0.025;
    const radius = 125;
    this.camera.position.set(
      Math.sin(a) * radius,
      18 + Math.sin(this.elapsed * 0.15) * 3,
      Math.cos(a) * radius,
    );
    // Aim left of the Archive so the skyline sits on the right, clear of the title text.
    const offset = 30;
    this.camera.lookAt(-Math.cos(a) * offset, 12, Math.sin(a) * offset - 8);
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
