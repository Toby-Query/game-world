import * as THREE from 'three/webgpu';
import type { NewsItem } from '@the-world/shared';

const TAG_COLOURS: Record<string, string> = {
  curator: '#ff4fd8',
  lore: '#b18cff',
  islands: '#3ee6ff',
  plague: '#9bff6a',
  advisory: '#ffb547',
  market: '#e7b54a',
  museum: '#e6dfd0',
  salvage: '#5ce1b8',
  weather: '#8fb0e6',
  archive: '#3ee6ff',
};

export interface ScreenFrame {
  channel: string;
  item: NewsItem;
  progress: number;
  ticker: string;
  /** Seconds since start; drives the ticker scroll and blinking. */
  time: number;
}

/**
 * A screen mesh whose texture is a 2D canvas drawn like a news broadcast: channel bar, a headline
 * card with a tag emblem, a progress bar and a scrolling ticker.
 */
export class NewsScreen {
  readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;

  constructor(
    width: number,
    height: number,
    resolution = 768,
    private readonly frameColour = 0x1a2233,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = resolution;
    this.canvas.height = Math.round((resolution * height) / width);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    // Unlit so screens read as glowing displays in any light; a dark bezel frames them.
    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, fog: true }),
    );
    display.position.z = 0.06;
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.4, height + 0.4, 0.1),
      new THREE.MeshStandardMaterial({ color: this.frameColour, roughness: 0.4, metalness: 0.5 }),
    );
    this.mesh = new THREE.Mesh();
    this.mesh.add(bezel, display);
  }

  draw(frame: ScreenFrame): void {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const u = h / 432; // layout unit relative to a 768x432 screen
    const tagColour = TAG_COLOURS[frame.item.tags[0] ?? ''] ?? '#3ee6ff';

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b1420');
    bg.addColorStop(1, '#16294a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Channel bar.
    const barH = 48 * u;
    ctx.fillStyle = '#ff4fd8';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillStyle = '#0b1420';
    ctx.font = `700 ${24 * u}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(frame.channel.toUpperCase(), 20 * u, barH / 2);
    if (frame.item.live && Math.floor(frame.time * 2) % 2 === 0) {
      const label = 'BREAKING';
      ctx.font = `800 ${20 * u}px system-ui, sans-serif`;
      const lw = ctx.measureText(label).width + 24 * u;
      ctx.fillStyle = '#ff3b3b';
      ctx.fillRect(w - lw - 16 * u, 8 * u, lw, barH - 16 * u);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, w - lw - 4 * u, barH / 2);
    }

    // Tag emblem: a ring with the tag's initial.
    const ex = 70 * u;
    const ey = barH + 80 * u;
    ctx.strokeStyle = tagColour;
    ctx.lineWidth = 6 * u;
    ctx.beginPath();
    ctx.arc(ex, ey, 40 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = tagColour;
    ctx.font = `800 ${40 * u}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText((frame.item.tags[0] ?? 'A').charAt(0).toUpperCase(), ex, ey + 2 * u);
    ctx.textAlign = 'left';
    ctx.font = `600 ${16 * u}px system-ui, sans-serif`;
    ctx.fillText((frame.item.tags[0] ?? 'archive').toUpperCase(), ex - 38 * u, ey + 62 * u);

    // Headline and body.
    const textX = 140 * u;
    const textW = w - textX - 24 * u;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${34 * u}px system-ui, sans-serif`;
    const headLines = wrap(ctx, frame.item.headline, textW, 3);
    headLines.forEach((line, i) => ctx.fillText(line, textX, barH + 46 * u + i * 40 * u));
    ctx.fillStyle = '#a9d8ff';
    ctx.font = `400 ${21 * u}px system-ui, sans-serif`;
    const bodyTop = barH + 46 * u + headLines.length * 40 * u + 18 * u;
    wrap(ctx, frame.item.body, textW, 3).forEach((line, i) =>
      ctx.fillText(line, textX, bodyTop + i * 27 * u),
    );

    // Progress bar for the current bulletin.
    const tickerH = 46 * u;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, h - tickerH - 6 * u, w, 6 * u);
    ctx.fillStyle = tagColour;
    ctx.fillRect(0, h - tickerH - 6 * u, w * frame.progress, 6 * u);

    // Scrolling ticker.
    ctx.fillStyle = '#3ee6ff';
    ctx.fillRect(0, h - tickerH, w, tickerH);
    ctx.fillStyle = '#0b1420';
    ctx.font = `700 ${22 * u}px system-ui, sans-serif`;
    const text = `${frame.ticker}   ///   `;
    const tw = ctx.measureText(text).width;
    const offset = (frame.time * 90 * u) % tw;
    for (let x = -offset; x < w; x += tw) ctx.fillText(text, x, h - tickerH / 2);

    this.texture.needsUpdate = true;
  }
}

/** Word-wraps `text` to at most `maxLines` lines, ending with an ellipsis if cut. */
export function wrap(
  ctx: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (lines.length === maxLines && line && words.join(' ') !== lines.join(' ')) {
    lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
  }
  return lines;
}
