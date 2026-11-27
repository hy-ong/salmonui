import { expect, test, type Locator, type Page } from '@playwright/test';

// Feature checks for the Sorting, Filtering, Searching, Paging, Grouping,
// Lazy Load Grouping and Aggregates demos: each feature a demo lists is
// exercised here, so the docs site shows working behavior, not just markup.
// Menus and filter dialogs load lazily: every assertion waits for them.

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
const header = (page: Page, id: string) => grid(page).locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const cells = (page: Page, id: string) => grid(page).locator(`.salmon-data-grid-rows [data-row-id] .salmon-data-grid-cell[data-column-id="${id}"]`);
const texts = async (page: Page, id: string) => (await cells(page, id).allInnerTexts()).map((t) => t.trim());
/** aria-rowcount: header rows plus every row of the view. */
const rowCount = async (page: Page) => Number(await page.locator('[role="grid"]').first().getAttribute('aria-rowcount'));
const log = (page: Page) => page.locator('[role="log"]');
const filterDialog = (page: Page) => page.getByRole('dialog', { name: /^Filter / });

async function openFilter(page: Page, id: string): Promise<Locator> {
  await header(page, id).locator('.salmon-data-grid-filter-button').click();
  const dialog = filterDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

test.describe('sorting demo', () => {
  test('multiple on and off, column menu sort, stable order for equal keys', async ({ page }) => {
    const problems = await open(page, 'sorting');
    await expect(header(page, 'priority')).toHaveAttribute('aria-sort', 'ascending');
    await expect(header(page, 'placed')).toHaveAttribute('aria-sort', 'descending');
    // sorting.multiple false: Ctrl/Cmd+click replaces the sort.
    await page.getByLabel('Multi-column sort').uncheck();
    await header(page, 'country').click({ modifiers: ['ControlOrMeta'] });
    await expect(header(page, 'country')).toHaveAttribute('aria-sort', 'ascending');
    await expect(header(page, 'priority')).toHaveAttribute('aria-sort', 'none');
    // Stable: equal countries keep the data order (order ids ascend).
    const countries = await texts(page, 'country');
    const ids = await texts(page, 'id');
    expect(new Set(countries).size).toBe(1);
    expect([...ids].sort()).toEqual(ids);
    // On again: Ctrl/Cmd+click adds.
    await page.getByLabel('Multi-column sort').check();
    await header(page, 'amount').click({ modifiers: ['ControlOrMeta'] });
    await expect(header(page, 'country')).toHaveAttribute('aria-sort', 'ascending');
    await expect(header(page, 'amount')).toHaveAttribute('aria-sort', 'ascending');
    // Column menu: Sort descending on Customer.
    await header(page, 'customer').locator('.salmon-data-grid-column-menu-button').click();
    const menu = page.locator('.salmon-data-grid-column-menu[data-salmon-popover]');
    await expect(menu).toBeVisible();
    await menu.locator('[data-item-id="sortDescending"]').click();
    await expect(header(page, 'customer')).toHaveAttribute('aria-sort', 'descending');
    const customers = await texts(page, 'customer');
    expect([...customers].sort().reverse()).toEqual(customers);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

test.describe('filter row demo', () => {
  test('initial filter, prefixes, wildcards, case and accents, lookup text, cell template, non-filterable column', async ({ page }) => {
    const problems = await open(page, 'filter-row');
    const amount = page.getByRole('textbox', { name: 'Filter Amount' });
    // The initial filter (amount >= 50) applies from the first render and marks its cell.
    await expect(grid(page).locator('.salmon-data-grid-filter-bar__cell[data-column-id="amount"]')).toHaveAttribute('data-filtered', '');
    expect((await texts(page, 'amount')).every((t) => Number(t.replace(/[$,]/g, '')) >= 50)).toBe(true);
    // It is written back with its operator prefix, and Enter on it keeps the condition.
    await expect(amount).toHaveValue('>=50');
    const initial = await rowCount(page);
    await amount.press('Enter');
    expect(await rowCount(page)).toBe(initial);
    const all = await rowCount(page);
    // Prefix operator.
    await amount.fill('>=500');
    await amount.press('Enter');
    await expect.poll(async () => (await texts(page, 'amount')).every((t) => Number(t.replace(/[$,]/g, '')) >= 500)).toBe(true);
    await amount.press('Escape');
    await expect.poll(() => rowCount(page)).toBeGreaterThan(all);
    // Wildcard on a column whose id differs from its field.
    const city = page.getByRole('textbox', { name: 'Filter City' });
    await city.fill('Lyo*');
    await city.press('Enter');
    await expect.poll(async () => [...new Set(await texts(page, 'place'))]).toEqual(['Lyon']);
    await city.press('Escape');
    // Case and accents: "jose" matches "jose alvarez", then also "José Álvarez".
    const customer = page.getByRole('textbox', { name: 'Filter Customer' });
    await customer.fill('jose');
    await customer.press('Enter');
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))]).toEqual(['jose alvarez']);
    const plain = await rowCount(page);
    await page.getByLabel('Ignore accents').check();
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))].sort()).toEqual(['José Álvarez', 'jose alvarez']);
    expect(await rowCount(page)).toBeGreaterThan(plain);
    await customer.fill('José');
    await customer.press('Enter');
    await page.getByLabel('Match case').check();
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))]).toEqual(['José Álvarez']);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(customer).toHaveValue('');
    await page.getByLabel('Match case').uncheck();
    // A lookup column filters by its display text.
    const category = page.getByRole('textbox', { name: 'Filter Category' });
    await category.fill('loose');
    await category.press('Enter');
    await expect.poll(async () => [...new Set(await texts(page, 'category'))]).toEqual(['Loose tea']);
    // renderFilterCell: the Country select.
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(category).toHaveValue('');
    await page.getByRole('combobox', { name: 'Filter Country' }).click();
    await page.getByRole('option', { name: 'Japan', exact: true }).click();
    await expect.poll(async () => [...new Set(await texts(page, 'country'))]).toEqual(['Japan']);
    await expect(log(page)).toContainText('country equal "Japan"');
    // filterable: false renders no filter input.
    await expect(grid(page).locator('.salmon-data-grid-filter-bar [data-column-id="note"] input')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('operator dropdown, typing trigger, nested filters and filter methods', async ({ page }) => {
    const problems = await open(page, 'filter-row');
    // showOperators + trigger 'input'.
    await page.getByLabel('Show operators').check();
    await page.getByLabel('Filter while typing (300 ms)').check();
    await page.getByRole('combobox', { name: 'Customer filter operator' }).selectOption('startsWith');
    await page.getByRole('textbox', { name: 'Filter Customer' }).pressSequentially('An');
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))].sort()).toEqual(['Ana Muñoz', 'André Silva']);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByLabel('Show operators').uncheck();
    await page.getByLabel('Filter while typing (300 ms)').uncheck();
    // Nested group via the reactive filters prop: (Japan or > 1,000) and not shipped.
    // A prop change applies without a change event (the event reports user and API changes).
    await page.getByRole('button', { name: '(Japan or over 1,000) and not shipped' }).click();
    await expect.poll(async () => cells(page, 'shipped').locator('[role="checkbox"][aria-checked="true"]').count()).toBe(0);
    await expect.poll(async () => new Set(await texts(page, 'country')).size).toBeGreaterThan(1);
    const countries = await texts(page, 'country');
    const amounts = (await texts(page, 'amount')).map((t) => Number(t.replace(/[$,]/g, '')));
    expect(countries.length).toBeGreaterThan(0);
    countries.forEach((c, i) => expect(c === 'Japan' || (amounts[i] as number) > 1000).toBe(true));
    // filterColumn with `in`, between, removeFilter.
    await page.getByRole('button', { name: 'City in Lyon, Osaka' }).click();
    await expect.poll(async () => [...new Set(await texts(page, 'place'))].every((c) => c === 'Lyon' || c === 'Osaka')).toBe(true);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('button', { name: 'Amount between 100 and 500' }).click();
    await expect.poll(async () => (await texts(page, 'amount')).every((t) => Number(t.replace(/[$,]/g, '')) >= 100 && Number(t.replace(/[$,]/g, '')) <= 500)).toBe(true);
    const between = await rowCount(page);
    await page.getByRole('button', { name: 'Remove Amount filter' }).click();
    await expect.poll(() => rowCount(page)).toBeGreaterThan(between);
    expect(problems).toEqual([]);
  });
});

