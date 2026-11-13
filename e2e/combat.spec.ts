import { expect, test, type Browser, type Page } from '@playwright/test';

const SLOW = { timeout: 90_000 };
const SERVER = 'http://localhost:2567';

/** A fresh signed-in player (with the starter kit), straight into the world. */
async function player(browser: Browser, name: string, email: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((n) => {
    localStorage.setItem('the-world:character', JSON.stringify({ name: n }));
  }, name);
  const start = await context.request.post(`${SERVER}/auth/start`, { data: { email } });
  const { devLink } = (await start.json()) as { devLink: string };
  const token = new URL(devLink).searchParams.get('login')!;
  const page = await context.newPage();
  await page.goto(`/?autostart=1&login=${encodeURIComponent(token)}`);
  await page.waitForFunction(
    () => window.__THE_WORLD__?.net?.().status === 'online',
    undefined,
    SLOW,
  );
  await page.waitForFunction(
    () => (window.__THE_WORLD__?.account?.()?.inventory.length ?? 0) === 3,
    undefined,
    SLOW,
  );
  return page;
}

/**
 * Presses `key` on the attacker until `landed` holds on the target. A press that comes too soon
 * after the last one is dropped by the attack cooldown (fast browsers), so it is retried.
 */
async function strike(
  attacker: Page,
  target: Page,
  key: string,
  landed: (arg: number) => boolean,
  arg: number,
): Promise<void> {
  const deadline = Date.now() + SLOW.timeout;
  for (;;) {
    await attacker.keyboard.press(key);
    try {
      await target.waitForFunction(landed, arg, { timeout: 10_000 });
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
    }
  }
}

const health = (page: Page) => page.evaluate(() => window.__THE_WORLD__?.combat?.().health ?? -1);
const bag = (page: Page) =>
  page.evaluate(() => window.__THE_WORLD__?.account?.()?.inventory.map((i) => i.name) ?? []);

test('two players fight: one dies, loot drops and is picked up, the loser respawns', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const id = Math.random().toString(36).slice(2, 7);
  const a = await player(browser, `Ares ${id}`, `ares-${id}@example.com`);
  const b = await player(browser, `Bia ${id}`, `bia-${id}@example.com`);

  // A looking down -Z, B a step in front of A, both away from the spawn: B respawns there, out of
  // A's reach, and players from other tests standing there stay out of the fight.
  await a.evaluate(() => window.__THE_WORLD__?.teleport?.(0, 0, 16));
  await b.evaluate(() => window.__THE_WORLD__?.teleport?.(0, 0, 14.6));
  await a.waitForFunction(
    () => window.__THE_WORLD__?.net?.().remotes.some((r) => Math.abs(r.z - 14.6) < 0.3),
    undefined,
    SLOW,
  );
  await expect(b.getByTestId('health')).toContainText('100 / 100');

  // A swings until B falls (each hit takes 20; the server decides what lands). Stop on the death
  // record, not on health: a slow browser may only see B's health after the respawn.
  const deaths = () => b.evaluate(() => window.__THE_WORLD__?.combat?.().deaths ?? 0);
  while ((await deaths()) === 0) {
    const hp = await health(b);
    await strike(
      a,
      b,
      'KeyF',
      (before) => {
        const c = window.__THE_WORLD__?.combat?.();
        return (c?.deaths ?? 0) > 0 || (c?.health ?? before) < before;
      },
      hp,
    );
  }
  // B died to A, once. (The death screen only lasts the 5 s respawn, which slow test browsers can
  // miss, so check the record of it.)
  expect(await deaths()).toBe(1);
  expect(await b.evaluate(() => window.__THE_WORLD__?.combat?.().killedBy)).toBe(`Ares ${id}`);

  // Half of B's carried items (one of two) dropped; the equipped club stays.
  await b.waitForFunction(
    () => window.__THE_WORLD__?.account?.()?.inventory.length === 2,
    undefined,
    SLOW,
  );
  expect(await bag(b)).toContain('Driftwood club');
  await a.waitForFunction(
    () => window.__THE_WORLD__?.combat?.().loot.length === 1,
    undefined,
    SLOW,
  );

  // A is standing next to the bag: E picks it up.
  await expect(a.locator('.tw-prompt.visible')).toContainText('Pick up', SLOW);
  await a.keyboard.press('KeyE');
  await a.waitForFunction(
    () => window.__THE_WORLD__?.account?.()?.inventory.length === 4,
    undefined,
    SLOW,
  );
  await a.waitForFunction(
    () => window.__THE_WORLD__?.combat?.().loot.length === 0,
    undefined,
    SLOW,
  );
  await expect(a.getByTestId('wallet-bag')).toHaveText('Bag 4/20');

  // B comes back at the Archive with full health.
  await expect(b.getByTestId('death-screen')).toBeHidden(SLOW);
  await expect(b.getByTestId('health')).toContainText('100 / 100');
  const back = await b.evaluate(() => window.__THE_WORLD__?.player?.());
  expect(back?.z).toBeGreaterThan(21);

  // Ranged: A shoots B from across the plaza.
  await b.evaluate(() => window.__THE_WORLD__?.teleport?.(0, 0, 8));
  await a.waitForFunction(
    () => window.__THE_WORLD__?.net?.().remotes.some((r) => Math.abs(r.z - 8) < 0.3),
    undefined,
    SLOW,
  );
  await strike(a, b, 'KeyR', () => (window.__THE_WORLD__?.combat?.().health ?? 100) < 100, 0);
  expect(await health(b)).toBe(88);

  await a.context().close();
  await b.context().close();
});
