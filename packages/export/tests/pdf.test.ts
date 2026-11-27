// PDF writer and exportPdf: structure (xref offsets, page count), decoded content streams,
// pagination with repeated headers, overflow page sets, and events.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExportModel } from '@salmonui/core/export-model';
import { hierarchyExportDetail } from '@salmonui/data-grid/engine/export';
import { exportPdf, PDF_MIME_TYPE, writePdf, type PdfExportOptions } from '@salmonui/export/pdf';
import type { ExportFile } from '@salmonui/core/export-model';
import { winAnsi } from '../dist/pdf-writer.js';
import { makeEngine, makeHierarchy, pdfStreams, pdfText, sales, stackedColumns, type Sale } from './helpers.ts';

const exportToPdf = async (engine: ReturnType<typeof makeEngine>, options?: PdfExportOptions<Sale>): Promise<Uint8Array> => ((await exportPdf(engine, options)) as ExportFile).data;

const latin = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

function checkXref(bytes: Uint8Array): number {
  const text = latin(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
  assert.ok(text.slice(startxref).startsWith('xref'));
  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
  return Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)?.[1]);
}

describe('writePdf', () => {
  it('writes a valid document with header and data text', async () => {
    const engine = makeEngine();
    const bytes = await exportToPdf(engine, { title: 'Sales' });
    assert.equal(checkXref(bytes), 1);
    const text = pdfStreams(bytes).flatMap(pdfText);
    for (const t of ['ID', 'Region', 'When', 's0', '10.50', '2025-01-01', '1 / 1']) assert.ok(text.includes(t), t);
    assert.match(latin(bytes), /\/Title \(Sales\)/);
  });

  it('paginates with repeated header rows and page numbers', async () => {
    const engine = makeEngine({ rows: sales(200) });
    const bytes = await exportToPdf(engine, { compress: false, footer: 'Page {page} of {pages}' });
    const pages = checkXref(bytes);
    assert.ok(pages > 2);
    const streams = pdfStreams(bytes);
    assert.equal(streams.length, pages);
    for (const s of streams) assert.ok(pdfText(s).includes('Region'), 'header on every page');
    assert.ok(pdfText(streams.at(-1) as string).includes(`Page ${pages} of ${pages}`));
    const rows = streams.flatMap(pdfText).filter((t) => /^s\d+$/.test(t));
    assert.equal(rows.length, 200);
  });

  it('landscape and horizontal overflow page sets', async () => {
    const engine = makeEngine({ columns: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, field: 'region', header: `Col ${i}`, width: 200 })) });
    const fit = await exportToPdf(engine, { orientation: 'landscape' });
    assert.match(latin(fit), /\/MediaBox \[0 0 841\.89 595\.28\]/);
    assert.equal(checkXref(fit), 1);
    const split = await exportToPdf(engine, { columnOverflow: 'paginate' });
    assert.ok(checkXref(split) > 1, 'columns spill onto extra page sets');
  });

  it('writes group captions, aggregates, details, and cell styles', async () => {
    const engine = makeEngine({ defaultQuery: { grouping: [{ columnId: 'region' }], aggregates: [{ columnId: 'qty', type: 'sum', placement: ['footer'] }] } });
    const model = createExportModel(engine, {
      columns: ['id', 'qty'],
      detail: ({ rowId }) => (rowId === 's3' ? { text: ['Detail of s3'] } : null),
      cell: ({ rowId, column }) => (rowId === 's0' && column.columnId === 'qty' ? { style: { backgroundColor: '#ff0000', bold: true } } : null),
    });
    const bytes = await writePdf(model, { compress: false });
    const stream = pdfStreams(bytes).join('\n');
    const text = pdfText(stream);
    for (const t of ['Region: East - 1 item', 'Detail of s3', '21']) assert.ok(text.includes(t), t);
    assert.match(stream, /1 0 0 rg [\d.]+ [\d.]+ [\d.]+ [\d.]+ re f/);
    assert.match(stream, /\/F2 8 Tf/);
  });

  it('stacked headers: a group row above the leaf row, groups split at freeze edges', async () => {
    const engine = makeEngine({ columns: stackedColumns });
    // Positioned text runs `x y Td (text) Tj` of the first page.
    const runs = async (): Promise<{ x: number; y: number; t: string }[]> => {
      const stream = pdfStreams(await exportToPdf(engine, { compress: false }))[0] as string;
      return [...stream.matchAll(/(-?[\d.]+) (-?[\d.]+) Td (\((?:\\.|[^\\)])*\)) Tj/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), t: pdfText(`${m[3]} Tj`)[0] as string }));
    };
    const whole = await runs();
    assert.deepEqual(whole.slice(0, 8).map((r) => r.t), ['ID', 'Order', 'Region', 'Info', 'Qty', 'Price', 'OK', 'When'], 'group level first, then the leaves');
    const y = (t: string, list = whole) => (list.find((r) => r.t === t) as { y: number }).y;
    assert.ok(y('Order') > y('Qty'), 'the group row sits above the leaf row');
    assert.equal(y('Order'), y('Info'));
    assert.equal(y('Qty'), y('When'));
    assert.ok(y('ID') < y('Order') && y('ID') > y('Qty'), 'a shallow leaf is centered over both header rows');
    assert.ok(whole.find((r) => r.t === 's0'), 'data rows follow');

    engine.dispatch({ type: 'columns.setFrozenCount', left: 2, right: 1 });
    const split = await runs();
    assert.deepEqual(split.slice(0, 10).map((r) => r.t), ['ID', 'Order', 'Order', 'Region', 'Info', 'Info', 'Qty', 'Price', 'OK', 'When']);
  });

  it('encodes WinAnsi and replaces unsupported characters', () => {
    assert.deepEqual(winAnsi('é€“x”中'), [0xe9, 0x80, 0x93, 120, 0x94, 63]);
  });
});

