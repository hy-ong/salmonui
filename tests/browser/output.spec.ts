import { inflateRawSync } from 'node:zlib';
import { expect, test, type Download, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Export and print browser gates: export methods and items, the writers stay
// lazy, and print: the print projection renders every row of the scope without
// virtualization and reaches window.print() for 10k x 20 within 1 s.

const outputEvents = (page: Page) => page.evaluate(() => (window as unknown as { __outputEvents: Record<string, unknown>[] }).__outputEvents);

/** Replaces window.print: records the print container, then fires afterprint like a closed dialog. */
async function stubPrint(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __prints: Record<string, unknown>[]; __printStart?: number };
    w.__prints = [];
    window.print = () => {
      const container = document.querySelector('.salmon-data-grid-print');
      w.__prints.push({
        ms: w.__printStart === undefined ? null : performance.now() - w.__printStart,
        printing: document.documentElement.hasAttribute('data-salmon-printing'),
        rows: container?.querySelectorAll('tbody > tr').length ?? 0,
        headers: [...(container?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent),
        details: [...(container?.querySelectorAll('tr.salmon-data-grid-print__detail') ?? [])].map((tr) => tr.textContent),
      });
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0);
    };
  });
}

const prints = (page: Page) => page.evaluate(() => (window as unknown as { __prints: Record<string, unknown>[] }).__prints);

async function downloadBytes(download: Download): Promise<Buffer> {
  return Buffer.concat(await (await download.createReadStream()).toArray());
}

/** Entries of a ZIP package by name (stored or deflated), read with an independent decoder. */
function unzip(bytes: Buffer): Map<string, string> {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('no end of central directory');
  const out = new Map<string, string>();
  let at = bytes.readUInt32LE(end + 16);
  for (let i = bytes.readUInt16LE(end + 10); i > 0; i--) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory');
    const nameLength = bytes.readUInt16LE(at + 28);
    const local = bytes.readUInt32LE(at + 42);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(start, start + bytes.readUInt32LE(at + 20));
    out.set(bytes.toString('utf8', at + 46, at + 46 + nameLength), (bytes.readUInt16LE(at + 10) === 8 ? inflateRawSync(data) : data).toString('utf8'));
    at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
  return out;
}

/** Checks a downloaded workbook: a ZIP whose first sheet holds the header and all 200 fixture rows. */
function expectWorkbook(bytes: Buffer): void {
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  const files = unzip(bytes);
  const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';
  expect((sheet.match(/<row /g) ?? []).length).toBe(201);
  const text = `${files.get('xl/sharedStrings.xml') ?? ''}${sheet}`;
  for (const value of ['ID', 'Text 0', 'r0', 'r199']) expect(text).toContain(`>${value}<`);
}

