import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page): Promise<void> {
  await page.goto('/?autostart=1');
  await page.waitForFunction(() => window.__THE_WORLD__?.ready === true, undefined, {
    timeout: 45_000,
  });
  // Let the player settle onto the ground.
  await page.waitForFunction(() => window.__THE_WORLD__?.player?.().grounded === true);
}

const player = (page: Page) =>
  page.evaluate(() => {
    const p = window.__THE_WORLD__?.player?.();
    if (!p) throw new Error('player debug hook missing');
    return p;
  });

test('the player walks and jumps', async ({ page }) => {
  await boot(page);
  const start = await player(page);

  // Walk forward (camera starts looking down -Z).
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  const walked = await player(page);
  expect(start.z - walked.z, 'moved forward').toBeGreaterThan(0.5);

  // Jump: rises, then lands again.
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await page.waitForFunction(
    (groundY) => (window.__THE_WORLD__?.player?.().y ?? 0) > groundY + 0.3,
    walked.y,
    { timeout: 5_000 },
  );
  // Software rendering in CI runs a few frames per second, so landing can take a while.
  await page.waitForFunction(() => window.__THE_WORLD__?.player?.().grounded === true, undefined, {
    timeout: 30_000,
  });
});
