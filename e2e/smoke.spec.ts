import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * Loads the game straight into the world (`?autostart=1` skips the title and character
 * screens), waits for the first rendered frame, and fails on any console error.
 */
test('the game boots and renders without console errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?autostart=1');
  await page.waitForFunction(() => window.__THE_WORLD__?.ready === true, undefined, {
    timeout: 45_000,
  });
  // Let a few frames render (physics settles, lighting is applied).
  await page.waitForTimeout(1500);

  const screenshot = await page.screenshot();
  await testInfo.attach('screenshot', { body: screenshot, contentType: 'image/png' });

  expect(errors, 'console errors').toEqual([]);
  expect(distinctColours(screenshot), 'canvas looks blank').toBeGreaterThan(50);
});

/** Counts distinct colours on a coarse grid: a blank or single-colour canvas scores very low. */
function distinctColours(png: Buffer): number {
  const image = PNG.sync.read(png);
  const seen = new Set<number>();
  for (let y = 0; y < image.height; y += 8) {
    for (let x = 0; x < image.width; x += 8) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i] ?? 0;
      const g = image.data[i + 1] ?? 0;
      const b = image.data[i + 2] ?? 0;
      seen.add((r << 16) | (g << 8) | b);
    }
  }
  return seen.size;
}
