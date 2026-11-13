import * as THREE from 'three/webgpu';
import { CHAT } from '@the-world/shared';

const WIDTH = 512;
const LINE = 34;

/** A camera-facing speech bubble that floats above a character for a few seconds. */
export class SpeechBubble {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private hideAt = 0;
  text = '';

  constructor(height: number) {
    this.canvas.width = WIDTH;
    this.canvas.height = 160;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
    this.sprite.scale.set(2.4, 0.75, 1);
    this.sprite.position.y = height;
    this.sprite.visible = false;
  }

  say(text: string, now: number): void {
    this.text = text;
    this.hideAt = now + CHAT.bubbleSeconds * 1000;
    this.draw(text);
    this.sprite.visible = true;
  }

  update(now: number): void {
    if (this.sprite.visible && now > this.hideAt) {
      this.sprite.visible = false;
      this.text = '';
    }
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }

  private draw(text: string): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, WIDTH, this.canvas.height);
    ctx.font = '500 26px system-ui, sans-serif';
    const lines = wrap(ctx, text, WIDTH - 48).slice(0, 3);
    const height = lines.length * LINE + 28;
    const top = this.canvas.height - height - 14;
    ctx.fillStyle = 'rgba(245, 248, 255, 0.94)';
    ctx.beginPath();
    ctx.roundRect(8, top, WIDTH - 16, height, 18);
    ctx.fill();
    // Tail pointing down at the speaker.
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2 - 12, top + height);
    ctx.lineTo(WIDTH / 2, top + height + 14);
    ctx.lineTo(WIDTH / 2 + 12, top + height);
    ctx.fill();
    ctx.fillStyle = '#0b1420';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, top + 14 + i * LINE));
    this.texture.needsUpdate = true;
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 3) lines[2] = `${lines[2]!.slice(0, -1)}…`;
  return lines;
}
