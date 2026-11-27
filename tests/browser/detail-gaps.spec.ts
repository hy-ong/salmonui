import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, scrollViewport } from './helpers.ts';

// Remaining behaviors of detail rows, child grids, row and column drag, keyboard
// hooks and the element API (examples/vite-spa/detail-gaps.html and the main
// page): cancelable detail toggles, full-width detail rows with
// pinned columns, child grid theme inheritance and focus,
// onKeyDown / keyBindings, row drag preview and cancel,
// drag policies, column drag events, element
// lookups and programmatic focus.

type Logged = { type: string; [key: string]: unknown };
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Logged[] }).__events.slice());
const clearEvents = (page: Page) => page.evaluate(() => void ((window as unknown as { __events: Logged[] }).__events.length = 0));
const cancelNext = (page: Page, type: string) => page.evaluate((t) => void ((window as unknown as { __cancel: string }).__cancel = t), type);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function openGaps(page: Page, query: string): Promise<void> {
  await openGrid(page, `${DEV_URL}detail-gaps.html?${query}`);
}

/** `<grid id> | <row id> | <column id or element id>` of the focused element. */
async function where(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'body';
    const grid = el.closest('.salmon-data-grid') as HTMLElement | null;
    if (!grid) return el.id || el.tagName.toLowerCase();
    const row = el.closest('[data-row-id]') as HTMLElement | null;
    return `${grid.id} | ${row?.dataset['rowId'] ?? '-'} | ${el.dataset['columnId'] ?? el.tagName.toLowerCase()}`;
  });
}