test.describe('filter menus demo', () => {
  test('menu open events: before and after events per opening; the before-event cancels', async ({ page }) => {
    const problems = await open(page, 'filter-menus');
    await openFilter(page, 'customer');
    await expect(log(page)).toContainText('beforeFilterMenuOpen (customer, excel, menu)');
    await expect(log(page)).toContainText('filterMenuOpen (customer, excel, menu)');
    await page.keyboard.press('Escape');
    await expect(filterDialog(page)).toHaveCount(0);
    // Cancelled in onBeforeFilterMenuOpen: no menu and no after-event.
    await page.getByLabel('Cancel the Note filter menu').check();
    await header(page, 'note').locator('.salmon-data-grid-filter-button').click();
    await expect(log(page)).toContainText('beforeFilterMenuOpen (note, excel, menu): prevented');
    await expect(filterDialog(page)).toHaveCount(0);
    await expect(log(page)).not.toContainText('filterMenuOpen (note');
    // Unticked, the Note menu opens again.
    await page.getByLabel('Cancel the Note filter menu').uncheck();
    await openFilter(page, 'note');
    await expect(log(page).locator('li').first()).toHaveText('filterMenuOpen (note, excel, menu)');
    expect(problems).toEqual([]);
  });

  test('excel: blanks, counts, select all, search; checklist pages in 50 values at a time', async ({ page }) => {
    const problems = await open(page, 'filter-menus');
    const all = await rowCount(page);
    // 600 distinct order ids: 50 load first, the next 50 on scrolling to the end.
    let dialog = await openFilter(page, 'id');
    const list = dialog.locator('.salmon-data-grid-facet-list');
    await expect(list).toHaveAttribute('data-count', '50');
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(list).toHaveAttribute('data-count', '100');
    await page.keyboard.press('Escape');
    await expect(filterDialog(page)).toHaveCount(0);
    dialog = await openFilter(page, 'note');
    const blanks = dialog.locator('[role="option"]', { hasText: '(Blanks)' });
    await expect(blanks.locator('.salmon-data-grid-facet-list__count')).toHaveText(/^\d+$/);
    const blankCount = Number(await blanks.locator('.salmon-data-grid-facet-list__count').innerText());
    // Select all off, then only blanks.
    await dialog.getByRole('checkbox', { name: 'Select all' }).uncheck();
    await blanks.click();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await rowCount(page)) - (all - 600)).toBe(blankCount);
    expect((await texts(page, 'note')).every((t) => t === '')).toBe(true);
    // Search narrows the checklist.
    dialog = await openFilter(page, 'customer');
    await dialog.getByRole('searchbox', { name: 'Search values' }).fill('Bao');
    await expect(dialog.locator('[role="option"]')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))]).toEqual(['Bao Nguyen']);
    expect(problems).toEqual([]);
  });

  test('menu: typed editors, per-column UI and operators, custom editor', async ({ page }) => {
    const problems = await open(page, 'filter-menus');
    await page.getByRole('combobox', { name: 'Filter UI' }).click();
    await page.getByRole('option', { name: 'Menu', exact: true }).click();
    // Country keeps the checklist (column filter.ui).
    let dialog = await openFilter(page, 'country');
    await expect(dialog.locator('.salmon-data-grid-facet-list')).toBeVisible();
    await page.keyboard.press('Escape');
    // filterComparator: the Customer comparer ignores case, spaces and hyphens.
    dialog = await openFilter(page, 'customer');
    await dialog.getByRole('textbox', { name: 'Value' }).fill('baonguyen');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))]).toEqual(['Bao Nguyen']);
    dialog = await openFilter(page, 'customer');
    await dialog.getByRole('button', { name: 'Clear' }).click();
    await expect.poll(async () => new Set(await texts(page, 'customer')).size).toBeGreaterThan(1);
    // renderFilter: the Category dropdown editor.
    dialog = await openFilter(page, 'category');
    await dialog.getByRole('combobox', { name: 'Operator' }).selectOption('equal');
    await dialog.getByRole('combobox', { name: 'Category value' }).selectOption('Tea');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => [...new Set(await texts(page, 'category'))]).toEqual(['Tea']);
    // Number editor with the column's operators and editorProps.
    dialog = await openFilter(page, 'quantity');
    await expect(dialog.getByRole('combobox', { name: 'Operator' }).locator('option')).toHaveText(['Equal', 'Greater than', 'Less than', 'Between']);
    await expect(dialog.getByRole('spinbutton', { name: 'Value' })).toHaveAttribute('max', '12');
    await dialog.getByRole('combobox', { name: 'Operator' }).selectOption('greaterThan');
    await dialog.getByRole('spinbutton', { name: 'Value' }).fill('10');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await texts(page, 'quantity')).every((t) => Number(t) > 10)).toBe(true);
    // String operators from filtering.operators.
    dialog = await openFilter(page, 'customer');
    await expect(dialog.getByRole('combobox', { name: 'Operator' }).locator('option')).toHaveText(['Contains', 'Starts with', 'Ends with', 'Equal', 'Not equal', 'Like', 'Empty', 'Not empty']);
    await page.keyboard.press('Escape');
    // Date, date-time and boolean editors.
    dialog = await openFilter(page, 'placed');
    await expect(dialog.getByLabel('Value')).toHaveAttribute('type', 'date');
    await page.keyboard.press('Escape');
    dialog = await openFilter(page, 'placedAt');
    await expect(dialog.getByLabel('Value')).toHaveAttribute('type', 'datetime-local');
    await page.keyboard.press('Escape');
    dialog = await openFilter(page, 'shipped');
    await dialog.getByRole('combobox', { name: 'Value' }).selectOption('true');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => cells(page, 'shipped').locator('[role="checkbox"][aria-checked="false"]').count()).toBe(0);
    // Alt+ArrowDown opens the menu from a focused header; Escape restores focus.
    await header(page, 'amount').focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(filterDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(header(page, 'amount')).toBeFocused();
    expect(problems).toEqual([]);
  });
});

