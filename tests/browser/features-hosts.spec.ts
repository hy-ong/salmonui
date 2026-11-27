import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, waitForGridReady } from './helpers.ts';

// Render feature gate and lazy feature chunks: on a client-only render, a
// grid with `editing` or `rowDrag` shows the sized placeholder until its
// host feature chunk arrives; the interaction chunk (`edit-chunk`,
// `row-drag-chunk`) is requested in parallel with the host (registry-lazy
// `WARM`), not after it.

async function hold(page: Page, pattern: RegExp): Promise<{ release: () => void; requested: string[] }> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const requested: string[] = [];
  await page.route(pattern, async (route) => {
    requested.push(route.request().url());
    await held;
    await route.continue();
  });
  return { release, requested };
}

function watch(page: Page, pattern: RegExp): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (pattern.test(request.url())) seen.push(request.url());
  });
  return seen;
}

test.describe('editing and rowDrag, client-only first use', () => {
  test('editing: placeholder until the host chunk arrives, the editing chunk warms in parallel, then the add row and editors', async ({ page }) => {
    const problems = collectProblems(page);
    const { release, requested } = await hold(page, /features\/feature-editing/);
    const warmed = watch(page, /editing\/edit-chunk/);
    await page.goto(`${DEV_URL}?rows=500&cols=6&edit=row&enewrow`);
    const placeholder = page.locator('[data-salmon-pending]');
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toHaveAttribute('aria-busy', 'true');
    expect(await page.locator('[role="grid"]').count()).toBe(0);
    expect(requested.length).toBe(1);
    // The interaction chunk is requested while the host is still held.
    await expect.poll(() => warmed.length).toBeGreaterThan(0);

    release();
    await waitForGridReady(page);
    await page.waitForFunction(() => (window as { __gridApi?: unknown }).__gridApi);
    await expect(page.locator('[data-new-row]')).toHaveCount(1);
    await expect(page.locator('[data-new-row] .salmon-data-grid-editor').first()).toBeVisible();
    await page.locator('.salmon-data-grid-rows .salmon-data-grid-row[data-row-index="0"] .salmon-data-grid-cell').nth(1).dblclick();
    await expect(page.locator('.salmon-data-grid-rows .salmon-data-grid-editor').first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('rowDrag: placeholder until the host chunk arrives, the drag chunk warms in parallel, then the handles', async ({ page }) => {
    const problems = collectProblems(page);
    const { release, requested } = await hold(page, /features\/feature-row-drag/);
    const warmed = watch(page, /row-drag-chunk/);
    await page.goto(`${DEV_URL}detail-gaps.html?mode=drag`);
    await expect(page.locator('[data-salmon-pending]').first()).toHaveAttribute('aria-busy', 'true');
    expect(await page.locator('[role="grid"]').count()).toBe(0);
    expect(requested.length).toBeGreaterThan(0);
    await expect.poll(() => warmed.length).toBeGreaterThan(0);

    release();
    await waitForGridReady(page);
    await page.waitForFunction(() => document.querySelector('[data-salmon-pending]') === null);
    await expect(page.locator('#customers .salmon-data-grid-row-drag-handle').first()).toBeVisible();
    await expect(page.locator('#customers [role="columnheader"][data-column-id="__salmon_drag"]')).toHaveCount(1);
    expect(problems).toEqual([]);
  });
});
