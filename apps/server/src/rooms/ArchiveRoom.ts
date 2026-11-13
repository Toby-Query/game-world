import { Room, logger, type Client } from '@colyseus/core';
import { randomUUID } from 'node:crypto';
import {
  CHAT,
  COMBAT,
  Cooldowns,
  MSG,
  NET,
  RateLimiter,
  checkMove,
  chooseLoot,
  inMeleeArc,
  parseAttack,
  positionAt,
  rayHitsBody,
  rewindTime,
  maskProfanity,
  parseChatSend,
  parsePose,
  playersNear,
  sanitizeJoinOptions,
  type Appearance,
  type AttackEvent,
  type AttackMessage,
  type ChatMessage,
  type DeathMessage,
  type HitMessage,
  type LootBag,
  type RespawnMessage,
  type Sample,
  type PlayerProfile,
  type PlayerSnapshot,
  type Pose,
  type SnapshotMessage,
  type Vec3,
  type WelcomeMessage,
} from '@the-world/shared';
import type { AccountStore } from '../accounts/AccountStore';
import { BLOCKED_WORDS } from '../chat/blockedWords';

/** Presence channel that carries global chat between every cell room. */
const GLOBAL_CHAT = 'chat:global';

/** Feet position new players start at: the Archive spawn on the plaza. */
export const ARCHIVE_SPAWN: Vec3 = { x: 0, y: 0, z: 22 };

interface ServerPlayer extends Pose {
  id: string;
  /** Account id when signed in; guests have none and nothing of theirs is saved. */
  playerId: string | null;
  name: string;
  appearance: Appearance;
  /** Server time (ms) of the last accepted move. */
  lastMoveAt: number;
  chatLimit: RateLimiter;
  health: number;
  dead: boolean;
  invulnerableUntil: number;
  cooldowns: Cooldowns;
  /** Recent positions (server time), so hits can be checked against what attackers saw. */
  history: Sample[];
}

/** Eye height above the feet, where ranged attacks start. */
const EYE = 1.5;
/** How much position history to keep for lag compensation. */
const HISTORY_MS = 1000;

export interface ArchiveRoomOptions {
  /** Allow the debug teleport message (tests, local development). */
  allowTeleport?: boolean;
}

/**
 * One Archive cell. The server owns positions: clients send their pose, the server checks the move
 * is physically possible, and every tick each client receives only the players near them.
 */
export class ArchiveRoom extends Room {
  /** Accounts, when the server has a database (set at startup). */
  static accounts: AccountStore | null = null;

  override maxClients = 100;
  // Seconds a reserved seat waits for the client to connect; generous for slow machines.
  override seatReservationTimeout = 60;
  readonly players = new Map<string, ServerPlayer>();
  readonly loot = new Map<string, LootBag>();
  private allowTeleport = false;
  /** Lets tests make loot drops deterministic. */
  random: () => number = Math.random;
  private readonly relayGlobal = (message: ChatMessage): void => {
    this.broadcast(MSG.chatMessage, message);
  };

  override onCreate(options: ArchiveRoomOptions = {}): void {
    this.allowTeleport = options.allowTeleport ?? process.env.NODE_ENV !== 'production';
    this.setPatchRate(null);
    this.setSimulationInterval(() => this.broadcastSnapshots(), 1000 / NET.tickRate);

    this.onMessage(MSG.move, (client, message: unknown) => this.onMove(client, message));
    this.onMessage(MSG.respawn, (client) => this.place(client, ARCHIVE_SPAWN));
    this.onMessage(MSG.teleport, (client, message: unknown) => {
      if (!this.allowTeleport) return;
      const pose = parsePose({ facing: 0, ...(message as object) });
      if (pose) this.place(client, pose);
    });
    this.onMessage(MSG.chat, (client, message: unknown) => this.onChat(client, message));
    this.onMessage(MSG.attack, (client, message: unknown) => this.onAttack(client, message));
    this.onMessage(MSG.dodge, (client) => this.onDodge(client));
    this.onMessage(MSG.pickup, (client, message: unknown) => void this.onPickup(client, message));
    // Global chat reaches every cell room, through presence (in-process now, Redis when scaled).
    void this.presence.subscribe(GLOBAL_CHAT, this.relayGlobal);
    logger.info(`Archive room ${this.roomId} created`);
  }

