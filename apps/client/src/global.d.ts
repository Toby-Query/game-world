export {};

declare global {
  interface Window {
    /** Set once the game has rendered its first frame; read by the smoke test. */
    __THE_WORLD__?: {
      ready: boolean;
      backend: 'webgpu' | 'webgl';
      /** Debug view of the local player, for automated tests. */
      player?: () => { x: number; y: number; z: number; grounded: boolean };
      /** Moves the local player instantly (feet position), for tests. */
      teleport?: (x: number, y: number, z: number) => void;
      /** Points the orbit camera, for screenshots and tests. */
      camera?: (yaw: number, pitch: number, distance: number) => void;
      /** Renderer cost of the last frame, for performance budgets. */
      stats?: () => { drawCalls: number; triangles: number };
    };
  }
}
