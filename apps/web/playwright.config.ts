import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173', trace: 'retain-on-failure', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  outputDir: process.env.E2E_OUT ?? 'test-results',
});
