import * as THREE from 'three/webgpu';
import {
  NET,
  interpolatePose,
  type PlayerProfile,
  type SnapshotMessage,
  type TimedPose,
} from '@the-world/shared';
import { CharacterModel } from '../game/character/CharacterModel';
import { SpeechBubble } from '../game/character/SpeechBubble';

interface Remote {
  profile: PlayerProfile;
  model: CharacterModel;
  label: THREE.Sprite;
  bubble: SpeechBubble;
  buffer: TimedPose[];
  /** Server time this player was last in a snapshot (they may have left our interest radius). */
  lastSeen: number;
}

const BUFFER_MS = 1000;
const HIDE_AFTER_MS = 1500;

/** Other players: one character per remote, drawn slightly in the past and interpolated. */
export class RemotePlayers {
  private readonly remotes = new Map<string, Remote>();
  /** Estimated server clock minus local clock, in ms. */
  private offset: number | null = null;
  private you: string | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  reset(you: string, players: PlayerProfile[]): void {
    for (const id of [...this.remotes.keys()]) this.remove(id);
    this.you = you;
    for (const p of players) this.add(p);
  }

  add(profile: PlayerProfile): void {
    if (profile.id === this.you || this.remotes.has(profile.id)) return;
    const model = new CharacterModel(profile.appearance);
    model.root.visible = false;
    const label = nameLabel(profile.name);
    label.position.y = 2.25 * profile.appearance.height;
    model.root.add(label);
    const bubble = new SpeechBubble(2.75 * profile.appearance.height);
    model.root.add(bubble.sprite);
    this.scene.add(model.root);
    this.remotes.set(profile.id, {
      profile,
      model,
      label,
      bubble,
      buffer: [],
      lastSeen: -Infinity,
    });
  }

  remove(id: string): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.model.root);
    r.label.material.map?.dispose();
    r.label.material.dispose();
    r.bubble.dispose();
    this.remotes.delete(id);
  }

  /** Shows what a remote player said nearby above their head. */
  say(id: string, text: string, localNow: number): void {
    this.remotes.get(id)?.bubble.say(text, localNow);
  }

  onSnapshot(message: SnapshotMessage, localNow: number): void {
    const sample = message.t - localNow;
    // Smooth the clock estimate so network jitter doesn't make remotes stutter.
    this.offset = this.offset === null ? sample : this.offset + (sample - this.offset) * 0.1;
    for (const p of message.players) {
      const r = this.remotes.get(p.id);
      if (!r) continue;
      r.buffer.push({ ...p, t: message.t });
      while (r.buffer.length > 2 && r.buffer[0]!.t < message.t - BUFFER_MS) r.buffer.shift();
      r.lastSeen = message.t;
    }
  }

  update(dt: number, localNow: number): void {
    if (this.offset === null) return;
    const serverNow = localNow + this.offset;
    const renderTime = serverNow - NET.interpolationDelayMs;
    for (const r of this.remotes.values()) {
      r.bubble.update(localNow);
      const pose = interpolatePose(r.buffer, renderTime);
      const visible = pose !== null && serverNow - r.lastSeen < HIDE_AFTER_MS;
      r.model.root.visible = visible;
      if (!visible) continue;
      r.model.root.position.set(pose.x, pose.y, pose.z);
      r.model.root.rotation.y = pose.facing;
      r.model.animate(dt, pose.speed, pose.grounded, pose.vy);
    }
  }

  /** Remote players currently visible (inside the interest radius), for the HUD and tests. */
  visible(): { id: string; name: string; x: number; y: number; z: number; bubble: string }[] {
    return [...this.remotes.values()]
      .filter((r) => r.model.root.visible)
      .map((r) => {
        const { x, y, z } = r.model.root.position;
        return { id: r.profile.id, name: r.profile.name, x, y, z, bubble: r.bubble.text };
      });
  }
}

/** A camera-facing name tag drawn into a canvas texture. */
function nameLabel(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '600 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const width = Math.min(ctx.measureText(name).width + 28, 252);
    ctx.fillStyle = 'rgba(11, 20, 32, 0.7)';
    ctx.beginPath();
    ctx.roundRect((256 - width) / 2, 10, width, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#e8f1ff';
    ctx.fillText(name, 128, 33);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sprite.scale.set(1.6, 0.4, 1);
  return sprite;
}