describe('exportPdf', () => {
  it('maps options and runs hooks and events', async () => {
    const engine = makeEngine({ pageSize: 2 });
    let completed = false;
    const file = await exportPdf(
      engine,
      {
        pages: 'current',
        fileName: 'report.pdf',
        orientation: 'landscape',
        pageSize: 'letter',
        header: 'Sales report',
        footer: 'Page {page} of {pages}',
        styles: { header: { bold: true, color: '#00ff00' } },
      },
      {
        cell: ({ column, text }) => (column.field === 'id' ? { text: `#${text}` } : null),
        headerCell: ({ text }) => (text === 'Qty' ? { text: 'Quantity' } : null),
        onExport: () => {
          completed = true;
        },
      },
    );
    assert.ok(file && completed);
    assert.equal(file.fileName, 'report.pdf');
    assert.equal(file.mimeType, PDF_MIME_TYPE);
    assert.match(latin(file.data), /\/MediaBox \[0 0 792 612\]/);
    const text = pdfStreams(file.data).flatMap(pdfText);
    for (const t of ['Sales report', 'Page 1 of 1', '#s0', '#s1', 'Quantity']) assert.ok(text.includes(t), t);
    assert.ok(!text.includes('#s2'), 'current page only');
    assert.equal(await exportPdf(engine, {}, { onBeforeExport: (e) => e.preventDefault() }), null);
  });
});

