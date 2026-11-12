import { describe, expect, it } from 'vitest';
import {
  FixedStep,
  MOVEMENT,
  approach,
  createMotorState,
  stepMotor,
  wishDirection,
  type MoveInput,
} from './movement';

const idle: MoveInput = { forward: 0, right: 0, sprint: false, jump: false };
const dt = 1 / 60;

describe('wishDirection', () => {
  it('is zero with no input', () => {
    expect(wishDirection(idle, 1.2)).toEqual({ x: 0, z: 0 });
  });

  it('points down -Z for forward at yaw 0', () => {
    const d = wishDirection({ ...idle, forward: 1 }, 0);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });

  it('points down +X for right at yaw 0', () => {
    const d = wishDirection({ ...idle, right: 1 }, 0);
    expect(d.x).toBeCloseTo(1);
    expect(d.z).toBeCloseTo(0);
  });

  it('follows the camera yaw', () => {
    const d = wishDirection({ ...idle, forward: 1 }, Math.PI / 2);
    expect(d.x).toBeCloseTo(-1);
    expect(d.z).toBeCloseTo(0);
  });

  it('normalises diagonals so they are not faster', () => {
    const d = wishDirection({ ...idle, forward: 1, right: 1 }, 0);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });
});

describe('approach', () => {
  it('moves toward the target without overshooting', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(5, -1, 2)).toBe(3);
  });
});

describe('stepMotor', () => {
  const base = { dt, cameraYaw: 0, gravityY: -9.81, jumpMultiplier: 1 };

  it('reaches walk speed on the ground and sprint speed when sprinting', () => {
    const state = createMotorState();
    state.grounded = true;
    for (let i = 0; i < 60; i++) stepMotor(state, { ...base, input: { ...idle, forward: 1 } });
    expect(-state.velocity.z).toBeCloseTo(MOVEMENT.walkSpeed);
    for (let i = 0; i < 60; i++)
      stepMotor(state, { ...base, input: { ...idle, forward: 1, sprint: true } });
    expect(-state.velocity.z).toBeCloseTo(MOVEMENT.sprintSpeed);
  });

  it('jumps when grounded, scaled by the zone jump multiplier', () => {
    const state = createMotorState();
    state.grounded = true;
    const { jumped } = stepMotor(state, {
      ...base,
      jumpMultiplier: 2,
      input: { ...idle, jump: true },
    });
    expect(jumped).toBe(true);
    expect(state.velocity.y).toBeCloseTo(MOVEMENT.jumpSpeed * 2);
  });

  it('allows a jump shortly after leaving a ledge (coyote time) but not later', () => {
    const late = createMotorState();
    late.grounded = false;
    late.airTime = MOVEMENT.coyoteTime + 0.05;
    expect(stepMotor(late, { ...base, input: { ...idle, jump: true } }).jumped).toBe(false);

    const early = createMotorState();
    early.grounded = false;
    early.airTime = 0.02;
    expect(stepMotor(early, { ...base, input: { ...idle, jump: true } }).jumped).toBe(true);
  });

  it('cannot double jump in the air', () => {
    const state = createMotorState();
    state.grounded = true;
    stepMotor(state, { ...base, input: { ...idle, jump: true } });
    state.grounded = false;
    for (let i = 0; i < 5; i++) stepMotor(state, { ...base, input: idle });
    expect(stepMotor(state, { ...base, input: { ...idle, jump: true } }).jumped).toBe(false);
  });

  it('falls under gravity and caps fall speed', () => {
    const state = createMotorState();
    for (let i = 0; i < 600; i++) stepMotor(state, { ...base, input: idle });
    expect(state.velocity.y).toBeCloseTo(-MOVEMENT.maxFallSpeed);
  });

  it('jumps much higher and hangs longer in low gravity', () => {
    const apex = (gravityY: number, airDrag: number): { height: number; time: number } => {
      const state = createMotorState();
      state.grounded = true;
      stepMotor(state, { ...base, gravityY, airDrag, input: { ...idle, jump: true } });
      state.grounded = false;
      let height = 0;
      let time = 0;
      while (state.velocity.y > 0) {
        height += state.velocity.y * dt;
        time += dt;
        stepMotor(state, { ...base, gravityY, airDrag, input: idle });
      }
      return { height, time };
    };
    const normal = apex(-9.81, 0.01);
    const low = apex(-2.4, 0.15);
    expect(normal.height).toBeCloseTo(1.96, 0);
    expect(low.height).toBeGreaterThan(normal.height * 2.5);
    expect(low.time).toBeGreaterThan(normal.time * 3);
  });
});

describe('FixedStep', () => {
  it('runs whole steps and carries the remainder', () => {
    const fixed = new FixedStep(1 / 60);
    expect(fixed.advance(1 / 30)).toBe(2);
    expect(fixed.advance(1 / 120)).toBe(0);
    expect(fixed.advance(1 / 120)).toBe(1);
  });

  it('caps catch-up after a long stall', () => {
    const fixed = new FixedStep(1 / 60, 5);
    expect(fixed.advance(10)).toBe(5);
  });
});
