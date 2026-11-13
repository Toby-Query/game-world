import * as THREE from 'three/webgpu';
import {
  COMBAT,
  Cooldowns,
  MSG,
  NET,
  type AttackEvent,
  type AttackKind,
  type AttackMessage,
  type DeathMessage,
  type HitMessage,
  type InventoryItem,
  type LootBag,
  type RespawnMessage,
} from '@the-world/shared';
import { CombatEffects } from '../game/combat/CombatEffects';
import { LootBags } from '../game/combat/LootBags';
import type { Game } from '../game/Game';
import { CombatHud } from '../ui/CombatHud';
import type { AccountClient } from './account';
import type { NetClient } from './NetClient';
import type { RemotePlayers } from './RemotePlayers';

/** The orbit camera's resting pitch (see OrbitCamera): ranged shots aim relative to it. */
const REST_PITCH = -0.25;

export interface CombatState {
  health: number;
  dead: boolean;
  loot: LootBag[];
  /** How many times you have died this session, and who got you last. */
  deaths: number;
  killedBy: string | null;
}

/**
 * The local side of PvP: turns key presses into attacks and dodges (the server decides what
 * hits), and shows the results: health, damage numbers, hit flashes, death and respawn, loot.
 */
export function startCombat(
  game: Game,
  client: NetClient,
  remotes: RemotePlayers,
  account: AccountClient | null,
): CombatState {
  const state: CombatState = {
    health: COMBAT.maxHealth,
    dead: false,
    loot: [],
    deaths: 0,
    killedBy: null,
  };
  const hud = new CombatHud();
  const effects = new CombatEffects(game.scene);
  const bags = new LootBags(game.scene, game.interactions, (id) => client.send(MSG.pickup, { id }));
  const cooldowns = new Cooldowns();
  const forward = new THREE.Vector3();

  const isMe = (id: string): boolean => id === client.you;
  const serverNow = (): number => remotes.serverNow(performance.now()) ?? Date.now();

  const attack = (kind: AttackKind): void => {
    const spec = kind === 'melee' ? COMBAT.melee : COMBAT.ranged;
    if (!cooldowns.use(kind, spec.cooldownMs, performance.now())) return;
    game.camera.getWorldDirection(forward);
    forward.setY(0).normalize();
    if (kind === 'ranged') {
      // The third-person camera rests looking down at the player; aim relative to that, so the
      // resting view shoots level and tilting the camera up aims up.
      const aim = game.orbit.pitch - REST_PITCH;
      forward.multiplyScalar(Math.cos(aim)).setY(Math.sin(aim));
    }
    // Face the attack, swing, and tell the server what we saw (lag compensation).
    game.player.facing = Math.atan2(-forward.x, -forward.z);
    game.avatar.swing(kind);
    const feet = game.player.feet;
    const message: AttackMessage = {
      kind,
      dir: { x: forward.x, y: forward.y, z: forward.z },
      origin: { x: feet.x, y: feet.y, z: feet.z },
      seenAt: serverNow() - NET.interpolationDelayMs,
    };
    client.send(MSG.attack, message);
  };

  const dodge = (): void => {
    if (!cooldowns.use('dodge', COMBAT.dodge.cooldownMs, performance.now())) return;
    const move = game.input.move();
    const yaw = game.orbit.yaw;
    // Dash where you are steering, or backwards when standing still.
    const f = move.forward || move.right ? move.forward : -1;
    const r = move.right;
    const x = -Math.sin(yaw) * f + Math.cos(yaw) * r;
    const z = -Math.cos(yaw) * f - Math.sin(yaw) * r;
    game.player.startDash(x, z, COMBAT.dodge.speed, COMBAT.dodge.durationMs / 1000);
    client.send(MSG.dodge);
  };

  client.on<AttackEvent>(MSG.attacked, (e) => {
    if (!isMe(e.attacker)) remotes.swing(e.attacker, e.kind);
    if (e.kind === 'ranged') effects.bolt(e.origin, e.dir, COMBAT.ranged.range * 0.6);
    else effects.slash(e.origin, e.dir);
  });

  client.on<HitMessage>(MSG.hit, (hit) => {
    hud.damage(hit.at, hit.damage, isMe(hit.target));
    if (isMe(hit.target)) {
      state.health = hit.health;
      hud.setHealth(hit.health);
      game.avatar.flash();
    } else {
      remotes.flash(hit.target);
    }
  });

  client.on<DeathMessage>(MSG.died, (death) => {
    if (!isMe(death.id)) return;
    state.dead = true;
    state.health = 0;
    state.deaths += 1;
    state.killedBy = death.byName;
    hud.setHealth(0);
    hud.showDeath(death.byName, death.respawnAt, serverNow());
    game.setDead(true);
  });

  client.on<RespawnMessage>(MSG.respawned, (r) => {
    if (!isMe(r.id)) return;
    state.dead = false;
    state.health = r.health;
    hud.setHealth(r.health);
    hud.hideDeath();
    game.setDead(false);
    game.player.teleport(new THREE.Vector3(r.at.x, r.at.y, r.at.z));
  });

  client.on<LootBag[]>(MSG.loot, (list) => {
    state.loot = list;
    bags.set(list);
  });

  client.on<InventoryItem[]>(MSG.inventory, (items) => account?.setInventory(items));

  game.systems.push((dt, elapsed) => {
    effects.update(dt);
    bags.update(elapsed);
    hud.update(dt, game.camera, window.innerWidth, window.innerHeight);
    if (!game.input.enabled || game.textInputActive || state.dead) return;
    if (game.input.wasPressed('KeyF') || game.input.wasPressed('Mouse0')) attack('melee');
    if (game.input.wasPressed('KeyR') || game.input.wasPressed('Mouse2')) attack('ranged');
    if (game.input.wasPressed('KeyQ')) dodge();
  });

  return state;
}
