import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { ZoneRules } from '@the-world/shared';
import { createMotorState, stepMotor, type MotorState, type MoveInput } from './movement';

const RADIUS = 0.35;
const HALF_HEIGHT = 0.55;
/** Distance from the feet to the capsule centre. */
const CENTRE = RADIUS + HALF_HEIGHT;

/**
 * Kinematic character on Rapier's character controller: slides along walls, climbs steps,
 * snaps to slopes. Movement intent comes from the pure motor in `movement.ts`.
 */
export class PlayerController {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly motor: MotorState = createMotorState();
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly previous = new THREE.Vector3();
  private readonly current = new THREE.Vector3();
  /** Feet position, interpolated between fixed steps for smooth rendering. */
  readonly position = new THREE.Vector3();
  /** Yaw the character model faces (radians). */
  facing = 0;

  constructor(
    rapier: typeof RAPIER,
    private readonly world: RAPIER.World,
    spawn: THREE.Vector3,
  ) {
    this.body = world.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawn.x,
        spawn.y + CENTRE,
        spawn.z,
      ),
    );
    this.collider = world.createCollider(
      rapier.ColliderDesc.capsule(HALF_HEIGHT, RADIUS),
      this.body,
    );
    this.controller = world.createCharacterController(0.02);
    this.controller.enableAutostep(0.4, 0.2, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    this.controller.setSlideEnabled(true);
    this.current.copy(spawn);
    this.previous.copy(spawn);
    this.position.copy(spawn);
  }

  /** Feet position after the latest physics step (not interpolated). */
  get feet(): THREE.Vector3 {
    return this.current;
  }

  get grounded(): boolean {
    return this.motor.grounded;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.motor.velocity.x, this.motor.velocity.z);
  }

  /** One fixed physics step. */
  fixedUpdate(dt: number, input: MoveInput, cameraYaw: number, rules: ZoneRules): void {
    this.previous.copy(this.current);
    const scaledDt = dt * rules.timeScale;
    stepMotor(this.motor, {
      dt: scaledDt,
      input,
      cameraYaw,
      gravityY: rules.gravity.y,
      jumpMultiplier: rules.jumpMultiplier,
      airDrag: rules.airDrag,
    });

    const v = this.motor.velocity;
    this.controller.computeColliderMovement(this.collider, {
      x: v.x * scaledDt,
      y: v.y * scaledDt,
      z: v.z * scaledDt,
    });
    const moved = this.controller.computedMovement();
    const t = this.body.translation();
    const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z };
    this.body.setNextKinematicTranslation(next);

    const wasGrounded = this.motor.grounded;
    this.motor.grounded = this.controller.computedGrounded();
    // Bumping a ceiling kills upward speed; landing stops the fall.
    if (v.y > 0 && moved.y < v.y * scaledDt * 0.5) v.y = 0;
    if (this.motor.grounded && !wasGrounded && v.y < 0) v.y = 0;

    this.current.set(next.x, next.y - CENTRE, next.z);
    if (this.horizontalSpeed > 0.2) this.targetFacing = Math.atan2(-v.x, -v.z);
  }

  private targetFacing = 0;

  /** Per-frame: interpolate the render position and turn toward the movement direction. */
  update(alpha: number, dt: number): void {
    this.position.lerpVectors(this.previous, this.current, alpha);
    let delta = this.targetFacing - this.facing;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.facing += delta * Math.min(1, dt * 12);
  }

  /** Moves the player instantly (spawns, respawns, teleports). */
  teleport(feet: THREE.Vector3): void {
    this.body.setTranslation({ x: feet.x, y: feet.y + CENTRE, z: feet.z }, true);
    this.current.copy(feet);
    this.previous.copy(feet);
    this.position.copy(feet);
    this.motor.velocity = { x: 0, y: 0, z: 0 };
  }

  dispose(): void {
    this.world.removeCharacterController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