test.describe('export', () => {
  test('toolbar CSV downloads the file; API Excel and PDF resolve valid files; events and cancel', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=8&chrome&export`);
    // Writers are not loaded before the first export.
    const before = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /xlsx|pdf/.test(n)));
    expect(before).toEqual([]);
    for (const id of ['exportExcel', 'exportPdf', 'exportCsv', 'print']) await expect(page.locator(`[data-toolbar-item="${id}"]`)).not.toHaveAttribute('aria-disabled', 'true');
    const download = page.waitForEvent('download');
    await page.locator('[data-toolbar-item="exportCsv"]').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('export.csv');
    const csv = await (await file.createReadStream()).toArray();
    expect(Buffer.concat(csv).toString('utf8').split('\r\n').filter(Boolean).length).toBe(201);
    const files = await page.evaluate(async () => {
      const api = window.__gridApi as any;
      const xlsx = await api.exportToExcel({ download: false, fileName: 'orders' });
      const pdf = await api.exportToPdf({ download: false, pages: 'all' });
      return {
        xlsx: [xlsx.fileName, xlsx.mimeType, xlsx.data[0], xlsx.data[1]],
        pdf: [pdf.fileName, new TextDecoder().decode(pdf.data.slice(0, 5))],
      };
    });
    expect(files.xlsx).toEqual(['orders.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 0x50, 0x4b]);
    expect(files.pdf).toEqual(['export.pdf', '%PDF-']);
    const events = await outputEvents(page);
    expect(events.map((e) => `${e.type}:${e.format}:${e.source}`)).toEqual([
      'beforeExport:csv:pointer',
      'export:csv:pointer',
      'beforeExport:excel:api',
      'export:excel:api',
      'beforeExport:pdf:api',
      'export:pdf:api',
    ]);
    // preventDefault() cancels: the method resolves to null and onExport does not fire.
    const cancelled = await page.evaluate(async () => {
      (window as unknown as { __cancelNext: boolean }).__cancelNext = true;
      return (window.__gridApi as any).exportToCsv({ download: false });
    });
    expect(cancelled).toBeNull();
    expect((await outputEvents(page)).length).toBe(7);
    expect(problems).toEqual([]);
  });

  test('toolbar and context-menu Excel and PDF items download valid files through the writers', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?rows=200&cols=8&chrome&export`);
    let download = page.waitForEvent('download');
    await page.locator('[data-toolbar-item="exportExcel"]').click();
    let file = await download;
    expect(file.suggestedFilename()).toBe('export.xlsx');
    expectWorkbook(await downloadBytes(file));
    download = page.waitForEvent('download');
    await page.locator('[data-toolbar-item="exportPdf"]').click();
    file = await download;
    expect(file.suggestedFilename()).toBe('export.pdf');
    let pdf = (await downloadBytes(file)).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    // The context menu items run the same commands.
    const menu = page.locator('.salmon-data-grid-context-menu');
    for (const [label, name] of [['Export to Excel', 'export.xlsx'], ['Export to PDF', 'export.pdf']] as const) {
      await page.locator('.salmon-data-grid-rows .salmon-data-grid-cell').first().click({ button: 'right' });
      await expect(menu).toBeVisible();
      const item = menu.locator('[role="menuitem"]', { hasText: label });
      await expect(item).not.toHaveAttribute('aria-disabled', 'true');
      download = page.waitForEvent('download');
      await item.click();
      file = await download;
      expect(file.suggestedFilename()).toBe(name);
      const bytes = await downloadBytes(file);
      if (name.endsWith('.xlsx')) expectWorkbook(bytes);
      else {
        pdf = bytes.toString('latin1');
        expect(pdf.startsWith('%PDF-')).toBe(true);
      }
    }
    expect((await outputEvents(page)).map((e) => `${e.type}:${e.format}:${e.source}`)).toEqual([
      'beforeExport:excel:pointer',
      'export:excel:pointer',
      'beforeExport:pdf:pointer',
      'export:pdf:pointer',
      'beforeExport:excel:pointer',
      'export:excel:pointer',
      'beforeExport:pdf:pointer',
      'export:pdf:pointer',
    ]);
    expect(problems).toEqual([]);
  });

  test('busy status while a large export runs', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?rows=100000&cols=30&export`);
    const done = page.evaluate(() => (window.__gridApi as any).exportToExcel({ download: false }).then((f: { data: Uint8Array }) => f.data.byteLength));
    await expect(page.locator('.salmon-data-grid-output-status')).toContainText('Exporting');
    expect(await done).toBeGreaterThan(100_000);
    await expect(page.locator('.salmon-data-grid-output-status')).toHaveCount(0);
  });

  test('without writers the Excel and PDF items are disabled with a reason; the context menu wires export', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=50&cols=6&chrome`);
    await expect(page.locator('[data-toolbar-item="exportExcel"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-toolbar-item="exportExcel"]')).toHaveAttribute('title', 'Excel export is not available');
    await expect(page.locator('[data-toolbar-item="exportCsv"]')).not.toHaveAttribute('aria-disabled', 'true');
    await page.locator('.salmon-data-grid-rows .salmon-data-grid-cell').first().click({ button: 'right' });
    const menu = page.locator('.salmon-data-grid-context-menu');
    await expect(menu).toBeVisible();
    const excel = menu.locator('[role="menuitem"]', { hasText: 'Export to Excel' });
    await expect(excel).toHaveAttribute('aria-disabled', 'true');
    const csv = menu.locator('[role="menuitem"]', { hasText: 'Export to CSV' });
    await expect(csv).not.toHaveAttribute('aria-disabled', 'true');
    const download = page.waitForEvent('download');
    await csv.click();
    expect((await download).suggestedFilename()).toBe('export.csv');
  });
});