  override onDispose(): void {
    void this.presence.unsubscribe(GLOBAL_CHAT, this.relayGlobal);
  }

  override async onJoin(client: Client, options: unknown): Promise<void> {
    let { name, appearance } = sanitizeJoinOptions(options);
    // Signed-in players appear as their saved character, whatever the client sent.
    const session = (options as { session?: unknown } | null)?.session;
    const accounts = ArchiveRoom.accounts;
    const playerId =
      accounts && typeof session === 'string' ? await accounts.playerForSession(session) : null;
    if (accounts && playerId) {
      const me = await accounts.me(playerId);
      if (me?.character) ({ name, appearance } = sanitizeJoinOptions({ appearance: me.character }));
    }
    const player: ServerPlayer = {
      id: client.sessionId,
      playerId,
      name,
      appearance,
      ...ARCHIVE_SPAWN,
      facing: 0,
      speed: 0,
      grounded: true,
      vy: 0,
      lastMoveAt: Date.now(),
      chatLimit: new RateLimiter(),
      health: COMBAT.maxHealth,
      dead: false,
      invulnerableUntil: 0,
      cooldowns: new Cooldowns(),
      history: [{ ...ARCHIVE_SPAWN, t: Date.now() }],
    };
    this.players.set(client.sessionId, player);
    const welcome: WelcomeMessage = {
      you: client.sessionId,
      players: [...this.players.values()].map(profile),
      spawn: ARCHIVE_SPAWN,
    };
    client.send(MSG.welcome, welcome);
    client.send(MSG.loot, [...this.loot.values()]);
    this.broadcast(MSG.joined, profile(player), { except: client });
    logger.info(`${name} (${client.sessionId}) joined the Archive`);
  }

  override async onLeave(client: Client, code?: number): Promise<void> {
    const consented = code === 1000 || code === 4000;
    if (!consented) {
      try {
        // Hold the slot so a dropped connection can come back as the same player.
        await this.allowReconnection(client, NET.reconnectSeconds);
        logger.info(`${client.sessionId} reconnected`);
        const player = this.players.get(client.sessionId);
        if (player) player.lastMoveAt = Date.now();
        return;
      } catch {
        // Timed out: fall through and remove them.
      }
    }
    this.players.delete(client.sessionId);
    this.broadcast(MSG.left, { id: client.sessionId });
    logger.info(`${client.sessionId} left the Archive`);
  }

  private onMove(client: Client, message: unknown): void {
    const player = this.players.get(client.sessionId);
    const pose = parsePose(message);
    if (!player || !pose || player.dead) return;
    const now = Date.now();
    const result = checkMove(player, pose, (now - player.lastMoveAt) / 1000);
    Object.assign(player, pose, result.position, { lastMoveAt: now });
    this.record(player, now);
    if (!result.ok) client.send(MSG.correction, result.position);
  }

  /**
   * Chat is rate limited and filtered here, so every client sees the same (masked) text. Nearby
   * messages go to players within earshot, including the speaker; global ones to everyone.
   */
  private onChat(client: Client, raw: unknown): void {
    const player = this.players.get(client.sessionId);
    const send = parseChatSend(raw);
    if (!player || !send) return;
    if (!player.chatLimit.allow()) {
      const wait = Math.ceil(player.chatLimit.waitSeconds());
      client.send(MSG.chatNotice, { text: `Slow down: you can chat again in ${wait}s.` });
      return;
    }
    const message: ChatMessage = {
      id: randomUUID(),
      from: player.id,
      name: player.name,
      channel: send.channel,
      text: maskProfanity(send.text, BLOCKED_WORDS),
      t: Date.now(),
    };
    if (send.channel === 'global') {
      void this.presence.publish(GLOBAL_CHAT, message);
      return;
    }
    const r2 = CHAT.proximityRadius ** 2;
    for (const other of this.clients) {
      const p = this.players.get(other.sessionId);
      if (p && (p.x - player.x) ** 2 + (p.z - player.z) ** 2 <= r2) {
        other.send(MSG.chatMessage, message);
      }
    }
  }

