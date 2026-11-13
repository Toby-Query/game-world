import * as THREE from 'three/webgpu';
import { MSG, NET, type Appearance, type MoveMessage, type Pose } from '@the-world/shared';
import type { Game } from '../game/Game';
import { ChatBox } from '../ui/ChatBox';
import type { AccountClient } from './account';
import { startCombat, type CombatState } from './combat';
import { NetClient, type NetStatus } from './NetClient';
import { RemotePlayers } from './RemotePlayers';

export interface Multiplayer {
  readonly client: NetClient;
  readonly remotes: RemotePlayers;
  readonly combat: CombatState;
}

/**
 * Connects the local game to the server: sends our pose at the network tick rate, draws everyone
 * nearby, and applies the server's corrections.
 */
export function startMultiplayer(
  game: Game,
  url: string,
  appearance: Appearance,
  account: AccountClient | null,
): Multiplayer {
  const session = account?.session ?? null;
  const remotes = new RemotePlayers(game.scene);
  const pill = statusPill();
  // Assigned just below; the chat box only calls it after the player presses Enter.
  let client: NetClient | null = null;
  const chat = new ChatBox({
    send: (channel, text) => client?.send(MSG.chat, { channel, text }),
    canOpen: () => game.currentMode === 'play' && game.input.enabled,
    onTyping: (typing) => {
      game.textInputActive = typing;
    },
  });

  client = new NetClient(
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
      chat: (m) => {
        const mine = m.from === client?.you;
        chat.add(m, mine);
        if (m.channel !== 'nearby') return;
        if (mine) game.bubble.say(m.text, performance.now());
        else remotes.say(m.from, m.text, performance.now());
      },
      notice: (text) => chat.notice(text),
      status: (s) => renderStatus(pill, s, 0),
    },
  );

  const net = client;
  game.onRespawn = () => net.send(MSG.respawn);
  game.onTeleport = (p) => net.send(MSG.teleport, { x: p.x, y: p.y, z: p.z });

  let sinceSend = 0;
  let sinceHud = 0;
  game.systems.push((dt) => {
    const now = performance.now();
    remotes.update(dt, now);
    sinceSend += dt;
    if (sinceSend >= 1 / NET.tickRate) {
      sinceSend = 0;
      const move: MoveMessage = { ...pose(game), placement: net.placement };
      net.send(MSG.move, move);
    }
    sinceHud += dt;
    if (sinceHud > 0.5) {
      sinceHud = 0;
      renderStatus(pill, net.status, remotes.visible().length);
    }
  });

  const combat = startCombat(game, net, remotes, account);
  renderStatus(pill, net.status, 0);
  void net.connect();
  return { client: net, remotes, combat };
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
