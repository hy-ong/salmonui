import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, installDevtools, openGrid, PROD_URL, scrollViewport, waitForModule } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Adaptive UI: mode and sheets, vertical cards over the same virtualized
// row window, touch long-press, multi-select, and swipe as native touch
// scroll, and the adaptive budgets (card scroll frames, sheet open).
// Mobile viewport: 390 x 844, touch, DPR 3. The grid is 600 px high.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const CARD_COLS = 12;
/** The fixture adds the `id` column to `cols`. */
const FIELDS = CARD_COLS + 1;
const VERTICAL = `?rows=100000&cols=${CARD_COLS}&adaptive=vertical`;
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

async function axeViolations(page: Page): Promise<unknown[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    const result = await axeApi.run({ include: [['.salmon-data-grid'], ['[data-salmon-popover]'], ['dialog']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v: any) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')) }));
  });
}

/** Touch press at the center of `selector` held for `ms` (CDP touch events produce touch pointer events). */
/** The adaptive interaction (touch long-press, sheets) is a chunk the grid loads after mount (adaptive-controller.ts). */
const adaptiveReady = (page: Page) => waitForModule(page, /\/adaptive-chunk\.js(\?|$)/);

async function press(page: Page, selector: string, ms: number): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no ${selector}`);
  const x = box.x + Math.min(box.width / 2, 60);
  const y = box.y + Math.min(box.height / 2, 18);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Clicks `selector` at the start of a frame; ms until the frame that shows `done` has rendered. */
async function framedClick(page: Page, selector: string, done: string): Promise<number> {
  return page.evaluate(
    ([sel, until]) =>
      new Promise<number>((resolve, reject) => {
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(sel);
          if (!el) return reject(new Error(`no ${sel}`));
          const t0 = performance.now();
          el.click();
          const check = () => {
            if (document.querySelector(until)) {
              void document.body.offsetHeight;
              const ch = new MessageChannel();
              ch.port1.onmessage = () => resolve(performance.now() - t0);
              ch.port2.postMessage(0);
            } else setTimeout(check, 0);
          };
          queueMicrotask(check);
        });
      }),
    [selector, done] as const,
  );
}

const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] as number;

test.describe('adaptive vertical rows', () => {
  test.use(MOBILE);

  test('cards render the same virtualized window, one field per column, desktop ARIA tree', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}${VERTICAL}`);
    await expect(page.locator('.salmon-data-grid')).toHaveAttribute('data-row-layout', 'vertical');
    for (const top of [0, 2_000_000, 40_000_000]) {
      await scrollViewport(page, top, null);
      const r = await page.evaluate(() => {
        const range = window.__gridApi.getRenderedRange();
        const cards = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-card')];
        const first = cards[0] as HTMLElement;
        return {
          rows: range.rows,
          cards: cards.length,
          cells: document.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-cell').length,
          colIndices: [...first.querySelectorAll('[role="gridcell"]')].map((c) => Number(c.getAttribute('aria-colindex'))),
          orphanCells: [...document.querySelectorAll('.salmon-data-grid-rows [role="gridcell"]')].filter((c) => !c.closest('[role="row"]')?.classList.contains('salmon-data-grid-card')).length,
          cardHeight: first.getBoundingClientRect().height,
          headerVisible: (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect().height > 1,
          headerCells: document.querySelectorAll('.salmon-data-grid-header [role="columnheader"]').length,
          scrollWidth: (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollWidth,
          clientWidth: (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).clientWidth,
        };
      });
      const visible = r.rows.end - r.rows.start;
      console.log(`[structure] cards ${r.cards} (visible ${visible}), cells ${r.cells}`);
      expect(r.cards).toBeLessThanOrEqual(visible + 10);
      expect(r.cells).toBe(r.cards * FIELDS);
      expect(r.colIndices).toEqual(Array.from({ length: FIELDS }, (_, i) => i + 1));
      expect(r.orphanCells).toBe(0);
      expect(r.cardHeight).toBe(FIELDS * 36 + 24);
      expect(r.headerVisible).toBe(false);
      expect(r.headerCells).toBeGreaterThan(0);
      expect(r.scrollWidth).toBeLessThanOrEqual(r.clientWidth);
    }
    // The last record is reachable.
    await scrollViewport(page, 1e9, null);
    await expect(page.locator('.salmon-data-grid-card[data-row-id="r99999"]')).toHaveAttribute('aria-rowindex', '100001');
    expect(problems).toEqual([]);
  });

  test('scrolling inside a card commits nothing; entering cards mount only their cells', async ({ page }) => {
    await installDevtools(page);
    // 20k cards (9.8M px) stay below maxScrollHeight: physical and virtual offsets match.
    await openGrid(page, `${DEV_URL}?rows=20000&cols=${CARD_COLS}&adaptive=vertical`);
    const card = FIELDS * 36 + 24;
    await scrollViewport(page, card * 1000, null);
    await page.waitForTimeout(100);
    const start = await page.evaluate(() => window.__commits.length);
    for (let i = 1; i <= 20; i++) await scrollViewport(page, card * 1000 + i, null);
    expect(await page.evaluate((s) => window.__commits.length - s, start)).toBe(0);
    const before = await page.evaluate(() => window.__commits.length);
    await scrollViewport(page, card * 1002, null);
    const result = await page.evaluate((s) => {
      const commits = window.__commits.slice(s);
      return { commits: commits.length, rows: new Set(commits.flatMap((c) => c.rows)).size, cells: new Set(commits.flatMap((c) => c.cells)).size, headers: commits.reduce((n, c) => n + c.headers.length, 0) };
    }, before);
    expect(result.commits).toBe(1);
    expect(result.rows).toBe(2);
    expect(result.cells).toBe(2 * FIELDS);
    expect(result.headers).toBe(0);
  });

  test('keyboard: ArrowRight/Left move between fields of a card, ArrowDown to the next card', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=2000&cols=6&adaptive=vertical`);
    await page.locator('.salmon-data-grid-card[data-row-id="r0"] .salmon-data-grid-cell').first().click();
    const focused = () => page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      return `${el.closest<HTMLElement>('[role="row"]')?.dataset['rowId']}:${el.getAttribute('aria-colindex')}`;
    });
    expect(await focused()).toBe('r0:1');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await focused()).toBe('r0:3');
    await page.keyboard.press('ArrowLeft');
    expect(await focused()).toBe('r0:2');
    await page.keyboard.press('ArrowDown');
    expect(await focused()).toBe('r1:2');
  });

  test('axe: vertical cards and the sort sheet have no violations', async ({ page }) => {
    await openGrid(page, `${DEV_URL}${VERTICAL}&qsort=multi&sel=multiple`);
    expect(await axeViolations(page)).toEqual([]);
    await page.locator('.salmon-data-grid-adaptive-bar__sort').click();
    await expect(page.locator('[data-salmon-popover][data-sheet="dialog"]')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe('adaptive sheets', () => {
  test.use(MOBILE);

  test('sort sheet: full screen, labelled close, applies a multi-column sort, focus returns', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&adaptive=vertical&qsort=multi&qevents`);
    const button = page.locator('.salmon-data-grid-adaptive-bar__sort');
    await button.click();
    const sheet = page.getByRole('dialog', { name: 'Sort' });
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    const box = await sheet.boundingBox();
    expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    await expect(sheet.getByRole('button', { name: 'Close' })).toBeVisible();
    await sheet.getByRole('group', { name: 'Text 1', exact: true }).getByLabel('Descending').check();
    await sheet.getByRole('group', { name: 'Number 4', exact: true }).getByLabel('Ascending').check();
    await sheet.getByRole('button', { name: 'Apply' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(button).toBeFocused();
    // The (visually hidden) headers carry the applied sort.
    await expect(page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]')).toHaveAttribute('aria-sort', 'descending');
    const applied = await page.evaluate(() => (window as unknown as { __queryEvents: { type: string; sortBy?: { field: string; direction: string }[] }[] }).__queryEvents.filter((e) => e.type === 'sortChange').at(-1)?.sortBy);
    expect(applied).toEqual([{ field: 's1', direction: 'desc' }, { field: 'n4', direction: 'asc' }]);
    // The sheet reopens with the applied order.
    await button.click();
    await expect(page.getByRole('dialog', { name: 'Sort' }).getByRole('group', { name: /Text 1/ })).toContainText('1');
    await expect(page.getByRole('dialog', { name: 'Sort' }).getByRole('group', { name: /Number 4/ })).toContainText('2');
    await page.keyboard.press('Escape');
    const events = await page.evaluate(() => (window as unknown as { __queryEvents: { type: string }[] }).__queryEvents.map((e) => e.type));
    expect(events).toContain('beforeSortChange');
    expect(events).toContain('sortChange');
    // Escape closes too.
    await page.evaluate(() => window.__gridApi.openSortDialog());
    await expect(page.getByRole('dialog', { name: 'Sort' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Sort' })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('filter sheet: column list, then that column\'s filter menu as a full-screen sheet', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&adaptive=vertical&qfilter=excel`);
    await page.locator('.salmon-data-grid-adaptive-bar__filter').click();
    const list = page.getByRole('dialog', { name: 'Filter' });
    await expect(list).toBeVisible();
    await list.getByRole('button', { name: 'Text 1' }).click();
    const menu = page.locator('[data-salmon-popover][data-sheet="dialog"].salmon-data-grid-filter-menu');
    await expect(menu).toBeVisible();
    expect(await menu.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    await menu.getByRole('button', { name: 'Close' }).click();
    await expect(menu).toHaveCount(0);
    // openFilterDialog(field) goes straight to the column sheet.
    await page.evaluate(() => window.__gridApi.openFilterDialog('n4'));
    await expect(page.locator('[data-salmon-popover][data-sheet="dialog"].salmon-data-grid-filter-menu')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('column menu (touch long-press on a header) is a bottom sheet; the chooser is full screen', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=10&adaptive=horizontal&chrome`);
    await adaptiveReady(page);
    await press(page, '.salmon-data-grid-header-cell[data-column-id="s1"]', 700);
    const menu = page.locator('[data-salmon-popover][data-sheet="menu"].salmon-data-grid-column-menu');
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    expect(box && box.x === 0 && box.width === 390 && Math.round(box.y + box.height) === 844).toBeTruthy();
    const itemHeight = await menu.locator('.salmon-data-grid-menu__item').first().evaluate((el) => el.getBoundingClientRect().height);
    expect(itemHeight).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__gridApi.openColumnChooser());
    const chooser = page.locator('[data-salmon-popover][data-sheet="dialog"].salmon-data-grid-column-chooser');
    await expect(chooser).toBeVisible();
    expect(await chooser.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    expect(problems).toEqual([]);
  });

  test('onBeforeAdaptiveDialogOpen-less api calls are no-ops without the features', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&adaptive=vertical`);
    await page.evaluate(() => {
      window.__gridApi.openSortDialog();
      window.__gridApi.openFilterDialog();
    });
    await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__gridApi.isAdaptive())).toBe(true);
  });
});

test.describe('adaptive editing', () => {
  test.use(MOBILE);

  const editDialog = (page: Page) => page.locator('dialog.salmon-data-grid-edit-dialog');
  const cardCell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid-card[data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
  const rowValue = (page: Page, rowId: string, field: string) =>
    page.evaluate(([r, f]) => (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.[f], [rowId, field] as const);

  test('edit dialog: double-tap opens a full-screen sheet, labelled 44 px close, first field focused, Save writes, Close and Escape cancel, focus returns', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=6&adaptive=vertical&edit=dialog`);
    const invoker = cardCell(page, 'r1', 's1');
    // Double-tap a card field (touch): the browser's dblclick opens the edit sheet.
    const at = await invoker.boundingBox();
    if (!at) throw new Error('no card cell');
    await page.touchscreen.tap(at.x + 20, at.y + at.height / 2);
    await page.waitForTimeout(60);
    await page.touchscreen.tap(at.x + 20, at.y + at.height / 2);
    const dialog = editDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-sheet', 'dialog');
    expect(await dialog.evaluate((el) => (el as HTMLDialogElement).matches(':modal'))).toBe(true);
    expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    const close = dialog.getByRole('button', { name: 'Close' });
    await expect(close).toBeVisible();
    const closeBox = await close.boundingBox();
    expect(closeBox && closeBox.width >= 44 && closeBox.height >= 44).toBeTruthy();
    await expect(page.getByRole('dialog', { name: 'Edit' })).toHaveCount(1);
    await expect(dialog.locator('.salmon-data-grid-editor input').first()).toBeFocused();
    // Save and Cancel stay on screen at the bottom of the sheet.
    const save = dialog.getByRole('button', { name: 'Save' });
    const saveBox = await save.boundingBox();
    expect(saveBox && saveBox.y + saveBox.height <= 844 && saveBox.height >= 44).toBeTruthy();
    expect(await axeViolations(page)).toEqual([]);
    await dialog.getByLabel('Text 1', { exact: true }).fill('from sheet');
    await save.tap();
    await expect(dialog).toHaveCount(0);
    expect(await rowValue(page, 'r1', 's1')).toBe('from sheet');
    await expect(cardCell(page, 'r1', 's1')).toHaveText('from sheet');
    await expect(invoker).toBeFocused();
    // The labelled close discards the draft.
    await invoker.dblclick();
    await dialog.getByLabel('Text 1', { exact: true }).fill('discarded');
    await close.tap();
    await expect(dialog).toHaveCount(0);
    expect(await rowValue(page, 'r1', 's1')).toBe('from sheet');
    await expect(invoker).toBeFocused();
    // Cancel and Escape discard too; F2 on the focused field opens the sheet from the keyboard.
    await page.keyboard.press('F2');
    await dialog.getByLabel('Text 1', { exact: true }).fill('discarded');
    await dialog.getByRole('button', { name: 'Cancel' }).tap();
    await expect(dialog).toHaveCount(0);
    await invoker.dblclick();
    await dialog.getByLabel('Text 1', { exact: true }).fill('discarded');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await rowValue(page, 'r1', 's1')).toBe('from sheet');
    expect(problems).toEqual([]);
  });

  test('editing over virtualized cards: a deep card edits in the full-screen sheet, the window stays virtualized and in place', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}${VERTICAL}&edit=dialog`);
    await scrollViewport(page, 2_000_000, null);
    const before = await page.evaluate(() => {
      const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
      const top = vp.getBoundingClientRect().top;
      const card = [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-card')].find((c) => c.getBoundingClientRect().top >= top) as HTMLElement;
      const range = window.__gridApi.getRenderedRange();
      return { rowId: card.dataset['rowId'] as string, scrollTop: vp.scrollTop, visible: range.rows.end - range.rows.start };
    });
    expect(Number(before.rowId.slice(1))).toBeGreaterThan(1000);
    const target = cardCell(page, before.rowId, 's1');
    // Tap first: focusing the cell may scroll the card fully into view, which would move a double-click's second press.
    await target.tap();
    await expect(target).toBeFocused();
    await target.dblclick();
    const dialog = editDialog(page);
    await expect(dialog).toBeVisible();
    expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    // One field per editable column (the key column is read-only).
    expect(await dialog.locator('.salmon-data-grid-edit-dialog__field').count()).toBe(CARD_COLS);
    await dialog.getByLabel('Text 1', { exact: true }).fill('deep edit');
    // The last field scrolls into reach inside the sheet; the header and actions stay put.
    await dialog.locator('.salmon-data-grid-edit-dialog__field').last().scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeInViewport();
    await dialog.getByRole('button', { name: 'Save' }).tap();
    await expect(dialog).toHaveCount(0);
    expect(await rowValue(page, before.rowId, 's1')).toBe('deep edit');
    await expect(cardCell(page, before.rowId, 's1')).toHaveText('deep edit');
    await expect(target).toBeFocused();
    const after = await page.evaluate(() => ({
      scrollTop: (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop,
      cards: document.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-card').length,
      cells: document.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-cell').length,
    }));
    expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(FIELDS * 36 + 24);
    expect(after.cards).toBeLessThanOrEqual(before.visible + 10);
    expect(after.cells).toBe(after.cards * FIELDS);
    // startEdit from code and an added record use the same sheet.
    await page.evaluate((id) => window.__gridApi.startEdit(id), before.rowId);
    await expect(dialog).toHaveAttribute('data-sheet', 'dialog');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.evaluate(() => window.__gridApi.addRow());
    await expect(page.getByRole('dialog', { name: 'Add' })).toBeVisible();
    expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    await dialog.getByRole('button', { name: 'Cancel' }).tap();
    await expect(dialog).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('the edit dialog stays a centred modal when the grid is not adaptive', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openGrid(page, `${DEV_URL}?rows=2000&cols=6&adaptive=vertical&adaptiveTarget=mobile&edit=dialog`);
    await page.locator('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s1"]').dblclick();
    const dialog = editDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toHaveAttribute('data-sheet', /.*/);
    const box = await dialog.boundingBox();
    expect(box && box.width <= 480 && box.x > 0).toBeTruthy();
  });
});

test.describe('touch', () => {
  test.use(MOBILE);

  test('tap selects; the multi-select toggle appears; long-press enters multi-select and taps add rows', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=2000&cols=6&adaptive=vertical&sel=multiple`);
    await expect(page.locator('.salmon-data-grid-adaptive-bar__multi')).toHaveCount(0);
    await page.locator('.salmon-data-grid-card[data-row-id="r0"] .salmon-data-grid-cell').first().tap();
    await expect(page.locator('.salmon-data-grid-card[data-row-id="r0"]')).toHaveAttribute('aria-selected', 'true');
    const toggle = page.locator('.salmon-data-grid-adaptive-bar__multi');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const size = await toggle.evaluate((el) => el.getBoundingClientRect());
    expect(size.height).toBeGreaterThanOrEqual(44);
    // Long-press another record: multi-select mode on, that record added.
    await press(page, '.salmon-data-grid-card[data-row-id="r1"] .salmon-data-grid-cell', 700);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.salmon-data-grid-card[data-row-id="r2"] .salmon-data-grid-cell').first().tap();
    expect(await page.evaluate(() => [...window.__gridApi.getSelectedRowIds()].sort())).toEqual(['r0', 'r1', 'r2']);
    await expect(toggle).toContainText('3 selected');
    // Toggle off: a tap replaces the selection again.
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.locator('.salmon-data-grid-card[data-row-id="r3"] .salmon-data-grid-cell').first().tap();
    expect(await page.evaluate(() => [...window.__gridApi.getSelectedRowIds()])).toEqual(['r3']);
    expect(problems).toEqual([]);
  });

  test('swipe: a slow touch swipe scrolls cards and rows natively; it selects nothing and opens no menu', async ({ page }) => {
    const problems = collectProblems(page);
    // Raw touch drag (touchStart, touchMoves, touchEnd) over the viewport drives the native scroll: the
    // synthetic scroll gesture (`Input.synthesizeScrollGesture`) scrolls nothing in headless Chromium on Linux.
    const swipe = async (x: number, y: number, dx: number, dy: number) => {
      const cdp = await page.context().newCDPSession(page);
      // 20 px steps every 16 ms: the swipe outlasts LONG_PRESS_MS, so movement (not the lift) is what cancels
      // the long-press.
      const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 20);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    };
    const viewport = () => page.evaluate(() => {
      const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
      return { top: vp.scrollTop, left: vp.scrollLeft };
    });
    await openGrid(page, `${DEV_URL}?rows=2000&cols=6&adaptive=vertical&sel=multiple`);
    const vertical = await page.locator('.salmon-data-grid-viewport').boundingBox();
    if (!vertical) throw new Error('no viewport');
    // Swipe up: the card list scrolls by about the swipe distance.
    await swipe(vertical.x + vertical.width / 2, vertical.y + vertical.height - 80, 0, -400);
    await expect.poll(async () => (await viewport()).top).toBeGreaterThan(300);
    const down = await viewport();
    expect(down.left).toBe(0);
    // Swipe down: back towards the top.
    await swipe(vertical.x + vertical.width / 2, vertical.y + 80, 0, 300);
    await expect.poll(async () => (await viewport()).top).toBeLessThan(down.top - 200);
    expect(await page.evaluate(() => [...window.__gridApi.getSelectedRowIds()])).toEqual([]);
    await expect(page.locator('.salmon-data-grid-adaptive-bar__multi')).toHaveCount(0);
    await expect(page.locator('.salmon-data-grid-card[aria-selected="true"]')).toHaveCount(0);
    // Horizontal rows with a context menu: a sideways swipe scrolls the columns, no long-press menu.
    await openGrid(page, `${DEV_URL}?rows=2000&cols=12&adaptive=horizontal&chrome`);
    const horizontal = await page.locator('.salmon-data-grid-viewport').boundingBox();
    if (!horizontal) throw new Error('no viewport');
    await swipe(horizontal.x + horizontal.width - 60, horizontal.y + 120, -300, 0);
    await expect.poll(async () => (await viewport()).left).toBeGreaterThan(200);
    const side = await viewport();
    expect(side.top).toBe(0);
    await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('long-press opens the context menu when one is configured', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=200&cols=6&adaptive=horizontal&chrome`);
    await adaptiveReady(page);
    await press(page, '.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s1"]', 700);
    await expect(page.locator('[data-salmon-popover][data-sheet="menu"].salmon-data-grid-context-menu')).toHaveCount(1);
  });

  test('adaptive pager and toolbar targets are at least 44 px', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=2000&cols=6&adaptive=horizontal&qpage=50&chrome`);
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-pager__button, .salmon-data-grid-toolbar__item')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44);
  });
});

