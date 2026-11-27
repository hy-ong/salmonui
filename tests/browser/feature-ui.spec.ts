import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// Mounted-grid checks for features without other browser coverage:
// filter menu / Excel wildcards, filter row debounce, the
// checklist without infinite scroll, the pager part element,
// URL paging with a custom parameter, grouped column
// visibility, chip drag reorder, the chip remove button,
// caption templates, the sticky footer, lazy group
// loading and retry, `colorScheme: 'auto'` and conditional
// row heights.

const SMALL = `${DEV_URL}?rows=2000&cols=10`;
const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const viewValues = (page: Page, field: string) => page.evaluate((f) => (window.__gridApi.getViewRows() as Record<string, unknown>[]).map((r) => r[f]), field);
const filters = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__gridApi.engine.getSnapshot().query.filters)) as { columnId: string; operator: string; value: unknown; predicate?: string }[]);
/** Merges props into the mounted grid; `patch` is an object literal evaluated in the page (functions allowed). */
const setExtra = (page: Page, patch: string) => page.evaluate((p) => (window as unknown as { __setExtra(x: unknown): void }).__setExtra(new Function(`return (${p});`)()), patch);
const chipOrder = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-group-chip')].map((c) => c.dataset['columnId']));
const grouping = (page: Page) => page.evaluate(() => (window.__gridApi.engine.getSnapshot().query.grouping as { columnId: string }[]).map((g) => g.columnId));

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

test.describe('filter wildcards in the menu and the Excel custom filter', () => {
  test('menu: like with * and % filters by the pattern', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qfilter=menu`);
    await header(page, 's1').locator('.salmon-data-grid-filter-button').click();
    let dialog = page.getByRole('dialog', { name: 'Filter Text 1' });
    await dialog.getByRole('combobox', { name: 'Operator' }).selectOption('like');
    await dialog.getByRole('textbox', { name: 'Value' }).fill('word-1*');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await viewValues(page, 's1')).every((v) => String(v).startsWith('word-1'))).toBe(true);
    expect((await viewValues(page, 's1')).length).toBeGreaterThan(0);
    expect((await viewValues(page, 's1')).length).toBeLessThan(2000);
    expect(await filters(page)).toEqual([expect.objectContaining({ columnId: 's1', operator: 'like', value: 'word-1*' })]);
    // `%` is the same wildcard: `%7` ends with 7.
    await header(page, 's1').locator('.salmon-data-grid-filter-button').click();
    dialog = page.getByRole('dialog', { name: 'Filter Text 1' });
    await expect(dialog.getByRole('combobox', { name: 'Operator' })).toHaveValue('like');
    await dialog.getByRole('textbox', { name: 'Value' }).fill('%7');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await viewValues(page, 's1')).every((v) => String(v).endsWith('7'))).toBe(true);
    expect((await viewValues(page, 's1')).length).toBeGreaterThan(0);
    expect(await filters(page)).toEqual([expect.objectContaining({ columnId: 's1', operator: 'like', value: '%7' })]);
    expect(problems).toEqual([]);
  });

  test('excel custom filter: like word-1* OR like %7', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qfilter=excel`);
    await header(page, 's1').locator('.salmon-data-grid-filter-button').click();
    const dialog = page.getByRole('dialog', { name: 'Filter Text 1' });
    await dialog.locator('summary').click();
    await dialog.getByRole('combobox', { name: 'Operator', exact: true }).selectOption('like');
    await dialog.getByRole('textbox', { name: 'Value', exact: true }).fill('word-1*');
    await dialog.getByRole('radio', { name: 'Or' }).check();
    await dialog.getByRole('combobox', { name: 'Operator 2' }).selectOption('like');
    await dialog.getByRole('textbox', { name: 'Value 2' }).fill('%7');
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect.poll(async () => (await viewValues(page, 's1')).every((v) => String(v).startsWith('word-1') || String(v).endsWith('7'))).toBe(true);
    const values = (await viewValues(page, 's1')).map(String);
    expect(values.some((v) => v.startsWith('word-1') && !v.endsWith('7'))).toBe(true);
    expect(values.some((v) => !v.startsWith('word-1') && v.endsWith('7'))).toBe(true);
    expect(await filters(page)).toEqual([
      expect.objectContaining({ columnId: 's1', operator: 'like', value: 'word-1*' }),
      expect.objectContaining({ columnId: 's1', operator: 'like', value: '%7', predicate: 'or' }),
    ]);
    expect(problems).toEqual([]);
  });
});

