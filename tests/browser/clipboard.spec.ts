import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, installDevtools, openGrid } from './helpers.ts';

// Clipboard and fill handle in the browser: Mod+C / Ctrl+Shift+H / Mod+V with the async Clipboard API, the
// fallbacks without it (hidden textarea + execCommand, the copy and paste
// dialogs, the keyboard paste capture), the before-events, and the fill
// handle drag: axis constraint, preview, Escape, auto-scroll under row
// virtualization with targets outside the rendered window, and zero React
// commits while dragging.

const GRID = `${DEV_URL}?rows=2000&cols=10&sel=cell&cellMode=box&edit=cell&efill`;

const cell = (page: Page, rowId: string, columnId: string) => page.locator(`.salmon-data-grid [data-row-id="${rowId}"] .salmon-data-grid-cell[data-column-id="${columnId}"]`);
const value = (page: Page, rowId: string, field: string) => page.evaluate(([r, f]) => (window.__gridApi.getRowInfo(r)?.row as Record<string, unknown> | undefined)?.[f], [rowId, field] as const);
const events = (page: Page) => page.evaluate(() => (window as unknown as { __editEvents: Record<string, unknown>[] }).__editEvents.filter((e) => String(e['type']).startsWith('before')));
const select = (page: Page, a: [string, string], b: [string, string]) =>
  page.evaluate(([x, y]) => window.__gridApi.selectCellRange({ rowId: x[0], field: x[1] }, { rowId: y[0], field: y[1] }), [a, b] as const);

