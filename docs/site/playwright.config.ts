import { defineConfig, devices } from '@playwright/test';
import { functionalWorkers, splitProjects } from '../../tooling/playwright/projects.mjs';

// Docs site smoke suite: every demo and docs page server-renders, hydrates
// with zero console errors, warnings or hydration mismatches.
//
// SITE_MODE=dev (default): `next dev`, where React reports hydration
// mismatches with full diffs. SITE_MODE=production: `next start` over the
// output of `next build` (run `npm run docs:build` first). SITE_MODE=export:
// tooling/site/serve-static.mjs over docs/site/out/ (run `npm run
// site:build` first); the demos use the in-browser demo backend, so no
// `/api/*` request may reach the server (it would 404).
const mode = process.env.SITE_MODE ?? 'dev';
// Default 41800, not the `docs:dev` port 41760, so the suite runs while a
// developer server is up.
const port = Number(process.env.SITE_PORT ?? 41800);
// Projects and PW_WORKERS: the root playwright.config.ts.
// With `CI` set an HTML report is written as well.

const commands: Record<string, string> = {
  dev: `npx next dev --port ${port}`,
  production: `npx next start --port ${port}`,
  export: `node ../../tooling/site/serve-static.mjs --port ${port}`,
};
const command = commands[mode];
if (!command) throw new Error(`Unknown SITE_MODE "${mode}" (expected dev, production or export)`);

export default defineConfig({
  testDir: 'tests',
  // Export mode skips only specs that intercept `/api/*` network requests
  // (there is no network request in the static export); every other spec,
  // including new ones, runs in all modes.
  ...(mode === 'export' ? { testIgnore: ['**/filter-status.spec.ts'] } : {}),
  timeout: 120_000,
  workers: functionalWorkers(),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: `http://localhost:${port}` },
  projects: splitProjects({ ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } }),
  webServer: {
    command,
    url: `http://localhost:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
