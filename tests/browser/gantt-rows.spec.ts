import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Gantt chart, timeline, export and API gates (examples/vite-spa/gantt.html?set=rows;
// checklist "Gantt Chart"): splitter and panes, cell editing, export hooks,
// horizontal virtualization, timeline extension, scroll methods, context menu,
// loading, serial numbers, notes, chart events, lookups and the part / state
// attributes with forced colors.

declare global {
  interface Window {
    __ganttApi: Record<string, any>;
    __ganttEvents: { id: string; type: string; value: any }[];
    __mountMs?: number;
  }
}

async function open(page: Page, query = 'set=rows'): Promise<void> {
  await page.goto(`${DEV_URL}gantt.html?${query}`);
  await page.waitForFunction(() => window.__mountMs !== undefined && Object.keys(window.__ganttApi).length > 0 && !document.querySelector('[data-salmon-pending]'));
  await page.locator('.salmon-gantt__row').first().waitFor();
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const api = <T,>(page: Page, id: string, fn: string, ...args: unknown[]) =>
  page.evaluate(([i, f, a]) => {
    const r = window.__ganttApi[i as string][f as string](...(a as unknown[]));
    return r && typeof r === 'object' && 'status' in r ? { status: r.status } : r;
  }, [id, fn, args] as const) as Promise<T>;
const events = (page: Page, id: string, type: string) => page.evaluate(([i, t]) => window.__ganttEvents.filter((e) => e.id === i && e.type === t), [id, type] as const);
const info = (page: Page, id: string, task: string) =>
  page.evaluate(([i, t]) => {
    const x = window.__ganttApi[i as string].getTaskInfo(t);
    return x ? { start: x.start?.toISOString(), end: x.end?.toISOString(), duration: x.duration, milestone: x.milestone, parentId: x.parentId, level: x.level, wbs: x.wbs, critical: x.critical, predecessors: x.predecessors } : null;
  }, [id, task] as const);
const gridWidth = (page: Page, id: string) => scope(page, id).locator('.salmon-gantt__grid-pane').evaluate((e) => Math.round(e.getBoundingClientRect().width));
const scrollLeft = (page: Page, id: string) => scope(page, id).locator('.salmon-gantt__chart-scroll').evaluate((e) => Math.abs(e.scrollLeft));
const innerWidth = (page: Page, id: string) => scope(page, id).locator('.salmon-gantt__chart-inner').evaluate((e) => (e as HTMLElement).offsetWidth);
/** Bottom-tier cells in the DOM: `{ x, title }`. */
const cells = (page: Page, id: string) =>
  scope(page, id)
    .locator('.salmon-gantt__tier[data-tier="bottom"] .salmon-gantt__tier-cell')
    .evaluateAll((els) => els.map((e) => ({ x: Number.parseFloat((e as HTMLElement).style.insetInlineStart), title: e.getAttribute('title') })));

test.describe('splitter and panes', () => {
  test('splitter position, columnIndex, pointer resize events, setSplitterPosition and the panes option', async ({ page }) => {
    await open(page);
    expect(Math.abs((await gridWidth(page, 'r-split')) - 300)).toBeLessThanOrEqual(2);
    // `columnIndex: 1`: the grid pane ends after the title column (ID 70 + Task name 220).
    expect(Math.abs((await gridWidth(page, 'r-cols')) - 292)).toBeLessThanOrEqual(2);
    const sep = scope(page, 'r-split').getByRole('separator');
    const b = (await sep.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 3 });
    await page.mouse.move(b.x + 100, b.y + b.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect.poll(() => gridWidth(page, 'r-split')).toBeGreaterThan(390);
    expect((await events(page, 'r-split', 'splitterResizeStart')).length).toBe(1);
    expect((await events(page, 'r-split', 'splitterResize')).length).toBeGreaterThan(0);
    const end = await events(page, 'r-split', 'splitterResizeEnd');
    expect(end.length).toBe(1);
    expect(Math.abs(end[0]!.value.position - (await gridWidth(page, 'r-split')))).toBeLessThanOrEqual(2);
    await api(page, 'r-split', 'setSplitterPosition', 200);
    await expect.poll(() => gridWidth(page, 'r-split')).toBe(200);
    // `panes`: one pane only.
    await expect(scope(page, 'r-grid').locator('.salmon-gantt__chart-pane')).toHaveCount(0);
    await expect(scope(page, 'r-grid').locator('.salmon-data-grid-row')).toHaveCount(9);
    await expect(scope(page, 'r-grid').getByRole('separator')).toHaveCount(0);
    await expect(scope(page, 'r-chart').locator('.salmon-gantt__chart-pane')).toBeVisible();
    await expect(scope(page, 'r-chart').locator('.salmon-gantt__row')).toHaveCount(9);
    await expect(scope(page, 'r-chart').locator('.salmon-gantt__hidden-grid')).toBeHidden();
  });
});

test.describe('editing', () => {
  test('a duration cell edit in the grid pane reschedules the task and its successors', async ({ page }) => {
    await open(page);
    const s = scope(page, 'r-edit');
    await s.scrollIntoViewIfNeeded();
    const before = await info(page, 'r-edit', '8');
    const cell = s.locator('.salmon-data-grid-row[data-row-id="6"] [data-column-id="duration"]');
    await expect(cell).toHaveText('5 days');
    await cell.dblclick();
    const editor = s.locator('.salmon-data-grid-row[data-row-id="6"] [data-column-id="duration"] input');
    await expect(editor).toBeVisible();
    await editor.fill('10 days');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await info(page, 'r-edit', '6'))?.duration).toBe(10);
    await expect(cell).toHaveText('10 days');
    // The successor (Integrate, 6FS) moves later: the edit went through the engine.
    await expect.poll(async () => new Date((await info(page, 'r-edit', '8'))!.start!).getTime()).toBeGreaterThan(new Date(before!.start!).getTime());
    const integrate = await info(page, 'r-edit', '8');
    expect(new Date(integrate!.start!).getTime()).toBeGreaterThanOrEqual(new Date((await info(page, 'r-edit', '6'))!.end!).getTime() - 1);
  });

  test('the dialog Notes tab edits the notes role; the grid notes column shows it', async ({ page }) => {
    await open(page);
    const s = scope(page, 'r-edit');
    await api(page, 'r-edit', 'openEditDialog', '3');
    const dialog = page.getByRole('dialog', { name: 'Edit task' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('tab', { name: 'Notes' }).click();
    const notes = dialog.getByRole('tabpanel').getByRole('textbox');
    await expect(notes).toHaveValue('Agree on the scope');
    await notes.fill('Scope signed off');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__ganttApi['r-edit'].getTask('3').notes)).toBe('Scope signed off');
    await api(page, 'r-edit', 'scrollToColumn', 'notes');
    await expect(s.locator('.salmon-data-grid-row[data-row-id="3"] [data-column-id="notes"]')).toHaveText('Scope signed off');
  });
});