describe('writePdf spans and hierarchy', () => {
  const count = (texts: readonly string[], t: string): number => texts.filter((x) => x === t).length;
  // 300 x 150 pt pages: three body lines under the header row.
  const short = { compress: false, pageSize: [300, 150] as const, orientation: 'landscape' as const };

  it('cell hook colSpan and rowSpan merge cells: covered cells are not drawn, row spans are opaque boxes', async () => {
    const engine = makeEngine();
    const model = createExportModel(engine, {
      columns: ['id', 'region', 'qty', 'price'],
      cell: ({ column, rowId }) => (rowId === 's0' && column.columnId === 'region' ? { colSpan: 3 } : rowId === 's1' && column.columnId === 'id' ? { rowSpan: 2 } : null),
    });
    const stream = pdfStreams(await writePdf(model, { compress: false })).join('\n');
    const text = pdfText(stream);
    assert.ok(text.includes('North'));
    assert.ok(!text.includes('10.50'), 'price of s0 is covered by the region span');
    assert.ok(text.includes('20.50'));
    assert.equal(count(text, 's1'), 1);
    assert.ok(!text.includes('s2'), 'id of s2 is covered by the row span of s1');
    // Two 15.2 pt rows, inset by 0.3 pt at both edges so the outer grid lines stay visible.
    assert.match(stream, /1 1 1 rg [\d.]+ [\d.]+ [\d.]+ 29\.8 re f/);
    // Without spans the same model draws every cell.
    const plain = pdfText(pdfStreams(await writePdf(createExportModel(engine, { columns: ['id', 'region', 'qty', 'price'], cell: () => null }), { compress: false })).join('\n'));
    assert.ok(plain.includes('10.50') && plain.includes('s2'));
  });

  it('a row span cut by a page break continues on the next page with the anchor drawn again', async () => {
    const engine = makeEngine();
    const model = createExportModel(engine, { columns: ['id', 'region'], cell: ({ column, rowId }) => (rowId === 's1' && column.columnId === 'id' ? { rowSpan: 4 } : null) });
    const pages = pdfStreams(await writePdf(model, short)).map(pdfText);
    assert.equal(pages.length, 2);
    assert.deepEqual(['s0', 's1', 's2'].map((t) => count(pages[0] as string[], t)), [1, 1, 0]);
    assert.deepEqual(['s1', 's3', 's4', 's5'].map((t) => count(pages[1] as string[], t)), [1, 0, 0, 1]);
  });

  it('mergeRepeatedValues merges equal consecutive values per page, with or without a cell hook', async () => {
    const engine = makeEngine({ defaultQuery: { sorting: [{ columnId: 'region', direction: 'asc' }] } });
    // East, North x3, South x2.
    const regions = async (options: object, cell?: () => null) => {
      const model = createExportModel(engine, { columns: ['region', 'qty'], ...(cell ? { cell } : {}) });
      return pdfStreams(await writePdf(model, { compress: false, ...options })).map(pdfText);
    };
    const [one] = await regions({ mergeRepeatedValues: true });
    assert.deepEqual(['East', 'North', 'South'].map((t) => count(one as string[], t)), [1, 1, 1]);
    assert.ok(['1', '2', '3', '4', '5', '6'].every((q) => (one as string[]).includes(q)), 'other columns are unchanged');
    const [hooked] = await regions({ mergeRepeatedValues: true }, () => null);
    assert.deepEqual(['East', 'North', 'South'].map((t) => count(hooked as string[], t)), [1, 1, 1]);
    const [off] = await regions({});
    assert.equal(count(off as string[], 'North'), 3);
    // East, North, North | North, South, South: the run restarts on page 2.
    const paged = await regions({ ...short, mergeRepeatedValues: true });
    assert.deepEqual(paged.map((p) => count(p, 'North')), [1, 1]);
    assert.deepEqual(paged.map((p) => count(p, 'South')), [0, 1]);
  });

  it('nested child models: every level drawn as an indented block, by hierarchy mode', async () => {
    const engine = makeHierarchy();
    const draw = async (mode: 'expanded' | 'all' | 'none') => {
      const detail = hierarchyExportDetail(engine, mode);
      return pdfStreams(await writePdf(createExportModel(engine, { hierarchy: mode, ...(detail ? { detail } : {}) }), { compress: false })).join('\n');
    };
    const expanded = pdfText(await draw('expanded'));
    assert.equal(count(expanded, 'OrderID'), 1, 'the expanded employee only');
    assert.deepEqual(expanded.filter((t) => /^10\d$/.test(t)), ['101', '104']);
    assert.ok(!expanded.includes('company'), 'nested levels keep their own (collapsed) expansion');
    const allStream = await draw('all');
    const all = pdfText(allStream);
    assert.equal(count(all, 'OrderID'), 3);
    assert.equal(count(all, 'company'), 6, 'a customer block under every order');
    assert.equal(count(all, 'Zero') + count(all, 'One'), 6);
    // Leftmost x of a text: the first column of each level.
    const x = (t: string): number => Math.min(...[...allStream.matchAll(new RegExp(`([\\d.]+) [\\d.]+ Td \\(${t}\\) Tj`, 'g'))].map((m) => Number(m[1])));
    assert.ok(x('CustomerID') > x('OrderID') && x('OrderID') > x('EmployeeID'), 'each level is indented further');
    const none = pdfText(await draw('none'));
    assert.ok(!none.includes('OrderID'));
  });
});