test.describe('print', () => {
  test('prints every row (no virtualization) within the 10k x 20 budget; events; cleanup', { tag: '@perf' }, async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${PROD_URL}?rows=10000&cols=20&export`);
    await stubPrint(page);
    // Warm the lazy chunks once, then measure.
    await page.evaluate(async () => {
      await (window.__gridApi as any).print();
      await new Promise((r) => setTimeout(r, 10));
    });
    const printed = await page.evaluate(async () => {
      (window as unknown as { __printStart: number }).__printStart = performance.now();
      return (window.__gridApi as any).print();
    });
    expect(printed).toBe(true);
    const [, measured] = await prints(page);
    expect(measured?.rows).toBe(10_000);
    expect(measured?.printing).toBe(true);
    // The fixture's ID column plus 20 data columns.
    expect((measured?.headers as string[]).length).toBe(21);
    expectBudget(measured?.ms as number, 1000, 'print 10k x 20 to window.print()');
    console.log(`print 10k x 20 to window.print(): ${(measured?.ms as number).toFixed(0)} ms`);
    // afterprint removes the container and fires onAfterPrint.
    await expect(page.locator('.salmon-data-grid-print')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-salmon-printing'))).toBe(false);
    const events = (await outputEvents(page)).map((e) => e.type);
    expect(events).toEqual(['beforePrint', 'afterPrint', 'beforePrint', 'afterPrint']);
    expect(problems).toEqual([]);
  });

  test('page scope, cancel, and Mod+P with focus in the grid', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=500&cols=6&paging=50&export&printPage`);
    await stubPrint(page);
    expect(await page.evaluate(() => (window.__gridApi as any).print())).toBe(true);
    expect((await prints(page))[0]?.rows).toBe(50);
    expect(await page.evaluate(() => (window.__gridApi as any).print({ scope: 'all' }))).toBe(true);
    await expect.poll(async () => (await prints(page)).length).toBe(2);
    expect((await prints(page))[1]?.rows).toBe(500);
    // Cancelled: no window.print().
    expect(await page.evaluate(() => {
      (window as unknown as { __cancelNext: boolean }).__cancelNext = true;
      return (window.__gridApi as any).print();
    })).toBe(false);
    expect((await prints(page)).length).toBe(2);
    await page.locator('.salmon-data-grid-rows .salmon-data-grid-cell').first().click();
    // Headless Chromium reports a non-Mac platform to the keymap: Mod is Ctrl.
    await page.keyboard.press('Control+p');
    await expect.poll(async () => (await prints(page)).length).toBe(3);
    const sources = (await outputEvents(page)).filter((e) => e.type === 'beforePrint').map((e) => e.source);
    expect(sources).toEqual(['api', 'api', 'api', 'keyboard']);
  });

  test('a detail hook prints detail blocks after their rows, as in export', async ({ page }) => {
    await openGrid(page, `${DEV_URL}?rows=500&cols=6&paging=50&export&printPage`);
    await stubPrint(page);
    expect(
      await page.evaluate(() =>
        (window.__gridApi as any).print({ detail: ({ rowId }: { rowId: string }) => (rowId === 'r1' || rowId === 'r3' ? { text: [`Detail of ${rowId}`] } : null) }),
      ),
    ).toBe(true);
    const [first] = await prints(page);
    expect(first?.rows).toBe(52);
    expect(first?.details).toEqual(['Detail of r1', 'Detail of r3']);
  });
});