test.describe('export', () => {
  test('Excel and CSV exports of the grid pane run the cell and headerCell hooks and the export events', async ({ page }) => {
    await open(page);
    const xlsx = await page.evaluate(async () => {
      let cells = 0;
      const file = await window.__ganttApi['r-edit'].exportToExcel({ fileName: 'plan.xlsx', cell: () => void cells++ });
      return { name: file.fileName, mime: file.mimeType, head: [...file.data.slice(0, 2)], size: file.data.length, cells };
    });
    expect(xlsx.name).toBe('plan.xlsx');
    expect(xlsx.mime).toContain('spreadsheetml');
    expect(xlsx.head).toEqual([0x50, 0x4b]);
    expect(xlsx.cells).toBeGreaterThan(9);
    const csv = await page.evaluate(async () => {
      const file = await window.__ganttApi['r-edit'].exportToCsv({ headerCell: (ctx: { text: string }) => ({ text: ctx.text.toUpperCase() }), cell: (ctx: { text: string; column: { field?: string } }) => (ctx.column.field === 'title' ? { text: `> ${ctx.text}` } : undefined) });
      return { name: file.fileName, data: file.data as string };
    });
    expect(csv.name).toBe('Gantt.csv');
    expect(csv.data).toContain('TASK NAME');
    expect(csv.data).toContain('> Scope');
    expect(csv.data).toContain('5 days');
    const before = await events(page, 'r-edit', 'beforeExport');
    expect(before.map((e) => e.value.format)).toEqual(['excel', 'csv']);
    expect((await events(page, 'r-edit', 'export')).map((e) => e.value.fileName)).toEqual(['plan.xlsx', 'Gantt.csv']);
  });

  test('PDF export draws both panes through exportWriters.pdf and runs the taskbar, timeline and cell hooks', async ({ page }) => {
    await open(page);
    const pdf = await page.evaluate(async () => {
      const seen = { bars: 0, tiers: 0, cells: 0, headers: 0, kinds: new Set<string>() };
      const file = await window.__ganttApi['r-edit'].exportToPdf({
        fileName: 'plan.pdf',
        pageSize: 'A4',
        orientation: 'landscape',
        fitToWidth: true,
        header: 'Launch plan',
        footer: 'Page',
        taskbar: (ctx: { info: { milestone: boolean; parent: boolean }; color: string }) => {
          seen.bars++;
          seen.kinds.add(ctx.info.milestone ? 'milestone' : ctx.info.parent ? 'parent' : 'task');
          ctx.color = '#aa0000';
        },
        timelineCell: () => void seen.tiers++,
        cell: () => void seen.cells++,
        headerCell: () => void seen.headers++,
      });
      const head = String.fromCharCode(...file.data.slice(0, 5));
      return { name: file.fileName, mime: file.mimeType, head, size: file.data.length, bars: seen.bars, tiers: seen.tiers, cells: seen.cells, headers: seen.headers, kinds: [...seen.kinds].sort() };
    });
    expect(pdf.name).toBe('plan.pdf');
    expect(pdf.mime).toBe('application/pdf');
    expect(pdf.head).toBe('%PDF-');
    expect(pdf.size).toBeGreaterThan(2000);
    expect(pdf.bars).toBe(9);
    expect(pdf.kinds).toEqual(['milestone', 'parent', 'task']);
    expect(pdf.tiers).toBeGreaterThan(5);
    expect(pdf.cells).toBeGreaterThan(9);
    expect(pdf.headers).toBeGreaterThan(3);
    expect((await events(page, 'r-edit', 'export')).map((e) => e.value.format)).toContain('pdf');
  });
});

