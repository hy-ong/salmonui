import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEV_URL } from './helpers.ts';

// Gantt remote writes, loading placeholders and the adaptive layout
// (examples/vite-spa/gantt.html?set=grid; checklist): a writable source receives every change with a signal, pending
// tasks, revert and `onError`; the chart mirrors the grid's skeletons; below
// the breakpoint one pane shows at a time.

declare global {
  interface Window {
    __ganttApi: Record<string, any>;
    __ganttEvents: { id: string; type: string; value: any }[];
    __mountMs?: number;
    __ganttWrite: { mode: 'resolve' | 'reject' | 'hold'; held: (() => void)[] };
    __ganttRelease: Record<string, () => void>;
  }
}

async function open(page: Page): Promise<void> {
  await page.goto(`${DEV_URL}gantt.html?set=grid`);
  await page.waitForFunction(() => window.__mountMs !== undefined && Object.keys(window.__ganttApi).length >= 6 && !document.querySelector('[data-salmon-pending]'));
  await page.locator('[data-scenario="g-query"] .salmon-gantt__row').first().waitFor();
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const api = <T,>(page: Page, id: string, fn: string, ...args: unknown[]) =>
  page.evaluate(([i, f, a]) => {
    const r = window.__ganttApi[i as string][f as string](...(a as unknown[]));
    return r && typeof r === 'object' && 'status' in r ? { status: r.status } : Array.isArray(r) ? JSON.parse(JSON.stringify(r)) : r;
  }, [id, fn, args] as const) as Promise<T>;
const events = (page: Page, id: string, type: string) => page.evaluate(([i, t]) => window.__ganttEvents.filter((e) => e.id === i && e.type === t), [id, type] as const);
const info = (page: Page, id: string, task: string) =>
  page.evaluate(([i, t]) => {
    const x = window.__ganttApi[i as string].getTaskInfo(t);
    return x ? { start: x.start?.toISOString(), end: x.end?.toISOString(), parentId: x.parentId, parent: x.parent } : null;
  }, [id, task] as const);
const pending = (page: Page, id: string) => scope(page, id).locator('.salmon-gantt__row[data-pending]');
const settle = (page: Page) => page.evaluate(() => window.__ganttWrite.held.splice(0).forEach((f) => f()));
const writeMode = (page: Page, mode: 'resolve' | 'reject' | 'hold') => page.evaluate((m) => void (window.__ganttWrite.mode = m), mode);

test.describe('remote writes', () => {
  test('a change is written to the source with a signal and the computed rows; the tasks are pending until it settles', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-write');
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
    // The source rows have no end date: the grid shows the scheduled one.
    const end = s.locator('.salmon-data-grid-row[data-row-id="3"] [data-column-id="end"]');
    await expect(end).not.toHaveText('');
    await writeMode(page, 'hold');
    await api(page, 'g-write', 'updateTask', '3', { duration: 4 });
    // The edited task and the dependent it reschedules are pending.
    await expect(pending(page, 'g-write').and(s.locator('[data-task-id="3"]'))).toHaveCount(1);
    await expect(pending(page, 'g-write').and(s.locator('[data-task-id="4"]'))).toHaveCount(1);
    const writes = await events(page, 'g-write', 'write');
    expect(writes).toHaveLength(1);
    expect(writes[0]!.value.hasSignal).toBe(true);
    expect(writes[0]!.value.ids).toEqual(expect.arrayContaining(['3', '4']));
    const row3 = writes[0]!.value.changed.find((c: { rowId: string }) => c.rowId === '3');
    expect(row3.row.duration).toBe(4);
    expect(row3.row.end).toBe((await info(page, 'g-write', '3'))?.end);
    expect(row3.row.parentId).toBe(2);
    expect(row3.columns).toEqual(expect.arrayContaining(['duration', 'end']));
    await settle(page);
    await expect(pending(page, 'g-write')).toHaveCount(0);
    // The source patched the grid pane with the written rows.
    await expect(end).not.toHaveText('');
    expect(await events(page, 'g-write', 'error')).toEqual([]);
  });

  test('a rejected write reverts the change and calls onError', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-write');
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
    const before3 = await info(page, 'g-write', '3');
    const before4 = await info(page, 'g-write', '4');
    await writeMode(page, 'reject');
    await api(page, 'g-write', 'updateTask', '3', { duration: 6 });
    expect((await events(page, 'g-write', 'taskChange')).length).toBe(1);
    await expect.poll(async () => (await events(page, 'g-write', 'error')).length).toBe(1);
    const [error] = await events(page, 'g-write', 'error');
    expect(error!.value.action).toBe('update');
    expect(error!.value.taskIds).toEqual(expect.arrayContaining(['3', '4']));
    expect(await info(page, 'g-write', '3')).toEqual(before3);
    expect(await info(page, 'g-write', '4')).toEqual(before4);
    await expect(pending(page, 'g-write')).toHaveCount(0);
  });

  test('a newer write of the same task aborts the older one; unmount aborts the writes in flight', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-write');
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
    await writeMode(page, 'hold');
    await api(page, 'g-write', 'updateTask', '3', { duration: 3 });
    await api(page, 'g-write', 'updateTask', '3', { duration: 5 });
    await expect.poll(async () => (await events(page, 'g-write', 'writeAborted')).length).toBe(1);
    const writes = await events(page, 'g-write', 'write');
    expect(writes).toHaveLength(2);
    expect(writes[1]!.value.ids).toEqual(expect.arrayContaining(writes[0]!.value.ids));
    expect(writes[1]!.value.changed.find((c: { rowId: string }) => c.rowId === '3').row.duration).toBe(5);
    const end5 = (await info(page, 'g-write', '3'))?.end;
    await settle(page);
    await expect(pending(page, 'g-write')).toHaveCount(0);
    expect((await info(page, 'g-write', '3'))?.end).toBe(end5);
    // Unmount aborts.
    await api(page, 'g-write', 'updateTask', '3', { duration: 2 });
    await expect(pending(page, 'g-write')).not.toHaveCount(0);
    await page.getByTestId('unmount-write').click();
    await expect(s).toHaveCount(0);
    await expect.poll(async () => (await events(page, 'g-write', 'writeAborted')).length).toBe(2);
  });
});

