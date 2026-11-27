import { defineConfig, devices } from '@playwright/test';

// Browser flows of the admin template (tests/app.spec.ts) against the Vite dev
// server at SALMON_UI_PORT_BASE + 60 (vite.config.ts). Run from the repository
// root: `npx playwright test -c examples/admin-template/playwright.config.ts`.
const base = Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730);
const port = base + 60;

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, locale: 'zh-TW', timezoneId: 'Asia/Taipei' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx vite --logLevel error --port ${port} --strictPort`,
    cwd: import.meta.dirname,
    url: `http://localhost:${port}/workspace/orders`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
