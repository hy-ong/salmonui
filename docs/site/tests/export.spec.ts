import { readFile } from 'node:fs/promises';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { buildTestFont } from '../../../packages/export/tests/font-fixture';

// Export options of the export-print demo, checked in the downloaded files:
// selected rows, hidden columns, several grids per
// workbook, merged repeats, formulas,
// detail blocks, embedded PDF fonts, the server export
// route, lookup display text, template text and images,
// and stacked headers as merged header cells.

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/export-print');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  await page.waitForLoadState('networkidle');
  return problems;
}

/** Clicks the trigger and returns the bytes of the file it downloads. */
async function download(page: Page, trigger: Locator | (() => Promise<void>)): Promise<{ name: string; bytes: Buffer }> {
  const pending = page.waitForEvent('download');
  if (typeof trigger === 'function') await trigger();
  else await trigger.click();
  const file = await pending;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

/** Entries of a ZIP archive (XLSX) by name, read through the central directory. */
function unzip(zip: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + size);
    out.set(name, (method === 8 ? inflateRawSync(data) : data).toString('utf8'));
    at += 46 + nameLength + extra + comment;
  }
  return out;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const grid = (page: Page) => page.getByRole('grid', { name: 'Orders to export and print' });

test('selected rows, hidden columns, lookup text, templates, images and stacked headers', async ({ page }) => {
  const problems = await open(page);

  // only the selected rows.
  const products = grid(page).locator('.salmon-data-grid-rows .salmon-data-grid-cell[data-column-id="product"]');
  await products.nth(0).click();
  await products.nth(2).click({ modifiers: ['ControlOrMeta'] });
  const ids = await grid(page).locator('.salmon-data-grid-rows [aria-selected="true"][data-row-id]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-row-id')));
  expect(ids).toHaveLength(2);
  const selected = unzip((await download(page, button(page, 'Excel of the selected rows'))).bytes);
  const selectedStrings = selected.get('xl/sharedStrings.xml') ?? '';
  for (const id of ids) expect(selectedStrings).toContain(`>${id}<`);
  expect(selectedStrings.match(/>ORD-\d+</g)).toHaveLength(2);

  // the hidden Note column is exported on request.
  const csv = (await download(page, button(page, 'CSV with hidden columns'))).bytes.toString('utf8');
  expect(csv.split(/\r?\n/)[0]).toContain('Note');
  expect(csv).toContain('Leave the parcel with the building reception');

  // lookup display text, hook text and images, merged stacked header.
  const templated = unzip((await download(page, button(page, 'Excel with template text and images'))).bytes);
  const strings = templated.get('xl/sharedStrings.xml') ?? '';
  expect(strings).toContain('Loose-leaf tea');
  expect(strings).toContain('>Shipped<');
  expect(strings).toContain('>Pending<');
  expect([...templated.keys()].some((name) => name.startsWith('xl/media/'))).toBe(true);
  expect(templated.get('xl/worksheets/sheet1.xml')).toMatch(/<mergeCell ref="[A-Z]+1:[A-Z]+1"\/>/);
  expect(problems).toEqual([]);
});

test('detail blocks, several grids per workbook, merged repeats and formulas', async ({ page }) => {
  const problems = await open(page);

  // a text detail block after rows with a note.
  const details = unzip((await download(page, button(page, 'Excel with detail rows'))).bytes);
  expect(details.get('xl/sharedStrings.xml')).toContain('Note: Gift wrap');

  // one sheet per grid, or both grids on one sheet.
  const sheets = unzip((await download(page, button(page, 'Workbook: both grids, one sheet each'))).bytes);
  expect(sheets.get('xl/workbook.xml')).toMatch(/<sheet [^>]*name="Orders"[\s\S]*<sheet [^>]*name="Targets"/);
  expect(sheets.has('xl/worksheets/sheet2.xml')).toBe(true);
  const stacked = unzip((await download(page, button(page, 'Workbook: both grids stacked'))).bytes);
  expect(stacked.has('xl/worksheets/sheet2.xml')).toBe(false);
  expect(stacked.get('xl/sharedStrings.xml')).toContain('Europe');

  // merged region runs and live formulas.
  const targets = unzip((await download(page, button(page, 'Targets: merged regions and formulas'))).bytes);
  const sheet = targets.get('xl/worksheets/sheet1.xml') ?? '';
  expect(sheet).toContain('<f>ROUND(180000*1.1,0)</f>');
  expect(sheet).toMatch(/<mergeCell ref="A\d+:A\d+"\/>/);
  expect(problems).toEqual([]);
});

