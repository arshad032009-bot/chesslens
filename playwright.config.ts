import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', timeout: 240_000, expect: { timeout: 120_000 }, retries: process.env.CI ? 1 : 0, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:8080', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve.mjs static 8080', url: 'http://localhost:8080/index.html', reuseExistingServer: !process.env.CI },
});