test.describe('timeline', () => {
  test('tier cells render only in the horizontal window and follow the scroll', async ({ page }) => {
    await open(page);
    const s = scope(page, 'r-long');
    await s.scrollIntoViewIfNeeded();
    const width = await innerWidth(page, 'r-long');
    expect(width).toBeGreaterThan(20000);
    const first = await cells(page, 'r-long');
    // 700+ days at 33 px: only the window and its overscan are in the DOM.
    expect(first.length).toBeLessThan(150);
    expect(Math.max(...first.map((c) => c.x))).toBeLessThan(5000);
    await s.locator('.salmon-gantt__chart-scroll').evaluate((e) => (e.scrollLeft = 12000));
    await expect.poll(async () => Math.min(...(await cells(page, 'r-long')).map((c) => c.x))).toBeGreaterThan(8000);
    const moved = await cells(page, 'r-long');
    expect(moved.length).toBeLessThan(150);
    expect(moved.some((c) => c.x <= 12000 && c.x + 33 > 12000)).toBe(true);
  });

  test('extendTimeline and the infinite timeline widen the range at both ends', async ({ page }) => {
    await open(page);
    const s = scope(page, 'r-long');
    await s.scrollIntoViewIfNeeded();
    const w0 = await innerWidth(page, 'r-long');
    await api(page, 'r-long', 'extendTimeline', 'end');
    await expect.poll(() => innerWidth(page, 'r-long')).toBeGreaterThan(w0);
    const w1 = await innerWidth(page, 'r-long');
    // `start`: the range grows before the project and the view keeps its date.
    await s.locator('.salmon-gantt__chart-scroll').evaluate((e) => (e.scrollLeft = 1000));
    await expect.poll(() => scrollLeft(page, 'r-long')).toBe(1000);
    await api(page, 'r-long', 'extendTimeline', 'start');
    await expect.poll(() => innerWidth(page, 'r-long')).toBeGreaterThan(w1);
    const grown = (await innerWidth(page, 'r-long')) - w1;
    await expect.poll(() => scrollLeft(page, 'r-long')).toBe(1000 + grown);
    // `timeline.infinite`: scrolling to the end extends it again.
    const w2 = await innerWidth(page, 'r-long');
    await s.locator('.salmon-gantt__chart-scroll').evaluate((e) => (e.scrollLeft = e.scrollWidth));
    await expect.poll(() => innerWidth(page, 'r-long')).toBeGreaterThan(w2);
  });

  test('scrollToDate, scrollToTask, scrollTo and focusTaskOnSelect move the chart', async ({ page }) => {
    await open(page);
    const s = scope(page, 'r-long');
    await s.scrollIntoViewIfNeeded();
    await api(page, 'r-long', 'scrollToDate', '2026-06-01');
    await expect.poll(async () => (await cells(page, 'r-long')).find((c) => c.title === 'Monday, June 1, 2026')?.x).toBe(await scrollLeft(page, 'r-long'));
    expect(await scrollLeft(page, 'r-long')).toBeGreaterThan(4000);
    // scrollToTask: the bar starts 40 px after the chart's inline start; the grid scrolls the row into view.
    await api(page, 'r-long', 'scrollToTask', '20');
    await expect(s.locator('.salmon-data-grid-row[data-row-id="20"]')).toBeVisible();
    const bar = s.locator('.salmon-gantt__row[data-task-id="20"] [data-part="taskbar"]');
    await expect.poll(async () => Math.round((await bar.evaluate((e) => Number.parseFloat((e as HTMLElement).style.insetInlineStart))) - (await scrollLeft(page, 'r-long')))).toBe(40);
    await api(page, 'r-long', 'scrollTo', { left: 500, top: 0 });
    await expect.poll(() => scrollLeft(page, 'r-long')).toBe(500);
    await expect(s.locator('.salmon-data-grid-row[data-row-id="1"]')).toBeVisible();
    // Selecting a task from outside the chart scrolls its bar into view (`focusTaskOnSelect`, default true).
    await api(page, 'r-long', 'selectRows', ['5']);
    const x5 = await s.locator('.salmon-gantt__row[data-task-id="5"] [data-part="taskbar"]').evaluate((e) => Number.parseFloat((e as HTMLElement).style.insetInlineStart));
    await expect.poll(() => scrollLeft(page, 'r-long')).toBe(Math.max(0, Math.round(x5 - 40)));
  });
});

