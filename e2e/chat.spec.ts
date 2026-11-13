import { expect, test, type Browser, type Page } from '@playwright/test';

const SLOW = { timeout: 90_000 };

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

async function say(page: Page, text: string, global = false): Promise<void> {
  await page.keyboard.press('Enter');
  const input = page.locator('input[name="chat"]');
  await expect(input).toBeVisible();
  if (global) await input.press('Tab');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toBeHidden();
}

test('two players chat nearby (with bubbles) and globally', async ({ browser }) => {
  test.setTimeout(300_000);
  const id = Math.random().toString(36).slice(2, 6);
  const [ayo, bea] = [`Ayo ${id}`, `Bea ${id}`];
  const a = await player(browser, ayo);
  const b = await player(browser, bea);
  await b.waitForFunction(
    (n) => window.__THE_WORLD__?.net?.().remotes.some((r) => r.name === n),
    ayo,
    SLOW,
  );

  // Nearby: B sees it in a bubble over A (bubbles fade, so check that first) and in the log;
  // swearing is masked.
  await say(a, `hello ${id}, shit weather`);
  await b.waitForFunction(
    ([n, t]) => window.__THE_WORLD__?.net?.().remotes.find((r) => r.name === n)?.bubble === t,
    [ayo, `hello ${id}, **** weather`] as const,
    SLOW,
  );
  const bLog = b.getByTestId('chat-log');
  await expect(bLog).toContainText(`${ayo}: hello ${id}, **** weather`, SLOW);
  await expect(bLog.locator('li[data-channel="nearby"]')).toHaveCount(1);
  await expect(a.getByTestId('chat-log')).toContainText(`${ayo} (you)`);

  // Global: B answers on the global channel.
  await say(b, `global ${id}`, true);
  await expect(a.getByTestId('chat-log').locator('li[data-channel="global"]')).toContainText(
    `${bea}: global ${id}`,
    SLOW,
  );

  // Esc while typing closes the chat box without opening the pause menu.
  await a.keyboard.press('Enter');
  await a.locator('input[name="chat"]').press('Escape');
  await expect(a.locator('input[name="chat"]')).toBeHidden();
  await expect(a.getByTestId('pause-menu')).toHaveCount(0);

  await a.context().close();
  await b.context().close();
});
