import type * as THREE from 'three/webgpu';
import { parseNewsFeed, type NewsItem } from '@the-world/shared';
import feedJson from '@content/news/feed.json';
import { NewsQueue } from './NewsQueue';
import { NewsScreen } from './NewsScreen';

/** Screens redraw at this rate; plenty for a ticker and cheap on slow machines. */
const REDRAW_HZ = 8;

/** All the news screens in a level, airing one shared feed. */
export class NewsNetwork {
  readonly channel: string;
  readonly queue: NewsQueue;
  readonly screens: NewsScreen[] = [];
  private lastDraw = -Infinity;

  constructor(private readonly scene: THREE.Scene) {
    const feed = parseNewsFeed(feedJson);
    this.channel = feed.channel;
    this.queue = new NewsQueue(feed.items);
  }

  /** Creates a screen of `width` x `height` metres at `position`, facing along `yaw`. */
  addScreen(
    width: number,
    height: number,
    position: THREE.Vector3Like,
    yaw: number,
    parent: THREE.Object3D = this.scene,
  ): NewsScreen {
    const screen = new NewsScreen(width, height, width > 12 ? 1024 : 768);
    screen.mesh.position.set(position.x, position.y, position.z);
    screen.mesh.rotation.y = yaw;
    parent.add(screen.mesh);
    this.screens.push(screen);
    return screen;
  }

  /** Breaking news from the server (or any game system). */
  push(item: NewsItem): void {
    this.queue.push(item);
  }

  update(elapsed: number): void {
    if (elapsed - this.lastDraw < 1 / REDRAW_HZ) return;
    this.lastDraw = elapsed;
    const { item, progress } = this.queue.at(elapsed);
    const frame = {
      channel: this.channel,
      item,
      progress,
      ticker: this.queue.tickerText(),
      time: elapsed,
    };
    for (const screen of this.screens) screen.draw(frame);
  }
}