test.describe('chart events and lookups', () => {
  test('onTaskbarClick, onRowDoubleClick and onChartPointerMove (at most once per frame)', async ({ page }) => {
    await open(page);
    const s = scope(page, 'r-long');
    await s.scrollIntoViewIfNeeded();
    const bar = s.locator('.salmon-gantt__row[data-task-id="2"] [data-part="taskbar"]');
    await bar.click();
    const clicks = await events(page, 'r-long', 'taskbarClick');
    expect(clicks.at(-1)?.value).toMatchObject({ taskId: '2', target: 'taskbar' });
    await expect.poll(async () => (await events(page, 'r-long', 'chartPointerMove')).length).toBeGreaterThan(0);
    const moves = await events(page, 'r-long', 'chartPointerMove');
    expect(moves.at(-1)?.value.taskId).toBe('2');
    expect(moves.at(-1)?.value.date.slice(0, 10)).toMatch(/^2026-02-0[4-9]$/);
    // A burst of moves within one frame reports once.
    const n = await page.evaluate(async () => {
      const el = document.querySelector('[data-scenario="r-long"] .salmon-gantt__chart-body') as HTMLElement;
      const r = el.getBoundingClientRect();
      const count = () => window.__ganttEvents.filter((e) => e.id === 'r-long' && e.type === 'chartPointerMove').length;
      await new Promise((f) => requestAnimationFrame(() => f(null)));
      const before = count();
      for (let i = 0; i < 10; i++) el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 20 + i * 5, clientY: r.top + 10 }));
      await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(() => f(null))));
      return count() - before;
    });
    expect(n).toBe(1);
    await s.locator('.salmon-data-grid-row[data-row-id="3"] .salmon-data-grid-cell').first().dblclick();
    await expect.poll(async () => (await events(page, 'r-long', 'rowDoubleClick')).length).toBeGreaterThan(0);
  });

  test('getTask, getTaskInfo, getViewRows, getRowElement and getTaskbarElement by id', async ({ page }) => {
    await open(page);
    await api(page, 'r-edit', 'collapseRows', ['2']);
    await expect(scope(page, 'r-edit').locator('.salmon-data-grid-row[data-row-id="4"]')).toHaveCount(0);
    const r = await page.evaluate(() => {
      const a = window.__ganttApi['r-edit'];
      const info = a.getTaskInfo('4');
      return {
        task: a.getTask('3').title,
        info: { parentId: info.parentId, level: info.level, wbs: info.wbs, duration: info.duration, durationUnit: info.durationUnit, predecessors: info.predecessors.map((d: any) => d.id + d.type), parent: info.parent },
        parent: a.getTaskInfo('5').parent,
        view: a.getViewRows().map((x: any) => x.id),
        row: a.getRowElement('5')?.getAttribute('data-row-id'),
        hiddenRow: a.getRowElement('4'),
        bar: a.getTaskbarElement('5')?.getAttribute('data-part'),
        unknown: a.getTask('99') ?? null,
      };
    });
    expect(r.task).toBe('Scope');
    expect(r.info).toEqual({ parentId: '2', level: 2, wbs: '1.1.2', duration: 3, durationUnit: 'day', predecessors: ['3fs'], parent: false });
    expect(r.parent).toBe(true);
    expect(r.view).toEqual([1, 2, 5, 6, 7, 8, 9]);
    expect(r.row).toBe('5');
    expect(r.hiddenRow).toBeNull();
    expect(r.bar).toBe('taskbar');
    expect(r.unknown).toBeNull();
  });
});

