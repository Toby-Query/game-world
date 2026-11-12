import * as THREE from 'three/webgpu';
import { MSG, NET, type Appearance, type Pose } from '@the-world/shared';
import type { Game } from '../game/Game';
import { NetClient, type NetStatus } from './NetClient';
import { RemotePlayers } from './RemotePlayers';

export interface Multiplayer {
  readonly client: NetClient;
  readonly remotes: RemotePlayers;
}

/**
 * Connects the local game to the server: sends our pose at the network tick rate, draws everyone
 * nearby, and applies the server's corrections.
 */
export function startMultiplayer(
  game: Game,
  url: string,
  appearance: Appearance,
  session: string | null,
): Multiplayer {
  const remotes = new RemotePlayers(game.scene);
  const pill = statusPill();

  const client = new NetClient(
    url,
    { appearance, ...(session ? { session } : {}) },
    {
      welcome: (m) => {
        remotes.reset(m.you, m.players);
        game.player.teleport(new THREE.Vector3(m.spawn.x, m.spawn.y, m.spawn.z));
      },
      joined: (p) => remotes.add(p),
      left: (id) => remotes.remove(id),
      snapshot: (m) => remotes.onSnapshot(m, performance.now()),
      correction: (p) => game.player.teleport(new THREE.Vector3(p.x, p.y, p.z)),
      status: (s) => renderStatus(pill, s, 0),
    },
  );

  game.onRespawn = () => client.send(MSG.respawn);
  game.onTeleport = (p) => client.send(MSG.teleport, { x: p.x, y: p.y, z: p.z });

  let sinceSend = 0;
  let sinceHud = 0;
  game.systems.push((dt) => {
    const now = performance.now();
    remotes.update(dt, now);
    sinceSend += dt;
    if (sinceSend >= 1 / NET.tickRate) {
      sinceSend = 0;
      client.send(MSG.move, pose(game));
    }
    sinceHud += dt;
    if (sinceHud > 0.5) {
      sinceHud = 0;
      renderStatus(pill, client.status, remotes.visible().length);
    }
  });

  renderStatus(pill, client.status, 0);
  void client.connect();
  return { client, remotes };
}

function pose(game: Game): Pose {
  const p = game.player.feet;
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    facing: game.player.facing,
    speed: game.player.horizontalSpeed,
    grounded: game.player.grounded,
    vy: game.player.motor.velocity.y,
  };
}

function statusPill(): HTMLDivElement {
  const pill = document.createElement('div');
  pill.className = 'tw-net';
  pill.dataset.testid = 'net-status';
  document.body.append(pill);
  return pill;
}

function renderStatus(pill: HTMLDivElement, status: NetStatus, nearby: number): void {
  pill.dataset.status = status;
  pill.textContent =
    status === 'online'
      ? `Online · ${nearby} nearby`
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'reconnecting'
          ? 'Reconnecting…'
          : 'Offline · retrying';
}
