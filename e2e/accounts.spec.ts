import { expect, test, type Browser, type Page } from '@playwright/test';

const SLOW = { timeout: 90_000 };

/** Signs in with the magic link on a fresh browser (own storage), and lands on the title. */
async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByTestId('title-signin').click(SLOW);
  await page.fill('input[name="email"]', email);
  await page.getByTestId('signin-send').click();
  // The local server sends no email; it hands the link back for development.
  const link = await page.getByTestId('dev-login-link').getAttribute('href', SLOW);
  await page.goto(link!);
  await expect(page.getByTestId('account-status')).toContainText(`Signed in as ${email}`, SLOW);
  expect(page.url()).not.toContain('login=');
  return page;
}

test('signing in on two browsers shows the same character and seed money', async ({ browser }) => {
  test.setTimeout(400_000);
  const id = Math.random().toString(36).slice(2, 7);
  const email = `salvager-${id}@example.com`;
  const name = `Zed ${id}`;

  // Browser 1: sign in, create the character, enter the world with the seed money.
  const a = await signIn(browser, email);
  await a.getByTestId('title-play').click();
  await expect(a.getByTestId('character-creator')).toBeVisible(SLOW);
  await a.fill('input[name="name"]', name);
  await a.click('button[aria-label="Next hair"]');
  await a.click('text=Enter the Archive');
  await a.getByTestId('controls-done').click(SLOW);
  await expect(a.getByTestId('wallet-balance')).toHaveText('◈ 100', SLOW);
  await expect(a.getByTestId('wallet-bag')).toHaveText('Bag 3/20');
  await a.waitForFunction(
    (n) => window.__THE_WORLD__?.account?.()?.character?.name === n,
    name,
    SLOW,
  );
  await a.context().close();

  // Browser 2: a new sign-in link for the same email. No creator: the saved character loads.
  const b = await signIn(browser, email);
  await b.getByTestId('title-play').click();
  await expect(b.getByTestId('character-creator')).toHaveCount(0);
  await b.getByTestId('controls-done').click(SLOW);
  await expect(b.getByTestId('wallet-balance')).toHaveText('◈ 100', SLOW);
  const me = await b.evaluate(() => window.__THE_WORLD__?.account?.() ?? null);
  expect(me?.character).toMatchObject({ name, hair: 'long' });
  expect(me?.balance).toBe(100);

  // Signing out returns to being a guest.
  await b.keyboard.press('Escape');
  await b.getByTestId('pause-quit').click(SLOW);
  await b.getByTestId('title-signout').click();
  await expect(b.getByTestId('account-status')).toContainText('guest');
  await b.context().close();
});
