import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_TITLE } from '@the-world/shared';
import { currentDevice, isDesktopDevice } from './device';
import { createPlaceholderScene } from './scene';

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
  if (label) label.textContent = `placeholder scene · ${backend}`;

  const world = createPlaceholderScene(RAPIER);

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h, false);
    world.camera.aspect = w / h;
    world.camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const timer = new THREE.Timer();
  timer.connect(document);
  await renderer.setAnimationLoop((time) => {
    timer.update(time);
    world.update(timer.getDelta());
    renderer.render(world.scene, world.camera);
  });

  window.__THE_WORLD__ = { ready: true, backend };
}

start().catch((error: unknown) => {
  console.error('The World failed to start', error);
  const label = document.getElementById('renderer-label');
  if (label) label.textContent = 'failed to start — see console';
});