test.describe('server-side filtering and search demo', () => {
  test('nested filters and the search travel in the read request', async ({ page }) => {
    const problems = await open(page, 'remote-query');
    await expect(cells(page, 'country').first()).toBeVisible();
    expect([...new Set(await texts(page, 'country'))].every((c) => c === 'Japan' || c === 'Malaysia')).toBe(true);
    await expect(log(page)).toContainText('"or":[');
    await page.getByRole('search').getByRole('searchbox').fill('Grinder');
    await expect(log(page)).toContainText('"search":{"text":"Grinder"');
    await expect.poll(async () => [...new Set(await texts(page, 'product'))]).toEqual(['Grinder']);
    expect(problems).toEqual([]);
  });
});

test.describe('remote checklist values', () => {
  test('the Excel filter reads paged, searchable facets from the server and applies the checked values', async ({ page }) => {
    const problems = await open(page, 'remote-query');
    await expect(cells(page, 'country').first()).toBeVisible();
    const dialog = await openFilter(page, 'customer');
    const list = dialog.locator('.salmon-data-grid-facet-list');
    // checklistPageSize 4: the first request asks for 4 values, the next 4 load on scrolling.
    await expect(list).toHaveAttribute('data-count', '4');
    await expect(log(page)).toContainText('facet: {"field":"customer","limit":4}');
    const scrollToEnd = () =>
      list.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        el.dispatchEvent(new Event('scroll'));
      });
    await scrollToEnd();
    await expect(log(page)).toContainText('facet: {"field":"customer","limit":8}');
    await expect(list).toHaveAttribute('data-count', '8');
    // All 10 customers match the demo's filters: the third request (limit 12) completes the list.
    await scrollToEnd();
    await expect(log(page)).toContainText('facet: {"field":"customer","limit":12}');
    await expect(list).toHaveAttribute('data-count', '10');
    // Search in the facet: one narrowed request after the debounce.
    // The first listed customer (sorted by name) under the demo's initial filters.
    const name = (await dialog.locator('[role="option"] .salmon-data-grid-facet-list__label').first().innerText()).trim();
    const term = name.slice(0, 4);
    await dialog.getByRole('searchbox', { name: 'Search values' }).fill(term);
    await expect(log(page)).toContainText(`facet: {"field":"customer","search":"${term}","limit":4}`);
    await expect(dialog.locator('[role="option"]')).toHaveCount(1);
    await expect(dialog.locator('[role="option"]').first()).toContainText(name);
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(log(page)).toContainText(`"field":"customer","op":"in","value":["${name}"]`);
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))]).toEqual([name]);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