test.describe('detail rows', () => {
  test('onBeforeDetailToggle preventDefault() cancels pointer, keyboard and API toggles', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=detail');
    const row = page.locator('#customers [data-row-id="c1"]');
    const toggle = row.locator('.salmon-data-grid-detail-toggle');
    // Pointer: cancelled, then allowed.
    await cancelNext(page, 'beforeDetailToggle');
    await toggle.click();
    await frames(page);
    await expect(row).toHaveAttribute('data-expanded', 'false');
    await expect(page.locator('#customers [data-row-id="__detail:c1"]')).toHaveCount(0);
    expect(await events(page)).toEqual([
      { type: 'beforeDetailToggle', rowId: 'c1', expanded: true, source: 'pointer', row: 'c1' },
      { type: 'beforeDetailToggle:cancelled' },
    ]);
    await clearEvents(page);
    await toggle.click();
    await expect(row).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('#customers [data-row-id="__detail:c1"] .detail-content')).toHaveCount(1);
    expect(await events(page)).toEqual([
      { type: 'beforeDetailToggle', rowId: 'c1', expanded: true, source: 'pointer', row: 'c1' },
      { type: 'detailToggle', rowId: 'c1', expanded: true, source: 'pointer' },
    ]);
    // Keyboard: Enter on the toggle cell, cancelled collapse.
    await clearEvents(page);
    await row.locator('[data-column-id="__salmon_detail"]').focus();
    await cancelNext(page, 'beforeDetailToggle');
    await page.keyboard.press('Enter');
    await frames(page);
    await expect(row).toHaveAttribute('data-expanded', 'true');
    expect(await events(page)).toEqual([
      { type: 'beforeDetailToggle', rowId: 'c1', expanded: false, source: 'keyboard', row: 'c1' },
      { type: 'beforeDetailToggle:cancelled' },
    ]);
    // API: the cancelled command is not applied and the state is unchanged.
    await cancelNext(page, 'beforeDetailToggle');
    const result = await page.evaluate(() => (window as any).__gridApi.expandDetail('c2'));
    expect(result.status).not.toBe('applied');
    expect(await page.evaluate(() => (window as any).__gridApi.isDetailExpanded('c2'))).toBe(false);
    await expect(page.locator('#customers [data-row-id="c2"]')).toHaveAttribute('data-expanded', 'false');
    expect(problems).toEqual([]);
  });

  test('a detail row spans the full width across the start and end pinned zones and the center', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=detail');
    await page.evaluate(() => (window as any).__gridApi.expandDetail('c2'));
    const detailRow = page.locator('#customers [data-row-id="__detail:c2"]');
    await expect(detailRow.locator('.detail-content')).toHaveCount(1);
    // One spanning gridcell: no pinned or center cells in the detail row.
    const cells = detailRow.locator('[role="gridcell"]');
    await expect(cells).toHaveCount(1);
    const colCount = await page.locator('#customers').getAttribute('aria-colcount');
    await expect(cells.first()).toHaveAttribute('aria-colspan', String(colCount));
    const measure = () =>
      page.evaluate(() => {
        const vp = document.querySelector('#customers > .salmon-data-grid-viewport') as HTMLElement;
        const parent = document.querySelector('#customers .salmon-data-grid-rows > [data-row-id="c2"]') as HTMLElement;
        const cell = document.querySelector('#customers [data-row-id="__detail:c2"] [role="gridcell"]') as HTMLElement;
        const content = document.querySelector('#customers [data-row-id="__detail:c2"] .salmon-data-grid-detail') as HTMLElement;
        const startPinned = parent.querySelector('[data-column-id="id"]') as HTMLElement;
        const endPinned = parent.querySelector('[data-column-id="total"]') as HTMLElement;
        const v = vp.getBoundingClientRect();
        const c = cell.getBoundingClientRect();
        const t = content.getBoundingClientRect();
        const s = startPinned.getBoundingClientRect();
        const e = endPinned.getBoundingClientRect();
        const midY = t.top + t.height / 2;
        // What is painted at the start-pinned, center and end-pinned x positions of the detail row.
        const hit = (x: number) => !!document.elementFromPoint(x, midY)?.closest('[data-row-id="__detail:c2"]');
        return {
          scrollLeft: vp.scrollLeft,
          maxScroll: vp.scrollWidth - vp.clientWidth,
          cellWidth: c.width,
          scrollWidth: vp.scrollWidth,
          contentLeft: t.left - v.left,
          contentRight: v.left + vp.clientWidth - t.right,
          hits: [hit(s.left + s.width / 2), hit(v.left + vp.clientWidth / 2), hit(e.left + e.width / 2)],
        };
      });
    const atStart = await measure();
    expect(atStart.maxScroll).toBeGreaterThan(200);
    // The spanning cell covers every column (the full scroll width); the content covers the viewport.
    expect(Math.abs(atStart.cellWidth - atStart.scrollWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(atStart.contentLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(atStart.contentRight)).toBeLessThanOrEqual(1);
    expect(atStart.hits).toEqual([true, true, true]);
    for (const left of [atStart.maxScroll / 2, atStart.maxScroll]) {
      await scrollViewport(page, null, left);
      const m = await measure();
      expect(m.scrollLeft).toBeGreaterThan(0);
      // Sticky content: still the full viewport width, under the pinned zones too.
      expect(Math.abs(m.contentLeft)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.contentRight)).toBeLessThanOrEqual(1);
      expect(m.hits).toEqual([true, true, true]);
    }
    expect(problems).toEqual([]);
  });

  test('detail rows with pinned rows: pinned rows show no toggle or detail; scrolling details span the full width below their row', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=detail&pinRows=c3,c7');
    const top = page.locator('#customers .salmon-data-grid-frozen-rows--top');
    await expect(top.locator(':scope > [data-row-id]')).toHaveCount(2);
    const pinned = top.locator('[data-row-id="c3"]');
    await expect(pinned).toHaveAttribute('data-pinned', '');
    // Policy: a pinned row has no expand toggle and no data-expanded state.
    await expect(top.locator('.salmon-data-grid-detail-toggle')).toHaveCount(0);
    expect(await pinned.getAttribute('data-expanded')).toBeNull();
    await expect(page.locator('#customers .salmon-data-grid-rows > [data-row-id="c2"] .salmon-data-grid-detail-toggle')).toHaveCount(1);
    // Enter on the pinned row's toggle cell does nothing.
    await clearEvents(page);
    await pinned.locator('[data-column-id="__salmon_detail"]').focus();
    await page.keyboard.press('Enter');
    await frames(page);
    expect((await events(page)).filter((e) => e.type.includes('etailToggle'))).toEqual([]);
    // The API keeps the expansion state of a pinned row but renders no detail row for it.
    expect((await page.evaluate(() => (window as any).__gridApi.expandDetail('c3'))).status).toBe('applied');
    expect(await page.evaluate(() => (window as any).__gridApi.isDetailExpanded('c3'))).toBe(true);
    await frames(page);
    await expect(page.locator('#customers [data-row-id="__detail:c3"]')).toHaveCount(0);

    // A scrolling row's detail: directly below its row, below the pinned zone, one cell over every column.
    await page.locator('#customers .salmon-data-grid-rows > [data-row-id="c2"] .salmon-data-grid-detail-toggle').click();
    const detailRow = page.locator('#customers [data-row-id="__detail:c2"]');
    await expect(detailRow.locator('.detail-content')).toHaveCount(1);
    await expect(top.locator('[data-row-id^="__detail"]')).toHaveCount(0);
    const colCount = await page.locator('#customers').getAttribute('aria-colcount');
    await expect(detailRow.locator('[role="gridcell"]')).toHaveCount(1);
    await expect(detailRow.locator('[role="gridcell"]')).toHaveAttribute('aria-colspan', String(colCount));
    const measure = () =>
      page.evaluate(() => {
        const vp = document.querySelector('#customers > .salmon-data-grid-viewport') as HTMLElement;
        const zone = document.querySelector('#customers .salmon-data-grid-frozen-rows--top') as HTMLElement;
        const parent = document.querySelector('#customers .salmon-data-grid-rows > [data-row-id="c2"]') as HTMLElement;
        const detail = document.querySelector('#customers [data-row-id="__detail:c2"]') as HTMLElement;
        const cell = detail.querySelector('[role="gridcell"]') as HTMLElement;
        const content = detail.querySelector('.salmon-data-grid-detail') as HTMLElement;
        const v = vp.getBoundingClientRect();
        const p = parent.getBoundingClientRect();
        const d = detail.getBoundingClientRect();
        const t = content.getBoundingClientRect();
        return {
          gap: d.top - p.bottom,
          zoneBottom: zone.getBoundingClientRect().bottom,
          zoneTop: zone.getBoundingClientRect().top,
          detailTop: d.top,
          cellWidth: cell.getBoundingClientRect().width,
          scrollWidth: vp.scrollWidth,
          contentLeft: t.left - v.left,
          contentRight: v.left + vp.clientWidth - t.right,
          ariaIndexes: [parent, detail].map((r) => Number(r.getAttribute('aria-rowindex'))),
          maxScroll: vp.scrollWidth - vp.clientWidth,
        };
      });
    const m = await measure();
    expect(Math.abs(m.gap)).toBeLessThanOrEqual(1);
    expect(m.detailTop).toBeGreaterThanOrEqual(m.zoneBottom - 1);
    expect(Math.abs(m.cellWidth - m.scrollWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.contentLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.contentRight)).toBeLessThanOrEqual(1);
    // The header row is 1 and the pinned rows 2 and 3; c2 is the third scrolling row, its detail row follows.
    expect(m.ariaIndexes).toEqual([6, 7]);
    // Horizontal scroll: the content stays full width; vertical scroll: the pinned zone stays, the detail scrolls under it.
    await scrollViewport(page, null, m.maxScroll);
    const h = await measure();
    expect(Math.abs(h.contentLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(h.contentRight)).toBeLessThanOrEqual(1);
    await scrollViewport(page, 60, null);
    const v = await measure();
    expect(Math.abs(v.zoneTop - m.zoneTop)).toBeLessThanOrEqual(1);
    expect(v.detailTop).toBeLessThan(m.detailTop - 30);

    // Unpinned, c3 returns to the scrolling rows with its kept detail row.
    await page.evaluate(() => (window as any).__gridApi.unpinRows('c3'));
    await expect(page.locator('#customers .salmon-data-grid-rows > [data-row-id="c3"]')).toHaveAttribute('data-expanded', 'true');
    await expect(page.locator('#customers [data-row-id="__detail:c3"] .detail-content')).toHaveCount(1);
    await expect(page.locator('#customers .salmon-data-grid-rows > [data-row-id="c3"] .salmon-data-grid-detail-toggle')).toHaveAttribute('aria-expanded', 'true');
    // Pinned again, the toggle and the detail row leave.
    await page.evaluate(() => (window as any).__gridApi.pinRows('c3'));
    await expect(top.locator('[data-row-id="c3"]')).toHaveCount(1);
    await expect(top.locator('[data-row-id="c3"] .salmon-data-grid-detail-toggle')).toHaveCount(0);
    await expect(page.locator('#customers [data-row-id="__detail:c3"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

test.describe('child grids', () => {
  test('a child grid resolves the parent theme: --salmon-* values and the dark color scheme', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=child&theme');
    await page.evaluate(() => (window as any).__gridApi.expandDetail('c1'));
    const child = page.locator('[id="customers/c1"]');
    await expect(child).toHaveAttribute('role', 'grid');
    const styles = await page.evaluate(() => {
      const read = (el: Element) => {
        const cs = getComputedStyle(el);
        return {
          primary: cs.getPropertyValue('--salmon-color-primary').trim(),
          surface: cs.getPropertyValue('--salmon-surface-default').trim() || cs.getPropertyValue('--salmon-surface-sunken').trim(),
          text: cs.getPropertyValue('--salmon-text-primary').trim(),
          scheme: cs.colorScheme,
          color: cs.color,
        };
      };
      const parent = document.getElementById('customers') as HTMLElement;
      const child = document.getElementById('customers/c1') as HTMLElement;
      const parentCell = parent.querySelector('.salmon-data-grid-rows > [data-row-id="c0"] [data-column-id="name"]') as HTMLElement;
      const childCell = child.querySelector('.salmon-data-grid-rows > [data-row-id] [data-column-id="orderId"]') as HTMLElement;
      // Reference: an unthemed element outside the ThemeProvider.
      const outside = document.getElementById('before') as HTMLElement;
      return {
        parent: read(parent),
        child: read(child),
        parentCellColor: getComputedStyle(parentCell).color,
        childCellColor: getComputedStyle(childCell).color,
        outsidePrimary: getComputedStyle(outside).getPropertyValue('--salmon-color-primary').trim(),
        scope: child.closest('.salmon-theme-scope')?.getAttribute('data-salmon-color-scheme') ?? null,
      };
    });
    expect(styles.parent.primary).not.toBe('');
    expect(styles.parent.primary).not.toBe(styles.outsidePrimary);
    expect(styles.child).toEqual(styles.parent);
    expect(styles.childCellColor).toBe(styles.parentCellColor);
    expect(styles.scope).toBe('dark');
    expect(styles.child.scheme).toContain('dark');
    expect(problems).toEqual([]);
  });

  test('Enter on a child-grid parent toggle, Enter into the child, Tab out of and back into the hierarchy', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=child');
    await page.locator('#before').focus();
    // Tab into the root grid: its single tab stop (the first cell, the toggle column).
    await page.keyboard.press('Tab');
    expect(await where(page)).toBe('customers | c0 | __salmon_detail');
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toBe('customers | c1 | __salmon_detail');
    // Enter toggles the child grid.
    await page.keyboard.press('Enter');
    const parentRow = page.locator('#customers [data-row-id="c1"]');
    await expect(parentRow).toHaveAttribute('data-expanded', 'true');
    const child = page.locator('[id="customers/c1"]');
    await expect(child).toHaveAttribute('role', 'grid');
    await expect(child.locator('.salmon-data-grid-rows > [data-row-id]')).toHaveCount(2);
    // ArrowDown to the detail row, Enter moves into the child grid (its first cell).
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toBe('customers | __detail:c1 | __salmon_detail');
    await page.keyboard.press('Enter');
    expect(await where(page)).toBe('customers/c1 | o1 | __salmon_detail');
    // Keys stay in the child: ArrowRight moves the child's focus.
    await page.keyboard.press('ArrowRight');
    expect(await where(page)).toBe('customers/c1 | o1 | orderId');
    // Each grid is one tab stop: Tab leaves the whole hierarchy to the next page element.
    await page.keyboard.press('Tab');
    expect(await where(page)).toBe('after');
    // Shift+Tab comes back to the child grid's tab stop (the last focused child cell).
    await page.keyboard.press('Shift+Tab');
    expect(await where(page)).toBe('customers/c1 | o1 | orderId');
    // Shift+Tab from the child goes to the parent's tab stop (the detail row), then out before the grid.
    await page.keyboard.press('Shift+Tab');
    expect(await where(page)).toBe('customers | __detail:c1 | __salmon_detail');
    await page.keyboard.press('Shift+Tab');
    expect(await where(page)).toBe('before');
    // Enter on the toggle collapses the child grid again.
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowUp');
    expect(await where(page)).toBe('customers | c1 | __salmon_detail');
    await page.keyboard.press('Enter');
    await expect(parentRow).toHaveAttribute('data-expanded', 'false');
    await expect(child).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

test.describe('keyboard hooks', () => {
  test('onKeyDown receives command, context, rowId and field; preventDefault() suppresses the built-in; keyBindings remaps', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=detail&keys');
    await page.evaluate(() => (window as any).__gridApi.focusCell('c2', 'name'));
    expect(await where(page)).toBe('customers | c2 | name');
    await clearEvents(page);
    // Built-in ArrowRight: the hook sees the command and the focused cell, then focus moves.
    await page.keyboard.press('ArrowRight');
    expect(await where(page)).toBe('customers | c2 | x0');
    expect((await events(page)).filter((e) => e.type === 'keyDown')).toEqual([
      { type: 'keyDown', key: 'ArrowRight', command: 'focus.right', context: 'body', rowId: 'c2', field: 'name' },
    ]);
    // preventDefault() for focus.right: the key is reported, focus stays.
    await page.evaluate(() => void ((window as unknown as { __preventCommand: string }).__preventCommand = 'focus.right'));
    await clearEvents(page);
    await page.keyboard.press('ArrowRight');
    await frames(page);
    expect(await where(page)).toBe('customers | c2 | x0');
    expect((await events(page)).filter((e) => e.type === 'keyDown')).toEqual([
      { type: 'keyDown', key: 'ArrowRight', command: 'focus.right', context: 'body', rowId: 'c2', field: 'x0' },
    ]);
    // keyBindings { 'focus.down': ['j'] }: j moves down, ArrowDown no longer resolves to focus.down.
    await clearEvents(page);
    await page.keyboard.press('j');
    expect(await where(page)).toBe('customers | c3 | x0');
    await page.keyboard.press('ArrowDown');
    await frames(page);
    expect(await where(page)).toBe('customers | c3 | x0');
    const keys = (await events(page)).filter((e) => e.type === 'keyDown');
    expect(keys).toEqual([
      { type: 'keyDown', key: 'j', command: 'focus.down', context: 'body', rowId: 'c2', field: 'x0' },
      { type: 'keyDown', key: 'ArrowDown', command: null, context: 'body', rowId: 'c3', field: 'x0' },
    ]);
    // Header context: the hook reports the header field and a null row id.
    await page.evaluate(() => (window as any).__gridApi.focusHeader('name'));
    await clearEvents(page);
    await page.keyboard.press('ArrowLeft');
    const header = (await events(page)).filter((e) => e.type === 'keyDown');
    expect(header).toEqual([expect.objectContaining({ key: 'ArrowLeft', command: 'focus.left', context: 'header', rowId: null, field: 'name' })]);
    expect(problems).toEqual([]);
  });
});

/**
 * Waits for the lazy row drag chunk: before it loads, `moveRows` returns `{ status: 'async' }` and runs
 * later (documented). An empty move is a harmless probe (rejected once the controller is ready).
 */
async function rowDragReady(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => (window as any).__gridApi.moveRows([], 0).status)).not.toBe('async');
}

async function handleCenter(page: Page, rowId: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(`#customers [data-row-id="${rowId}"] .salmon-data-grid-row-drag-handle`).boundingBox();
  if (!box) throw new Error(`no handle for ${rowId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const order = (page: Page, n = 6) => page.evaluate((count) => [...document.querySelectorAll<HTMLElement>('#customers .salmon-data-grid-rows > [data-row-id]')].slice(0, count).map((r) => r.dataset['rowId']), n);

async function dragRow(page: Page, rowId: string, toRowId: string, { release = true } = {}): Promise<void> {
  const from = await handleCenter(page, rowId);
  const target = await page.locator(`#customers .salmon-data-grid-rows > [data-row-id="${toRowId}"]`).boundingBox();
  if (!target) throw new Error(`no row ${toRowId}`);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 2 });
  await page.mouse.move(from.x + 40, target.y + target.height * 0.8, { steps: 12 });
  await frames(page);
  if (release) await page.mouse.up();
}

test.describe('row drag', () => {
  test('renderRowDragPreview renders custom preview content, hidden from assistive technology; onRowDragStart preventDefault() cancels', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=drag&preview');
    // Select c1 and c2: the preview context carries both rows.
    await page.locator('#customers [data-row-id="c1"] [data-column-id="name"]').click();
    await page.locator('#customers [data-row-id="c2"] [data-column-id="name"]').click({ modifiers: ['ControlOrMeta'] });
    await clearEvents(page);
    await dragRow(page, 'c1', 'c4', { release: false });
    const preview = page.locator('#customers .salmon-data-grid-row-drag-preview');
    await expect(preview).toHaveAttribute('data-visible', '');
    await expect(preview).toHaveAttribute('aria-hidden', 'true');
    await expect(preview.locator('.custom-preview')).toHaveText('Moving 2: Customer 1, Customer 2');
    // The default label is replaced.
    await expect(preview.locator('.salmon-data-grid-row-drag-preview__label')).toHaveCount(0);
    // The live region announces the grab (the accessible feedback, not the preview).
    await expect.poll(() => page.evaluate(() => document.querySelector('#customers .salmon-data-grid-live[role="status"], .salmon-data-grid-live[role="status"]')?.textContent ?? '')).not.toBe('');
    await page.mouse.up();
    await expect(preview).not.toHaveAttribute('data-visible', '');
    await expect(preview.locator('.custom-preview')).toHaveCount(0);
    await expect.poll(() => order(page)).toEqual(['c0', 'c3', 'c4', 'c1', 'c2', 'c5']);
    // onRowDragStart preventDefault(): no session, no preview, no drop events, order unchanged.
    await clearEvents(page);
    await cancelNext(page, 'rowDragStart');
    await dragRow(page, 'c5', 'c0', { release: false });
    await expect(preview).not.toHaveAttribute('data-visible', '');
    expect(await page.locator('#customers [data-row-dragging]').count()).toBe(0);
    await page.mouse.up();
    await frames(page);
    expect(await order(page)).toEqual(['c0', 'c3', 'c4', 'c1', 'c2', 'c5']);
    const log = await events(page);
    expect(log.slice(0, 2)).toEqual([{ type: 'rowDragStart', rowIds: ['c5'], fromIndex: 5, source: 'pointer' }, { type: 'rowDragStart:cancelled' }]);
    expect(log.filter((e) => e.type === 'rowDrag' || e.type === 'beforeRowDrop' || e.type === 'rowDrop')).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('rowDrag.acrossGroups maps to the cross-group drop policy', async ({ page }) => {
    // Grouped by city: groups sort Graz, Kobe, Lima, Oslo, Pune with 12 rows each, so data index 36 is c0,
    // the first Oslo row (c0, c5, c10 ...); c1 is in Lima.
    await openGaps(page, 'mode=drag&group');
    await rowDragReady(page);
    const groupOf = (id: string) => page.evaluate((rid) => (window as any).__gridApi.getRow(rid)?.city, id);
    const firstOf = (city: string) => page.evaluate((c) => [...document.querySelectorAll<HTMLElement>('#customers .salmon-data-grid-rows > [data-row-id]')].map((r) => r.dataset['rowId'] as string).find((id) => !id.startsWith('__') && (window as any).__gridApi.getRow(id)?.city === c), city);
    expect(await firstOf('Graz')).toBe('c4');
    // Default (no acrossGroups): a move into another group is rejected and the value is kept.
    const blocked = await page.evaluate(() => (window as any).__gridApi.moveRows('c1', 36));
    expect(blocked).toEqual({ status: 'rejected', reason: 'groupChange' });
    expect(await groupOf('c1')).toBe('Lima');
    // Within a group the move is allowed (c10 before c0, both Oslo).
    expect((await page.evaluate(() => (window as any).__gridApi.moveRows('c10', 36))).status).toBe('applied');
    expect(await groupOf('c10')).toBe('Oslo');
    // acrossGroups: true (core allowGroupChange): the same cross-group move applies and rewrites the grouped value.
    await openGaps(page, 'mode=drag&group&across');
    await rowDragReady(page);
    expect((await page.evaluate(() => (window as any).__gridApi.moveRows('c1', 36))).status).toBe('applied');
    expect(await groupOf('c1')).toBe('Oslo');
  });

  test('row drag with detail rows, a custom renderRow and row spans', async ({ page }) => {
    const problems = collectProblems(page);
    // Detail rows: the expanded detail follows its parent row.
    await openGaps(page, 'mode=drag&detail');
    await page.evaluate(() => (window as any).__gridApi.expandDetail('c0'));
    await expect(page.locator('#customers [data-row-id="__detail:c0"] .detail-content')).toHaveCount(1);
    await dragRow(page, 'c0', 'c2');
    await expect.poll(() => order(page, 4)).toEqual(['c1', 'c2', 'c0', '__detail:c0']);
    // renderRow: the handle lives in the custom row's cells; pointer drag reorders.
    await openGaps(page, 'mode=drag&renderRow');
    await expect(page.locator('#customers [data-custom-row]').first()).toBeVisible();
    await expect(page.locator('#customers [data-custom-row][data-row-id="c0"] .salmon-data-grid-row-drag-handle')).toHaveCount(1);
    await dragRow(page, 'c0', 'c2');
    await expect.poll(() => order(page, 4)).toEqual(['c1', 'c2', 'c0', 'c3']);
    // Row spans (city spans 2 rows on every 4th row): rows still move by id; the spans follow the new order.
    await openGaps(page, 'mode=drag&rowSpan');
    await rowDragReady(page);
    expect((await page.evaluate(() => (window as any).__gridApi.moveRows('c0', 2))).status).toBe('applied');
    await expect.poll(() => order(page, 4)).toEqual(['c1', 'c2', 'c0', 'c3']);
    expect(problems).toEqual([]);
  });

  test('pinned rows are neither drag sources nor drop targets', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=drag&pinRows=c3,c7');
    await rowDragReady(page);
    const top = page.locator('#customers .salmon-data-grid-frozen-rows--top');
    const pinnedIds = () => top.locator(':scope > [data-row-id]').evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset['rowId']));
    expect(await pinnedIds()).toEqual(['c3', 'c7']);
    expect(await order(page, 4)).toEqual(['c0', 'c1', 'c2', 'c4']);
    // No drag handle in pinned rows.
    await expect(top.locator('[data-row-id="c3"] .salmon-data-grid-row-drag-handle')).toBeHidden();
    await expect(page.locator('#customers .salmon-data-grid-rows > [data-row-id="c0"] .salmon-data-grid-row-drag-handle')).toBeVisible();
    // Dropping a scrolling row onto a pinned row is invalid: no onRowDrop, the order and the pins stay.
    await clearEvents(page);
    const from = await handleCenter(page, 'c1');
    const target = await top.locator('[data-row-id="c3"]').boundingBox();
    if (!target) throw new Error('no pinned row');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 10, { steps: 2 });
    await page.mouse.move(from.x + 40, target.y + target.height * 0.3, { steps: 12 });
    await frames(page);
    await expect(page.locator('#customers .salmon-data-grid-row-drop-indicator')).toHaveAttribute('data-invalid', 'true');
    await page.mouse.up();
    await frames(page);
    const log = await events(page);
    expect(log.filter((e) => e.type === 'beforeRowDrop')).toEqual([{ type: 'beforeRowDrop', rowIds: ['c1'], toIndex: -1, valid: false, source: 'pointer' }]);
    expect(log.filter((e) => e.type === 'rowDrop')).toEqual([]);
    expect(await order(page, 4)).toEqual(['c0', 'c1', 'c2', 'c4']);
    expect(await pinnedIds()).toEqual(['c3', 'c7']);
    // The first scrolling row cannot move above the pinned rows by keyboard; pinned rows do not move.
    await page.locator('#customers .salmon-data-grid-rows > [data-row-id="c0"] [data-column-id="name"]').click();
    await page.keyboard.press('Alt+Shift+ArrowUp');
    await frames(page);
    expect(await order(page, 4)).toEqual(['c0', 'c1', 'c2', 'c4']);
    await top.locator('[data-row-id="c3"] [data-column-id="name"]').click();
    await page.keyboard.press('Alt+Shift+ArrowDown');
    await frames(page);
    expect(await pinnedIds()).toEqual(['c3', 'c7']);
    expect(await order(page, 4)).toEqual(['c0', 'c1', 'c2', 'c4']);
    // Drags among the scrolling rows still work; moveRows data indexes count the scrolling rows only.
    await dragRow(page, 'c0', 'c2');
    await expect.poll(() => order(page, 4)).toEqual(['c1', 'c2', 'c0', 'c4']);
    expect((await page.evaluate(() => (window as any).__gridApi.moveRows('c4', 0))).status).toBe('applied');
    await expect.poll(() => order(page, 4)).toEqual(['c4', 'c1', 'c2', 'c0']);
    expect(await pinnedIds()).toEqual(['c3', 'c7']);
    expect(problems).toEqual([]);
  });

  test('a child grid reorders its own rows; its drags do not reach the parent grid', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=child&childDrag');
    await page.evaluate(() => (window as any).__gridApi.expandDetail('c0'));
    const child = page.locator('[id="customers/c0"]');
    const childOrder = () => child.locator('.salmon-data-grid-rows > [data-row-id]').evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset['rowId']));
    await expect.poll(childOrder).toEqual(['o0', 'o60']);
    await rowDragReady(page);
    // Rows of the parent grid only (the child grid's rows are nested in the detail row).
    const parentRows = (n: number) =>
      page.evaluate((count) => [...document.querySelectorAll<HTMLElement>('#customers .salmon-data-grid-rows > [data-row-id]')].filter((r) => r.closest('.salmon-data-grid')?.id === 'customers').slice(0, count).map((r) => r.dataset['rowId']), n);
    const parentOrder = await parentRows(4);
    expect(parentOrder).toEqual(['c0', '__detail:c0', 'c1', 'c2']);
    const childHandle = async (rowId: string) => {
      const box = await child.locator(`[data-row-id="${rowId}"] .salmon-data-grid-row-drag-handle`).boundingBox();
      if (!box) throw new Error(`no child handle for ${rowId}`);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    // Within the child: o0 after o60. Only the child raises drag events.
    await clearEvents(page);
    let from = await childHandle('o0');
    const o60 = await child.locator('[data-row-id="o60"]').boundingBox();
    if (!o60) throw new Error('no child row');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });
    await page.mouse.move(from.x + 30, o60.y + o60.height * 0.8, { steps: 10 });
    await frames(page);
    await page.mouse.up();
    await expect.poll(childOrder).toEqual(['o60', 'o0']);
    let log = await events(page);
    expect(log.filter((e) => e.type === 'childRowDragStart' || e.type === 'childRowDrop')).toEqual([
      { type: 'childRowDragStart', rowIds: ['o0'], fromIndex: 0 },
      { type: 'childRowDrop', rowIds: ['o0'], toIndex: 1 },
    ]);
    expect(log.filter((e) => e.type === 'rowDragStart' || e.type === 'rowDrop')).toEqual([]);
    expect(await parentRows(4)).toEqual(parentOrder);
    // A child row released over a parent row moves nowhere: no drop in either grid.
    await clearEvents(page);
    from = await childHandle('o60');
    const c2 = await page.locator('#customers .salmon-data-grid-rows > [data-row-id="c2"]').boundingBox();
    if (!c2) throw new Error('no parent row');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });
    await page.mouse.move(from.x + 30, c2.y + c2.height * 0.8, { steps: 12 });
    await frames(page);
    await page.mouse.up();
    await frames(page);
    log = await events(page);
    expect(log.filter((e) => e.type === 'childRowDrop' || e.type === 'rowDrop' || e.type === 'rowDragStart')).toEqual([]);
    expect(await childOrder()).toEqual(['o60', 'o0']);
    expect(await parentRows(4)).toEqual(parentOrder);
    // The parent's own drag still reorders the parent rows; the detail row follows its parent.
    await dragRow(page, 'c1', 'c2');
    await expect.poll(() => parentRows(5)).toEqual(['c0', '__detail:c0', 'c2', 'c1', 'c3']);
    expect(await childOrder()).toEqual(['o60', 'o0']);
    expect(problems).toEqual([]);
  });
});

