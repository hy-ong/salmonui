import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Globalization React layer in the browser: the localeText catalog and a runtime
// locale switch, right-to-left pager keys,
// persistState with localStorage and the state API, and the
// "Locale switch" and "State restore" budgets on the
// production build of the 100k x 100 fixture.

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const SMALL = `${DEV_URL}?rows=2000&cols=10`;
const LARGE = `${PROD_URL}?rows=100000&cols=100`;
const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);

/** Runs `action` in the page and resolves with the time until the next frame has painted (ms). */
async function toPainted(page: Page, action: string): Promise<number> {
  return page.evaluate(
    (code) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const t0 = performance.now();
          new Function(code)();
          requestAnimationFrame(() => {
            const ch = new MessageChannel();
            ch.port1.onmessage = () => resolve(performance.now() - t0);
            ch.port2.postMessage(0);
          });
        });
      }),
    action,
  );
}

test.describe('localization', () => {
  test('the German catalog labels the pager and menus; a locale switch re-renders formats in place', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&l10n&qpage=50&chrome`);
    const pager = page.getByRole('navigation', { name: 'Seitennavigation' });
    await expect(pager).toBeVisible();
    // Catalog numbers use the grid locale (en-US until the switch below).
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('1 von 40 Seiten (2,000 Elemente)');
    await expect(pager.getByRole('button', { name: 'Nächste Seite', exact: true })).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'Tabellen-Symbolleiste' })).toBeVisible();
    await expect(header(page, 's1').getByRole('button', { name: /^Spaltenmenü / })).toHaveCount(1);
    const number = page.locator('.salmon-data-grid-rows [role="row"]').first().locator('[data-column-id="n4"]');
    const english = await number.textContent();
    await page.evaluate(() => (window as unknown as { __setExtra(p: object): void }).__setExtra({ locale: 'de-DE' }));
    await expect(number).not.toHaveText(english ?? '');
    // The engine kept its state (the grid was not remounted); the count follows the new locale.
    await expect(pager.locator('.salmon-data-grid-pager__info')).toHaveText('1 von 40 Seiten (2.000 Elemente)');
    expect(problems).toEqual([]);
  });

  test('right-to-left pager: ArrowLeft goes forward, ArrowRight back', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qpage=50&gridDir=rtl`);
    await expect(page.locator('.salmon-data-grid')).toHaveAttribute('dir', 'rtl');
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    await pager.getByRole('button', { name: 'Page 1', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(pager.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(pager.getByRole('button', { name: 'Page 2', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(pager.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('PageDown');
    await expect(pager.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(problems).toEqual([]);
  });

  test("dir='auto' with an Arabic locale renders right-to-left", async ({ page }) => {
    await openGrid(page, `${SMALL}&locale=ar-EG&gridDir=auto`);
    await expect(page.locator('.salmon-data-grid')).toHaveAttribute('dir', 'rtl');
  });

  test('gate: locale switch to painted on 100k x 100', { tag: '@perf' }, async ({ page }) => {
    await openGrid(page, LARGE);
    const samples: number[] = [];
    for (const locale of ['de-DE', 'fr-FR', 'en-US', 'de-DE', 'ja-JP']) {
      samples.push(await toPainted(page, `window.__setExtra({ locale: ${JSON.stringify(locale)} })`));
    }
    const median = [...samples].sort((a, b) => a - b)[2] as number;
    console.log(`locale switch to painted: median ${median.toFixed(1)} ms, samples ${samples.map((s) => s.toFixed(1)).join(', ')}`);
    expectBudget(median, 100, 'locale switch to painted median');
  });
});

test.describe('persistState and the state API', () => {
  test('sort, width, and page survive a reload; resetState drops the stored entry', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&persist&qsort&qpage=50`);
    await page.evaluate(() => localStorage.removeItem('salmon-data-grid:spa'));
    await header(page, 's1').click();
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'ascending');
    await page.evaluate(() => {
      window.__gridApi.setColumnWidth('s2', 260);
      window.__gridApi.pinColumn('s3', 'start');
      window.__gridApi.goToPage(3);
    });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('salmon-data-grid:spa'))).toContain('"pinning"');
    await page.reload();
    await page.waitForFunction(() => window.__mountMs !== undefined && window.__gridApi);
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.getByRole('navigation', { name: 'Pagination' }).getByRole('button', { name: 'Page 3', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(header(page, 's3')).toHaveAttribute('data-frozen', 'left');
    const state = await page.evaluate(() => window.__gridApi.getState({ exclude: ['scroll', 'selection'] }));
    expect(state.sorting).toEqual([{ field: 's1', direction: 'asc' }]);
    expect(state.columns.find((c: { id: string }) => c.id === 's2').width).toBe(260);
    expect(state.pinning.columns).toEqual({ s3: 'start' });
    const reset = await page.evaluate(() => window.__gridApi.resetState().status);
    expect(reset).toBe('applied');
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'none');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('salmon-data-grid:spa'))).toBeNull();
    expect(problems).toEqual([]);
  });

  test('gate: restoreState to painted on 100k x 100', { tag: '@perf' }, async ({ page }) => {
    await openGrid(page, `${LARGE}&qsort&qfilter=menu`);
    const state = {
      version: 1,
      columns: [{ id: 'n4', field: 'n4', hidden: false, width: 180 }, { id: 's1', field: 's1', hidden: false }, { id: 's2', field: 's2', hidden: true }],
      pinning: { start: 1, end: 0, columns: { d7: 'end' } },
      sorting: [{ field: 'n5', direction: 'desc' }],
      filters: [{ field: 's1', operator: 'contains', value: 'word-1', logic: 'and' }],
    };
    const ms = await toPainted(page, `window.__restoreResult = window.__gridApi.restoreState(${JSON.stringify(state)})`);
    console.log(`restoreState to painted: ${ms.toFixed(1)} ms`);
    expect(await page.evaluate(() => (window as unknown as { __restoreResult: { status: string } }).__restoreResult.status)).toBe('applied');
    await expect(header(page, 'n5')).toHaveAttribute('aria-sort', 'descending');
    expectBudget(ms, 300, 'restoreState to painted');
  });
});

// Date picker editor: the WAI-ARIA APG date picker dialog
// with Intl weekday names and the locale's first day of week.
test.describe('date picker', () => {
  const dateCell = (page: Page, rowId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="d7"]`);
  const picker = (page: Page) => page.getByRole('dialog', { name: 'Choose a date' });
  const focusedDay = (page: Page) => page.locator('.salmon-data-grid-date-picker__day:focus');
  const iso = (page: Page, rowId: string) =>
    page.evaluate((r) => {
      const v = (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.['d7'];
      return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    }, rowId);
  const addDays = (isoDay: string, n: number) => new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  test('en-US: Sunday first; arrows, Home/End, PageUp/PageDown, Escape, Enter choose and return focus', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&edit=row`);
    const before = await iso(page, 'r1');
    await dateCell(page, 'r1').dblclick();
    const input = dateCell(page, 'r1').locator('input');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('placeholder', 'mm/dd/yyyy');
    const [y, m, d] = before.split('-');
    await expect(input).toHaveValue(`${m}/${d}/${y}`);
    const button = dateCell(page, 'r1').getByRole('button', { name: 'Choose a date' });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(picker(page)).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const headers = picker(page).getByRole('columnheader');
    await expect(headers).toHaveCount(7);
    await expect(headers.first()).toHaveAttribute('abbr', 'Sunday');
    await expect(headers.first()).toHaveText('Sun');
    // Focus starts on the draft day, which is selected.
    await expect(focusedDay(page)).toHaveAttribute('aria-selected', 'true');
    const start = Number(await focusedDay(page).getAttribute('data-day'));
    await page.keyboard.press('ArrowRight');
    await expect(focusedDay(page)).toHaveAttribute('data-day', String(start + 1));
    await page.keyboard.press('ArrowDown');
    await expect(focusedDay(page)).toHaveAttribute('data-day', String(start + 8));
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    await expect(focusedDay(page)).toHaveAttribute('data-day', String(start));
    await page.keyboard.press('Home');
    // Home: the first column (Sunday) of the focused week.
    expect(await focusedDay(page).evaluate((el) => (el as HTMLTableCellElement).cellIndex)).toBe(0);
    await page.keyboard.press('End');
    expect(await focusedDay(page).evaluate((el) => (el as HTMLTableCellElement).cellIndex)).toBe(6);
    const heading = picker(page).getByRole('heading');
    const month = await heading.textContent();
    await page.keyboard.press('PageDown');
    await expect(heading).not.toHaveText(month ?? '');
    await page.keyboard.press('PageUp');
    await expect(heading).toHaveText(month ?? '');
    // Escape closes the picker only: focus returns to the input, the row stays in edit.
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);
    await expect(input).toBeFocused();
    await expect(page.locator('[data-row-id="r1"]').first()).toHaveAttribute('data-editing', '');
    // Choose the next day with the keyboard; Enter in the input then saves the row.
    await page.keyboard.press('Alt+ArrowDown');
    await expect(focusedDay(page)).toHaveAttribute('data-day', String(start));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(picker(page)).toHaveCount(0);
    await expect(input).toBeFocused();
    const next = addDays(before, 1);
    const [ny, nm, nd] = next.split('-');
    await expect(input).toHaveValue(`${nm}/${nd}/${ny}`);
    await page.keyboard.press('Enter');
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    expect(await iso(page, 'r1')).toBe(next);
    expect(problems).toEqual([]);
  });

  test('de-DE: Monday first, German names, typed dd.mm.yyyy; axe on the open dialog', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=row&locale=de-DE&l10n`);
    await dateCell(page, 'r2').dblclick();
    const input = dateCell(page, 'r2').locator('input');
    await expect(input).toHaveAttribute('placeholder', 'dd.mm.yyyy');
    await input.fill('24.12.2026');
    await page.keyboard.press('Alt+ArrowDown');
    const dialog = page.getByRole('dialog', { name: 'Datum auswählen' });
    await expect(dialog).toBeVisible();
    const headers = dialog.getByRole('columnheader');
    await expect(headers.first()).toHaveAttribute('abbr', 'Montag');
    await expect(headers.last()).toHaveAttribute('abbr', 'Sonntag');
    await expect(dialog.getByRole('heading')).toHaveText('Dezember 2026');
    await expect(focusedDay(page)).toHaveAttribute('aria-label', 'Donnerstag, 24. Dezember 2026');
    await expect(dialog.getByRole('button', { name: 'Nächster Monat' })).toBeVisible();
    if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => {
      const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
      const result = await axeApi.run({ include: [['[data-salmon-popover]']] }, { resultTypes: ['violations'] });
      return result.violations.map((v: any) => v.id);
    });
    expect(violations).toEqual([]);
    // A click on a day chooses it.
    await dialog.getByRole('gridcell', { name: 'Montag, 28. Dezember 2026' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(input).toHaveValue('28.12.2026');
    await page.keyboard.press('Enter');
    expect(await iso(page, 'r2')).toBe('2026-12-28');
  });

  test('right-to-left: ArrowLeft moves to the next day', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=row&gridDir=rtl`);
    await dateCell(page, 'r1').dblclick();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(picker(page)).toHaveAttribute('dir', 'rtl');
    const start = Number(await focusedDay(page).getAttribute('data-day'));
    await page.keyboard.press('ArrowLeft');
    await expect(focusedDay(page)).toHaveAttribute('data-day', String(start + 1));
    await page.keyboard.press('ArrowRight');
    await expect(focusedDay(page)).toHaveAttribute('data-day', String(start));
  });

  test('dialog form: the picker opens inside the edit dialog; Escape closes the picker, not the form', async ({ page }) => {
    await openGrid(page, `${SMALL}&edit=dialog`);
    await page.locator('.salmon-data-grid [data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s1"]').click();
    await page.keyboard.press('F2');
    const form = page.locator('dialog.salmon-data-grid-edit-dialog');
    await expect(form).toBeVisible();
    const button = form.getByRole('button', { name: 'Choose a date' }).first();
    await button.click();
    await expect(form.getByRole('dialog', { name: 'Choose a date' })).toBeVisible();
    await expect(focusedDay(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);
    await expect(form).toBeVisible();
    await expect(form.locator('.salmon-data-grid-date input').first()).toBeFocused();
  });

  test('datetime: the same calendar plus a time input; typed 12-hour text parses', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=50&cols=10&edit=row`);
    await page.evaluate(() => (window as unknown as { __setExtra(p: object): void }).__setExtra({ columns: [{ field: 'id', header: 'Id', editable: false }, { field: 'd7', header: 'When', type: 'datetime', width: 260 }] }));
    await dateCell(page, 'r1').dblclick();
    const input = dateCell(page, 'r1').locator('input');
    await expect(input).toHaveAttribute('placeholder', 'mm/dd/yyyy hh:mm');
    await input.fill('03/15/2026 2:45 pm');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(focusedDay(page)).toHaveAttribute('aria-label', 'Sunday, March 15, 2026');
    const time = picker(page).getByLabel('Time');
    await expect(time).toHaveValue('14:45');
    await time.fill('09:30');
    await expect(input).toHaveValue('03/15/2026 09:30');
    await picker(page).getByRole('gridcell', { name: 'Monday, March 16, 2026' }).click();
    await expect(input).toHaveValue('03/16/2026 09:30');
    await page.keyboard.press('Enter');
    // The app grid is timeZone="UTC": wall time is UTC.
    expect(await page.evaluate(() => ((window.__gridApi.getRowInfo('r1')?.row as Record<string, unknown>)['d7'] as Date).toISOString())).toBe('2026-03-16T09:30:00.000Z');
  });
});
