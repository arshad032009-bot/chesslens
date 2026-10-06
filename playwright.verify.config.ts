import { defineConfig } from '@playwright/test';
// Used only by .github/workflows/verify-engine.yml. The workflow starts the static server itself; no retries so a flaky pass cannot hide a failure.
export default defineConfig({
  testDir: 'tests/e2e', testMatch: 'verify-engine.spec.ts', timeout: 600_000, expect: { timeout: 30_000 }, retries: 0, workers: 1, outputDir: 'test-results',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: { baseURL: process.env.BASE_URL || 'http://localhost:8080', browserName: 'chromium', screenshot: 'on', trace: 'retain-on-failure' },
});
