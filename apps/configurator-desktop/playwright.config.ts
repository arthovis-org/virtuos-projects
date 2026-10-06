import { defineConfig } from '@playwright/test';

// The desktop app's smoke test (e2e/): launches Electron on the bundled configurator.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
});
