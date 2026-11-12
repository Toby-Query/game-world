import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_TITLE } from '@the-world/shared';
import { currentDevice, isDesktopDevice } from './device';
import { Game } from './game/Game';
import { buildArchiveLevel } from './game/level/archive/archiveLevel';
import { buildTestLevel } from './game/level/testLevel';

async function start(): Promise<void> {
  document.title = GAME_TITLE;

  if (!isDesktopDevice(currentDevice())) {
    const gate = document.getElementById('gate');
    if (gate) gate.style.display = 'grid';
    return;
  }

  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  await RAPIER.init();

  // WebGPURenderer uses WebGPU when available and falls back to WebGL 2 otherwise.
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  await renderer.init();
  container.appendChild(renderer.domElement);

  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? 'webgpu'
    : 'webgl';
  const label = document.getElementById('renderer-label');
  if (label)
    label.textContent = `${backend} · click to look · WASD move · Shift sprint · Space jump`;

  const params = new URLSearchParams(location.search);
  const buildLevel = params.get('level') === 'test' ? buildTestLevel : buildArchiveLevel;
  const game = new Game({ renderer, rapier: RAPIER, buildLevel });
  const resize = (): void => game.resize(container.clientWidth, container.clientHeight);
  resize();
  window.addEventListener('resize', resize);

  let first = true;
  await renderer.setAnimationLoop((time) => {
    game.frame(time);
    if (first) {
      first = false;
      window.__THE_WORLD__ = {
        ready: true,
        backend,
        player: () => ({
          x: game.player.position.x,
          y: game.player.position.y,
          z: game.player.position.z,
          grounded: game.player.grounded,
        }),
        camera: (yaw: number, pitch: number, distance: number) => {
          game.orbit.yaw = yaw;
          game.orbit.pitch = pitch;
          game.orbit.distance = distance;
        },
        stats: () => ({
          drawCalls: renderer.info.render.drawCalls,
          triangles: renderer.info.render.triangles,
        }),
      };
    }
  });
}

start().catch((error: unknown) => {
  console.error('The World failed to start', error);
  const label = document.getElementById('renderer-label');
  if (label) label.textContent = 'failed to start — see console';
});