test.describe('search demo', () => {
  test('initial text, toolbar box, methods, operator, fields, case and accents', async ({ page }) => {
    const problems = await open(page, 'search');
    const region = page.getByRole('search', { name: 'Search grid' });
    const box = region.getByRole('searchbox');
    // search.text is server-rendered and shown in the box.
    await expect(box).toHaveValue('Lyon');
    expect([...new Set(await texts(page, 'city'))]).toEqual(['Lyon']);
    // search.highlight: the match is a <mark> in the rendered cells, server-rendered too.
    const marks = grid(page).locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="city"] mark.salmon-data-grid-search-mark');
    await expect(marks.first()).toHaveText('Lyon');
    expect(await marks.count()).toBe(await cells(page, 'city').count());
    await page.getByLabel('Highlight matches').uncheck();
    await expect(grid(page).locator('mark')).toHaveCount(0);
    await page.getByLabel('Highlight matches').check();
    await expect(marks.first()).toHaveText('Lyon');
    await page.getByRole('button', { name: 'Search “Tokyo”' }).click();
    await expect(box).toHaveValue('Tokyo');
    await expect.poll(async () => [...new Set(await texts(page, 'city'))]).toEqual(['Tokyo']);
    await expect(log(page)).toContainText('beforeSearchChange (api): "Lyon" → "Tokyo"');
    // Typing; the note column is not searched.
    await box.fill('Gift wrap');
    await expect.poll(() => cells(page, 'id').count()).toBe(0);
    // Case and accents.
    await box.fill('jose');
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))]).toEqual(['jose alvarez']);
    await page.getByLabel('Ignore accents').check();
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))].sort()).toEqual(['José Álvarez', 'jose alvarez']);
    // The accent-folded match marks the original characters.
    await expect.poll(async () => [...new Set(await grid(page).locator('.salmon-data-grid-cell[data-column-id="customer"] mark').allInnerTexts())].sort()).toEqual(['José', 'jose']);
    await page.getByLabel('Match case').check();
    await box.fill('JOSE');
    await expect.poll(() => cells(page, 'id').count()).toBe(0);
    await box.fill('Jose');
    await expect.poll(async () => [...new Set(await texts(page, 'customer'))]).toEqual(['José Álvarez']);
    await page.getByLabel('Match case').uncheck();
    await page.getByLabel('Ignore accents').uncheck();
    // Operator and fields: "Ma" starts the country "Malaysia" and the customer "Ana Muñoz" contains it.
    await page.locator('.demo-toolbar').getByRole('combobox', { name: 'Operator', exact: true }).click();
    await page.getByRole('option', { name: 'startsWith', exact: true }).click();
    await page.locator('.demo-toolbar').getByRole('combobox', { name: 'Columns', exact: true }).click();
    await page.getByRole('option', { name: 'City and Country', exact: true }).click();
    await box.fill('Ma');
    await expect.poll(async () => [...new Set(await texts(page, 'country'))]).toEqual(['Malaysia']);
    // wildcard and like: the pattern spans the whole value, and the mark covers it.
    await page.locator('.demo-toolbar').getByRole('combobox', { name: 'Operator', exact: true }).click();
    await page.getByRole('option', { name: 'wildcard (* and ?)', exact: true }).click();
    await box.fill('T*o');
    await expect.poll(async () => [...new Set(await texts(page, 'city'))]).toEqual(['Tokyo']);
    await expect(grid(page).locator('.salmon-data-grid-cell[data-column-id="city"] mark').first()).toHaveText('Tokyo');
    await box.fill('T?kyo');
    await expect.poll(async () => [...new Set(await texts(page, 'city'))]).toEqual(['Tokyo']);
    await box.fill('Tok');
    await expect.poll(() => cells(page, 'id').count()).toBe(0);
    await page.locator('.demo-toolbar').getByRole('combobox', { name: 'Operator', exact: true }).click();
    await page.getByRole('option', { name: 'like (%)', exact: true }).click();
    await box.fill('%many');
    await expect.poll(async () => [...new Set(await texts(page, 'country'))]).toEqual(['Germany']);
    await box.fill('Ma%');
    await expect.poll(async () => [...new Set(await texts(page, 'country'))]).toEqual(['Malaysia']);
    // clearSearch.
    await page.getByRole('button', { name: 'Clear search' }).first().click();
    await expect(box).toHaveValue('');
    await expect.poll(async () => new Set(await texts(page, 'country')).size).toBeGreaterThan(1);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