test.describe('mode projection', () => {
  test('target mobile follows the container width after mount, without errors', async ({ page }) => {
    const problems = collectProblems(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openGrid(page, `${DEV_URL}?rows=2000&cols=6&adaptive=vertical&adaptiveTarget=mobile`);
    const grid = page.locator('.salmon-data-grid');
    await expect(grid).not.toHaveAttribute('data-adaptive', '');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(grid).toHaveAttribute('data-row-layout', 'vertical');
    await expect(page.locator('.salmon-data-grid-card').first()).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(grid).not.toHaveAttribute('data-row-layout', 'vertical');
    await expect(page.locator('.salmon-data-grid-card')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

test.describe('adaptive timing (production build)', { tag: '@perf' }, () => {
  test.use(MOBILE);

  test('card scroll: frames during 3 s at 2,000 px/s stay at vsync, no blank frames', async ({ page }) => {
    await openGrid(page, `${PROD_URL}${VERTICAL}`);
    const result = await page.evaluate(
      () =>
        new Promise<{ frames: number; p95: number; dropped: number; blank: number; work: number[] }>((resolve) => {
          const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
          const rowsEl = document.querySelector('.salmon-data-grid-rows') as HTMLElement;
          const stamps: number[] = [];
          const work: number[] = [];
          let blank = 0;
          const start = performance.now();
          const frame = (now: number) => {
            stamps.push(now);
            // Coverage check of the previous frame's DOM: the cards cover the viewport.
            const first = rowsEl.firstElementChild?.getBoundingClientRect();
            const last = rowsEl.lastElementChild?.getBoundingClientRect();
            const vpRect = vp.getBoundingClientRect();
            if (!first || !last || first.top > vpRect.top + 1 || last.bottom < vpRect.bottom - 1) blank++;
            const t0 = performance.now();
            vp.scrollTop = ((now - start) / 1000) * 2000;
            const ch = new MessageChannel();
            ch.port1.onmessage = () => work.push(performance.now() - t0);
            ch.port2.postMessage(0);
            if (now - start < 3000) requestAnimationFrame(frame);
            else {
              const intervals = stamps.slice(1).map((t, i) => t - (stamps[i] as number));
              const sorted = [...intervals].sort((a, b) => a - b);
              resolve({
                frames: intervals.length,
                p95: sorted[Math.ceil(sorted.length * 0.95) - 1] as number,
                dropped: intervals.filter((d) => d > 16.7 * 1.5).length,
                blank: Math.max(0, blank - 1),
                work,
              });
            }
          };
          requestAnimationFrame(frame);
        }),
    );
    const workP95 = p95(result.work);
    console.log(`[perf] card scroll: ${result.frames} frames, interval p95 ${result.p95.toFixed(1)} ms, dropped ${result.dropped}, blank ${result.blank}, work p95 ${workP95.toFixed(2)} ms`);
    expectBudget(result.p95, 17.5, 'card scroll interval p95');
    expectBudget(result.dropped / result.frames, 0.02, 'card scroll dropped frame ratio', { unit: 'x' });
    expect(Math.max(0, result.blank)).toBe(0);
    expectBudget(workP95, 8, 'card scroll work p95');
  });

  test('edit sheet over virtualized cards opens <= 50 ms to painted', async ({ page }) => {
    await openGrid(page, `${PROD_URL}${VERTICAL}&edit=dialog`);
    await scrollViewport(page, 2_000_000, null);
    const open: number[] = [];
    for (let i = 0; i < 7; i++) {
      const ms = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              const card = document.querySelector<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-card') as HTMLElement;
              const t0 = performance.now();
              window.__gridApi.startEdit(card.dataset['rowId']);
              const check = () => {
                if (document.querySelector('dialog.salmon-data-grid-edit-dialog[data-sheet] .salmon-data-grid-edit-dialog__field')) {
                  void document.body.offsetHeight;
                  const ch = new MessageChannel();
                  ch.port1.onmessage = () => resolve(performance.now() - t0);
                  ch.port2.postMessage(0);
                } else setTimeout(check, 0);
              };
              queueMicrotask(check);
            });
          }),
      );
      // The first open also loads the lazy editing chunk.
      if (i > 0) open.push(ms);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog.salmon-data-grid-edit-dialog')).toHaveCount(0);
    }
    console.log(`[perf] adaptive edit sheet open p95 ${p95(open).toFixed(1)} ms (${open.map((v) => v.toFixed(1)).join(', ')})`);
    expectBudget(p95(open), 50, 'adaptive edit sheet open p95');
  });

  test('sort sheet and filter sheet open <= 50 ms to painted', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?rows=100000&cols=${CARD_COLS}&adaptive=vertical&qsort=multi&qfilter=excel`);
    const sort: number[] = [];
    const filter: number[] = [];
    for (let i = 0; i < 6; i++) {
      sort.push(await framedClick(page, '.salmon-data-grid-adaptive-bar__sort', '[data-salmon-popover][data-sheet="dialog"] .salmon-data-grid-sort-dialog__list'));
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
      await page.evaluate(() => window.__gridApi.openFilterDialog());
      await expect(page.locator('.salmon-data-grid-filter-columns')).toBeVisible();
      // Same columns as the desktop filter menu budget (256 distinct values): list items 3 and 4 are s1 and s2.
      const item = 3 + (i % 2);
      filter.push(await framedClick(page, `.salmon-data-grid-filter-columns__list > li:nth-child(${item}) > button`, '[data-salmon-popover][data-sheet="dialog"] .salmon-data-grid-facet-list'));
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-salmon-popover]')).toHaveCount(0);
    }
    console.log(`[perf] adaptive sort sheet open p95 ${p95(sort).toFixed(1)} ms; filter sheet (excel) open p95 ${p95(filter).toFixed(1)} ms (${filter.map((v) => v.toFixed(1)).join(', ')})`);
    expectBudget(p95(sort), 50, 'adaptive sort sheet open p95');
    expectBudget(p95(filter), 50, 'adaptive filter sheet (excel) open p95');
  });
});
