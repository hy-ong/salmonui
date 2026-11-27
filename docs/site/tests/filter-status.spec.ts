import { expect, test, type Page } from '@playwright/test';

// Filter status in the pager, getFilteredRows and the
// filter dialog's loading indicator, on the filter-status and
// remote-query demos.

async function open(page: Page, id: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(`/demos/data-grid/${id}`);
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('.salmon-data-grid').first();
const status = (page: Page) => page.locator('.salmon-data-grid-pager [data-filter-status]');
const cells = (page: Page, id: string) => grid(page).locator(`.salmon-data-grid-rows [data-row-id] .salmon-data-grid-cell[data-column-id="${id}"]`);
const pagerItems = async (page: Page) => Number(((await page.locator('.salmon-data-grid-pager__items').innerText()).match(/\d+/) ?? ['-1'])[0]);

test.describe('filter status in the pager and getFilteredRows', () => {
  test('the status is server-rendered, follows the filter row and showStatus; getFilteredRows spans every page', async ({ page }) => {
    // The initial filters are in the server HTML, before any script runs.
    const html = await (await page.request.get('/demos/data-grid/filter-status')).text();
    expect(html).toContain('Filtered by Country: Equal Japan; Amount: Greater than or equal 200');
    const problems = await open(page, 'filter-status');
    await expect(status(page)).toHaveText('Filtered by Country: Equal Japan; Amount: Greater than or equal 200');
    // A filter row change updates the message.
    const customer = page.getByRole('textbox', { name: 'Filter Customer' });
    await customer.fill('a');
    await customer.press('Enter');
    await expect(status(page)).toHaveText('Filtered by Country: Equal Japan; Amount: Greater than or equal 200; Customer: Contains a');
    // getFilteredRows: every filtered row, not just the 10-row page.
    const total = await pagerItems(page);
    expect(total).toBeGreaterThan(10);
    await page.getByRole('button', { name: 'Read filtered rows' }).click();
    await expect(page.getByTestId('filtered-rows')).toContainText(`getFilteredRows(): ${total} rows`);
    expect(await cells(page, 'id').count()).toBe(10);
    // showStatus false hides it; clearing every filter removes it too.
    await page.getByLabel('Show filter status').uncheck();
    await expect(status(page)).toHaveCount(0);
    await page.getByLabel('Show filter status').check();
    await expect(status(page)).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(status(page)).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

test.describe('filter dialog loading indicator', () => {
  test('skeleton by default, spinner when set, while a remote facet loads', async ({ page }) => {
    // Hold facet requests until released, so the loading state is observable.
    let release: () => void = () => {};
    let held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/orders**', async (route) => {
      if ((route.request().postData() ?? '').includes('"facet"')) await held;
      await route.continue();
    });
    const problems = await open(page, 'remote-query');
    await expect(cells(page, 'country').first()).toBeVisible();
    const openCustomer = async () => {
      await grid(page).locator('.salmon-data-grid-header-cell[data-column-id="customer"] .salmon-data-grid-filter-button').click();
      const dialog = page.getByRole('dialog', { name: 'Filter Customer' });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    let dialog = await openCustomer();
    let loading = dialog.locator('[role="status"][data-loading]');
    await expect(loading).toHaveAttribute('data-indicator', 'skeleton');
    await expect(loading).toHaveText('Loading…');
    await expect(loading.locator('.salmon-data-grid-filter-menu__skeleton-row')).toHaveCount(6);
    await expect(loading.locator('.salmon-data-grid-filter-menu__skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect((await loading.boundingBox())?.height ?? 0).toBeGreaterThan(100);
    await expect(dialog.locator('.salmon-data-grid-facet-list')).toHaveCount(0);
    release();
    await expect(dialog.locator('.salmon-data-grid-facet-list')).toBeVisible();
    await expect(loading).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // Spinner.
    held = new Promise<void>((resolve) => (release = resolve));
    await page.getByRole('combobox', { name: 'Filter values loading' }).click();
    await page.getByRole('option', { name: 'Spinner', exact: true }).click();
    dialog = await openCustomer();
    loading = dialog.locator('[role="status"][data-loading]');
    await expect(loading).toHaveAttribute('data-indicator', 'spinner');
    await expect(loading).toHaveText('Loading…');
    await expect(loading.locator('.salmon-data-grid-loading__spinner')).toBeVisible();
    await expect(loading.locator('.salmon-data-grid-filter-menu__skeleton-row')).toHaveCount(0);
    release();
    await expect(dialog.locator('.salmon-data-grid-facet-list')).toBeVisible();
    await expect(loading).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