test.describe('paging demo', () => {
  test('initial page, buttons, sizes, keyboard, methods, events, text, narrow layout, renderPager', async ({ page }) => {
    const problems = await open(page, 'paging');
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    const info = pager.locator('.salmon-data-grid-pager__info');
    await expect(info).toHaveText('3 of 100 pages (1,000 items)');
    await expect(cells(page, 'id').first()).toHaveText('ORD-10020');
    await expect(pager.locator('.salmon-data-grid-pager__number')).toHaveCount(5);
    // Keyboard on the page buttons.
    await pager.getByRole('button', { name: 'Page 3', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(pager.getByRole('button', { name: 'Page 4', exact: true })).toBeFocused();
    await expect(info).toHaveText(/^4 of 100 pages/);
    await page.keyboard.press('Home');
    await expect(info).toHaveText(/^1 of 100 pages/);
    await expect(log(page)).toContainText('pageChange (keyboard): page 3 → 4, size 10 → 10');
    // Page size dropdown keeps the first row (row 1 of page 1) and clamps.
    await pager.getByRole('combobox').selectOption('25');
    await expect(info).toHaveText(/^1 of 40 pages/);
    // Methods and getPageInfo.
    await page.getByRole('button', { name: 'Go to page 50' }).click();
    await expect(log(page)).toContainText('error (page)');
    await page.getByRole('button', { name: 'Read page info' }).click();
    await expect(page.getByText('page 1 of 40, 25 per page, 1000 rows')).toBeVisible();
    // Cancelable before-event.
    await page.getByLabel('Cancel moves to the last page').check();
    await pager.getByRole('button', { name: 'Last page' }).click();
    await expect(log(page)).toContainText('beforePageChange to 40: canceled');
    await expect(info).toHaveText(/^1 of 40 pages/);
    // localeText.
    await page.getByLabel('Custom pager text').check();
    const named = page.getByRole('navigation', { name: 'Order pages' });
    await expect(named.locator('.salmon-data-grid-pager__info')).toHaveText('Page 1 of 40 · 1,000 orders');
    // Narrow container: the other numbered buttons and the item count hide.
    await page.getByLabel('Narrow container (420 px)').check();
    await expect(named.locator('.salmon-data-grid-pager__number:not([aria-current="page"])').first()).toBeHidden();
    await expect(named.locator('.salmon-data-grid-pager__number[aria-current="page"]')).toBeVisible();
    // renderPager.
    await page.getByLabel('Custom pager (renderPager)').check();
    // renderPager is reactive: the pager switches at once and the page and page size stay.
    const compact = page.getByTestId('compact-pager');
    await expect(compact.getByTestId('compact-pager-info')).toHaveText('1 / 40 (1000 rows, 25 per page)');
    await compact.getByRole('button', { name: 'Next ›' }).click();
    await expect(compact.getByTestId('compact-pager-info')).toHaveText('2 / 40 (1000 rows, 25 per page)');
    await expect(cells(page, 'id').first()).toHaveText('ORD-10025');
    // And back to the built-in pager without a page change.
    await page.getByLabel('Custom pager (renderPager)').uncheck();
    await expect(compact).toHaveCount(0);
    await expect(named.locator('.salmon-data-grid-pager__info')).toHaveText('Page 2 of 40 · 1,000 orders');
    expect(problems).toEqual([]);
  });
});

test.describe('cursor paging demo', () => {
  test('the next page request carries the cursor of the previous response', async ({ page }) => {
    const problems = await open(page, 'cursor-paging');
    await expect(log(page)).toContainText('page {"cursor":null,"limit":25} → next "');
    const first = await cells(page, 'id').first().innerText();
    await page.getByRole('navigation', { name: 'Pagination' }).getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(log(page).locator('li').first()).toContainText('page {"cursor":"');
    await expect(cells(page, 'id').first()).not.toHaveText(first);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Grouping, lazy grouping, aggregates
// ---------------------------------------------------------------------------

test.describe('paged groups demo', () => {
  test('pages count data rows; aggregateScope switches page-wise and whole aggregates', async ({ page }) => {
    const problems = await open(page, 'paged-groups');
    const footer = page.getByTestId('amount-footer');
    await expect(footer).toContainText('25 orders');
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('1 of 16 pages (400 items)');
    await expect(grid(page).locator('.salmon-data-grid-group-caption').first()).toBeVisible();
    const pageOne = await footer.innerText();
    await pager.getByRole('button', { name: 'Page 2', exact: true }).click();
    await expect(footer).not.toHaveText(pageOne);
    await expect(footer).toContainText('25 orders');
    await page.getByLabel('Aggregate every row').check();
    await expect(footer).toContainText('400 orders');
    const whole = await footer.innerText();
    await pager.getByRole('button', { name: 'Page 3', exact: true }).click();
    await expect(footer).toHaveText(whole);
    expect(problems).toEqual([]);
  });
});

test.describe('grouping demo', () => {
  test('a custom groupKey buckets rows and the caption shows the formatted key', async ({ page }) => {
    const problems = await open(page, 'grouping');
    await page.getByRole('button', { name: 'Group by amount band (custom key)' }).click();
    const captions = grid(page).locator('.salmon-data-grid-rows [data-row-id^="__g:"]');
    await expect(captions.first()).toContainText('Amount band: $0');
    // The rows under the first band have amounts inside it.
    const amounts = (await texts(page, 'amount')).map((t) => Number(t.replace(/[$,]/g, ''))).filter((n) => !Number.isNaN(n));
    expect(amounts.length).toBeGreaterThan(0);
    expect(amounts.every((n) => n < 250)).toBe(true);
    // Collapsed, the bands list in key order with the key in the column format (C0).
    await page.getByRole('button', { name: 'Collapse all' }).click();
    await expect(captions.nth(1)).toContainText('Amount band: $250');
    await expect(captions.nth(2)).toContainText('Amount band: $500');
    expect(problems).toEqual([]);
  });
});

test.describe('lazy grouping demo', () => {
  test('a large group shows Load more and appends chunks; paging pages the countries in the root request', async ({ page }) => {
    const problems = await open(page, 'lazy-grouping');
    const captions = grid(page).locator('.salmon-data-grid-group-caption[data-depth="0"]');
    await expect(captions.first()).toBeVisible();
    // Expand the first country, then its first city: 50 children load, and more exist.
    await captions.first().locator('button[aria-label^="Expand"]').click();
    const city = grid(page).locator('.salmon-data-grid-group-caption[data-depth="1"]').first();
    await expect(city).toBeVisible();
    await city.locator('button[aria-label^="Expand"]').click();
    const more = city.getByRole('button', { name: 'Load more' });
    await expect(more).toBeVisible();
    const before = await rowCount(page);
    await more.click();
    await expect.poll(() => rowCount(page)).toBe(before + 50);
    // Paging: the root request carries the group path and the page; the pager counts countries.
    await page.getByLabel('Page the countries (3 per page)').check();
    await expect(log(page)).toContainText('group [] page {"offset":0,"limit":3}');
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pager).toBeVisible();
    await expect(captions).toHaveCount(3);
    const first = await captions.first().innerText();
    await pager.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(log(page)).toContainText('group [] page {"offset":3,"limit":3}');
    await expect(captions.first()).not.toHaveText(first);
    expect(problems).toEqual([]);
  });
});

test.describe('grouping with column virtualization demo', () => {
  test('indent, captions and pinned column stay while the center scrolls', async ({ page }) => {
    const problems = await open(page, 'grouping-wide');
    const caption = grid(page).locator('.salmon-data-grid-group-caption').first();
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'true');
    const dataRow = grid(page).locator('.salmon-data-grid-rows .salmon-data-grid-row:not(.salmon-data-grid-group-caption)').first();
    const indentX = async () => (await dataRow.locator('.salmon-data-grid-indent').boundingBox())?.x;
    const pinX = async () => (await dataRow.locator('.salmon-data-grid-pin--left').boundingBox())?.x;
    const captionX = async () => (await caption.locator('.salmon-data-grid-group-caption__text').boundingBox())?.x;
    const before = [await indentX(), await pinX(), await captionX()];
    await expect(grid(page).locator('.salmon-data-grid-header-cell[data-column-id="n70"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Scroll to column 70' }).click();
    await expect(grid(page).locator('.salmon-data-grid-header-cell[data-column-id="n70"]')).toBeVisible();
    await expect(grid(page).locator('.salmon-data-grid-header-cell[data-column-id="n1"]')).toHaveCount(0);
    expect([await indentX(), await pinX(), await captionX()]).toEqual(before);
    expect(problems).toEqual([]);
  });
});