/** Types `text` into the filter row input with a per-key delay; returns when the last key is in. */
async function typeAndMeasure(page: Page, debounce: number | null): Promise<{ applies: number[]; lastInput: number; firstInput: number }> {
  const patch = debounce === null ? `{ filtering: { ui: 'row', trigger: 'input' } }` : `{ filtering: { ui: 'row', trigger: 'input', debounce: ${debounce} } }`;
  await setExtra(page, patch.replace(/ }$/, `, onFilterChange: () => window.__applies.push(performance.now()) }`));
  const input = page.getByRole('textbox', { name: 'Filter Text 1' });
  await input.evaluate((el) => {
    const w = window as unknown as { __applies: number[]; __inputs: number[] };
    w.__inputs = [];
    el.addEventListener('input', () => w.__inputs.push(performance.now()));
  });
  await input.pressSequentially('word-1', { delay: 60 });
  const wait = (debounce ?? 1500) + 600;
  await expect.poll(() => page.evaluate(() => (window as unknown as { __applies: number[] }).__applies.length), { timeout: wait + 5000 }).toBe(1);
  // Nothing else applies afterwards.
  await page.waitForTimeout(wait);
  return page.evaluate(() => {
    const w = window as unknown as { __applies: number[]; __inputs: number[] };
    return { applies: [...w.__applies], lastInput: w.__inputs[w.__inputs.length - 1] as number, firstInput: w.__inputs[0] as number };
  });
}

test.describe('filter row debounce', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => ((window as unknown as { __applies: number[] }).__applies = []));
  });

  test('trigger input: no filter before `debounce` ms after the last key, exactly one apply after it', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qfilter=row`);
    const r = await typeAndMeasure(page, 400);
    expect(r.applies).toHaveLength(1);
    // The keys came faster than the delay (each one restarts it), and the apply waited the full delay after the last key.
    expect(r.lastInput - r.firstInput).toBeGreaterThan(0);
    expect((r.applies[0] as number) - r.lastInput).toBeGreaterThanOrEqual(395);
    expect(await filters(page)).toEqual([expect.objectContaining({ columnId: 's1', operator: 'contains', value: 'word-1' })]);
    expect((await viewValues(page, 's1')).every((v) => String(v).includes('word-1'))).toBe(true);
    expect(problems).toEqual([]);
  });

  test('trigger input without debounce waits the 1500 ms default', async ({ page }) => {
    await openGrid(page, `${SMALL}&qfilter=row`);
    const r = await typeAndMeasure(page, null);
    expect(r.applies).toHaveLength(1);
    expect((r.applies[0] as number) - r.lastInput).toBeGreaterThanOrEqual(1495);
    expect(await filters(page)).toEqual([expect.objectContaining({ columnId: 's1', value: 'word-1' })]);
  });
});

test.describe('checklist without infinite scroll', () => {
  test('checklistInfiniteScroll: false requests every value at once', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=20000&cols=10&qfilter=excel`);
    const list = page.locator('[data-salmon-popover] .salmon-data-grid-facet-list');
    // Default: one page of 100.
    await header(page, 'n4').locator('.salmon-data-grid-filter-button').click();
    await expect(list).toBeVisible();
    expect(Number(await list.getAttribute('data-count'))).toBe(100);
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await setExtra(page, `{ filtering: { ui: 'excel', checklistInfiniteScroll: false } }`);
    await header(page, 'n4').locator('.salmon-data-grid-filter-button').click();
    await expect(list).toBeVisible();
    const total = Number(await list.getAttribute('data-total'));
    expect(total).toBeGreaterThan(5000);
    expect(Number(await list.getAttribute('data-count'))).toBe(total);
    // Scrolling to the end asks for nothing more: everything is loaded.
    await list.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(200);
    expect(Number(await list.getAttribute('data-count'))).toBe(total);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