test.describe('loading placeholders', () => {
  test("loadingIndicator 'skeleton': the chart mirrors the grid's skeleton while the source loads and under setLoading(true)", async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-skeleton');
    const gridSkeleton = s.locator('.salmon-gantt__grid-pane .salmon-data-grid-loading[data-indicator="skeleton"]');
    const chartSkeleton = s.locator('.salmon-gantt__chart-pane .salmon-gantt__loading[data-indicator="skeleton"]');
    await expect(gridSkeleton).toHaveCount(1);
    await expect(chartSkeleton).toHaveCount(1);
    await expect(chartSkeleton).toHaveAttribute('aria-hidden', 'true');
    const bars = await gridSkeleton.locator('.salmon-data-grid-loading__bar').count();
    expect(bars).toBeGreaterThan(0);
    await expect(chartSkeleton.locator('.salmon-data-grid-loading__bar')).toHaveCount(bars);
    // The bars share the row height and start below the header in both panes.
    const g = await gridSkeleton.locator('.salmon-data-grid-loading__bar').first().boundingBox();
    const c = await chartSkeleton.locator('.salmon-data-grid-loading__bar').first().boundingBox();
    expect(Math.abs(g!.height - c!.height)).toBeLessThan(1);
    expect(Math.abs(g!.y - c!.y)).toBeLessThan(2);
    await page.evaluate(() => window.__ganttRelease['g-skeleton']!());
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
    await expect(chartSkeleton).toHaveCount(0);
    await api(page, 'g-skeleton', 'setLoading', true);
    await expect(chartSkeleton).toHaveCount(1);
    await api(page, 'g-skeleton', 'setLoading', false);
    await expect(chartSkeleton).toHaveCount(0);
  });

  test('a lazy parent that loads opens the same skeleton row in both panes (virtualization.skeletonRows)', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-mask');
    await s.scrollIntoViewIfNeeded();
    await s.locator('.salmon-data-grid-row[data-row-id="1"] button.salmon-data-grid-tree-toggle').click();
    const gridRow = s.locator('.salmon-data-grid-skeleton-row[data-tree-loading="1"]');
    const chartRow = s.locator('.salmon-gantt__skeleton-row[data-loading-parent="1"]');
    await expect(gridRow).toHaveCount(1);
    await expect(chartRow).toHaveCount(1);
    await expect(chartRow.locator('.salmon-data-grid-skeleton-bar')).toHaveCount(1);
    const y = async (l: Locator) => (await l.boundingBox())!.y;
    // The skeleton rows and the row after them line up across the panes.
    expect(Math.abs((await y(gridRow)) - (await y(chartRow)))).toBeLessThan(2);
    const nextGrid = s.locator('.salmon-data-grid-row[data-row-id="2"]');
    const nextChart = s.locator('.salmon-gantt__row[data-task-id="2"]');
    expect(Math.abs((await y(nextGrid)) - (await y(nextChart)))).toBeLessThan(2);
    await page.evaluate(() => window.__ganttRelease['g-mask']!());
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(4);
    await expect(chartRow).toHaveCount(0);
    await expect.poll(async () => Math.abs((await y(nextGrid)) - (await y(nextChart)))).toBeLessThan(2);
  });
});

