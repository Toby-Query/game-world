import type { MoveInput } from './player/movement';

/**
 * Keyboard and mouse state for desktop play. Mouse look uses pointer lock;
 * clicking the canvas captures the mouse, Esc releases it.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
  private wheel = 0;
  private on = true;

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    canvas.addEventListener('click', this.onClick);
  }

  /** False while a menu or text box has focus, so typing does not move the player. */
  get enabled(): boolean {
    return this.on;
  }

  set enabled(value: boolean) {
    if (value === this.on) return;
    this.on = value;
    // Drop keys pressed while disabled so they don't fire when control returns.
    this.pressed.clear();
    this.down.clear();
    this.lookDX = this.lookDY = this.wheel = 0;
    if (!value) this.releasePointerLock();
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  isDown(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  /** True once per key press (consumed when read). */
  wasPressed(code: string): boolean {
    if (!this.enabled) return false;
    const hit = this.pressed.has(code);
    this.pressed.delete(code);
    return hit;
  }

  move(): MoveInput {
    const axis = (pos: string[], neg: string[]): number =>
      (pos.some((c) => this.isDown(c)) ? 1 : 0) - (neg.some((c) => this.isDown(c)) ? 1 : 0);
    return {
      forward: axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']),
      right: axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']),
      sprint: this.isDown('ShiftLeft') || this.isDown('ShiftRight'),
      // A tap shorter than one frame still counts.
      jump: this.isDown('Space') || this.wasPressed('Space'),
    };
  }

  /** Mouse movement since the last call, in pixels. */
  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }

  /** Wheel delta since the last call (positive = zoom out). */
  consumeWheel(): number {
    const out = this.wheel;
    this.wheel = 0;
    return out;
  }

  requestPointerLock(): void {
    if (!this.pointerLocked) void this.canvas.requestPointerLock?.();
  }

  releasePointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('click', this.onClick);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTyping(e.target)) return;
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.down.clear();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.lookDX += e.movementX;
    this.lookDY += e.movementY;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    this.wheel += Math.sign(e.deltaY);
  };

  private readonly onClick = (): void => {
    if (this.enabled) this.requestPointerLock();
  };
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
