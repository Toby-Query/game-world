import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { DEFAULT_APPEARANCE, GAME_TITLE, httpUrlFor } from '@the-world/shared';
import { currentDevice, isDesktopDevice } from './device';
import { loadAppearance, saveAppearance } from './game/character/characterStore';
import { Game } from './game/Game';
import { buildArchiveLevel } from './game/level/archive/archiveLevel';
import { buildTestLevel } from './game/level/testLevel';
import { AccountClient } from './net/account';
import { startMultiplayer, type Multiplayer } from './net/multiplayer';
import { resolveServerUrl } from './net/serverUrl';
import { loadSettings, qualityProfile } from './settings/settings';
import { LoadingScreen } from './ui/LoadingScreen';
import { Shell } from './ui/Shell';
import { Sound } from './ui/sound';
import { WalletHud } from './ui/WalletHud';

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
  const offline = params.has('offline');
  const serverUrl = resolveServerUrl(
    import.meta.env.VITE_SERVER_URL as string | undefined,
    location,
  );

  // Signed-in players get their saved character from the server (a guest's local character is
  // uploaded on their first sign-in). ?login=<token> finishes a sign-in link.
  const account = offline ? null : new AccountClient(httpUrlFor(serverUrl));
  let saved = loadAppearance();
  if (account) {
    loading.set(0.6, 'Signing in');
    const loginToken = params.get('login');
    const me = await account.restore(loginToken);
    if (loginToken) {
      params.delete('login');
      const query = params.toString();
      history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
    }
    if (me?.character) {
      saved = me.character;
      saveAppearance(me.character);
    } else if (me && saved) {
      void account.saveCharacter(saved).catch(() => undefined);
    }
    const wallet = new WalletHud();
    account.onChange = (m) => wallet.show(m);
    wallet.show(account.me);
  }
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

  let multiplayer: Multiplayer | null = null;
  const shell = new Shell({
    game,
    settings,
    sound: new Sound(settings.volume),
    saved,
    forceCreator: params.has('creator'),
    account,
    // Join the server the first time the player enters the world (?offline=1 plays alone).
    onEnterWorld: (appearance) => {
      if (!multiplayer && !offline) {
        multiplayer = startMultiplayer(game, serverUrl, appearance, account?.session ?? null);
      }
    },
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
        teleport: (x: number, y: number, z: number) => game.teleport(new THREE.Vector3(x, y, z)),
        camera: (yaw: number, pitch: number, distance: number) => {
          game.orbit.yaw = yaw;
          game.orbit.pitch = pitch;
          game.orbit.distance = distance;
        },
        zone: () => ({
          id: game.zone?.id ?? null,
          gravityY: game.rules.gravity.y,
        }),
        net: () => ({
          status: multiplayer?.client.status ?? 'offline',
          you: multiplayer?.client.you ?? null,
          remotes: multiplayer?.remotes.visible() ?? [],
        }),
        account: () => account?.me ?? null,
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