test.describe('column drag events', () => {
  test('onColumnDragStart, onColumnDrag per move and onColumnDrop carry field, fromIndex and toIndex', async ({ page }) => {
    const problems = collectProblems(page);
    await openGaps(page, 'mode=drag');
    const fields = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#customers .salmon-data-grid-header-cell[data-column-id]')].map((c) => c.dataset['columnId']));
    const before = await fields();
    const nameIndex = before.indexOf('name');
    const cityIndex = before.indexOf('city');
    expect(cityIndex).toBe(nameIndex + 1);
    const name = await page.locator('#customers .salmon-data-grid-header-cell[data-column-id="name"]').boundingBox();
    const city = await page.locator('#customers .salmon-data-grid-header-cell[data-column-id="city"]').boundingBox();
    if (!name || !city) throw new Error('no header cells');
    await clearEvents(page);
    await page.mouse.move(name.x + name.width / 2, name.y + name.height / 2);
    await page.mouse.down();
    await page.mouse.move(city.x + city.width * 0.85, city.y + city.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect.poll(fields).toEqual(before.map((f, i) => (i === nameIndex ? 'city' : i === cityIndex ? 'name' : f)));
    const log = (await events(page)).filter((e) => e.type.startsWith('column'));
    expect(log[0]).toEqual({ type: 'columnDragStart', field: 'name', fromIndex: nameIndex, toIndex: nameIndex, source: 'pointer' });
    const drags = log.filter((e) => e.type === 'columnDrag');
    expect(drags.length).toBeGreaterThan(0);
    expect(drags.every((e) => e['field'] === 'name' && e['fromIndex'] === nameIndex)).toBe(true);
    expect(drags.at(-1)).toEqual({ type: 'columnDrag', field: 'name', fromIndex: nameIndex, toIndex: cityIndex });
    expect(log.at(-1)).toEqual({ type: 'columnDrop', field: 'name', fromIndex: nameIndex, toIndex: cityIndex, source: 'pointer' });
    expect(log.filter((e) => e.type === 'columnDragStart' || e.type === 'columnDrop').length).toBe(2);
    expect(problems).toEqual([]);
  });
});

test.describe('element API and focus', () => {
  test('getRowInfo(element), getRowElement(rowId), getCellElement(rowId, field); null outside the rendered window', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10`);
    const result = await page.evaluate(() => {
      const api = (window as any).__gridApi;
      const rowEl = api.getRowElement('r3') as HTMLElement | null;
      const cellEl = api.getCellElement('r3', 's1') as HTMLElement | null;
      const inner = document.createElement('span');
      cellEl?.appendChild(inner);
      const fromCell = api.getRowInfo(cellEl);
      const fromInner = api.getRowInfo(inner);
      const fromRow = api.getRowInfo(rowEl);
      inner.remove();
      const byId = api.getRowInfo('r3');
      const outside = api.getRowInfo(document.getElementById('grid-title'));
      return {
        rowIsRow: rowEl?.getAttribute('role') === 'row' && rowEl.dataset['rowId'] === 'r3',
        cellIsCell: cellEl?.dataset['columnId'] === 's1' && rowEl?.contains(cellEl),
        fromCell: { rowId: fromCell?.rowId, field: fromCell?.field, rowIndex: fromCell?.rowIndex, sameRow: fromCell?.element === rowEl, sameCell: fromCell?.cellElement === cellEl, column: fromCell?.column?.field, row: fromCell?.row?.id },
        fromInner: { rowId: fromInner?.rowId, field: fromInner?.field, sameCell: fromInner?.cellElement === cellEl },
        fromRow: { rowId: fromRow?.rowId, field: fromRow?.field, cell: fromRow?.cellElement },
        byId: { rowId: byId?.rowId, field: byId?.field, sameRow: byId?.element === rowEl },
        outside: outside === undefined,
        far: { row: api.getRowElement('r1900'), cell: api.getCellElement('r1900', 's1'), info: api.getRowInfo('r1900')?.element === null, index: api.getRowInfo('r1900')?.rowIndex },
        missing: { row: api.getRowElement('nope'), cell: api.getCellElement('r3', 'nope') },
      };
    });
    expect(result.rowIsRow).toBe(true);
    expect(result.cellIsCell).toBe(true);
    expect(result.fromCell).toEqual({ rowId: 'r3', field: 's1', rowIndex: 3, sameRow: true, sameCell: true, column: 's1', row: 'r3' });
    expect(result.fromInner).toEqual({ rowId: 'r3', field: 's1', sameCell: true });
    expect(result.fromRow).toEqual({ rowId: 'r3', field: null, cell: null });
    expect(result.byId).toEqual({ rowId: 'r3', field: null, sameRow: true });
    expect(result.outside).toBe(true);
    // Outside the rendered window: the row exists (rowIndex) but has no element.
    expect(result.far).toEqual({ row: null, cell: null, info: true, index: 1900 });
    expect(result.missing).toEqual({ row: null, cell: null });
    // After scrolling there, the elements resolve and the old ones are gone.
    await page.evaluate(() => (window as any).__gridApi.scrollToRow('r1900'));
    await frames(page);
    await expect.poll(() => page.evaluate(() => (window as any).__gridApi.getCellElement('r1900', 's1')?.dataset['columnId'] ?? null)).toBe('s1');
    expect(await page.evaluate(() => (window as any).__gridApi.getRowElement('r3'))).toBeNull();
    expect(problems).toEqual([]);
  });

  test('api.focus() focuses the content at the logical focus; focusCell moves from the header to the content', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=500&cols=10`);
    // Default target: the first body cell.
    await page.evaluate(() => (window as any).__gridApi.focus());
    expect(await where(page)).toMatch(/\| r0 \| id$/);
    // The last focused cell is restored after focus left the grid.
    await page.evaluate(() => (window as any).__gridApi.focusCell('r4', 's1'));
    await page.locator('.app__after').focus();
    expect(await where(page)).toBe('button');
    await page.evaluate(() => (window as any).__gridApi.focus());
    expect(await where(page)).toMatch(/\| r4 \| s1$/);
    // A virtualized-away target is scrolled back into view and focused.
    await scrollViewport(page, 36 * 300, null);
    await page.evaluate(() => (window as any).__gridApi.focus());
    await expect.poll(() => where(page)).toMatch(/\| r4 \| s1$/);
    // Header to content: focusHeader, then focusCell into the body.
    await page.evaluate(() => (window as any).__gridApi.focusHeader('s2'));
    expect(await page.evaluate(() => (window as any).__gridApi.getFocusedCell())).toEqual({ rowId: null, field: 's2', region: 'header' });
    await page.evaluate(() => (window as any).__gridApi.focusCell('r0', 's2'));
    expect(await where(page)).toMatch(/\| r0 \| s2$/);
    expect(await page.evaluate(() => (window as any).__gridApi.getFocusedCell())).toEqual({ rowId: 'r0', field: 's2', region: 'body' });
    // focus() moves to the content (like Alt+W): after focusHeader it focuses the
    // last focused body cell, not the header.
    await page.evaluate(() => (window as any).__gridApi.focusCell('r1', 's3'));
    await page.evaluate(() => (window as any).__gridApi.focusHeader('s2'));
    await page.locator('.app__after').focus();
    await page.evaluate(() => (window as any).__gridApi.focus());
    expect(await where(page)).toMatch(/\| r1 \| s3$/);
    // ArrowDown from the header moves into the content.
    await page.evaluate(() => (window as any).__gridApi.focusHeader('s2'));
    await page.keyboard.press('ArrowDown');
    expect(await where(page)).toMatch(/\| r0 \| s2$/);
    expect(problems).toEqual([]);
  });
});
