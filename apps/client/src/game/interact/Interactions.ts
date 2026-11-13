export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Something the player can use with the interact key (E) when close enough. */
export interface Interactable {
  id: string;
  position: Point;
  /** How close (metres) the player must be. */
  radius: number;
  /** Shown as "E  <prompt>" when this is the nearest interactable in range. */
  prompt: string;
  onInteract(): void;
}

/** Picks the closest interactable whose radius contains `player`, or null. Pure. */
export function nearestInRange(items: readonly Interactable[], player: Point): Interactable | null {
  let best: Interactable | null = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const d = Math.hypot(
      item.position.x - player.x,
      (item.position.y - player.y) * 0.5, // height matters less than ground distance
      item.position.z - player.z,
    );
    if (d <= item.radius && d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

/** Registry of interactables in the current level; the game asks it what is in reach. */
export class Interactions {
  private readonly items: Interactable[] = [];
  private focused: Interactable | null = null;
  /** Called when the focused interactable changes (to show or hide the prompt). */
  onFocusChange: (item: Interactable | null) => void = () => {};

  add(item: Interactable): void {
    this.items.push(item);
  }

  /** Removes an interactable (e.g. a loot bag someone picked up). */
  remove(id: string): void {
    const i = this.items.findIndex((item) => item.id === id);
    if (i >= 0) this.items.splice(i, 1);
    if (this.focused?.id === id) {
      this.focused = null;
      this.onFocusChange(null);
    }
  }

  get current(): Interactable | null {
    return this.focused;
  }

  update(player: Point): void {
    const next = nearestInRange(this.items, player);
    if (next !== this.focused) {
      this.focused = next;
      this.onFocusChange(next);
    }
  }

  /** Uses the focused interactable; returns whether anything happened. */
  interact(): boolean {
    if (!this.focused) return false;
    this.focused.onInteract();
    return true;
  }
}
