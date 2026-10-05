import { defineConfig } from '@playwright/test';

// The browser smoke test (e2e/): the real app in a real browser. It uses an installed browser
// instead of downloading one: Chrome (CI), or Edge on Windows. PW_CHANNEL picks another.
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome');
const port = 5199;

export default defineConfig({
  testDir: 'e2e',
  // CI's browser draws the 3D in software: much slower than a desktop.
  timeout: process.env.CI ? 180_000 : 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    channel,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