test.describe('pager element and URL paging', () => {
  test("api.getPartElement('pager') returns the rendered pager; null without paging", async ({ page }) => {
    await openGrid(page, `${SMALL}&qpage=50`);
    const same = await page.evaluate(() => {
      const el = window.__gridApi.getPartElement('pager') as HTMLElement | null;
      return { same: el !== null && el === document.querySelector('.salmon-data-grid-pager'), role: el?.getAttribute('role') ?? null, label: el?.getAttribute('aria-label') ?? null };
    });
    expect(same).toEqual({ same: true, role: 'navigation', label: 'Pagination' });
    await openGrid(page, SMALL);
    expect(await page.evaluate(() => window.__gridApi.getPartElement('pager'))).toBeNull();
  });

  test('paging.syncUrl { param: "p" }: reads ?p= after mount without page events, writes with replaceState', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qpage=50&qsyncUrl=p&qevents&p=3`);
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('3 of 40 pages (2,000 items)');
    await expect(page.locator('.salmon-data-grid-rows [role="row"]').first()).toHaveAttribute('data-row-id', 'r100');
    const pageEvents = () => page.evaluate(() => (window as unknown as { __queryEvents: { type: string }[] }).__queryEvents.filter((e) => /pagechange/i.test(e.type)));
    // The initial URL read is prop state: no page events.
    expect(await pageEvents()).toEqual([]);
    const historyLength = await page.evaluate(() => history.length);
    await pager.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect.poll(() => page.evaluate(() => new URL(location.href).searchParams.get('p'))).toBe('4');
    // The default `page` parameter is not used; other parameters are kept; no history entry is added.
    expect(await page.evaluate(() => new URL(location.href).searchParams.has('page'))).toBe(false);
    expect(await page.evaluate(() => new URL(location.href).searchParams.get('qpage'))).toBe('50');
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect((await pageEvents()).map((e) => e.type)).toEqual(['beforePageChange', 'pageChange']);
    await pager.getByRole('button', { name: 'Page 1', exact: true }).click();
    await expect.poll(() => page.evaluate(() => new URL(location.href).searchParams.has('p'))).toBe(false);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

test.describe('grouping options on a mounted grid', () => {
  const s1Cells = (page: Page) => page.locator('.salmon-data-grid-rows .salmon-data-grid-row:not(.salmon-data-grid-group-caption) .salmon-data-grid-cell[data-column-id="s1"]');

  test('showGroupedColumns false (default): grouping hides the grouped column header and cells', async ({ page }) => {
    const problems = collectProblems(page);
    // The example sets showGroupedColumns: true; the override drops it (default false).
    await openGrid(page, `${SMALL}&group=`);
    await setExtra(page, `{ grouping: { groupBy: [] } }`);
    await expect(header(page, 's1')).toHaveCount(1);
    expect(await s1Cells(page).count()).toBeGreaterThan(0);
    await page.evaluate(() => window.__gridApi.groupColumn('s1'));
    await expect(page.locator('.salmon-data-grid-group-caption').first()).toBeVisible();
    await expect(header(page, 's1')).toHaveCount(0);
    await expect(s1Cells(page)).toHaveCount(0);
    await expect(header(page, 's2')).toHaveCount(1);
    // Ungrouping shows the column again.
    await page.evaluate(() => window.__gridApi.ungroupColumn('s1'));
    await expect(header(page, 's1')).toHaveCount(1);
    expect(await s1Cells(page).count()).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  test('showGroupedColumns true keeps the grouped column header and cells', async ({ page }) => {
    // The example sets showGroupedColumns: true.
    await openGrid(page, `${SMALL}&group=`);
    await page.evaluate(() => window.__gridApi.groupColumn('s1'));
    await expect(page.locator('.salmon-data-grid-group-caption').first()).toBeVisible();
    await expect(header(page, 's1')).toHaveCount(1);
    expect(await s1Cells(page).count()).toBeGreaterThan(0);
  });

  async function dragChip(page: Page, from: string, before: string): Promise<void> {
    const chip = (await page.locator(`.salmon-data-grid-group-chip[data-column-id="${from}"]`).boundingBox())!;
    const target = (await page.locator(`.salmon-data-grid-group-chip[data-column-id="${before}"]`).boundingBox())!;
    await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
    await page.mouse.down();
    await page.mouse.move(chip.x + chip.width / 2 - 10, chip.y + chip.height / 2, { steps: 3 });
    await page.mouse.move(target.x + 4, target.y + target.height / 2, { steps: 6 });
    await page.mouse.up();
  }

  test('reorderable: true moves a chip by pointer drag', async ({ page }) => {
    const problems = collectProblems(page);
    // The example sets reorderable: true.
    await openGrid(page, `${SMALL}&group=s0,s1`);
    expect(await chipOrder(page)).toEqual(['s0', 's1']);
    await dragChip(page, 's1', 's0');
    await expect.poll(() => chipOrder(page)).toEqual(['s1', 's0']);
    expect(await grouping(page)).toEqual(['s1', 's0']);
    // The top-level captions are now s1 groups.
    const firstCaption = await page.locator('.salmon-data-grid-group-caption[data-depth="0"] .salmon-data-grid-group-caption__label').first().innerText();
    expect(firstCaption.startsWith('Text 1')).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __groupEvents: { type: string; action?: string }[] }).__groupEvents)).toContainEqual(expect.objectContaining({ type: 'change', action: 'move', field: 's1', groupBy: ['s1', 's0'] }));
    expect(problems).toEqual([]);
  });

  test('reorderable: false blocks chip drag and Alt+Arrow reorder', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&group=s0,s1`);
    await setExtra(page, `{ grouping: { groupBy: ['s0', 's1'], reorderable: false } }`);
    await dragChip(page, 's1', 's0');
    await page.waitForTimeout(200);
    expect(await chipOrder(page)).toEqual(['s0', 's1']);
    await page.locator('.salmon-data-grid-group-chip[data-column-id="s1"] .salmon-data-grid-group-chip__label').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await page.waitForTimeout(100);
    expect(await chipOrder(page)).toEqual(['s0', 's1']);
    expect(await grouping(page)).toEqual(['s0', 's1']);
    expect(problems).toEqual([]);
  });

  test('showRemoveButton: false hides the chip remove button and Delete does not ungroup', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&group=s0`);
    await expect(page.locator('.salmon-data-grid-group-chip__remove')).toHaveCount(1);
    await setExtra(page, `{ grouping: { groupBy: ['s0'], showRemoveButton: false } }`);
    await expect(page.locator('.salmon-data-grid-group-chip__remove')).toHaveCount(0);
    await expect(page.locator('.salmon-data-grid-group-chip')).toHaveCount(1);
    await page.locator('.salmon-data-grid-group-chip[data-column-id="s0"] .salmon-data-grid-group-chip__label').focus();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);
    await expect(page.locator('.salmon-data-grid-group-chip')).toHaveCount(1);
    expect(await grouping(page)).toEqual(['s0']);
    await expect(page.locator('.salmon-data-grid-group-caption').first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('renderCaption(ctx) renders the caption; ctx.expanded follows the toggle', async ({ page }) => {
    const problems = collectProblems(page);
    // 12 rows: both captions and their rows are rendered.
    await openGrid(page, `${DEV_URL}?rows=12&cols=10&group=b9`);
    await setExtra(
      page,
      "{ grouping: { groupBy: ['b9'], renderCaption: (ctx) => `${ctx.header}=${ctx.formattedKey}|${ctx.field}|${ctx.count}|${ctx.rows().length}|${ctx.expanded ? 'open' : 'closed'}` } }",
    );
    const captions = page.locator('.salmon-data-grid-group-caption');
    await expect(captions).toHaveCount(2);
    const text = (i: number) => captions.nth(i).locator('.salmon-data-grid-group-caption__text');
    await expect(text(0)).toHaveText(/^Flag 9=(true|false)\|b9\|\d+\|\d+\|open$/);
    // The built-in label is replaced.
    await expect(captions.first().locator('.salmon-data-grid-group-caption__label')).toHaveCount(0);
    const parts = (await text(0).innerText()).split('|');
    expect(parts[2]).toBe(parts[3]);
    const counts = (await Promise.all([0, 1].map(async (i) => Number((await text(i).innerText()).split('|')[2])))).reduce((a, b) => a + b, 0);
    expect(counts).toBe(12);
    await captions.first().locator('.salmon-data-grid-group-toggle').click();
    await expect(text(0)).toHaveText(/\|closed$/);
    await expect(text(1)).toHaveText(/\|open$/);
    await captions.first().locator('.salmon-data-grid-group-toggle').click();
    await expect(text(0)).toHaveText(/\|open$/);
    expect(problems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

test.describe('sticky footer', () => {
  for (const [name, query] of [
    ['without grouping', '&aggs'],
    ['grouped', '&group=s0&aggs'],
  ] as const) {
    test(`the footer stays pinned to the bottom of the scroll container while the body scrolls, ${name}`, async ({ page }) => {
      const problems = collectProblems(page);
      await openGrid(page, `${SMALL}${query}`);
      const measure = () =>
        page.evaluate(() => {
          const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
          const footer = document.querySelector('.salmon-data-grid-footer') as HTMLElement;
          const r = vp.getBoundingClientRect();
          const f = footer.getBoundingClientRect();
          return { gap: r.top + vp.clientTop + vp.clientHeight - f.bottom, height: f.height, scrollTop: vp.scrollTop, scrollable: vp.scrollHeight - vp.clientHeight, text: footer.innerText };
        });
      const before = await measure();
      expect(before.height).toBeGreaterThan(0);
      expect(before.scrollable).toBeGreaterThan(10_000);
      expect(Math.abs(before.gap)).toBeLessThanOrEqual(1);
      for (const top of [3000, before.scrollable / 2, before.scrollable]) {
        await scrollViewport(page, top, null);
        const now = await measure();
        expect(now.scrollTop).toBeGreaterThan(0);
        expect(Math.abs(now.gap)).toBeLessThanOrEqual(1);
        expect(now.height).toBe(before.height);
        expect(now.text).toBe(before.text);
      }
      expect(problems).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// Lazy load grouping
// ---------------------------------------------------------------------------

test.describe('lazy group loading indicator and retry', () => {
  test('a caption shows data-status loading while its children load, error with a Retry button that reloads', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=10&lazyGroups`);
    const captions = page.locator('.salmon-data-grid-group-caption');
    await expect(captions.first()).toBeVisible();
    const lazy = (code: string) => page.evaluate((c) => new Function('lazy', c)((window as unknown as { __lazyRemote: unknown }).__lazyRemote), code);
    const dataRows = page.locator('.salmon-data-grid-rows .salmon-data-grid-row:not(.salmon-data-grid-group-caption)');
    await expect(dataRows).toHaveCount(0);
    // Loading: the read is held.
    await lazy('lazy.hold = true;');
    const first = captions.nth(0);
    const firstId = (await first.getAttribute('data-row-id')) as string;
    await expect(first).toHaveAttribute('data-status', 'idle');
    await expect(first.locator('.salmon-data-grid-group-caption__status')).toHaveCount(0);
    expect(await page.evaluate((id) => window.__gridApi.getGroup(id).status, firstId)).toBe('idle');
    await first.locator('.salmon-data-grid-group-toggle').click();
    await expect(first).toHaveAttribute('data-status', 'loading');
    await expect(first.locator('.salmon-data-grid-group-caption__status[role="status"]')).toHaveText('Loading…');
    expect(await page.evaluate((id) => window.__gridApi.getGroup(id).status, firstId)).toBe('loading');
    await lazy('lazy.hold = false; lazy.release();');
    await expect(first).not.toHaveAttribute('data-status');
    await expect(first.locator('.salmon-data-grid-group-caption__status')).toHaveCount(0);
    expect(await page.evaluate((id) => window.__gridApi.getGroup(id).status, firstId)).toBe('ready');
    const firstCount = Number(await page.evaluate((id) => window.__gridApi.getGroup(id).count, firstId));
    await expect(dataRows).toHaveCount(firstCount);
    // Error: the read fails; the caption shows the message and a Retry button.
    await lazy('lazy.fail = true;');
    const second = captions.nth(firstCount + 1);
    const secondId = (await second.getAttribute('data-row-id')) as string;
    expect(secondId).not.toBe(firstId);
    await second.locator('.salmon-data-grid-group-toggle').click();
    await expect(second).toHaveAttribute('data-status', 'error');
    await expect(second.locator('.salmon-data-grid-group-caption__status[data-error]')).toContainText('Failed to load.');
    const retry = second.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    expect(await page.evaluate((id) => window.__gridApi.getGroup(id).status, secondId)).toBe('error');
    // Retry after the source recovers loads the children.
    await lazy('lazy.fail = false;');
    await retry.click();
    await expect(second).not.toHaveAttribute('data-status');
    await expect(retry).toHaveCount(0);
    expect(await page.evaluate((id) => window.__gridApi.getGroup(id).status, secondId)).toBe('ready');
    const secondCount = Number(await page.evaluate((id) => window.__gridApi.getGroup(id).count, secondId));
    await expect(dataRows).toHaveCount(firstCount + secondCount);
  });
});

