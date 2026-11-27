import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// Row spans across virtualized rows, fixture flag `?rowSpan`:
// s2 spans three rows on every 6th row with row virtualization on (36 px rows).

const URL = `${DEV_URL}?rows=100000&cols=10&rowSpan`;

test.describe('row spans with row virtualization', () => {
  test('spans render deep in 100k rows, and a span cut by the window top is drawn from its first row', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, URL);
    // Near the top: row r0 spans rows 0..2.
    await expect(page.locator('.salmon-data-grid-row[data-row-id="r0"] .salmon-data-grid-cell[data-column-id="s2"]')).toHaveAttribute('aria-rowspan', '3');
    // Deep scroll: every rendered span start has aria-rowspan 3 or less (cut by the window end).
    await scrollViewport(page, 36 * 60_000, null);
    const info = await page.evaluate(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row')];
      const first = rows[0] as HTMLElement;
      const firstIndex = Number(first.dataset['rowIndex']);
      const spans = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="s2"][aria-rowspan]')];
      return { firstIndex, starts: spans.length, rowSpans: spans.map((s) => Number(s.getAttribute('aria-rowspan'))) };
    });
    expect(info.firstIndex).toBeGreaterThan(59_000);
    expect(info.starts).toBeGreaterThan(2);
    expect(Math.max(...info.rowSpans)).toBeLessThanOrEqual(3);
    // Put the window top in the middle of a span: first rendered row index % 6 === 1.
    const target = await page.evaluate(() => {
      const first = document.querySelector<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row') as HTMLElement;
      return Number(first.dataset['rowIndex']);
    });
    for (let shift = 1; shift <= 6; shift++) {
      const first = await page.evaluate(() => Number(document.querySelector<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row')?.dataset['rowIndex']));
      if (first % 6 === 1 || first % 6 === 2) break;
      await scrollViewport(page, 36 * (60_000 + shift), null);
    }
    const carried = await page.evaluate(() => {
      const first = document.querySelector<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row') as HTMLElement;
      const index = Number(first.dataset['rowIndex']);
      const cell = first.querySelector<HTMLElement>('.salmon-data-grid-cell[data-column-id="s2"]');
      const next = first.nextElementSibling?.querySelector<HTMLElement>('.salmon-data-grid-cell[data-column-id="s2"]');
      return {
        index,
        anchor: cell?.dataset['rowId'] ?? null,
        rowSpan: cell?.getAttribute('aria-rowspan') ?? null,
        // The carried cell's top is pulled up to its first row; its bottom ends at the span's last row.
        top: cell ? cell.getBoundingClientRect().top - first.getBoundingClientRect().top : null,
        height: cell?.getBoundingClientRect().height ?? null,
        nextIsSpacer: next === null || next === undefined,
      };
    });
    expect(target).toBeGreaterThan(0);
    const above = carried.index % 6;
    expect(above === 1 || above === 2).toBe(true);
    expect(carried.anchor).toBe(`r${carried.index - above}`);
    expect(carried.rowSpan).toBe(above === 1 ? '2' : null);
    expect(carried.top).toBeCloseTo(-36 * above, 0);
    expect(carried.height).toBeCloseTo(36 * 3, 0);
    if (above === 1) expect(carried.nextIsSpacer).toBe(true);
    expect(problems).toEqual([]);
  });

  test('a span that starts thousands of rows above the window is drawn from its first row (no lookback limit)', async ({ page }) => {
    // `?longRowSpan`: s1 spans rows 20,000..39,999 (and every other 20,000-row block).
    const problems = collectProblems(page);
    await openGrid(page, `${URL}&longRowSpan`);
    const carried = async () =>
      page.evaluate(() => {
        const first = document.querySelector<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row') as HTMLElement;
        const cell = first.querySelector<HTMLElement>('.salmon-data-grid-cell[data-column-id="s1"]');
        const viewport = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
        const box = cell?.getBoundingClientRect();
        const view = viewport.getBoundingClientRect();
        return {
          index: Number(first.dataset['rowIndex']),
          anchor: cell?.dataset['rowId'] ?? null,
          text: cell?.textContent ?? null,
          // The cell covers the whole viewport height: it starts above and ends below it.
          covers: box ? box.top <= view.top && box.bottom >= view.bottom : false,
          spacers: document.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="s1"]').length,
        };
      });
    // Jump 10,000 rows into the span, then scroll on through it.
    await scrollViewport(page, 36 * 30_000, null);
    const deep = await carried();
    expect(deep.index).toBeGreaterThan(29_000);
    expect(deep.anchor).toBe('r20000');
    expect(deep.covers).toBe(true);
    expect(deep.spacers).toBe(1);
    const anchorText = await page.evaluate(() => String((window.__gridApi.getRowInfo('r20000')?.row as Record<string, unknown>)['s1']));
    expect(deep.text).toBe(anchorText);
    await scrollViewport(page, 36 * 39_000, null);
    expect((await carried()).anchor).toBe('r20000');
    // Past the span's end, the next block starts at r40000.
    await scrollViewport(page, 36 * 45_000, null);
    expect((await carried()).anchor).toBe('r40000');
    // And back up again, into the first block.
    await scrollViewport(page, 36 * 12_345, null);
    expect((await carried()).anchor).toBe('r0');
    expect(problems).toEqual([]);
  });

  test('row spans follow per-row heights (rowHeight function)', async ({ page }) => {
    // `?rowHeights`: rows whose id number is a multiple of 3 are 64 px, the others 32 px.
    await openGrid(page, `${URL}&rowHeights`);
    const box = async (rowId: string) => {
      const cell = page.locator(`.salmon-data-grid-rows [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="s2"]`).first();
      return (await cell.boundingBox())!;
    };
    // r0 spans r0..r2: 64 + 32 + 32 px; it ends where r3 starts.
    const span = await box('r0');
    expect(span.height).toBeCloseTo(128, 0);
    const next = (await page.locator('.salmon-data-grid-rows .salmon-data-grid-row[data-row-id="r3"]').boundingBox())!;
    expect(span.y + span.height).toBeCloseTo(next.y, 0);
  });

  test('clicking a carried span focuses the span\'s first row', async ({ page }) => {
    await openGrid(page, URL);
    for (let shift = 0; shift < 6; shift++) {
      await scrollViewport(page, 36 * (30_000 + shift), null);
      const first = await page.evaluate(() => Number(document.querySelector<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row')?.dataset['rowIndex']));
      if (first % 6 === 1) break;
    }
    const anchor = await page.evaluate(() => {
      const first = document.querySelector<HTMLElement>('.salmon-data-grid-rows > .salmon-data-grid-row') as HTMLElement;
      return first.querySelector<HTMLElement>('.salmon-data-grid-cell[data-column-id="s2"][data-row-id]')?.dataset['rowId'] ?? null;
    });
    expect(anchor).not.toBeNull();
    // Click the visible part of the carried cell (it lies in the first rendered row).
    const cell = page.locator(`.salmon-data-grid-rows > .salmon-data-grid-row >> nth=0 >> .salmon-data-grid-cell[data-column-id="s2"][data-row-id]`);
    await cell.click({ position: { x: 20, y: 36 * 1 + 18 } });
    const focused = await page.evaluate(() => window.__gridApi.getFocusedCell()?.rowId ?? null);
    expect(focused).toBe(anchor);
  });
});

