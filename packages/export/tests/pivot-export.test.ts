// Pivot export: `exportPivot()` to XLSX (outlined
// sheet, merged stacked column headers, number formats, total styles,
// conditional formats, `cell` hook), CSV (whole and streamed), PDF (repeated
// headers, page breaks) and window sources paged through.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPivotExportModel, exportPivot, loadPivotResult, streamPivotCsv } from '@salmonui/export/pivot';
import { pdfStreams, pdfText, sheetCells, unzip } from './helpers.ts';
import { pivotFixture, windowSource } from './pivot-fixture.ts';

const sheet = (files: Map<string, string>): string => files.get('xl/worksheets/sheet1.xml') ?? '';
const rowXml = (xml: string, r: number): string => new RegExp(`<row r="${r}"[^>]*>[\\s\\S]*?</row>`).exec(xml)?.[0] ?? '';
/** Style (`cellXfs` entry) of a cell. */
function xfOf(files: Map<string, string>, ref: string): string {
  const s = new RegExp(`<c r="${ref}" s="(\\d+)"`).exec(sheet(files))?.[1];
  const xfs = [...(files.get('xl/styles.xml') ?? '').replace(/^[\s\S]*<cellXfs[^>]*>/, '').matchAll(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  return s === undefined ? '' : (xfs[Number(s)] ?? '');
}
const fontOf = (files: Map<string, string>, xf: string): string => {
  const id = Number(/fontId="(\d+)"/.exec(xf)?.[1] ?? 0);
  return [...(files.get('xl/styles.xml') ?? '').matchAll(/<font>[\s\S]*?<\/font>/g)][id]?.[0] ?? '';
};
const fillOf = (files: Map<string, string>, xf: string): string => {
  const id = Number(/fillId="(\d+)"/.exec(xf)?.[1] ?? 0);
  return [...(files.get('xl/styles.xml') ?? '').matchAll(/<fill>[\s\S]*?<\/fill>/g)][id]?.[0] ?? '';
};

describe('exportPivot XLSX', () => {
  it('writes an outlined sheet with stacked merged column headers and row outline levels', async () => {
    const result = pivotFixture();
    const file = await exportPivot(result, { fileName: 'report' });
    assert.ok(file);
    assert.equal(file.fileName, 'report.xlsx');
    const files = unzip(file.data);
    const cells = sheetCells(files);
    assert.equal(cells['A1'], 'Region / Country');
    assert.equal(cells['B1'], '2023');
    assert.equal(cells['D1'], '2024');
    assert.equal(cells['F1'], 'Grand Total');
    assert.equal(cells['B2'], 'Sales');
    assert.equal(cells['C2'], 'Units');
    const xml = sheet(files);
    for (const m of ['A1:A2', 'B1:C1', 'D1:E1', 'F1:G1']) assert.ok(xml.includes(`<mergeCell ref="${m}"/>`), m);
    // Body: one row per leaf row, the tree depth as the outline level.
    assert.equal(cells['A3'], 'R0 Total');
    assert.equal(cells['B3'], 10.25);
    assert.equal(cells['B4'], undefined, 'empty cell');
    assert.equal(cells['C4'], 21.25);
    assert.equal(cells['A10'], 'Grand Total');
    assert.equal(cells['G10'], (7 + 1) * 10 + 5 + 0.25);
    assert.match(rowXml(xml, 4), /outlineLevel="1"/);
    assert.doesNotMatch(rowXml(xml, 3), /outlineLevel/);
    assert.match(xml, /outlineLevelRow="\d"/);
    assert.match(xml, /<outlinePr summaryBelow="0"\/>/);
    // Row headers indented by depth, frozen with the header rows.
    assert.match(xfOf(files, 'A4'), /indent="1"/);
    assert.match(xml, /<pane xSplit="1" ySplit="2"/);
    // Subtotal and grand total rows and columns are bold.
    assert.match(fontOf(files, xfOf(files, 'B3')), /<b\/>/);
    assert.match(fontOf(files, xfOf(files, 'B10')), /<b\/>/);
    assert.match(fontOf(files, xfOf(files, 'F5')), /<b\/>/);
    assert.doesNotMatch(fontOf(files, xfOf(files, 'C5')), /<b\/>/);
  });

  it('applies number formats from model.formats, conditional formats and the cell hook', async () => {
    const result = pivotFixture({
      formats: { Sales: { number: { style: 'currency', currency: 'USD' } }, Units: { number: { maximumFractionDigits: 0 } } },
      conditionalFormats: [
        { measure: 'Units', operator: 'greaterThan', value: 60, tone: 'danger' },
        { operator: 'between', value: 30, value2: 32, style: { backgroundColor: '#00ff00', color: '#112233' } },
        { measure: 'Sales', operator: 'greaterThan', value: 0, style: { color: '#abcdef' }, applyGrandTotals: false },
      ],
    });
    const file = await exportPivot(result, {
      cell: ({ pivotCell, row }) => (pivotCell && row.label === 'R1' && pivotCell.columnIndex === 0 ? { value: 'n/a', style: { italic: true } } : undefined),
      headerCell: ({ text }) => (text === '2024' ? { text: 'FY2024' } : undefined),
    });
    const files = unzip((file as { data: Uint8Array }).data);
    const styles = files.get('xl/styles.xml') ?? '';
    assert.match(styles, /formatCode="&quot;\$&quot;#,##0\.00"/);
    assert.match(styles, /formatCode="#,##0"/);
    const cells = sheetCells(files);
    assert.equal(cells['D1'], 'FY2024');
    assert.equal(cells['B6'], 'n/a');
    assert.match(fontOf(files, xfOf(files, 'B6')), /<i\/>/);
    // R2C1 (row 7 of the sheet = leaf 6): Units 2024 = 73.25 > 60 -> danger tone.
    assert.match(fillOf(files, xfOf(files, 'E9')), /FFFEE2E2/);
    // 30.25 / 31.25 (leaf 2, columns 0..1) fall in [30, 32].
    assert.match(fillOf(files, xfOf(files, 'C5')), /FF00FF00/);
    assert.match(fontOf(files, xfOf(files, 'C5')), /FF112233/);
    // applyGrandTotals: false skips grand total cells.
    assert.match(fontOf(files, xfOf(files, 'B3')), /FFABCDEF/);
    assert.doesNotMatch(fontOf(files, xfOf(files, 'F3')), /FFABCDEF/);
  });

  it('tabular layout, removed row headers, excluded columns, current rows only, several pivots per workbook', async () => {
    const result = pivotFixture();
    const tabular = unzip((await exportPivot(result, { rowLayout: 'tabular' }))?.data as Uint8Array);
    const t = sheetCells(tabular);
    assert.equal(t['A1'], 'Region');
    assert.equal(t['B1'], 'Country');
    assert.equal(t['C1'], '2023');
    assert.equal(t['A3'], 'R0 Total', 'a leaf label sits at its level');
    assert.equal(t['A4'], undefined, 'an outer label shows on the first row of its member only');
    assert.equal(t['B4'], 'R0C0');
    assert.equal(t['A6'], 'R1');
    assert.equal(t['A10'], 'Grand Total');
    const bare = sheetCells(unzip((await exportPivot(result, { rowHeaders: false, includeColumn: (h) => h.measure === 'Sales', rowRange: [0, 2] }))?.data as Uint8Array));
    assert.equal(bare['A1'], '2023');
    assert.equal(bare['A2'], 'Sales');
    assert.equal(bare['B1'], '2024');
    assert.equal(bare['C1'], 'Grand Total');
    assert.equal(bare['D1'], undefined);
    assert.equal(bare['A3'], 10.25);
    assert.equal(bare['A5'], undefined, 'rowRange stops after two rows');
    const two = unzip((await exportPivot([result, pivotFixture({ regions: 1 })], { xlsx: { sheetNames: ['A', 'B'] } }))?.data as Uint8Array);
    assert.ok(two.has('xl/worksheets/sheet2.xml'));
    assert.match(two.get('xl/workbook.xml') ?? '', /name="B"/);
  });

  it('onBeforeExport cancels, onExport sees the file', async () => {
    const result = pivotFixture();
    assert.equal(await exportPivot(result, {}, { onBeforeExport: (e) => e.preventDefault() }), null);
    let seen: Promise<unknown> | null = null;
    const file = await exportPivot(result, {}, { onExport: (e) => (seen = e.file) });
    assert.equal(await seen, file);
  });
});

describe('exportPivot CSV', () => {
  it('escapes formula text by default, false keeps it raw, negative numbers stay', async () => {
    const base = pivotFixture();
    const result = { ...base, cellAt: (r: number, c: number) => ({ ...base.cellAt(r, c), value: -5, formattedValue: '-5.00' }) };
    const evil = { headerCell: (ctx: { readonly level: number }) => (ctx.level === 0 ? { text: '=evil' } : null) };
    const first = (csv: string): string[] => csv.split('\r\n')[0]?.split(',') ?? [];
    const raw = (await exportPivot(result, { format: 'csv', ...evil })) as { data: string };
    assert.ok(first(raw.data).slice(1).every((h) => h.startsWith("'=evil")));
    assert.equal(raw.data.split('\r\n')[1]?.split(',')[1], '-5');
    const formatted = (await exportPivot(result, { format: 'csv', csv: { values: 'formatted' } })) as { data: string };
    assert.equal(formatted.data.split('\r\n')[1]?.split(',')[1], '-5.00');
    const off = (await exportPivot(result, { format: 'csv', csv: { escapeFormulas: false }, ...evil })) as { data: string };
    assert.ok(first(off.data).slice(1).every((h) => h.startsWith('=evil')));
    let streamed = '';
    for await (const chunk of streamPivotCsv(result, evil)) streamed += chunk;
    assert.equal(streamed, raw.data);
    streamed = '';
    for await (const chunk of streamPivotCsv(result, { ...evil, escapeFormulas: false })) streamed += chunk;
    assert.equal(streamed, off.data);
  });

  it('writes the column path of every value column and raw numbers; formatted values on request', async () => {
    const base = pivotFixture();
    // Formatted texts that differ from the raw numbers.
    const result = { ...base, cellAt: (r: number, c: number) => ({ ...base.cellAt(r, c), formattedValue: base.cellAt(r, c).value === null ? '' : `$${base.cellAt(r, c).value}` }) };
    const file = (await exportPivot(result, { format: 'csv', fileName: 'p' })) as { fileName: string; data: string } | null;
    assert.ok(file);
    assert.equal(file.fileName, 'p.csv');
    const lines = file.data.trim().split('\r\n');
    assert.equal(lines[0], 'Region / Country,2023 / Sales,2023 / Units,2024 / Sales,2024 / Units,Grand Total / Sales,Grand Total / Units');
    assert.equal(lines[1], 'R0 Total,10.25,11.25,12.25,13.25,14.25,15.25');
    assert.equal(lines[2]?.split(',')[1], '');
    assert.equal(lines.length, 9);
    const formatted = (await exportPivot(result, { format: 'csv', csv: { values: 'formatted' }, rowHeaders: false })) as { data: string } | null;
    const flines = formatted?.data.split('\r\n') ?? [];
    assert.equal(flines[0], '2023 / Sales,2023 / Units,2024 / Sales,2024 / Units,Grand Total / Sales,Grand Total / Units');
    assert.equal(flines[1], '$10.25,$11.25,$12.25,$13.25,$14.25,$15.25');
    // Header hooks and hidden columns carry into the path.
    const hooked = (await exportPivot(result, { format: 'csv', includeColumn: (h) => h.measure === 'Units', headerCell: (ctx) => (ctx.header?.kind === 'grandTotal' && ctx.level === 0 ? { text: 'All' } : null) })) as { data: string } | null;
    assert.equal(hooked?.data.split('\r\n')[0], 'Region / Country,2023 / Units,2024 / Units,All / Units');
  });

  it('streams a result and pages a window source without holding it whole', async () => {
    const result = pivotFixture({ regions: 40 });
    const whole = (await exportPivot(result, { format: 'csv' }))?.data;
    let streamed = '';
    for await (const chunk of streamPivotCsv(result, { chunkRows: 10 })) streamed += chunk;
    assert.equal(streamed, whole);
    const source = windowSource(result);
    let paged = '';
    let chunks = 0;
    for await (const chunk of streamPivotCsv(source, { windowCells: 6 * 15 })) {
      paged += chunk;
      chunks++;
    }
    assert.equal(paged, whole);
    assert.ok(chunks > 3);
    assert.ok(source.calls.every(([s, e]) => e - s <= 15), 'row windows of windowCells / columnCount rows');
    assert.equal(source.calls.at(-1)?.[1], result.rowCount);
  });
});

describe('window sources', () => {
  it('XLSX over a window source pages all columns by row windows and equals the local export', async () => {
    const result = pivotFixture({ regions: 9 });
    const source = windowSource(result);
    const loaded = await loadPivotResult(source, { windowCells: 6 * 5 });
    assert.ok(source.calls.length >= 4);
    for (let r = 0; r < result.rowCount; r++) {
      assert.equal(loaded.memberAt('rows', r).label, result.memberAt('rows', r).label);
      for (let c = 0; c < result.columnCount; c++) assert.deepEqual(loaded.cellAt(r, c), result.cellAt(r, c));
    }
    for (const layout of ['compact', 'tabular'] as const) {
      const local = sheetCells(unzip((await exportPivot(result, { rowLayout: layout }))?.data as Uint8Array));
      const remote = sheetCells(unzip((await exportPivot(windowSource(result), { rowLayout: layout, windowCells: 30 }))?.data as Uint8Array));
      assert.deepEqual(remote, local, layout);
    }
  });
});

describe('exportPivot PDF', () => {
  it('repeats the column headers on every page and breaks rows across pages', async () => {
    const result = pivotFixture({ regions: 60 });
    const file = (await exportPivot(result, { format: 'pdf', fileName: 'p', pdf: { compress: false, footer: 'Page {page} of {pages}' } })) as { fileName: string; data: Uint8Array } | null;
    assert.ok(file);
    assert.equal(file.fileName, 'p.pdf');
    const streams = pdfStreams(file.data);
    assert.ok(streams.length > 2);
    for (const s of streams) {
      const text = pdfText(s);
      assert.ok(text.includes('2023') && text.includes('Sales'), 'header on every page');
    }
    const labels = streams.flatMap(pdfText).filter((t) => /^R\d+(C\d+| Total)?$/.test(t));
    let expected = 0;
    for (let r = 0; r < result.rowCount; r++) if (result.memberAt('rows', r).kind !== 'grandTotal') expected++;
    assert.equal(labels.length, expected);
    assert.ok(streams.flatMap(pdfText).includes('10.25'));
  });

  it('appends the chart image on its own page after the table (table and chart in one PDF)', async () => {
    // A JPEG header (SOF0 3x2, 3 components): the writer passes JPEG through without decoding it.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
    ]);
    const result = pivotFixture();
    const pdf = { compress: false, footer: 'Page {page} of {pages}' };
    const plain = (await exportPivot(result, { format: 'pdf', pdf })) as { data: Uint8Array };
    const file = (await exportPivot(result, { format: 'pdf', pdf, chart: { data: jpeg, width: 1200, height: 600 } })) as { data: Uint8Array };
    const before = pdfStreams(plain.data);
    const streams = pdfStreams(file.data);
    assert.equal(streams.length, before.length + 1);
    const last = streams[streams.length - 1] as string;
    // Scaled to the page body width (A4 portrait, 36 pt margins: 523.28 pt), aspect kept.
    assert.match(last, /q 523\.28 0 0 261\.64 36 [\d.]+ cm \/Im0 Do Q/);
    assert.ok(pdfText(last).includes(`Page ${streams.length} of ${streams.length}`));
    assert.ok(pdfText(streams[0] as string).includes(`Page 1 of ${streams.length}`));
    const latin = Buffer.from(file.data).toString('latin1');
    assert.match(latin, /\/Subtype \/Image \/Width 3 \/Height 2/);
    assert.match(latin, /\/XObject << \/Im0 \d+ 0 R >>/);
  });

  it('the cell hook and the export model are shared with print', () => {
    const model = createPivotExportModel(pivotFixture(), { cell: ({ cell }) => (cell.type === 'number' ? { text: `#${cell.text}` } : undefined) });
    const row = model.getRow(0);
    assert.equal(row.kind, 'data');
    assert.equal(model.cell(row as never, model.columns[1] as never).text, '#10.25');
    assert.equal(model.headerRows.length, 2);
    assert.equal(model.frozen.left, 1);
  });
});