test.describe('adaptive', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('below the breakpoint one pane shows at a time with a pane switch; dialogs are full screen', async ({ page }) => {
    await open(page);
    const s = scope(page, 'g-adaptive');
    await s.scrollIntoViewIfNeeded();
    const root = s.locator('.salmon-gantt');
    await expect(root).toHaveAttribute('data-adaptive', 'true');
    const switcher = s.getByRole('group', { name: 'View' });
    await expect(switcher.getByRole('button')).toHaveText(['Tasks', 'Timeline']);
    await expect(switcher.getByRole('button', { name: 'Tasks' })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.locator('.salmon-gantt__splitter')).toHaveCount(0);
    await expect(s.locator('.salmon-gantt__chart-pane')).toHaveCount(0);
    await expect(s.locator('.salmon-data-grid-row[data-row-id="3"]')).toBeVisible();
    const width = (await root.boundingBox())!.width;
    expect((await s.locator('.salmon-gantt__grid-pane').boundingBox())!.width).toBeGreaterThan(width - 4);
    await switcher.getByRole('button', { name: 'Timeline' }).click();
    await expect(switcher.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.locator('.salmon-gantt__chart-pane')).toBeVisible();
    await expect(s.locator('.salmon-gantt__grid-pane')).toHaveClass(/salmon-gantt__hidden-grid/);
    await expect(s.locator('.salmon-gantt__row')).toHaveCount(9);
    expect((await s.locator('.salmon-gantt__chart-pane').boundingBox())!.width).toBeGreaterThan(width - 4);
    // Back to the task list: the grid stayed mounted.
    await switcher.getByRole('button', { name: 'Tasks' }).click();
    await expect(s.locator('.salmon-data-grid-row[data-row-id="3"]')).toBeVisible();
    // The task dialog is full screen.
    await api(page, 'g-adaptive', 'openEditDialog', '3');
    const dialog = page.locator('.salmon-gantt-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-full-screen', 'always');
    expect((await dialog.boundingBox())!.width).toBeGreaterThan(386);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});

test('above the breakpoint the adaptive Gantt shows both panes', async ({ page }) => {
  await open(page);
  const s = scope(page, 'g-adaptive');
  await s.locator('.salmon-gantt__row').first().waitFor();
  await expect(s.locator('.salmon-gantt')).not.toHaveAttribute('data-adaptive', 'true');
  await expect(s.locator('.salmon-gantt__splitter')).toHaveCount(1);
  await expect(s.getByRole('group', { name: 'View' })).toHaveCount(0);
});
