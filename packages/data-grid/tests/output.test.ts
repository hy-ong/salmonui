import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, createGroupingModule } from '@salmonui/data-grid/engine';
import { createExportModel, createExportModule } from '@salmonui/data-grid/engine/export';
import { downloadBlob, type DataGridColumn } from '@salmonui/data-grid';
import { escapeHtml, renderPrintTable } from '../dist/data-grid/print-document.js';
import { render, type Person } from './fixtures.ts';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

// Export and print in the React layer: item enablement in the server HTML,
// the print projection markup, the print generation budget, and the
// SSR-safe download helper.

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80 },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 90 },
];

function button(html: string, id: string): string {
  const match = html.match(new RegExp(`<button[^>]*data-toolbar-item="${id}"[^>]*>`));
  assert.ok(match, `toolbar item ${id}`);
  return match[0];
}

const writer = async () => ({ exportXlsx: async () => null, exportPdf: async () => null });

describe('export and print items', () => {
  it('CSV and print are always available; Excel and PDF need their writer loader', () => {
    const html = render({ rows: 5, columns, toolbar: ['exportExcel', 'exportPdf', 'exportCsv', 'print'] });
    assert.match(button(html, 'exportExcel'), /aria-disabled="true"/);
    assert.match(button(html, 'exportExcel'), /title="Excel export is not available"/);
    assert.match(button(html, 'exportPdf'), /aria-disabled="true"/);
    assert.doesNotMatch(button(html, 'exportCsv'), /aria-disabled/);
    assert.doesNotMatch(button(html, 'print'), /aria-disabled/);
  });

  it('exportWriters enables the Excel and PDF items', () => {
    const html = render({ rows: 5, columns, toolbar: ['exportExcel', 'exportPdf'], exportWriters: { excel: writer, pdf: writer } });
    assert.doesNotMatch(button(html, 'exportExcel'), /aria-disabled/);
    assert.doesNotMatch(button(html, 'exportPdf'), /aria-disabled/);
  });

  it('renders no busy status on the server', () => {
    assert.doesNotMatch(render({ rows: 5, columns }), /salmon-data-grid-output-status/);
  });
});

interface Order {
  readonly id: number;
  readonly region: string;
  readonly item: string;
  readonly qty: number;
}

function orders(n: number): Order[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, region: i % 2 ? 'East' : 'West', item: `Item <${i}> & "x"`, qty: i * 2 }));
}

describe('print projection', () => {
  it('renders stacked headers, escaped text, alignment, and every row', () => {
    const engine = createDataGridEngine({
      getRowId: (r: Order) => String(r.id),
      columns: [
        { field: 'id', header: 'ID', type: 'number' },
        { id: 'details', header: 'Details', columns: [{ field: 'item', header: 'Item' }, { field: 'qty', header: 'Qty', type: 'number' }] },
      ],
      dataSource: orders(3),
      modules: [createExportModule<Order>()],
    });
    const html = renderPrintTable(createExportModel(engine), { label: 'Orders' });
    assert.match(html, /^<table class="salmon-data-grid-print__table" aria-label="Orders">/);
    assert.match(html, /<th scope="col" rowspan="2">ID<\/th><th scope="colgroup" colspan="2" class="salmon-data-grid-print__center">Details<\/th>/);
    assert.match(html, /<td>Item &lt;1&gt; &amp; &quot;x&quot;<\/td>/);
    assert.equal(html.match(/<tbody>[\s\S]*<\/tbody>/)?.[0].match(/<tr>/g)?.length, 3);
    assert.equal(escapeHtml('plain'), 'plain');
  });

  it('renders group captions, a column subset, and detail blocks', () => {
    const engine = createDataGridEngine({
      getRowId: (r: Order) => String(r.id),
      columns: [{ field: 'region' }, { field: 'item' }, { field: 'qty', type: 'number' }],
      dataSource: orders(4),
      modules: [createGroupingModule<Order>(), createExportModule<Order>()],
      defaultQuery: { grouping: [{ columnId: 'region' }] },
    });
    const model = createExportModel(engine, { columns: ['item', 'qty'], detail: ({ rowId }) => (rowId === '0' ? { text: ['note <b>'] } : null) });
    const html = renderPrintTable(model);
    assert.match(html, /<tr class="salmon-data-grid-print__caption" data-depth="0"><td colspan="2">region: West - 2 items<\/td><\/tr>/);
    assert.match(html, /<tr class="salmon-data-grid-print__detail" data-depth="2"><td colspan="2"><div>note &lt;b&gt;<\/div><\/td><\/tr>/);
    assert.doesNotMatch(html, /<th[^>]*>region</);
  });

  it('builds the 10k x 20 print document within the generation budget @perf', () => {
    const cols = Array.from({ length: 20 }, (_, c) => ({ id: `c${c}`, header: `Column ${c}`, accessor: (r: Order) => (c % 2 ? r.qty + c : `${r.item}-${c}`) }));
    const engine = createDataGridEngine({ getRowId: (r: Order) => String(r.id), columns: cols, dataSource: orders(10_000), modules: [createExportModule<Order>()] });
    renderPrintTable(createExportModel(engine)); // warm-up
    const start = performance.now();
    const html = renderPrintTable(createExportModel(engine));
    const ms = performance.now() - start;
    assert.equal(html.match(/<tr>/g)?.length, 10_001);
    // Budget: print document generation for 10k x 20 <= 1 s to the window.print() call;
    // markup generation gets at most a quarter of it (the browser parses the rest).
    assertBudget(ms, 250, 'print markup 10k x 20');
  });
});

describe('downloadBlob', () => {
  it('is a no-op that returns false without a document (SSR)', () => {
    assert.equal(downloadBlob({ fileName: 'a.csv', mimeType: 'text/csv', data: 'a' }), false);
  });
});
