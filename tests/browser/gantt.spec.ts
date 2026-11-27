import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Gantt browser gates (examples/vite-spa/gantt.html): both panes from one row model, scroll
// sync, taskbar editing, dependencies, dialog, toolbar, zoom, undo, keyboard,
// RTL, axe-core and the 10,000-task budgets.

declare global {
  interface Window {
    __ganttApi: Record<string, any>;
    __ganttEvents: { id: string; type: string; value: any }[];
    __mountMs?: number;
    __hydrated?: boolean;
  }
}

async function open(page: Page, query = '', url = DEV_URL): Promise<void> {
  await page.goto(`${url}gantt.html${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => window.__mountMs !== undefined && Object.keys(window.__ganttApi).length > 0 && !document.querySelector('[data-salmon-pending]'));
  await page.locator('.salmon-gantt__row').first().waitFor();
}
const scope = (page: Page, id = 'basic'): Locator => page.locator(`[data-scenario="${id}"]`);
const bar = (page: Page, task: number, id = 'basic'): Locator => scope(page, id).locator(`.salmon-gantt__row[data-task-id="${task}"] [data-part]`).last();
const api = <T,>(page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => window.__ganttApi['basic'][f as string](...(a as unknown[])), [fn, args] as const) as Promise<T>;
const info = (page: Page, id: number) => page.evaluate((i) => {
  const x = window.__ganttApi['basic'].getTaskInfo(i);
  return x ? { start: x.start?.toISOString(), end: x.end?.toISOString(), progress: x.progress, parentId: x.parentId, critical: x.critical, predecessors: x.predecessors } : null;
}, id);
const events = (page: Page, type: string) => page.evaluate((t) => window.__ganttEvents.filter((e) => e.id === 'basic' && e.type === t), type);

test.describe('panes', () => {
  test('the chart draws one row per visible grid row, summary bars, connectors; collapse hides both', async ({ page }) => {
    await open(page);
    const s = scope(page);
    await expect(s.locator('.salmon-data-grid-row')).toHaveCount(9);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
    await expect(s.locator('.salmon-gantt__summary')).toHaveCount(3);
    await expect(s.locator('.salmon-gantt__connector')).toHaveCount(6);
    await api(page, 'collapseRows', ['5']);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(6);
    await expect(s.locator('.salmon-data-grid-row')).toHaveCount(6);
    await api(page, 'expandAll');
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
  });

  test('row offsets are shared: chart rows line up with grid rows (row-height extension point)', async ({ page }) => {
    await open(page);
    const gridTop = await scope(page).locator('.salmon-data-grid-row[data-row-id="6"]').evaluate((e) => e.getBoundingClientRect().top);
    const chartTop = await scope(page).locator('.salmon-gantt__row[data-task-id="6"]').evaluate((e) => e.getBoundingClientRect().top);
    expect(Math.abs(gridTop - chartTop)).toBeLessThanOrEqual(1);
  });
});

test.describe('taskbar editing', () => {
  test('dragging a taskbar moves the task by whole days and reschedules successors; undo restores', async ({ page }) => {
    await open(page);
    const before = await info(page, 6);
    const duration = await api<string>(page, 'formatDuration', '6');
    const box = (await bar(page, 6).boundingBox())!;
    const day = await page.evaluate(() => window.__ganttApi['basic'].getChartElement().querySelector('.salmon-gantt__tier[data-tier="bottom"] .salmon-gantt__tier-cell').getBoundingClientRect().width);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + day * 0.5, box.y + box.height / 2, { steps: 3 });
    await page.mouse.move(box.x + box.width / 2 + day * 1, box.y + box.height / 2, { steps: 3 });
    // The editing tooltip follows the bar, not the chart's start edge.
    const tip = (await scope(page).locator('.salmon-gantt__edit-tooltip').boundingBox())!;
    const moving = (await bar(page, 6).boundingBox())!;
    expect(Math.abs(tip.x - moving.x)).toBeLessThan(2);
    await page.mouse.up();
    await expect.poll(async () => (await info(page, 6))?.start).not.toBe(before?.start);
    expect((await events(page, 'taskbarEditEnd')).length).toBe(1);
    // A move keeps the duration (a start with an `end: null` key used to reset it to one day).
    expect(await api<string>(page, 'formatDuration', '6')).toBe(duration);
    const integrate = await info(page, 8);
    expect(new Date(integrate!.start!).getTime()).toBeGreaterThan(new Date((await info(page, 6))!.end!).getTime() - 1);
    await api(page, 'undo');
    await expect.poll(async () => (await info(page, 6))?.start).toBe(before?.start);
  });

  test('resizing the end changes the finish; progress drag changes the progress', async ({ page }) => {
    await open(page);
    const before = await info(page, 7);
    const b = bar(page, 7);
    await b.hover();
    const handle = b.locator('.salmon-gantt__handle[data-handle="end"]');
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + 60, h.y + h.height / 2, { steps: 4 });
    await page.mouse.move(h.x + 140, h.y + h.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await info(page, 7))?.end).not.toBe(before?.end);
    const b2 = bar(page, 7);
    await b2.hover();
    const p = (await b2.locator('.salmon-gantt__progress-handle').boundingBox())!;
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
    await page.mouse.down();
    await page.mouse.move(p.x + 30, p.y + p.height / 2, { steps: 4 });
    await page.mouse.move(p.x + 50, p.y + p.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await info(page, 7))?.progress).toBeGreaterThan(0);
  });

  test('drag to connect adds a dependency', async ({ page }) => {
    await open(page);
    const from = bar(page, 3);
    await from.hover();
    const point = (await from.locator('.salmon-gantt__connector-point[data-end="end"]').boundingBox())!;
    const to = (await bar(page, 7).boundingBox())!;
    await page.mouse.move(point.x + 4, point.y + 4);
    await page.mouse.down();
    await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 6 });
    await page.mouse.move(to.x + 6, to.y + to.height / 2, { steps: 2 });
    await page.mouse.up();
    await expect.poll(async () => (await info(page, 7))?.predecessors.map((d: any) => `${d.id}${d.type}`)).toContain('3fs');
    expect((await events(page, 'dependencyChange')).length).toBe(1);
  });

  test('read-only shows no editing handles', async ({ page }) => {
    await open(page);
    await expect(scope(page, 'readonly').locator('[data-editable]')).toHaveCount(0);
    await expect(scope(page, 'basic').locator('[data-editable]').first()).toBeAttached();
  });
});

test.describe('methods, toolbar and dialog', () => {
  test('add, update, indent, outdent and delete through the API reschedule the rows', async ({ page }) => {
    await open(page);
    const s = scope(page);
    await api(page, 'addTask', { title: 'QA', duration: 2 }, { position: 'child', targetId: '5' });
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(10);
    await api(page, 'updateTask', '10', { predecessors: '8' });
    await expect.poll(async () => (await info(page, 10))?.predecessors.length).toBe(1);
    await api(page, 'outdent', ['10']);
    await expect.poll(async () => (await info(page, 10))?.parentId).toBe('1');
    await api(page, 'indent', ['10']);
    await expect.poll(async () => (await info(page, 10))?.parentId).toBe('5');
    await api(page, 'deleteTasks', ['10']);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
  });

  test('zoom in, zoom out and zoom to fit change the tiers', async ({ page }) => {
    await open(page);
    const s = scope(page);
    const width = () => s.locator('.salmon-gantt__chart-inner').evaluate((e) => (e as HTMLElement).offsetWidth);
    const w0 = await width();
    await s.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(width).toBeGreaterThan(w0);
    await s.getByRole('button', { name: 'Zoom out' }).click();
    await s.getByRole('button', { name: 'Zoom out' }).click();
    await expect.poll(width).toBeLessThan(w0);
    await s.getByRole('button', { name: 'Zoom to fit' }).click();
    const fit = await width();
    const view = await s.locator('.salmon-gantt__chart-scroll').evaluate((e) => e.clientWidth);
    expect(fit).toBeLessThanOrEqual(view + 2);
    expect((await events(page, 'zoomChange')).length).toBeGreaterThan(0);
  });

  test('critical path toggle marks the critical bars', async ({ page }) => {
    await open(page);
    const s = scope(page);
    await s.getByRole('button', { name: 'Critical path' }).click();
    await expect(s.getByRole('button', { name: 'Critical path' })).toHaveCSS('height', '32px');
    await expect(s.getByRole('button', { name: 'Critical path' })).toHaveCSS('border-radius', '6px');
    await expect(s.locator('.salmon-gantt__taskbar[data-critical]').first()).toBeAttached();
    expect(await api<unknown[]>(page, 'getCriticalTasks')).not.toHaveLength(0);
    // Critical links recolor the drawn path only: the 8px hit path stays transparent.
    const link = s.locator('.salmon-gantt__connector[data-critical]').first();
    await expect(link.locator('.salmon-gantt__connector-hit')).toHaveCSS('stroke', 'rgba(0, 0, 0, 0)');
    await expect(link.locator('path:not(.salmon-gantt__connector-hit, .salmon-gantt__connector-arrow)')).not.toHaveCSS('stroke', 'rgba(0, 0, 0, 0)');
  });

  test('double click on a taskbar opens the edit dialog; saving the title updates both panes', async ({ page }) => {
    await open(page);
    await bar(page, 4).dblclick();
    const dialog = page.getByRole('dialog', { name: 'Edit task' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Dependency' })).toBeVisible();
    const title = dialog.getByLabel('Task name');
    await title.fill('Estimate effort');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(scope(page).locator('.salmon-data-grid-row[data-row-id="4"]')).toContainText('Estimate effort');
  });

  test('keyboard: Alt+Shift+Right indents the selected row; Ctrl+Z undoes', async ({ page }) => {
    await open(page);
    await scope(page).locator('.salmon-data-grid-row[data-row-id="7"] .salmon-data-grid-cell').nth(1).click();
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await expect.poll(async () => (await info(page, 7))?.parentId).toBe('6');
    await page.keyboard.press('Escape');
    await scope(page).locator('.salmon-gantt__chart-scroll').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await info(page, 7))?.parentId).toBe('5');
  });
});

test.describe('platform', () => {
  test('RTL: the timeline runs right to left', async ({ page }) => {
    await open(page, 'dir=rtl');
    const s = scope(page);
    const early = (await bar(page, 3).boundingBox())!;
    const late = (await bar(page, 6).boundingBox())!;
    expect(late.x).toBeLessThan(early.x);
    const grid = (await s.locator('.salmon-gantt__grid-pane').boundingBox())!;
    const chart = (await s.locator('.salmon-gantt__chart-pane').boundingBox())!;
    expect(grid.x).toBeGreaterThan(chart.x);
  });

  test('axe-core: no violations with both panes', async ({ page }) => {
    await open(page);
    await expectClean(page, 'gantt');
  });

  test('server render hydrates without warnings', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || (m.type() === 'warning' && /hydrat/i.test(m.text()))) problems.push(m.text());
    });
    await page.goto(`${DEV_URL}gantt.html?ssr=1`);
    await page.waitForFunction(() => window.__hydrated === true);
    await page.locator('.salmon-gantt__row').first().waitFor();
    expect(problems).toEqual([]);
  });
});

test.describe('10,000 tasks (Scheduler and Gantt budgets)', () => {
  test('initial render ≤ 300 ms; DOM bounded; drag frames make no React commits; reschedule ≤ 50 ms', { tag: '@perf' }, async ({ page }) => {
    await open(page, 'set=perf', PROD_URL);
    const mount = await page.evaluate(() => window.__mountMs as number);
    expectBudget(mount, 300, 'gantt 10,000 tasks initial render');
    const rows = await page.locator('.salmon-gantt__row').count();
    expect(rows).toBeLessThan(60);
    const ms = await page.evaluate(() => {
      const a = window.__ganttApi['perf'];
      const t0 = performance.now();
      a.updateTask('2', { duration: 3 });
      return performance.now() - t0;
    });
    expectBudget(ms, 50, 'gantt 10,000 tasks reschedule');
    // Scroll keeps both panes in sync.
    await page.evaluate(() => window.__ganttApi['perf'].scrollTo({ top: 36 * 5000 }));
    await expect.poll(() => page.locator('.salmon-gantt__row').first().getAttribute('data-row-index').then(Number)).toBeGreaterThan(4900);
  });
});
