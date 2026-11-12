/** Tunable movement constants (metres, seconds). */
export const MOVEMENT = {
  walkSpeed: 4.5,
  sprintSpeed: 7.5,
  jumpSpeed: 6.2,
  /** How quickly horizontal velocity reaches the target speed, on the ground and in the air. */
  groundAcceleration: 40,
  airAcceleration: 8,
  /** Coyote time: a jump still works this long after walking off a ledge. */
  coyoteTime: 0.12,
  /** Jump buffering: a jump pressed this long before landing still fires on landing. */
  jumpBuffer: 0.12,
  maxFallSpeed: 40,
} as const;

export interface MoveInput {
  /** -1 (back) .. 1 (forward) */
  forward: number;
  /** -1 (left) .. 1 (right) */
  right: number;
  sprint: boolean;
  jump: boolean;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Turns stick-style input into a unit (or zero) world-space direction on the ground plane,
 * relative to the camera's yaw. Yaw 0 looks down -Z, matching three.js cameras.
 */
export function wishDirection(input: MoveInput, cameraYaw: number): { x: number; z: number } {
  const len = Math.hypot(input.forward, input.right);
  if (len < 1e-6) return { x: 0, z: 0 };
  const f = input.forward / Math.max(len, 1);
  const r = input.right / Math.max(len, 1);
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  // Forward is (-sin, -cos); right is (cos, -sin).
  return {
    x: -sin * f + cos * r,
    z: -cos * f - sin * r,
  };
}

/** Moves `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export interface MotorState {
  velocity: Vec3;
  /** Seconds since the character was last grounded. */
  airTime: number;
  /** Seconds since jump was last pressed (Infinity when not buffered). */
  jumpBufferTime: number;
  grounded: boolean;
}

export function createMotorState(): MotorState {
  return {
    velocity: { x: 0, y: 0, z: 0 },
    airTime: 0,
    jumpBufferTime: Number.POSITIVE_INFINITY,
    grounded: false,
  };
}

export interface StepOptions {
  dt: number;
  input: MoveInput;
  cameraYaw: number;
  /** Gravity along Y in m/s^2 (negative pulls down). */
  gravityY: number;
  jumpMultiplier: number;
  /** Fraction of vertical speed lost per second while airborne (zone air drag). */
  airDrag?: number;
  /** Extra speed multiplier, e.g. from zones or powers. */
  speedMultiplier?: number;
}

/**
 * Advances the character's velocity by one fixed step. Pure: the physics engine then turns
 * `velocity * dt` into a collision-aware movement and reports whether we ended up grounded.
 */
export function stepMotor(state: MotorState, opts: StepOptions): { jumped: boolean } {
  const { dt, input } = opts;
  const v = state.velocity;

  // Horizontal: accelerate toward the wished velocity.
  const dir = wishDirection(input, opts.cameraYaw);
  const speed =
    (input.sprint ? MOVEMENT.sprintSpeed : MOVEMENT.walkSpeed) * (opts.speedMultiplier ?? 1);
  const accel = (state.grounded ? MOVEMENT.groundAcceleration : MOVEMENT.airAcceleration) * dt;
  v.x = approach(v.x, dir.x * speed, accel * speed);
  v.z = approach(v.z, dir.z * speed, accel * speed);

  // Timers for coyote time and jump buffering.
  state.airTime = state.grounded ? 0 : state.airTime + dt;
  state.jumpBufferTime = input.jump ? 0 : state.jumpBufferTime + dt;

  let jumped = false;
  const canJump = state.airTime <= MOVEMENT.coyoteTime;
  if (canJump && state.jumpBufferTime <= MOVEMENT.jumpBuffer) {
    v.y = MOVEMENT.jumpSpeed * opts.jumpMultiplier;
    state.jumpBufferTime = Number.POSITIVE_INFINITY;
    state.airTime = MOVEMENT.coyoteTime + 1; // no double jump via coyote time
    state.grounded = false;
    jumped = true;
  } else if (state.grounded && v.y < 0) {
    v.y = -1; // keep a small downward push so slopes and steps stay snapped
  } else {
    v.y = Math.max(v.y + opts.gravityY * dt, -MOVEMENT.maxFallSpeed);
    v.y *= Math.max(0, 1 - (opts.airDrag ?? 0) * dt);
  }
  return { jumped };
}

/** Accumulates frame time into fixed physics steps; returns how many steps to run. */
export class FixedStep {
  private accumulator = 0;

  constructor(
    readonly step: number,
    private readonly maxSteps = 5,
  ) {}

  advance(frameDt: number): number {
    this.accumulator = Math.min(this.accumulator + frameDt, this.step * this.maxSteps);
    let steps = 0;
    while (this.accumulator >= this.step) {
      this.accumulator -= this.step;
      steps++;
    }
    return steps;
  }

  /** 0..1: how far we are between the last and the next fixed step (for interpolation). */
  get alpha(): number {
    return this.accumulator / this.step;
  }
}
