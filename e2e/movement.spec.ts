import { expect, test, type Page } from '@playwright/test';

// Software rendering in CI can drop to about one frame per second, so these tests wait for
// outcomes (the player moved, landed) instead of holding keys for fixed amounts of time.
const SLOW = { timeout: 60_000 };

async function boot(page: Page): Promise<void> {
  await page.goto('/?autostart=1');
  await page.waitForFunction(() => window.__THE_WORLD__?.ready === true, undefined, SLOW);
  await page.waitForFunction(
    () => window.__THE_WORLD__?.player?.().grounded === true,
    undefined,
    SLOW,
  );
}

const player = (page: Page) =>
  page.evaluate(() => {
    const p = window.__THE_WORLD__?.player?.();
    if (!p) throw new Error('player debug hook missing');
    return p;
  });

test('the player walks and jumps', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page);
  const start = await player(page);

  // Walk forward (the camera starts looking down -Z).
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    (z) => (window.__THE_WORLD__?.player?.().z ?? z) < z - 1,
    start.z,
    SLOW,
  );
  await page.keyboard.up('KeyW');
  const walked = await player(page);
  expect(Math.abs(walked.x - start.x), 'walked straight').toBeLessThan(0.5);

  // Jump: rises, then lands again.
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await page.waitForFunction(
    (groundY) => (window.__THE_WORLD__?.player?.().y ?? 0) > groundY + 0.3,
    walked.y,
    SLOW,
  );
  await page.waitForFunction(
    () => window.__THE_WORLD__?.player?.().grounded === true,
    undefined,
    SLOW,
  );
});