/** Text shown by the `Tj` operators of a PDF's content streams (Helvetica literals). */
function pdfText(pdf: Buffer): string[] {
  const text = pdf.toString('latin1');
  const out: string[] = [];
  const re = /<< \/Length (\d+) \/Filter \/FlateDecode >>\nstream\n/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[0].length;
    const stream = inflateSync(pdf.subarray(start, start + Number(m[1]))).toString('latin1');
    for (const t of stream.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)) out.push(t[1] as string);
  }
  return out;
}

test('PDF merges repeated values and draws cell hook spans', async ({ page }) => {
  const problems = await open(page);
  const pdf = await download(page, button(page, 'Targets PDF: merged regions and a spanned cell'));
  expect(pdf.name).toBe('targets.pdf');
  const text = pdfText(pdf.bytes);
  // Europe x3 and Asia x2 are one merged cell each.
  expect(text.filter((t) => t === 'Europe')).toHaveLength(1);
  expect(text.filter((t) => t === 'Asia')).toHaveLength(1);
  // Portugal's target spans the stretch column: its own stretch value is not drawn.
  expect(text).toContain('Under review');
  expect(text).not.toContain('$104,500');
  expect(text).toContain('$264,000');
  expect(problems).toEqual([]);
});

test('PDF with an embedded TrueType font', async ({ page }) => {
  const problems = await open(page);
  const codePoints = [...Array.from({ length: 95 }, (_, i) => 32 + i), ...'Заказы·注文الطلبات'].map((c) => (typeof c === 'number' ? c : (c.codePointAt(0) as number)));
  const font = buildTestFont({ codePoints, name: 'DemoTest' });
  const pdf = await download(page, () => page.getByLabel('PDF with a TrueType font').setInputFiles({ name: 'demo.ttf', mimeType: 'font/ttf', buffer: Buffer.from(font.bytes) }));
  const text = pdf.bytes.toString('latin1');
  expect(text.startsWith('%PDF-')).toBe(true);
  expect(text).toContain('/CIDFontType2');
  expect(text).toContain('/ToUnicode');
  expect(problems).toEqual([]);
});

test('server export rebuilds the client view from getState()', async ({ page }) => {
  const problems = await open(page);
  // Sort by quantity, descending: the server CSV follows the client sort.
  const header = grid(page).locator('.salmon-data-grid-header-cell[data-column-id="quantity"]');
  await header.click();
  await header.click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  const csv = (await download(page, button(page, 'Server export (CSV)'))).bytes.toString('utf8');
  const lines = csv.split(/\r?\n/).filter(Boolean);
  expect(lines[0]).toContain('Order');
  const qty = (lines.find((line) => line.split(',').includes('Qty')) ?? '').split(',').indexOf('Qty');
  expect(qty).toBeGreaterThan(0);
  // Within each country group (caption lines separate them) quantities never increase.
  let rows = 0;
  let previous = Infinity;
  let ordered = true;
  for (const cells of lines.map((line) => line.split(','))) {
    if (!/^ORD-/.test(cells[0] ?? '')) {
      previous = Infinity;
      continue;
    }
    const value = Number(cells[qty]);
    if (!(value <= previous)) ordered = false;
    previous = value;
    rows++;
  }
  expect(rows).toBe(10_000);
  expect(ordered).toBe(true);
  expect(problems).toEqual([]);
});