// ---------------------------------------------------------------------------
// Theme and row heights
// ---------------------------------------------------------------------------

test.describe("colorScheme: 'auto'", () => {
  test("'auto' follows prefers-color-scheme; explicit schemes ignore it", async ({ page }) => {
    const problems = collectProblems(page);
    const read = () =>
      page.evaluate(() => {
        const grid = document.querySelector('.salmon-data-grid') as HTMLElement;
        const s = getComputedStyle(grid);
        return { primary: s.getPropertyValue('--salmon-color-primary').trim(), background: s.backgroundColor, scheme: s.colorScheme };
      });
    await page.emulateMedia({ colorScheme: 'light' });
    // The example starts with colorScheme 'auto'.
    await openGrid(page, `${DEV_URL}?rows=200&cols=10`);
    const scheme = page.getByLabel('Scheme');
    await expect(scheme).toHaveValue('auto');
    const autoLight = await read();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(async () => (await read()).primary).not.toBe(autoLight.primary);
    const autoDark = await read();
    expect(autoDark.background).not.toBe(autoLight.background);
    expect(autoDark.scheme).toContain('dark');
    // The explicit schemes give the same colors as 'auto' under the matching preference, whatever the media says.
    await scheme.selectOption('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await read()).toEqual(autoDark);
    await scheme.selectOption('light');
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await read()).toEqual(autoLight);
    // Back to auto under dark media: dark again.
    await scheme.selectOption('auto');
    expect(await read()).toEqual(autoDark);
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await read()).toEqual(autoLight);
    expect(problems).toEqual([]);
  });
});

