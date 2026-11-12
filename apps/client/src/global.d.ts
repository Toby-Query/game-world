export {};

declare global {
  interface Window {
    /** Set once the game has rendered its first frame; read by the smoke test. */
    __THE_WORLD__?: {
      ready: boolean;
      backend: 'webgpu' | 'webgl';
      /** Debug view of the local player, for automated tests. */
      player?: () => { x: number; y: number; z: number; grounded: boolean };
    };
  }
}