async function center(page: Page, rowId: string, columnId: string): Promise<{ x: number; y: number }> {
  const box = await cell(page, rowId, columnId).boundingBox();
  if (!box) throw new Error(`cell ${rowId}:${columnId} not rendered`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Pointer down on the fill handle. */
async function grabHandle(page: Page): Promise<void> {
  const handle = page.locator('.salmon-data-grid .salmon-data-grid-fill-handle');
  await expect(handle).toHaveCount(1);
  const box = await handle.boundingBox();
  if (!box) throw new Error('no fill handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

/**
 * Ctrl+V (Mod+V of the Desktop Chrome device, a Windows user agent). Where the
 * host performs the native paste (Linux, Windows) the clipboard content lands
 * in the capture textarea; on a macOS host Ctrl+V is no paste shortcut, so the
 * paste event the browser would fire is dispatched on the capture textarea.
 */
async function pressPaste(page: Page, text: string): Promise<void> {
  await page.keyboard.down('Control');
  await page.keyboard.down('v');
  await page.evaluate((t) => {
    const el = document.activeElement;
    if (!el?.classList.contains('salmon-data-grid-clipboard-input')) return;
    const data = new DataTransfer();
    data.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
  await page.keyboard.up('v');
  await page.keyboard.up('Control');
}

/** Stubs the async Clipboard API away (insecure context); keeps the real one for the test. */
async function withoutClipboardApi(page: Page, execResult: boolean): Promise<void> {
  await page.addInitScript((ok) => {
    const w = window as unknown as { __realClipboard: Clipboard; __execCopies: string[] };
    w.__realClipboard = navigator.clipboard;
    w.__execCopies = [];
    Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, get: () => undefined });
    document.execCommand = (command: string) => {
      if (command !== 'copy') return false;
      const el = document.activeElement as HTMLTextAreaElement | null;
      w.__execCopies.push(el ? el.value.slice(el.selectionStart, el.selectionEnd) : '');
      return ok;
    };
  }, execResult);
}

test.describe('fill handle', () => {
  test('shows at the range corner; dragging down tiles the range; onBeforeFill fires; 0 commits while dragging', async ({ page }) => {
    const problems = collectProblems(page);
    await installDevtools(page);
    await openGrid(page, GRID);
    await select(page, ['r1', 's2'], ['r2', 's3']);
    await expect(cell(page, 'r2', 's3')).toHaveAttribute('data-fill-corner', '');
    await expect(cell(page, 'r2', 's3').locator('.salmon-data-grid-fill-handle')).toHaveCount(1);
    const source = [await value(page, 'r1', 's2'), await value(page, 'r2', 's2'), await value(page, 'r1', 's3'), await value(page, 'r2', 's3')];
    const target = await center(page, 'r6', 's2');
    await page.evaluate(() => (window.__commits.length = 0));
    await grabHandle(page);
    await page.mouse.move(target.x, target.y, { steps: 6 });
    const preview = page.locator('.salmon-data-grid .salmon-data-grid-fill-preview');
    await expect(preview).toHaveAttribute('data-visible', '');
    // Drag transients are DOM writes only: no React commit until the release applies the fill.
    expect(await page.evaluate(() => window.__commits.length)).toBe(0);
    // The preview covers rows r1..r6 of the two columns.
    const p = await preview.boundingBox();
    const top = await cell(page, 'r1', 's2').boundingBox();
    const bottom = await cell(page, 'r6', 's3').boundingBox();
    expect(Math.abs((p?.y ?? 0) - (top?.y ?? 0))).toBeLessThan(2);
    expect(Math.abs((p?.y ?? 0) + (p?.height ?? 0) - ((bottom?.y ?? 0) + (bottom?.height ?? 0)))).toBeLessThan(2);
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
    expect([await value(page, 'r3', 's2'), await value(page, 'r4', 's2'), await value(page, 'r5', 's3'), await value(page, 'r6', 's3')]).toEqual([source[0], source[1], source[2], source[3]]);
    // The filled range is selected; the handle moved to its corner.
    await expect(cell(page, 'r6', 's3').locator('.salmon-data-grid-fill-handle')).toHaveCount(1);
    const fill = (await events(page)).find((e) => e['type'] === 'beforeFill') as Record<string, unknown>;
    expect(fill['target']).toEqual({ rowId: 'r6', field: 's3' });
    expect(fill['range']).toEqual({ anchor: { rowId: 'r1', field: 's2' }, focus: { rowId: 'r2', field: 's3' } });
    expect(fill['source']).toBe('pointer');
    expect(problems).toEqual([]);
  });

  test('a diagonal drag fills along one axis only (right here)', async ({ page }) => {
    await openGrid(page, GRID);
    await select(page, ['r1', 's0'], ['r1', 's0']);
    const before = { down: await value(page, 'r2', 's0'), right: await value(page, 'r1', 's1') };
    const source = await value(page, 'r1', 's0');
    await grabHandle(page);
    const target = await center(page, 'r2', 's3');
    await page.mouse.move(target.x, target.y, { steps: 6 });
    await page.mouse.up();
    expect(await value(page, 'r1', 's2')).toBe(source);
    expect(await value(page, 'r1', 's3')).toBe(source);
    expect(await value(page, 'r2', 's0')).toBe(before.down);
    expect(before.right).not.toBe(source);
  });

  test('Escape cancels the drag; read-only cells are skipped', async ({ page }) => {
    await openGrid(page, GRID);
    await select(page, ['r1', 's2'], ['r1', 's2']);
    const before = await value(page, 'r4', 's2');
    await grabHandle(page);
    const target = await center(page, 'r4', 's2');
    await page.mouse.move(target.x, target.y, { steps: 4 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-fill-preview')).toHaveCount(0);
    await page.mouse.up();
    expect(await value(page, 'r4', 's2')).toBe(before);
    // The selection survived the Escape.
    await expect(cell(page, 'r1', 's2')).toHaveAttribute('data-fill-corner', '');
    expect((await events(page)).filter((e) => e['type'] === 'beforeFill')).toEqual([]);
    // The key column is read-only: filling over it leaves the ids alone.
    await select(page, ['r1', 's0'], ['r1', 's0']);
    await grabHandle(page);
    const id = await center(page, 'r1', 'id');
    await page.mouse.move(id.x, id.y, { steps: 4 });
    await page.mouse.up();
    expect(await value(page, 'r1', 'id')).toBe('r1');
  });

  test('auto-scrolls under virtualization and fills rows outside the rendered window', async ({ page }) => {
    await openGrid(page, GRID);
    await select(page, ['r0', 's2'], ['r1', 's2']);
    const pattern = [await value(page, 'r0', 's2'), await value(page, 'r1', 's2')];
    await grabHandle(page);
    const viewport = await page.locator('.salmon-data-grid-viewport').boundingBox();
    if (!viewport) throw new Error('no viewport');
    const x = (await center(page, 'r1', 's2')).x;
    // Hold the pointer below the body: auto-scroll moves the window down.
    await page.mouse.move(x, viewport.y + viewport.height - 4, { steps: 4 });
    await page.mouse.move(x, viewport.y + viewport.height + 30, { steps: 2 });
    await page.waitForFunction(() => (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop > 3000);
    await page.mouse.move(x, viewport.y + viewport.height - 60, { steps: 2 });
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-fill-preview')).toHaveAttribute('data-visible', '');
    await page.mouse.up();
    const result = await page.evaluate(() => {
      const range = window.__gridApi.getSelection().cellRanges[0];
      return { range, rendered: document.querySelector('.salmon-data-grid [data-row-id="r2"]') !== null };
    });
    // The fill extended far below the first window; its first rows are no longer rendered.
    expect(result.rendered).toBe(false);
    const last = Number(String(result.range?.focus?.rowId ?? 'r0').slice(1));
    expect(last).toBeGreaterThan(80);
    for (const r of [2, 3, 41, last - 1, last]) expect(await value(page, `r${r}`, 's2')).toBe(pattern[r % 2]);
  });

  test('drags across pin edges: start-pinned into center, center into end-pinned', async ({ page }) => {
    const problems = collectProblems(page);
    // cols=4: id and s0 pinned start, s1 and s2 in the center, s3 pinned end (all text columns).
    await openGrid(page, `${DEV_URL}?rows=2000&cols=4&frozenCols=2&frozenRight&sel=cell&cellMode=box&edit=cell&efill`);
    const zone = (rowId: string, columnId: string) =>
      cell(page, rowId, columnId).evaluate((el) => (el.closest('.salmon-data-grid-pin--left') ? 'start' : el.closest('.salmon-data-grid-pin--right') ? 'end' : 'center'));
    expect([await zone('r1', 's0'), await zone('r1', 's2'), await zone('r1', 's3')]).toEqual(['start', 'center', 'end']);

    // Start-pinned s0 (rows 1..2) dragged right into the center: s1 and s2 take s0's values.
    await select(page, ['r1', 's0'], ['r2', 's0']);
    const pinned = [await value(page, 'r1', 's0'), await value(page, 'r2', 's0')];
    await grabHandle(page);
    const into = await center(page, 'r2', 's2');
    await page.mouse.move(into.x, into.y, { steps: 6 });
    await expect(page.locator('.salmon-data-grid .salmon-data-grid-fill-preview')).toHaveAttribute('data-visible', '');
    await page.mouse.up();
    for (const field of ['s1', 's2']) {
      expect(await value(page, 'r1', field)).toBe(pinned[0]);
      expect(await value(page, 'r2', field)).toBe(pinned[1]);
    }
    await expect(cell(page, 'r1', 's2')).toHaveText(String(pinned[0]));
    expect(await value(page, 'r1', 's3')).not.toBe(pinned[0]);

    // Center s1 (rows 5..6) dragged right into the end-pinned s3: s2 and s3 take s1's values.
    await select(page, ['r5', 's1'], ['r6', 's1']);
    const middle = [await value(page, 'r5', 's1'), await value(page, 'r6', 's1')];
    await grabHandle(page);
    const end = await center(page, 'r6', 's3');
    await page.mouse.move(end.x, end.y, { steps: 6 });
    await page.mouse.up();
    for (const field of ['s2', 's3']) {
      expect(await value(page, 'r5', field)).toBe(middle[0]);
      expect(await value(page, 'r6', field)).toBe(middle[1]);
    }
    await expect(cell(page, 'r6', 's3')).toHaveText(String(middle[1]));
    // The fill extended the selection across both zones.
    expect(await page.evaluate(() => window.__gridApi.getSelection().cellRanges[0])).toEqual({ anchor: { rowId: 'r5', columnId: 's1' }, focus: { rowId: 'r6', columnId: 's3' } });
    expect(problems).toEqual([]);
  });

  test('drags down past the rendered window from a pinned column: auto-scroll fills rows that were not rendered', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=2000&cols=4&frozenCols=2&frozenRight&sel=cell&cellMode=box&edit=cell&efill`);
    await select(page, ['r0', 's0'], ['r1', 's0']);
    const pattern = [await value(page, 'r0', 's0'), await value(page, 'r1', 's0')];
    const renderedAtStart = await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>('.salmon-data-grid-rows > [data-row-index]')].map((r) => Number(r.dataset['rowIndex']))));
    await grabHandle(page);
    const viewport = (await page.locator('.salmon-data-grid-viewport').boundingBox())!;
    const x = (await center(page, 'r1', 's0')).x;
    await page.mouse.move(x, viewport.y + viewport.height - 4, { steps: 4 });
    await page.mouse.move(x, viewport.y + viewport.height + 30, { steps: 2 });
    await page.waitForFunction(() => (document.querySelector('.salmon-data-grid-viewport') as HTMLElement).scrollTop > 3000);
    await page.mouse.move(x, viewport.y + viewport.height - 60, { steps: 2 });
    await page.mouse.up();
    const range = await page.evaluate(() => window.__gridApi.getSelection().cellRanges[0]);
    const last = Number(String(range?.focus?.rowId ?? 'r0').slice(1));
    expect(last).toBeGreaterThan(renderedAtStart + 40);
    expect(range?.focus?.columnId).toBe('s0');
    for (const r of [2, renderedAtStart + 1, last - 1, last]) expect(await value(page, `r${r}`, 's0')).toBe(pattern[r % 2]);
    expect(await value(page, `r${last + 1}`, 's0')).not.toBe(pattern[(last + 1) % 2]);
  });
});

test.describe('copy and paste with the Clipboard API', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('Mod+C copies the range as TSV (drafts included); onBeforeCopy can replace the text; Ctrl+Shift+H adds headers', async ({ page }) => {
    await openGrid(page, GRID);
    await select(page, ['r1', 's2'], ['r2', 's3']);
    await cell(page, 'r1', 's2').focus();
    const expected = [`${await value(page, 'r1', 's2')}\t${await value(page, 'r1', 's3')}`, `${await value(page, 'r2', 's2')}\t${await value(page, 'r2', 's3')}`].join('\n');
    await page.keyboard.press('Control+C');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    const copy = (await events(page)).find((e) => e['type'] === 'beforeCopy') as Record<string, unknown>;
    expect(copy).toMatchObject({ source: 'keyboard', copied: 'range', cells: 4, includeHeaders: false, rowIds: ['r1', 'r2'], fields: ['s2', 's3'], data: expected });
    await page.evaluate(() => {
      (window as unknown as { __clipboardHook: (e: { type: string; data: string }) => void }).__clipboardHook = (e) => {
        if (e.type === 'beforeCopy') e.data = 'replaced';
      };
    });
    await page.keyboard.press('Control+C');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('replaced');
    await page.evaluate(() => ((window as unknown as { __clipboardHook: unknown }).__clipboardHook = undefined));
    await page.keyboard.press('Control+Shift+H');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`Text 2\tText 3\n${expected}`);
  });

  test('Mod+V pastes from the system clipboard; onBeforePaste can change or cancel it; api.copy()/paste()', async ({ page }) => {
    await openGrid(page, GRID);
    await page.evaluate(() => navigator.clipboard.writeText('one\ttwo\nthree\tfour'));
    await cell(page, 'r5', 's2').click();
    await pressPaste(page, 'one\ttwo\nthree\tfour');
    await expect.poll(() => value(page, 'r6', 's3')).toBe('four');
    expect(await value(page, 'r5', 's2')).toBe('one');
    await expect(cell(page, 'r5', 's2')).toBeFocused();
    const paste = (await events(page)).find((e) => e['type'] === 'beforePaste') as Record<string, unknown>;
    expect(paste).toMatchObject({ source: 'keyboard', data: 'one\ttwo\nthree\tfour', target: { rowId: 'r5', field: 's2' } });
    await page.evaluate(() => {
      (window as unknown as { __clipboardHook: (e: { type: string; data: string; preventDefault(): void }) => void }).__clipboardHook = (e) => {
        if (e.type === 'beforePaste' && e.data === 'cancel me') e.preventDefault();
        else if (e.type === 'beforePaste') e.data = e.data.toUpperCase();
      };
    });
    expect(await page.evaluate(() => window.__gridApi.paste('cancel me'))).toEqual({ status: 'rejected', reason: 'cancelled' });
    expect(await value(page, 'r5', 's2')).toBe('one');
    expect((await page.evaluate(() => window.__gridApi.paste('upper'))).status).toBe('applied');
    expect(await value(page, 'r5', 's2')).toBe('UPPER');
    // api.copy() writes the focused cell's text.
    await page.evaluate(() => window.__gridApi.selectCellRange({ rowId: 'r6', field: 's3' }, { rowId: 'r6', field: 's3' }));
    expect((await page.evaluate(() => window.__gridApi.copy())).status).toBe('applied');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('four');
  });

  test('the copy toolbar item copies the selection', async ({ page }) => {
    await openGrid(page, GRID);
    await page.evaluate(() => (window as unknown as { __setExtra(p: unknown): void }).__setExtra({ toolbar: ['copy'] }));
    await select(page, ['r3', 's0'], ['r3', 's0']);
    await page.getByRole('toolbar', { name: 'Data Grid toolbar' }).getByRole('button', { name: 'Copy' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(String(await value(page, 'r3', 's0')));
  });
});

test.describe('without the Clipboard API', () => {
  test('copy falls back to a hidden textarea and execCommand', async ({ page }) => {
    await withoutClipboardApi(page, true);
    await openGrid(page, GRID);
    expect(await page.evaluate(() => navigator.clipboard)).toBeUndefined();
    await select(page, ['r1', 's2'], ['r1', 's3']);
    await cell(page, 'r1', 's2').focus();
    await page.keyboard.press('Control+C');
    const copies = await page.evaluate(() => (window as unknown as { __execCopies: string[] }).__execCopies);
    expect(copies).toEqual([`${await value(page, 'r1', 's2')}\t${await value(page, 'r1', 's3')}`]);
    await expect(page.locator('.salmon-data-grid-clipboard-dialog')).toHaveCount(0);
    await expect(cell(page, 'r1', 's2')).toBeFocused();
  });

  test('when execCommand fails too, a dialog shows the text selected for Ctrl/Cmd+C', async ({ page }) => {
    await withoutClipboardApi(page, false);
    await openGrid(page, GRID);
    await select(page, ['r1', 's2'], ['r1', 's2']);
    await cell(page, 'r1', 's2').focus();
    await page.keyboard.press('Control+C');
    const dialog = page.locator('dialog.salmon-data-grid-clipboard-dialog');
    await expect(dialog).toBeVisible();
    const area = dialog.locator('textarea');
    await expect(area).toBeFocused();
    await expect(area).toHaveValue(String(await value(page, 'r1', 's2')));
    expect(await area.evaluate((el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart)).toBe(String(await value(page, 'r1', 's2')).length);
    await expect(dialog).toHaveAccessibleName('Copy');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(cell(page, 'r1', 's2')).toBeFocused();
  });

  test('Mod+V pastes through the hidden textarea (no Clipboard API needed)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await withoutClipboardApi(page, true);
    await openGrid(page, GRID);
    await page.evaluate(() => (window as unknown as { __realClipboard: Clipboard }).__realClipboard.writeText('alpha\nbeta'));
    await cell(page, 'r8', 's3').click();
    await pressPaste(page, 'alpha\nbeta');
    await expect.poll(() => value(page, 'r9', 's3')).toBe('beta');
    expect(await value(page, 'r8', 's3')).toBe('alpha');
    await expect(cell(page, 'r8', 's3')).toBeFocused();
  });

  test('api.paste() without text opens a paste dialog; pasting into it pastes into the grid', async ({ page }) => {
    await withoutClipboardApi(page, true);
    await openGrid(page, GRID);
    await cell(page, 'r4', 's2').click();
    const result = await page.evaluate(() => window.__gridApi.paste().status);
    expect(result).toBe('async');
    const dialog = page.locator('dialog.salmon-data-grid-clipboard-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('textarea')).toBeFocused();
    await dialog.locator('textarea').evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'from dialog');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => value(page, 'r4', 's2')).toBe('from dialog');
    await expect(cell(page, 'r4', 's2')).toBeFocused();
  });
});