test.describe('conditional getRowHeight', () => {
  test('rendered rows have their getRowHeight heights and offsets, before and after scrolling', async ({ page }) => {
    const problems = collectProblems(page);
    // ?rowHeights: rows with an index divisible by 3 are 64 px, the others 32 px.
    await openGrid(page, `${SMALL}&rowHeights`);
    const heightOf = (i: number) => (i % 3 === 0 ? 64 : 32);
    const offsetOf = (n: number) => 32 * n + 32 * Math.ceil(n / 3);
    const measure = () =>
      page.evaluate(() => {
        const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const body = document.querySelector('.salmon-data-grid-body') as HTMLElement;
        const bodyTop = body.getBoundingClientRect().top;
        const rows = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row[data-row-index]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { index: Number(el.dataset['rowIndex']), id: el.dataset['rowId'] as string, top: r.top - bodyTop, height: r.height };
        });
        const header = (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect();
        const probe = document.elementFromPoint(vp.getBoundingClientRect().left + 40, header.bottom + 1)?.closest<HTMLElement>('[data-row-index]');
        return { rows, bodyHeight: body.getBoundingClientRect().height, scrollTop: vp.scrollTop, topIndex: probe ? Number(probe.dataset['rowIndex']) : -1 };
      });
    const check = async () => {
      const m = await measure();
      expect(m.rows.length).toBeGreaterThan(5);
      for (const row of m.rows) {
        expect(row.id).toBe(`r${row.index}`);
        expect(row.height).toBeCloseTo(heightOf(row.index), 0);
        expect(row.top).toBeCloseTo(offsetOf(row.index), 0);
      }
      // The row under the top edge of the body is the one whose span covers scrollTop.
      expect(offsetOf(m.topIndex)).toBeLessThanOrEqual(m.scrollTop + 1);
      expect(offsetOf(m.topIndex) + heightOf(m.topIndex)).toBeGreaterThan(m.scrollTop);
      return m;
    };
    const start = await check();
    expect(start.bodyHeight).toBeCloseTo(offsetOf(2000), 0);
    expect(start.rows[0]?.index).toBe(0);
    for (const top of [10_001, 40_000, offsetOf(2000)]) {
      await scrollViewport(page, top, null);
      const m = await check();
      expect(m.rows[0]?.index).toBeGreaterThan(0);
    }
    expect(problems).toEqual([]);
  });
});