  /** Server-side move without speed checks (spawn, respawn, debug teleport). */
  private place(client: Client, at: Vec3): void {
    const player = this.players.get(client.sessionId);
    if (!player || player.dead) return;
    this.moveTo(player, at);
  }

  private moveTo(player: ServerPlayer, at: Vec3): void {
    const now = Date.now();
    Object.assign(player, { x: at.x, y: at.y, z: at.z, vy: 0, lastMoveAt: now });
    player.history = [{ x: at.x, y: at.y, z: at.z, t: now }];
  }

  private record(player: ServerPlayer, now: number): void {
    player.history.push({ x: player.x, y: player.y, z: player.z, t: now });
    while (player.history.length > 2 && player.history[0]!.t < now - HISTORY_MS) {
      player.history.shift();
    }
  }

  /**
   * Melee hits everyone in the arc in front; ranged hits the nearest body along the aim. Targets are
   * rewound to where the attacker saw them (lag compensation), within a small limit.
   */
  private onAttack(client: Client, raw: unknown): void {
    const attacker = this.players.get(client.sessionId);
    const attack = parseAttack(raw);
    const now = Date.now();
    if (!attacker || !attack || attacker.dead) return;
    const spec = attack.kind === 'melee' ? COMBAT.melee : COMBAT.ranged;
    if (!attacker.cooldowns.use(attack.kind, spec.cooldownMs, now)) return;

    // The server's idea of where the attacker is wins over what the client claims.
    const origin = { x: attacker.x, y: attacker.y, z: attacker.z };
    const event: AttackEvent = {
      attacker: attacker.id,
      kind: attack.kind,
      origin,
      dir: attack.dir,
    };
    this.sendNear(origin, MSG.attacked, event);

    const when = rewindTime(attack.seenAt, now);
    const targets = [...this.players.values()]
      .filter((p) => p !== attacker && !p.dead)
      .map((p) => ({ p, at: positionAt(p.history, when) ?? p }));
    if (attack.kind === 'melee') {
      for (const t of targets) {
        if (inMeleeArc(origin, attack.dir, t.at)) this.damage(t.p, attacker, attack, now);
      }
      return;
    }
    const eye = { ...origin, y: origin.y + EYE };
    let best: { p: ServerPlayer; d: number } | null = null;
    for (const t of targets) {
      const d = rayHitsBody(eye, attack.dir, t.at, COMBAT.ranged.range);
      if (d !== null && (!best || d < best.d)) best = { p: t.p, d };
    }
    if (best) this.damage(best.p, attacker, attack, now);
  }

  private onDodge(client: Client): void {
    const player = this.players.get(client.sessionId);
    const now = Date.now();
    if (!player || player.dead) return;
    if (!player.cooldowns.use('dodge', COMBAT.dodge.cooldownMs, now)) return;
    player.invulnerableUntil = now + COMBAT.dodge.invulnerableMs;
  }

  private damage(target: ServerPlayer, attacker: ServerPlayer, attack: AttackMessage, now: number) {
    if (target.dead || target.invulnerableUntil > now) return;
    const amount = attack.kind === 'melee' ? COMBAT.melee.damage : COMBAT.ranged.damage;
    target.health = Math.max(0, target.health - amount);
    const hit: HitMessage = {
      attacker: attacker.id,
      target: target.id,
      kind: attack.kind,
      damage: amount,
      health: target.health,
      at: { x: target.x, y: target.y, z: target.z },
    };
    this.sendNear(target, MSG.hit, hit);
    if (target.health === 0) void this.kill(target, attacker, now);
  }

