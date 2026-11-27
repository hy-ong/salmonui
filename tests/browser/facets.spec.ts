import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Paged checklist facets: the excel / checklist list
// requests `filtering.checklistPageSize` (100) distinct values at a time and
// the next page as it scrolls to its end; select-all, single toggles and OK
// work over values that are not loaded yet; a search pages the same way.

const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const viewValues = (page: Page, field: string) => page.evaluate((f) => (window.__gridApi.getViewRows() as Record<string, unknown>[]).map((r) => r[f]), field);
const list = (page: Page) => page.locator('[data-salmon-popover] .salmon-data-grid-facet-list');
const loaded = async (page: Page) => Number(await list(page).getAttribute('data-count'));
const total = async (page: Page) => Number(await list(page).getAttribute('data-total'));
const filters = (page: Page) =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.__gridApi.engine.getSnapshot().query.filters)) as { columnId: string; operator: string; value: unknown[] }[]);

async function openFilter(page: Page, field: string): Promise<void> {
  await header(page, field).locator('.salmon-data-grid-filter-button').click();
  await expect(list(page)).toBeVisible();
}

test.describe('paged checklist facets', () => {
  test('loads one page, then the next page while scrolling to the end', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=20000&cols=10&qfilter=excel`);
    await openFilter(page, 'n4');
    expect(await loaded(page)).toBe(100);
    const all = await total(page);
    expect(all).toBeGreaterThan(5000);
    // Every option reports the full set size, not the loaded prefix.
    await expect(list(page).locator('[role="option"]').first()).toHaveAttribute('aria-setsize', String(all));
    await list(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => loaded(page)).toBe(200);
    // Keyboard End reaches the loaded end and asks for more as well.
    await list(page).focus();
    await page.keyboard.press('End');
    await expect.poll(() => loaded(page)).toBe(300);
    expect(problems).toEqual([]);
  });

  test('unchecking one value with all checked applies notIn without reading every value', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=20000&cols=10&qfilter=excel`);
    await openFilter(page, 'n4');
    const firstLabel = (await list(page).locator('.salmon-data-grid-facet-list__label').first().textContent()) ?? '';
    await list(page).locator('[role="option"]').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();
    const applied = await filters(page);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.operator).toBe('notIn');
    expect(applied[0]?.value).toHaveLength(1);
    const excluded = Number(firstLabel.replace(/,/g, ''));
    await expect.poll(async () => (await viewValues(page, 'n4')).includes(excluded)).toBe(false);
  });

  test('select all off, then one value from a later page, applies in with that value', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=20000&cols=10&qfilter=excel`);
    await openFilter(page, 'n4');
    const dialog = page.getByRole('dialog');
    await dialog.locator('.salmon-data-grid-filter-menu__all input').uncheck();
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeDisabled();
    await list(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => loaded(page)).toBe(200);
    // Only the options in view are mounted: scroll option 150 (32 px rows) into the list first.
    await list(page).evaluate((el) => {
      el.scrollTop = 149 * 32;
      el.dispatchEvent(new Event('scroll'));
    });
    const option = list(page).locator('[role="option"][aria-posinset="150"]');
    await expect(option).toBeVisible();
    await option.click();
    await expect(dialog.locator('.salmon-data-grid-filter-menu__all input')).toHaveJSProperty('indeterminate', true);
    await dialog.getByRole('button', { name: 'OK' }).click();
    const applied = await filters(page);
    expect(applied[0]?.operator).toBe('in');
    expect(applied[0]?.value).toHaveLength(1);
    // Reopening keeps the column's current filter: one value checked.
    await openFilter(page, 'n4');
    await expect(page.getByRole('dialog').locator('.salmon-data-grid-filter-menu__all input')).toHaveJSProperty('indeterminate', true);
  });

  test('a search pages its matches and OK keeps every checked match, loaded or not', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=20000&cols=10&qfilter=excel`);
    await openFilter(page, 'n4');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('searchbox', { name: 'Search values' }).fill('1');
    await expect.poll(() => loaded(page)).toBe(100);
    const matches = await total(page);
    expect(matches).toBeGreaterThan(100);
    await dialog.getByRole('button', { name: 'OK' }).click();
    const applied = await filters(page);
    expect(applied[0]?.operator).toBe('in');
    expect(applied[0]?.value).toHaveLength(matches);
  });
});

test.describe('paged checklist timing (production build)', { tag: '@perf' }, () => {
  test('excel filter open on ~63k distinct values (100k rows) <= 50 ms to painted', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?qfilter=excel`);
    const samples: number[] = [];
    for (let i = 0; i < 6; i++) {
      const id = ['n4', 'n5', 'n6'][i % 3] as string;
      samples.push(
        await page.evaluate(
          ([sel, until]) =>
            new Promise<number>((resolve, reject) => {
              requestAnimationFrame(() => {
                const el = document.querySelector<HTMLElement>(sel);
                if (!el) return reject(new Error(`no ${sel}`));
                const t0 = performance.now();
                el.click();
                const check = () => {
                  if (document.querySelector(until)) {
                    void document.body.offsetHeight;
                    const ch = new MessageChannel();
                    ch.port1.onmessage = () => resolve(performance.now() - t0);
                    ch.port2.postMessage(0);
                  } else setTimeout(check, 0);
                };
                queueMicrotask(check);
              });
            }),
          [`.salmon-data-grid-header-cell[data-column-id="${id}"] .salmon-data-grid-filter-button`, '[data-salmon-popover][data-placed] .salmon-data-grid-facet-list'] as const,
        ),
      );
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] as number;
    console.log(`[perf] excel open (paged, ~63k distinct) p95 ${p95.toFixed(1)} ms (${samples.map((s) => s.toFixed(1)).join(', ')})`);
    expectBudget(p95, 50, 'excel open (paged, ~63k distinct) p95');
  });
});
