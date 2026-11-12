import { expect, test, type Browser, type Page } from '@playwright/test';

const SLOW = { timeout: 90_000 };

/** Opens the game as a separate player (own browser context, own saved character). */
async function player(browser: Browser, name: string): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript((n) => {
    localStorage.setItem('the-world:character', JSON.stringify({ name: n }));
  }, name);
  const page = await context.newPage();
  await page.goto('/?autostart=1');
  await page.waitForFunction(
    () => window.__THE_WORLD__?.net?.().status === 'online',
    undefined,
    SLOW,
  );
  return page;
}

const sees = (page: Page, name: string) =>
  page.evaluate(
    (n) => window.__THE_WORLD__?.net?.().remotes.find((r) => r.name === n) ?? null,
    name,
  );

test('two players see each other and see each other move', async ({ browser }) => {
  test.setTimeout(300_000);
  const suffix = Math.random().toString(36).slice(2, 6);
  const [ayo, bea] = [`Ayo ${suffix}`, `Bea ${suffix}`];
  const a = await player(browser, ayo);
  const b = await player(browser, bea);

  // Each sees the other, with their name tag.
  await a.waitForFunction(
    (n) => window.__THE_WORLD__?.net?.().remotes.some((r) => r.name === n),
    bea,
    SLOW,
  );
  await b.waitForFunction(
    (n) => window.__THE_WORLD__?.net?.().remotes.some((r) => r.name === n),
    ayo,
    SLOW,
  );
  await expect(b.getByTestId('net-status')).toContainText('Online');

  // A walks forward; B sees A's position change.
  const before = await sees(b, ayo);
  expect(before).not.toBeNull();
  await a.keyboard.down('KeyW');
  await b.waitForFunction(
    ([n, z]) => {
      const r = window.__THE_WORLD__?.net?.().remotes.find((p) => p.name === n);
      return r !== undefined && Math.abs(r.z - z) > 1;
    },
    [ayo, before!.z] as const,
    SLOW,
  );
  await a.keyboard.up('KeyW');

  // A leaves the interest radius (debug teleport high above the far sea); B stops seeing A.
  await a.evaluate(() => window.__THE_WORLD__?.teleport?.(300, 500, 300));
  await b.waitForFunction(
    (n) => !window.__THE_WORLD__?.net?.().remotes.some((r) => r.name === n),
    ayo,
    SLOW,
  );

  // Close both players so they stop rendering and leave the server for the next tests.
  await a.context().close();
  await b.context().close();
});
