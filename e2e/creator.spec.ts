import { expect, test } from '@playwright/test';

test('a new player creates a character, which is saved and skipped next time', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const creator = page.getByTestId('character-creator');
  await expect(creator).toBeVisible({ timeout: 60_000 });

  await page.fill('input[name="name"]', 'Ayo');
  await page.click('button[aria-label="Next hair"]');
  await page.click('button[aria-label="Next top"]');
  await expect(page.getByTestId('part-hair')).toHaveText('Long');
  await expect(page.getByTestId('part-top')).toHaveText('Jacket');

  await page.click('text=Enter the Archive');
  await expect(creator).toBeHidden();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('the-world:character') ?? 'null'),
  );
  expect(saved).toMatchObject({ name: 'Ayo', hair: 'long', top: 'jacket' });

  // A returning player goes straight into the world.
  await page.reload();
  await page.waitForFunction(() => window.__THE_WORLD__?.ready === true, undefined, {
    timeout: 60_000,
  });
  await expect(creator).toHaveCount(0);
});
