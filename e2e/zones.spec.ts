import { expect, test, type Page } from '@playwright/test';

// Software rendering in CI is slow, so wait on outcomes rather than timings.
const SLOW = { timeout: 90_000 };

const world = (page: Page) =>
  page.evaluate(() => {
    const w = window.__THE_WORLD__;
    const p = w?.player?.();
    const z = w?.zone?.();
    if (!p || !z) throw new Error('debug hooks missing');
    return { ...p, ...z };
  });

/** Jumps from the ground and returns the highest point reached above the take-off height. */
async function jumpHeight(page: Page): Promise<number> {
  const start = await world(page);
  await page.evaluate(() => {
    const w = window as unknown as { __peak?: number; __watch?: number };
    w.__peak = -Infinity;
    w.__watch = window.setInterval(() => {
      const y = window.__THE_WORLD__?.player?.().y ?? -Infinity;
      w.__peak = Math.max(w.__peak ?? -Infinity, y);
    }, 10);
  });
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await page.waitForFunction(
    (y) => (window.__THE_WORLD__?.player?.().y ?? y) > y + 0.3,
    start.y,
    SLOW,
  );
  await page.waitForFunction(
    () => window.__THE_WORLD__?.player?.().grounded === true,
    undefined,
    SLOW,
  );
  const peak = await page.evaluate(() => {
    const w = window as unknown as { __peak?: number; __watch?: number };
    window.clearInterval(w.__watch);
    return w.__peak ?? 0;
  });
  return peak - start.y;
}

async function standAt(page: Page, x: number, z: number, zone: string | null): Promise<void> {
  await page.evaluate(([px, pz]) => window.__THE_WORLD__?.teleport?.(px!, 0.1, pz!), [x, z]);
  // Teleporting clears "grounded"; it returns after a physics step, which also updates the zone.
  await page.waitForFunction(
    (id) =>
      window.__THE_WORLD__?.player?.().grounded === true &&
      window.__THE_WORLD__?.zone?.().id === id,
    zone,
    SLOW,
  );
}

test('the Orbital Wing makes jumps floaty and leaving it restores gravity', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?autostart=1&offline=1');
  await page.waitForFunction(() => window.__THE_WORLD__?.ready === true, undefined, SLOW);

  // Inside the low-gravity hall, away from its platforms.
  await standAt(page, 22.5, -22, 'orbital-wing');
  const inside = await world(page);
  expect(inside.id).toBe('orbital-wing');
  expect(inside.gravityY).toBeGreaterThan(-3);
  await expect(page.getByTestId('zone-banner')).toContainText('Orbital Wing');
  const floaty = await jumpHeight(page);

  // Back in the museum, normal gravity.
  await standAt(page, 10, -22, null);
  const outside = await world(page);
  expect(outside.id).toBeNull();
  expect(outside.gravityY).toBeCloseTo(-9.81);
  const normal = await jumpHeight(page);

  expect(normal).toBeLessThan(2.5);
  expect(floaty).toBeGreaterThan(normal * 2.5);
});
