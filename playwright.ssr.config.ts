import { defineConfig, devices } from '@playwright/test';
import { functionalWorkers, splitProjects } from './tooling/playwright/projects.mjs';

// Hydration gates for `npm run test:ssr` (zero hydration
// warnings and zero console errors in the Vite SSR and Next App Router
// examples). Both servers run in development mode, where React reports
// hydration mismatches as console errors.
// SALMON_UI_PORT_BASE moves both servers: Vite SSR at base + 20 (same as
// tests/browser/helpers.ts SSR_URL) and Next at base + 50; the Vite SSR
// WebSocket port moves to base + 40 (examples/vite-ssr/server.mjs). Offset
// + 30 is skipped: with the default base it is 41760, the `docs:dev` port.
// Projects and PW_WORKERS: playwright.config.ts.
// With `CI` set an HTML report is written as well.
const base = Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730);
const ssrPort = base + 20;
const nextPort = base + 50;

export default defineConfig({
  testDir: 'tests',
  testMatch: ['browser/ssr.spec.ts', 'browser/ssr-features.spec.ts', 'browser/ssr-pickers.spec.ts', 'browser/ssr-pivot.spec.ts', 'browser/ssr-kanban.spec.ts', 'browser/ssr-assistant.spec.ts', 'browser/ssr-dropdowns.spec.ts', 'browser/ssr-locale.spec.ts', 'ssr/*.spec.ts'],
  timeout: 120_000,
  workers: functionalWorkers(),
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
  projects: splitProjects({ ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }),
  webServer: [
    {
      // Dist stylesheets rewritten from the sources first (see playwright.config.ts).
      command: 'node tooling/checks/copy-css.mjs && node examples/vite-ssr/server.mjs',
      url: `http://localhost:${ssrPort}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: String(ssrPort), NODE_ENV: 'development' },
    },
    {
      command: `npm exec --workspace @salmonui/example-next-app -- next dev --port ${nextPort}`,
      url: `http://localhost:${nextPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NEXT_TELEMETRY_DISABLED: '1' },
    },
  ],
});
