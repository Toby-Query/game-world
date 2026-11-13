import type { LootBag, Me } from '@the-world/shared';

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
      /** The physics zone the player is in and its current (blended) gravity, for tests. */
      zone?: () => { id: string | null; gravityY: number };
      /** Connection status and the remote players currently visible, for tests. */
      net?: () => {
        status: string;
        you: string | null;
        remotes: {
          id: string;
          name: string;
          x: number;
          y: number;
          z: number;
          /** What they are saying nearby (speech bubble), or ''. */
          bubble: string;
          hp: number;
        }[];
      };
      /** The signed-in account (character, balance, inventory), or null for guests. */
      account?: () => Me | null;
      /** Your health, whether you are dead, and the loot bags nearby. */
      combat?: () => {
        health: number;
        dead: boolean;
        loot: LootBag[];
        deaths: number;
        killedBy: string | null;
      };
      /** Renderer cost of the last frame, for performance budgets. */
      stats?: () => { drawCalls: number; triangles: number };
    };
  }
}
