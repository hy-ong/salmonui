import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Mount and data budget: client mount with the `remote` first page
// (mock server latency 0) <= 120 ms excluding network.
// examples/vite-spa/remote.html, production build: 1,000,000 rows served by
// the `@salmonui/data/server` reference handler over an in-process transport
// (request and response through JSON, no network, latency 0) to a DataGrid on
// `createJsonDataSource`, with server paging (page size 50) or infinite
// scroll (blockSize 100). `__firstPageMs` runs from `root.render()` to the
// painted frame after the first data row is in the DOM; `__serverMs` is the
// handler's query and response serialization (server work, excluded with
// the network). Client time = first page - server. Fresh page load per
// sample, median of 5 after one warm-up load. There is no recorded
// reference median for a remote scenario.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;

async function load(page: Page, mode: 'paging' | 'infinite'): Promise<{ firstPage: number; server: number; reads: number }> {
  await page.goto(`${PROD_URL}remote.html?mode=${mode}`);
  await page.waitForFunction(() => window.__firstPageMs !== undefined, undefined, { timeout: 30_000 });
  return page.evaluate(() => ({ firstPage: window.__firstPageMs as number, server: window.__serverMs, reads: window.__readCount }));
}

for (const mode of ['paging', 'infinite'] as const) {
  test(`remote first page (${mode}, 1,000,000 rows, latency 0): client mount to painted rows <= 120 ms`, async ({ page }) => {
    await load(page, mode); // warm-up (browser caches, JIT of the bundle is per page)
    const samples: { firstPage: number; server: number; reads: number }[] = [];
    for (let i = 0; i < 5; i++) samples.push(await load(page, mode));
    const client = samples.map((s) => s.firstPage - s.server).sort((a, b) => a - b);
    const total = samples.map((s) => s.firstPage).sort((a, b) => a - b);
    const server = samples.map((s) => s.server).sort((a, b) => a - b);
    console.log(
      `[perf] remote first page ${mode}: client=${round(client[2] as number)}ms total=${round(total[2] as number)}ms server=${round(server[2] as number)}ms (client samples ${client.map(round).join(', ')}; reads ${samples.map((s) => s.reads).join(', ')})`,
    );
    expect(await page.locator('.salmon-data-grid-rows [data-row-id="r0"]').count()).toBe(1);
    expectBudget(client[2] as number, 120, `remote first page ${mode} client`);
  });
}
