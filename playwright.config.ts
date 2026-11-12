import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests run against the production build of the client (`vite preview`).
 * Chromium renders with SwiftShader so the tests work on machines without a GPU (CI runners).
 * Set CHROME_PATH to use an already-installed Chrome instead of Playwright's bundled browser.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @the-world/client preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