  /** Death: drop a share of carried items as a loot bag, then respawn at the Archive. */
  private async kill(target: ServerPlayer, killer: ServerPlayer, now: number): Promise<void> {
    target.dead = true;
    const at = { x: target.x, y: target.y, z: target.z };
    let loot: LootBag | null = null;
    const accounts = ArchiveRoom.accounts;
    if (accounts && target.playerId) {
      const dropped = chooseLoot(await accounts.inventory(target.playerId), this.random);
      const removed = [];
      for (const item of dropped) {
        if (await accounts.removeItem(target.playerId, item.id)) removed.push(item);
      }
      if (removed.length > 0) {
        loot = { id: randomUUID(), at, items: removed.map(({ kind, name }) => ({ kind, name })) };
        this.loot.set(loot.id, loot);
      }
      this.sendTo(target.id, MSG.inventory, await accounts.inventory(target.playerId));
    }
    const respawnAt = now + COMBAT.respawnSeconds * 1000;
    const death: DeathMessage = {
      id: target.id,
      by: killer.id,
      byName: killer.name,
      respawnAt,
      loot,
    };
    this.broadcast(MSG.died, death);
    if (loot) this.broadcast(MSG.loot, [...this.loot.values()]);
    this.clock.setTimeout(() => this.respawn(target), respawnAt - Date.now());
  }

  private respawn(player: ServerPlayer): void {
    if (!this.players.has(player.id)) return;
    player.dead = false;
    player.health = COMBAT.maxHealth;
    this.moveTo(player, ARCHIVE_SPAWN);
    const message: RespawnMessage = { id: player.id, at: ARCHIVE_SPAWN, health: player.health };
    this.broadcast(MSG.respawned, message);
  }

  /** Takes what fits from a loot bag into the picker's inventory (signed-in players only). */
  private async onPickup(client: Client, raw: unknown): Promise<void> {
    const player = this.players.get(client.sessionId);
    const id = (raw as { id?: unknown } | null)?.id;
    const bag = typeof id === 'string' ? this.loot.get(id) : undefined;
    if (!player || !bag || player.dead) return;
    const dist = Math.hypot(player.x - bag.at.x, player.z - bag.at.z);
    if (dist > COMBAT.pickupRadius + 0.5) return;
    const accounts = ArchiveRoom.accounts;
    if (!accounts || !player.playerId) {
      client.send(MSG.chatNotice, { text: 'Sign in to carry loot.' });
      return;
    }
    // Claim the bag first so two players can't take the same items.
    this.loot.delete(bag.id);
    const left: LootBag['items'] = [];
    for (const item of bag.items) {
      if (!(await accounts.addItem(player.playerId, item))) left.push(item);
    }
    if (left.length > 0) {
      this.loot.set(bag.id, { ...bag, items: left });
      client.send(MSG.chatNotice, { text: 'Your bag is full: sell something to carry more.' });
    }
    this.broadcast(MSG.loot, [...this.loot.values()]);
    client.send(MSG.inventory, await accounts.inventory(player.playerId));
  }

  private sendTo(sessionId: string, type: string, message: unknown): void {
    this.clients.find((c) => c.sessionId === sessionId)?.send(type, message);
  }

  /** Sends to every client within the interest radius of `at`. */
  private sendNear(at: Vec3, type: string, message: unknown): void {
    const r2 = NET.interestRadius ** 2;
    for (const client of this.clients) {
      const p = this.players.get(client.sessionId);
      if (p && (p.x - at.x) ** 2 + (p.z - at.z) ** 2 <= r2) client.send(type, message);
    }
  }

  private broadcastSnapshots(): void {
    const t = Date.now();
    const all = [...this.players.values()];
    for (const client of this.clients) {
      const self = this.players.get(client.sessionId);
      if (!self) continue;
      const message: SnapshotMessage = { t, players: playersNear(all, self).map(snapshot) };
      client.send(MSG.snapshot, message);
    }
  }
}

function profile(p: ServerPlayer): PlayerProfile {
  return { id: p.id, name: p.name, appearance: p.appearance };
}

function snapshot(p: ServerPlayer): PlayerSnapshot {
  return {
    id: p.id,
    x: round(p.x),
    y: round(p.y),
    z: round(p.z),
    facing: round(p.facing),
    speed: round(p.speed),
    grounded: p.grounded,
    vy: round(p.vy),
    hp: p.health,
  };
}

const round = (n: number): number => Math.round(n * 100) / 100;
