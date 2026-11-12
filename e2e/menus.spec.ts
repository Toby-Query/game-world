import { expect, test } from '@playwright/test';

const SLOW = { timeout: 60_000 };

test('a first-time visitor goes title → controls → world, pauses and changes settings', async ({
  page,
}) => {
  test.setTimeout(240_000);
  // A returning character, so this test is about the menus rather than the creator.
  await page.addInitScript(() => {
    if (!localStorage.getItem('the-world:character')) {
      localStorage.setItem('the-world:character', JSON.stringify({ name: 'Tester' }));
    }
  });
  await page.goto('/');

  // Loading screen gives way to the title.
  await expect(page.getByTestId('title-screen')).toBeVisible(SLOW);
  await expect(page.getByTestId('title-screen')).toContainText('The World');
  await expect(page.locator('#loading')).toHaveCount(0, SLOW);

  // First launch shows the controls once.
  await page.getByTestId('title-play').click();
  await expect(page.getByTestId('controls-overlay')).toContainText('Jump');
  await page.getByTestId('controls-done').click();
  await expect(page.getByTestId('controls-overlay')).toHaveCount(0);

  // Esc pauses; settings change and persist.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible(SLOW);
  await page.getByTestId('pause-settings').click();
  const panel = page.getByTestId('settings-panel');
  await panel.locator('input[name="sensitivity"]').fill('2');
  await panel.locator('input[name="invertY"]').check();
  await panel.locator('select[name="quality"]').selectOption('low');
  await page.getByTestId('settings-back').click();
  await page.getByTestId('pause-resume').click();
  await expect(page.getByTestId('pause-menu')).toHaveCount(0);

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('the-world:settings') ?? 'null'),
  );
  expect(saved).toMatchObject({ sensitivity: 2, invertY: true, quality: 'low' });

  // After a reload the settings are still there, and the controls overlay is not shown again.
  await page.reload();
  await page.getByTestId('title-settings').click(SLOW);
  await expect(page.locator('select[name="quality"]')).toHaveValue('low');
  await expect(page.locator('input[name="invertY"]')).toBeChecked();
  await page.getByTestId('settings-back').click();
  await page.getByTestId('title-play').click();
  await expect(page.getByTestId('controls-overlay')).toHaveCount(0);
  await expect(page.getByTestId('title-screen')).toHaveCount(0);
});
