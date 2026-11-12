import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { DEFAULT_APPEARANCE, GAME_TITLE } from '@the-world/shared';
import { currentDevice, isDesktopDevice } from './device';
import { loadAppearance } from './game/character/characterStore';
import { Game } from './game/Game';
import { buildArchiveLevel } from './game/level/archive/archiveLevel';
import { buildTestLevel } from './game/level/testLevel';
import { loadSettings, qualityProfile } from './settings/settings';
import { LoadingScreen } from './ui/LoadingScreen';
import { Shell } from './ui/Shell';
import { Sound } from './ui/sound';

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

async function start(): Promise<void> {
  document.title = GAME_TITLE;

  if (!isDesktopDevice(currentDevice())) {
    const gate = document.getElementById('gate');
    if (gate) gate.style.display = 'grid';
    return;
  }

  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  const loading = new LoadingScreen();
  const settings = loadSettings();

  loading.set(0.1, 'Waking the physics engine');
  await RAPIER.init();

  // WebGPURenderer uses WebGPU when available and falls back to WebGL 2 otherwise.
  loading.set(0.3, 'Starting the renderer');
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(qualityProfile(settings.quality, window.devicePixelRatio).pixelRatio);
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

  loading.set(0.5, 'Raising the Archive');
  await nextFrame();
  const params = new URLSearchParams(location.search);
  const buildLevel = params.get('level') === 'test' ? buildTestLevel : buildArchiveLevel;
  const saved = loadAppearance();
  const game = new Game({
    renderer,
    rapier: RAPIER,
    buildLevel,
    appearance: saved ?? DEFAULT_APPEARANCE,
  });
  game.applySettings(settings);
  const resize = (): void => game.resize(container.clientWidth, container.clientHeight);
  resize();
  window.addEventListener('resize', resize);

  loading.set(0.75, 'Compiling shaders');
  await nextFrame();
  try {
    await renderer.compileAsync(game.scene, game.camera);
  } catch {
    // Not fatal: anything left compiles on first draw.
  }

  const shell = new Shell({
    game,
    settings,
    sound: new Sound(settings.volume),
    saved,
    forceCreator: params.has('creator'),
  });
  // ?autostart=1 skips every menu (automated tests, quick iteration).
  if (params.has('autostart')) shell.enterWorld();
  else shell.showTitle();

  loading.set(1, 'Ready');
  let first = true;
  await renderer.setAnimationLoop((time) => {
    game.frame(time);
    if (first) {
      first = false;
      loading.hide();
      window.__THE_WORLD__ = {
        ready: true,
        backend,
        player: () => ({
          x: game.player.position.x,
          y: game.player.position.y,
          z: game.player.position.z,
          grounded: game.player.grounded,
        }),
        teleport: (x: number, y: number, z: number) =>
          game.player.teleport(new THREE.Vector3(x, y, z)),
        camera: (yaw: number, pitch: number, distance: number) => {
          game.orbit.yaw = yaw;
          game.orbit.pitch = pitch;
          game.orbit.distance = distance;
        },
        zone: () => ({
          id: game.zone?.id ?? null,
          gravityY: game.rules.gravity.y,
        }),
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
  document.getElementById('loading')?.classList.add('failed');
});
