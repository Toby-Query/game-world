import { describe, expect, it, vi } from 'vitest';
import { Interactions, nearestInRange, type Interactable } from './Interactions';

const make = (id: string, x: number, radius = 3): Interactable => ({
  id,
  position: { x, y: 0, z: 0 },
  radius,
  prompt: id,
  onInteract: vi.fn(),
});

describe('nearestInRange', () => {
  it('returns null when nothing is close enough', () => {
    expect(nearestInRange([make('a', 10)], { x: 0, y: 0, z: 0 })).toBeNull();
  });

  it('picks the closest item in range', () => {
    const items = [make('far', 2.5), make('near', 1)];
    expect(nearestInRange(items, { x: 0, y: 0, z: 0 })?.id).toBe('near');
  });
});

describe('Interactions', () => {
  it('reports focus changes once and runs the focused action', () => {
    const interactions = new Interactions();
    const onFocusChange = vi.fn();
    interactions.onFocusChange = onFocusChange;
    const item = make('plaque', 1);
    interactions.add(item);

    expect(interactions.interact()).toBe(false);
    interactions.update({ x: 0, y: 0, z: 0 });
    interactions.update({ x: 0.1, y: 0, z: 0 });
    expect(onFocusChange).toHaveBeenCalledTimes(1);
    expect(interactions.interact()).toBe(true);
    expect(item.onInteract).toHaveBeenCalledOnce();

    interactions.update({ x: 20, y: 0, z: 0 });
    expect(onFocusChange).toHaveBeenLastCalledWith(null);
  });
});