test.describe('menus, loading and serial numbers', () => {
  test('the context menu of the grid pane and of a taskbar runs the Gantt items', async ({ page }) => {
    await open(page);
    const s = scope(page, 'r-edit');
    await s.scrollIntoViewIfNeeded();
    await s.locator('.salmon-data-grid-row[data-row-id="4"] [data-column-id="title"]').click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Add child' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Convert to milestone' })).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Add child' }).click();
    await expect.poll(async () => (await info(page, 'r-edit', '10'))?.parentId).toBe('4');
    expect((await events(page, 'r-edit', 'contextMenuItemClick')).at(-1)?.value).toMatchObject({ item: 'gantt:addChild', taskId: '4' });
    await expect(s.locator('.salmon-gantt__row[data-task-id="10"]')).toHaveCount(1);
    // The chart pane: right-click a taskbar.
    await s.locator('.salmon-gantt__row[data-task-id="6"] [data-part="taskbar"]').click({ button: 'right' });
    const chartMenu = page.getByRole('menu');
    await expect(chartMenu.getByRole('menuitem', { name: 'Convert to milestone' })).toBeVisible();
    await chartMenu.getByRole('menuitem', { name: 'Convert to milestone' }).click();
    await expect.poll(async () => (await info(page, 'r-edit', '6'))?.milestone).toBe(true);
    await expect(s.locator('.salmon-gantt__row[data-task-id="6"] [data-part="milestone"]')).toHaveCount(1);
  });

  test('setLoading shows the busy state on both panes', async ({ page }) => {
    await open(page);
    const root = scope(page, 'r-edit').locator('.salmon-gantt');
    await expect(root).not.toHaveAttribute('aria-busy', 'true');
    await api(page, 'r-edit', 'setLoading', true);
    await expect(root).toHaveAttribute('aria-busy', 'true');
    await expect(root).toHaveAttribute('data-loading', 'true');
    await expect(scope(page, 'r-edit').locator('.salmon-data-grid')).toHaveAttribute('aria-busy', 'true');
    await api(page, 'r-edit', 'setLoading', false);
    await expect(root).not.toHaveAttribute('aria-busy', 'true');
    await expect(scope(page, 'r-edit').locator('.salmon-data-grid')).not.toHaveAttribute('aria-busy', 'true');
  });

  test("the 'serialNumber' column numbers the rows in view order after sort and collapse", async ({ page }) => {
    await open(page);
    const s = scope(page, 'r-edit');
    const numbers = () =>
      s.evaluate((el) =>
        [...el.querySelectorAll<HTMLElement>('.salmon-data-grid-row[data-row-id]')]
          .sort((a, b) => Number(a.dataset['rowIndex']) - Number(b.dataset['rowIndex']))
          .map((r) => [r.dataset['rowId'], r.querySelector('[data-column-id="serialNumber"]')?.textContent]),
      );
    await expect(s.locator('.salmon-data-grid-header-cell[data-column-id="serialNumber"]')).toHaveText('S.No');
    expect(await numbers()).toEqual([['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9']]);
    await api(page, 'r-edit', 'sortColumn', 'title', 'asc');
    await expect.poll(numbers).toEqual([['1', '1'], ['5', '2'], ['6', '3'], ['7', '4'], ['8', '5'], ['2', '6'], ['4', '7'], ['3', '8'], ['9', '9']]);
    await api(page, 'r-edit', 'collapseRows', ['5']);
    await expect.poll(numbers).toEqual([['1', '1'], ['5', '2'], ['2', '3'], ['4', '4'], ['3', '5'], ['9', '6']]);
  });
});

