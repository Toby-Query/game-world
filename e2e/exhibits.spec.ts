import { expect, test } from '@playwright/test';

test('walking up to an exhibit and pressing E opens its plaque', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/?autostart=1&offline=1');
  await page.waitForFunction(() => window.__THE_WORLD__?.ready === true, undefined, {
    timeout: 60_000,
  });

  // Stand just in front of the centre pedestal of the museum's front row.
  await page.evaluate(() => window.__THE_WORLD__?.teleport?.(0, 0, -14.8));
  const prompt = page.locator('.tw-prompt.visible');
  await expect(prompt).toContainText('Read:', { timeout: 60_000 });

  await page.keyboard.press('KeyE');
  const plaque = page.locator('.tw-panel.visible');
  await expect(plaque).toBeVisible({ timeout: 60_000 });
  await expect(plaque.locator('h2')).not.toBeEmpty();
  await expect(plaque).toContainText('recovered from');

  await page.keyboard.press('Escape');
  await expect(plaque).toBeHidden({ timeout: 60_000 });
});