// Span-aware focus, selection, and editing. Fixture flags: `?span`
// (s3 spans s3..n5 on every 5th row), `?rowSpan` (s2 spans three rows on
// every 6th row), `?merge=rows` (mergeCells), cell selection and cell editing.
const SPAN_URL = `${DEV_URL}?rows=2000&cols=10&span&rowSpan&sel=cell&cellMode=box&edit=cell`;

/** `rowId:field` of the focused cell (a carried span carries its own `data-row-id`). */
const focusedCell = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el?.classList.contains('salmon-data-grid-cell')) return el?.tagName.toLowerCase() ?? 'none';
    return `${(el.closest('[data-row-id]') as HTMLElement).dataset['rowId']}:${el.dataset['columnId']}`;
  });
const spanCell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid-rows [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);

test.describe('span-aware focus, selection, and editing', () => {
  test('arrow keys land on span anchors and leave spans from their edge', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SPAN_URL);
    await spanCell(page, 'r1', 's1').click();
    expect(await focusedCell(page)).toBe('r1:s1');
    await page.keyboard.press('ArrowRight');
    expect(await focusedCell(page)).toBe('r0:s2'); // r1:s2 is covered by the r0 row span
    await page.keyboard.press('ArrowRight');
    expect(await focusedCell(page)).toBe('r1:s3'); // back in the aimed-at row r1
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowDown');
    expect(await focusedCell(page)).toBe('r3:s2'); // ArrowDown leaves the 3-row span from its bottom edge
    await spanCell(page, 'r4', 'n4').click();
    await page.keyboard.press('ArrowDown');
    expect(await focusedCell(page)).toBe('r5:s3'); // r5:n4 is covered by the r5 column span
    await page.keyboard.press('ArrowDown');
    expect(await focusedCell(page)).toBe('r6:n4'); // the aimed-at column again
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    expect(await focusedCell(page)).toBe('r5:n6'); // ArrowRight leaves the 3-column span from its right edge
    expect(await page.evaluate(() => window.__gridApi.getFocusedCell())).toEqual({ rowId: 'r5', field: 'n6', region: 'body' });
    expect(problems).toEqual([]);
  });

  test('a box range covers whole spans', async ({ page }) => {
    await openGrid(page, SPAN_URL);
    await spanCell(page, 'r4', 'n4').click();
    await page.keyboard.press('Shift+ArrowDown');
    expect(await focusedCell(page)).toBe('r5:s3');
    for (const [row, col] of [['r4', 's3'], ['r4', 'n4'], ['r4', 'n5'], ['r5', 's3']] as const) {
      await expect(spanCell(page, row, col)).toHaveAttribute('aria-selected', 'true');
    }
    await expect(spanCell(page, 'r4', 'n6')).toHaveAttribute('aria-selected', 'false');
  });

  test('editing a span edits its anchor cell; updateCell keeps the spans', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, SPAN_URL);
    await spanCell(page, 'r5', 's3').click();
    await page.keyboard.press('F2');
    const input = spanCell(page, 'r5', 's3').locator('input');
    await expect(input).toBeFocused();
    await input.fill('spanned');
    await page.keyboard.press('Enter');
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    expect(await page.evaluate(() => (window.__gridApi.getRowInfo('r5')?.row as Record<string, unknown>)['s3'])).toBe('spanned');
    await expect(spanCell(page, 'r5', 's3')).toHaveAttribute('aria-colspan', '3');
    await expect(spanCell(page, 'r5', 's3')).toContainText('spanned');
    // Double-clicking the lower part of a row span edits its anchor row.
    await spanCell(page, 'r0', 's2').dblclick({ position: { x: 20, y: 36 * 2 + 10 } });
    await expect(spanCell(page, 'r0', 's2').locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    // A covered cell can still be written through the API; the span stays drawn.
    await page.evaluate(() => window.__gridApi.updateCell('r1', 's2', 'covered'));
    expect(await page.evaluate(() => (window.__gridApi.getRowInfo('r1')?.row as Record<string, unknown>)['s2'])).toBe('covered');
    await expect(spanCell(page, 'r0', 's2')).toHaveAttribute('aria-rowspan', '3');
    expect(problems).toEqual([]);
  });

  test('merged spans are recomputed after a data change', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=10&merge=rows&edit=cell`);
    expect(await spanCell(page, 'r0', 's0').getAttribute('aria-rowspan')).toBeNull();
    await page.evaluate(() => {
      const api = window.__gridApi;
      api.updateCell('r1', 's0', (api.getRowInfo('r0')?.row as Record<string, unknown>)['s0']);
    });
    await expect(spanCell(page, 'r0', 's0')).toHaveAttribute('aria-rowspan', /^[2-9]/);
    await page.evaluate(() => window.__gridApi.updateCell('r1', 's0', 'different'));
    await expect(spanCell(page, 'r0', 's0')).not.toHaveAttribute('aria-rowspan', /.*/);
  });
});