test.describe('theming parts', () => {
  test('parts carry data-* state; forced colors keep bars and connectors visible', async ({ page }) => {
    await open(page);
    const s = scope(page, 'r-edit');
    await expect(s.locator('.salmon-gantt__taskbar[data-part="taskbar"]').first()).toBeAttached();
    await expect(s.locator('.salmon-gantt__progress').first()).toBeAttached();
    await expect(s.locator('.salmon-gantt__baseline[data-part="baseline"]')).toHaveCount(1);
    await expect(s.locator('.salmon-gantt__milestone[data-part="milestone"]')).toHaveCount(1);
    await expect(s.locator('.salmon-gantt__connector[data-part="connector"]').first()).toBeAttached();
    // `criticalPath`: critical bars and links; task 7 is manual.
    await expect(s.locator('.salmon-gantt__taskbar[data-critical]').first()).toBeAttached();
    await expect(s.locator('.salmon-gantt__connector[data-critical]').first()).toBeAttached();
    await expect(s.locator('.salmon-gantt__row[data-task-id="7"] .salmon-gantt__taskbar')).toHaveAttribute('data-manual', 'true');
    await expect(s.locator('.salmon-gantt__row[data-task-id="6"] .salmon-gantt__taskbar')).not.toHaveAttribute('data-manual', 'true');
    await page.emulateMedia({ forcedColors: 'active' });
    const style = await s.evaluate((el) => {
      const bar = getComputedStyle(el.querySelector('.salmon-gantt__row[data-task-id="6"] .salmon-gantt__taskbar')!);
      const path = getComputedStyle(el.querySelector('.salmon-gantt__connector path')!);
      return { border: bar.borderTopStyle, width: bar.borderTopWidth, stroke: path.stroke };
    });
    expect(style.border).toBe('solid');
    expect(style.width).toBe('1px');
    expect(style.stroke).not.toBe('none');
  });
});
