import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, waitForGridReady } from './helpers.ts';

// Render feature gate and placeholder, for the small render features: on a
// client-only first use the grid shows the sized placeholder while its
// feature chunk is held, then the real grid with the feature's output.

/** Holds the requests of `chunk` until the returned release is called. */
async function holdChunk(page: Page, chunk: RegExp): Promise<{ release: () => void; requested: string[] }> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested: string[] = [];
  await page.route(chunk, async (route) => {
    requested.push(route.request().url());
    await held;
    await route.continue();
  });
  return { release, requested };
}

async function expectPlaceholder(page: Page): Promise<void> {
  const placeholder = page.locator('[data-salmon-pending]');
  await expect(placeholder).toHaveCount(1);
  await expect(placeholder).toHaveAttribute('aria-busy', 'true');
  expect(await page.locator('[role="grid"]').count()).toBe(0);
}

test.describe('small render features, client-only first use', () => {
  test('rowPinning: placeholder until the chunk arrives, then the pinned rows', async ({ page }) => {
    const problems = collectProblems(page);
    const { release, requested } = await holdChunk(page, /features\/feature-row-pinning/);
    await page.goto(`${DEV_URL}?rows=500&cols=6&pinRows=r30`);
    await expectPlaceholder(page);
    expect(requested.length).toBe(1);
    release();
    await waitForGridReady(page);
    await expect(page.locator('.salmon-data-grid-frozen-rows--top [data-row-id="r30"][data-pinned]')).toHaveCount(1);
    expect(problems).toEqual([]);
  });

  test('lookup: placeholder until the chunk arrives, then display values', async ({ page }) => {
    const problems = collectProblems(page);
    const { release, requested } = await holdChunk(page, /features\/feature-lookup/);
    await page.goto(`${DEV_URL}?rows=500&cols=6&lookup`);
    await expectPlaceholder(page);
    expect(requested.length).toBe(1);
    release();
    await waitForGridReady(page);
    // Row r1 holds key 1 in s2: the grid shows the lookup's title.
    await expect(page.locator('[data-row-id="r1"] [data-column-id="s2"]')).toHaveText('Closed');
    expect(problems).toEqual([]);
  });

  test('persistState: placeholder until the chunk arrives, then the stored state restored', async ({ page }) => {
    const problems = collectProblems(page);
    // A stored sort (descending s1) under the harness id "spa".
    await page.addInitScript(() => {
      localStorage.setItem('salmon-data-grid:spa', JSON.stringify({ version: 1, sorting: [{ field: 's1', direction: 'desc' }] }));
    });
    const { release, requested } = await holdChunk(page, /features\/feature-persist-state/);
    await page.goto(`${DEV_URL}?rows=500&cols=6&persist&sort`);
    await expectPlaceholder(page);
    expect(requested.length).toBe(1);
    release();
    await waitForGridReady(page);
    await expect(page.locator('[role="columnheader"][data-column-id="s1"]')).toHaveAttribute('aria-sort', 'descending');
    expect(problems).toEqual([]);
  });

  test('adaptive: placeholder until the chunk arrives, then the card rows', async ({ page }) => {
    const problems = collectProblems(page);
    const { release, requested } = await holdChunk(page, /features\/feature-adaptive/);
    await page.goto(`${DEV_URL}?rows=500&cols=6&adaptive=vertical`);
    await expectPlaceholder(page);
    expect(requested.length).toBe(1);
    release();
    await waitForGridReady(page);
    await expect(page.getByRole('grid')).toHaveAttribute('data-row-layout', 'vertical');
    await expect(page.locator('.salmon-data-grid-card').first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('infiniteScroll: placeholder until the chunk arrives, then the loaded rows', async ({ page }) => {
    const problems = collectProblems(page);
    const { release, requested } = await holdChunk(page, /features\/feature-infinite-scroll/);
    await page.goto(`${DEV_URL}infinite.html`);
    await expectPlaceholder(page);
    expect(requested.length).toBe(1);
    release();
    await waitForGridReady(page);
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r0"]')).toHaveCount(1);
    expect(problems).toEqual([]);
  });

  test('output: the export implementation loads on the first export, not with the grid', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => {
      if (/output-impl/.test(request.url())) requested.push(request.url());
    });
    await page.goto(`${DEV_URL}?rows=50&cols=6`);
    await waitForGridReady(page);
    await page.waitForFunction(() => window.__gridApi);
    expect(requested).toEqual([]);
    const text = await page.evaluate(async () => (await window.__gridApi.exportToCsv({ download: false }))?.data as string);
    expect(text.split('\n').length).toBeGreaterThan(50);
    expect(requested.length).toBe(1);
  });
});
