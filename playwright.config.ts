import { defineConfig, devices } from '@playwright/test';
import { functionalWorkers, splitProjects } from './tooling/playwright/projects.mjs';

// Browser gates for the Salmon UI packages (structural budgets, the SSR
// contract). `npm run test:browser` builds the packages and
// the examples first.
// SALMON_UI_PORT_BASE moves the three servers (dev, preview, SSR at base, +10, +20)
// and the Vite SSR WebSocket port (+40, examples/vite-ssr/server.mjs) so
// several checkouts can run the browser suite at once; 41760 stays reserved
// for the docs dev server.
// Projects (tooling/playwright/projects.mjs): `functional` runs fully parallel
// on PW_WORKERS workers (default 50% of the cores, `auto` = all but two);
// `timing` (`*-perf.spec.ts` and `@perf`-tagged timing tests) then runs alone on
// one worker. `--project=timing --no-deps` runs only the timing tests.
// With `CI` set an HTML report is written as well (PLAYWRIGHT_HTML_OUTPUT_DIR
// picks the folder).
const base = Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730);

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 120_000,
  workers: functionalWorkers(),
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  },
  projects: splitProjects({ ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }),
  webServer: [
    {
      // Development build: React Profiler and the __SALMON_UI_DEVTOOLS__ hook are active.
      // The packages' dist stylesheets are rewritten from the sources first (a few ms): a
      // TypeScript-only rebuild (`tsc -b`) leaves them stale, and an old unlayered copy lets
      // a shared module repeated by a later family sheet override the earlier family's rules.
      command: `node tooling/checks/copy-css.mjs && npm run dev --workspace @salmonui/example-vite-spa -- --logLevel error --port ${base}`,
      url: `http://localhost:${base}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Production build: timing numbers.
      command: `npm run preview --workspace @salmonui/example-vite-spa -- --logLevel error --port ${base + 10}`,
      url: `http://localhost:${base + 10}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Vite SSR in development mode: hydration mismatches are reported loudly.
      command: 'node examples/vite-ssr/server.mjs',
      url: `http://localhost:${base + 20}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: String(base + 20), NODE_ENV: 'development' },
    },
  ],
});
