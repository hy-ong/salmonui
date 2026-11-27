import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// Gantt resource view, multi-taskbar, lanes, drag between rows, split-task
// segment drag and chart tooltips (examples/vite-spa/gantt-resources.html;
// checklist).

declare global {
  interface Window {
    __ganttApi: Record<string, any>;
    __ganttEvents: { id: string; type: string; value: any }[];
    __mountMs?: number;
  }
}

async function open(page: Page): Promise<void> {
  await page.goto(`${DEV_URL}gantt-resources.html`);
  await page.waitForFunction(() => window.__mountMs !== undefined && Object.keys(window.__ganttApi).length >= 5);
  await page.locator('[data-scenario="resources"] .salmon-gantt__row').first().waitFor();
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const call = <T,>(page: Page, id: string, fn: string, ...args: unknown[]) => page.evaluate(([s, f, a]) => window.__ganttApi[s as string][f as string](...(a as unknown[])), [id, fn, args] as const) as Promise<T>;
const dayWidth = (page: Page, id: string) => scope(page, id).locator('.salmon-gantt__tier[data-tier="bottom"] .salmon-gantt__tier-cell').first().evaluate((e) => e.getBoundingClientRect().width);
const resourcesOf = (page: Page, id: string, task: number) => page.evaluate(([s, t]) => ((window.__ganttApi[s as string].getTask(t).resources ?? []) as { id: string }[]).map((r) => r.id), [id, task] as const);

test.describe('resource view', () => {
  test('rows are grouped by resource with an Unassigned row; both panes show the same rows', async ({ page }) => {
    await open(page);
    const s = scope(page, 'resources');
    // Ana: 2, 3, 4; Ben: 4; Unassigned: 5.
    await expect(s.locator('.salmon-data-grid-row')).toHaveCount(8);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(8);
    await expect(s.locator('.salmon-gantt__row--resource')).toHaveCount(3);
    const titles = await s.locator('.salmon-gantt__row--resource [role="img"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(titles).toEqual(['Ana, 3 tasks', 'Ben, 1 task', 'Unassigned, 1 task']);
    // A task with two resources is shown under each.
    await expect(s.locator('.salmon-gantt__row[data-task-id="4"]')).toHaveCount(2);
    await expect(s.locator('.salmon-gantt__row[data-row-key="4@r2"][data-resource="r2"]')).toHaveCount(1);
    // Grid rows and chart rows line up.
    const gridTop = await s.locator('.salmon-data-grid-row[data-row-id="4@r2"]').evaluate((e) => e.getBoundingClientRect().top);
    const chartTop = await s.locator('.salmon-gantt__row[data-row-key="4@r2"]').evaluate((e) => e.getBoundingClientRect().top);
    expect(Math.abs(gridTop - chartTop)).toBeLessThanOrEqual(1);
    // Id-addressed methods keep working; collapsing a resource hides its tasks in both panes.
    expect(await call(page, 'resources', 'getTaskInfo', 2)).toBeTruthy();
    await call(page, 'resources', 'collapseRows', ['__res:r1']);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(5);
    await expect(s.locator('.salmon-data-grid-row')).toHaveCount(5);
  });

  test('over-allocated ranges are marked in the resource row and on the bars', async ({ page }) => {
    await open(page);
    const s = scope(page, 'resources');
    const ana = s.locator('.salmon-gantt__row--resource[data-resource="r1"]');
    await expect(ana.locator('[data-part="overAllocation"]')).toHaveCount(1);
    await expect(s.locator('.salmon-gantt__row--resource[data-resource="r2"] [data-part="overAllocation"]')).toHaveCount(0);
    await expect(s.locator('.salmon-gantt__row[data-row-key="2"] [data-part="taskbar"][data-over-allocated]')).toHaveCount(1);
    await expect(s.locator('.salmon-gantt__row[data-row-key="3"] [data-part="taskbar"][data-over-allocated]')).toHaveCount(1);
    await expect(s.locator('.salmon-gantt__row[data-row-key="5"] [data-over-allocated]')).toHaveCount(0);
    // Moving Research after Design clears the over-allocation.
    await call(page, 'resources', 'updateTask', 3, { start: new Date('2026-03-05T08:00:00Z') });
    await expect(ana.locator('[data-part="overAllocation"]')).toHaveCount(0);
  });

  test('axe-core: no violations in the resource view', async ({ page }) => {
    await open(page);
    await expectClean(page, 'gantt resources');
  });
});

test.describe('multi-taskbar and lanes', () => {
  test('a collapsed parent draws its children bars; expanding shows the summary again', async ({ page }) => {
    await open(page);
    const s = scope(page, 'multi');
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(1);
    await expect(s.locator('.salmon-gantt__row[data-task-id="1"] [data-part="multiTaskbar"]')).toHaveCount(4);
    await expect(s.locator('.salmon-gantt__summary[data-multi]')).toHaveCount(1);
    await call(page, 'multi', 'expandAll');
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(5);
    await expect(s.locator('[data-part="multiTaskbar"]')).toHaveCount(0);
  });

  test('taskbarOverlap false stacks overlapping bars in lanes and grows the resource row in both panes', async ({ page }) => {
    await open(page);
    const s = scope(page, 'lanes');
    const ana = s.locator('.salmon-gantt__row--resource[data-resource="r1"]');
    await expect(ana.locator('[data-part="multiTaskbar"]')).toHaveCount(3);
    const lane = (t: number) => ana.locator(`[data-part="multiTaskbar"][data-task-id="${t}"]`).getAttribute('data-lane');
    expect(await lane(2)).toBe('0');
    expect(await lane(3)).toBe('1');
    expect(await lane(4)).toBe('0');
    const chartH = await ana.evaluate((e) => e.getBoundingClientRect().height);
    const gridH = await s.locator('.salmon-data-grid-row[data-row-id="__res:r1"]').evaluate((e) => e.getBoundingClientRect().height);
    expect(chartH).toBeGreaterThan(36);
    expect(Math.abs(chartH - gridH)).toBeLessThanOrEqual(1);
    // Ben has one task: one lane, the default height.
    const ben = await s.locator('.salmon-gantt__row--resource[data-resource="r2"]').evaluate((e) => e.getBoundingClientRect().height);
    expect(ben).toBe(36);
  });
});

/** Drags the center of `bar` by (dx, dy) in small steps. */
async function drag(page: Page, bar: Locator, dx: number, dy: number): Promise<void> {
  await bar.scrollIntoViewIfNeeded();
  const box = (await bar.boundingBox())!;
  const x = box.x + Math.min(box.width / 2, 12);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test.describe('drag between rows', () => {
  test('in the resource view, dropping a bar on another resource reassigns the task; undo restores', async ({ page }) => {
    await open(page);
    const s = scope(page, 'resources');
    const from = s.locator('.salmon-gantt__row[data-row-key="2"] [data-part="taskbar"]');
    const target = s.locator('.salmon-gantt__row--resource[data-resource="r2"]');
    const dy = (await target.boundingBox())!.y - (await from.boundingBox())!.y + 4;
    await drag(page, from, 0, dy);
    await expect.poll(() => resourcesOf(page, 'resources', 2)).toEqual(['r2']);
    await expect(s.locator('.salmon-gantt__row[data-row-key="2@r2"], .salmon-gantt__row[data-row-key="2"][data-resource="r2"]')).toHaveCount(1);
    await call(page, 'resources', 'undo');
    await expect.poll(() => resourcesOf(page, 'resources', 2)).toEqual(['r1']);
  });

  test('in the project view, dropping a bar on another row moves the task below it', async ({ page }) => {
    await open(page);
    const s = scope(page, 'rows');
    const order = () => page.evaluate(() => (window.__ganttApi['rows'].getViewRows() as { id: number }[]).map((r) => r.id));
    expect(await order()).toEqual([1, 2, 3, 4, 5]);
    await s.scrollIntoViewIfNeeded();
    const from = s.locator('.salmon-gantt__row[data-task-id="2"] [data-part="taskbar"]');
    const to = s.locator('.salmon-gantt__row[data-task-id="4"]');
    const dy = (await to.boundingBox())!.y - (await from.boundingBox())!.y + 6;
    await drag(page, from, 0, dy);
    await expect.poll(order).toEqual([1, 3, 4, 2, 5]);
    expect((await page.evaluate(() => window.__ganttEvents.filter((e) => e.id === 'rows' && e.type === 'taskChange'))).at(-1)?.value.action).toBe('move');
  });
});

test.describe('split tasks', () => {
  test('dragging a segment moves it; resizing its end changes its length', async ({ page }) => {
    await open(page);
    const s = scope(page, 'split');
    const segs = () => page.evaluate(() => (window.__ganttApi['split'].getTaskInfo(1).segments as { start: Date; end: Date }[]).map((x) => [x.start.toISOString().slice(0, 10), x.end.toISOString().slice(0, 10)]));
    const before = await segs();
    expect(before).toHaveLength(2);
    const day = await dayWidth(page, 'split');
    const second = s.locator('.salmon-gantt__row[data-task-id="1"] .salmon-gantt__segment[data-segment="1"]');
    await s.scrollIntoViewIfNeeded();
    const box = (await second.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + day * 0.6, box.y + box.height / 2, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2 + day * 1.1, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await segs())[1]![0]).not.toBe(before[1]![0]);
    const moved = await segs();
    expect(moved[0]).toEqual(before[0]);
    // Resize the first segment's end by one day.
    const first = s.locator('.salmon-gantt__row[data-task-id="1"] .salmon-gantt__segment[data-segment="0"]');
    await first.hover();
    const h = (await first.locator('.salmon-gantt__handle[data-handle="end"]').boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + day * 0.6, h.y + h.height / 2, { steps: 4 });
    await page.mouse.move(h.x + day * 1.1, h.y + h.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await segs())[0]![1]).not.toBe(moved[0]![1]);
  });
});

test.describe('tooltips', () => {
  test('hovering a taskbar opens one Tooltip with its dates; baselines and connectors have their own', async ({ page }) => {
    await open(page);
    const s = scope(page, 'resources');
    await page.waitForFunction(() => document.querySelector('[data-scenario="resources"] .salmon-gantt__chart'));
    await page.waitForTimeout(1700); // the tooltip chunk loads when idle
    await s.locator('.salmon-gantt__row[data-row-key="2"] [data-part="taskbar"]').hover();
    const tip = page.locator('.salmon-tooltip').filter({ hasText: 'Design' });
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('Start:');
    await expect(tip).toContainText('Progress:');
    const describedBy = await s.locator('.salmon-gantt__row[data-row-key="2"] [data-part="taskbar"]').getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect((await page.evaluate(() => window.__ganttEvents.filter((e) => e.id === 'resources' && e.type === 'beforeTooltipOpen'))).at(-1)?.value.kind).toBe('taskbar');
    await page.mouse.move(0, 0);
    await expect(page.locator('.salmon-tooltip')).toHaveCount(0);
    await s.locator('.salmon-gantt__row[data-row-key="3"] [data-part="baseline"]').hover();
    await expect(page.locator('.salmon-tooltip').filter({ hasText: 'Baseline: Research' })).toBeVisible();
    // No tooltip without the prop.
    await page.mouse.move(0, 0);
    await scope(page, 'rows').locator('.salmon-gantt__row[data-task-id="2"] [data-part="taskbar"]').hover();
    await page.waitForTimeout(600);
    await expect(page.locator('.salmon-tooltip')).toHaveCount(0);
  });
});
