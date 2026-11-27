// XLSX writer and exportXlsx, checked by unzipping with node:zlib and reading the
// SpreadsheetML.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExportModel, type ExportFile } from '@salmonui/core/export-model';
import { hierarchyExportDetail } from '@salmonui/data-grid/engine/export';
import { exportXlsx, writeXlsx, XLSX_MIME_TYPE, type XlsxExportOptions } from '@salmonui/export/xlsx';
import { columnLetter, excelDatePattern, excelNumberFormat } from '../dist/xlsx-writer.js';
import { crc32 } from '../dist/bytes.js';
import { createFilterModule, createDataGridEngine, createSortModule, type DataGridModule, type LookupSource } from '@salmonui/data-grid/engine';
import { createExportModule } from '@salmonui/data-grid/engine/export';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';
import { makeEngine, makeHierarchy, sheetCells, stackedColumns, unzip, type Sale } from './helpers.ts';

type Source = Parameters<typeof exportXlsx<Sale>>[0];

interface Order {
  readonly id: string;
  readonly customerId: number;
  readonly qty: number;
}
const customers = [
  { CustomerID: 1, ContactName: 'Maria' },
  { CustomerID: 2, ContactName: 'Ana' },
  { CustomerID: 3, ContactName: 'Thomas' },
];
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function lookupEngine(data: readonly unknown[] | LookupSource = customers) {
  return createDataGridEngine<Order, readonly DataGridModule<Order, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns: [
      { field: 'id', header: 'ID' },
      { field: 'customerId', header: 'Customer', lookup: { data, keyField: 'CustomerID', displayField: 'ContactName' } },
      { field: 'qty', header: 'Qty', type: 'number' },
    ],
    dataSource: [
      { id: 'o1', customerId: 3, qty: 1 },
      { id: 'o2', customerId: 1, qty: 2 },
      { id: 'o3', customerId: 2, qty: 3 },
      { id: 'o4', customerId: 99, qty: 4 },
    ],
    dev: false,
    modules: [createLookupModule<Order>(), createSortModule<Order>(), createFilterModule<Order>(), createExportModule<Order>()],
  });
}

async function xlsx(source: Source, options?: XlsxExportOptions<Sale>): Promise<Map<string, string>> {
  const file = (await exportXlsx(source, options)) as ExportFile;
  return unzip(file.data);
}

describe('xlsx building blocks', () => {
  it('crc32 matches the reference value', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
    assert.equal(crc32(new TextEncoder().encode('6789'), crc32(new TextEncoder().encode('12345'))), 0xcbf43926);
  });

  it('column letters and number formats', () => {
    assert.deepEqual([0, 25, 26, 701, 702].map(columnLetter), ['A', 'Z', 'AA', 'ZZ', 'AAA']);
    assert.equal(excelDatePattern('dd/MM/yyyy HH:mm'), 'dd/mm/yyyy hh:mm');
    assert.equal(excelDatePattern('h:mm a'), 'h:mm AM/PM');
    assert.equal(excelNumberFormat({ kind: 'number', style: 'decimal', pattern: null, options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } }, 'number'), '#,##0.00');
    assert.equal(excelNumberFormat({ kind: 'number', style: 'percent', pattern: null, options: { minimumFractionDigits: 1, maximumFractionDigits: 1 } }, 'number'), '0.0%');
    assert.equal(excelNumberFormat({ kind: 'number', style: 'currency', pattern: null, options: {} }, 'number'), '"$"#,##0.00');
    assert.equal(excelNumberFormat(null, 'date'), 14);
    assert.equal(excelNumberFormat(null, 'string'), null);
  });
});

describe('writeXlsx', () => {
  it('writes a valid package with typed cells, number formats, and widths', async () => {
    const files = await xlsx(makeEngine());
    for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml', 'xl/styles.xml', 'xl/sharedStrings.xml']) {
      assert.ok(files.has(part), part);
    }
    const cells = sheetCells(files);
    assert.equal(cells['A1'], 'ID');
    assert.equal(cells['F1'], 'When');
    assert.equal(cells['A2'], 's0');
    assert.equal(cells['C2'], 1);
    assert.equal(cells['D2'], 10.5);
    assert.equal(cells['E2'], true);
    assert.equal(cells['F2'], 45658, '2025-01-01 as an Excel serial');
    const styles = files.get('xl/styles.xml') as string;
    assert.match(styles, /formatCode="#,##0\.00"/);
    assert.match(styles, /formatCode="yyyy-mm-dd"/);
    assert.match(files.get('xl/worksheets/sheet1.xml') as string, /<col min="4" max="4" width="16.43" customWidth="1"\/>/);
  });

  it('text mode writes display strings; compress: false stores entries', async () => {
    const cells = sheetCells(await xlsx(makeEngine(), { values: 'text', compress: false }));
    assert.equal(cells['D2'], '10.50');
    assert.equal(cells['F2'], '2025-01-01');
  });

  it('groups: captions with outline levels, group footers, grid footer', async () => {
    const engine = makeEngine({ defaultQuery: { grouping: [{ columnId: 'region' }], aggregates: [{ columnId: 'qty', type: 'sum', placement: ['groupFooter', 'footer'] }] } });
    const files = await xlsx(engine, { columns: [{ id: 'id' }, { id: 'qty' }] });
    const sheet = files.get('xl/worksheets/sheet1.xml') as string;
    const cells = sheetCells(files);
    assert.equal(cells['A2'], 'Region: East - 1 item');
    assert.equal(cells['A3'], 's3');
    assert.equal(cells['B4'], 4, 'group footer sum');
    assert.match(sheet, /<row r="3" outlineLevel="1">/);
    assert.match(sheet, /<sheetFormatPr defaultRowHeight="15" outlineLevelRow="2"\/>/);
    const last = Object.keys(cells).filter((k) => k.startsWith('B')).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).at(-1) as string;
    assert.equal(cells[last], 21, 'grid footer sum');
  });

  it('stacked headers merge; pinned columns and header freeze write a pane', async () => {
    const engine = makeEngine({
      columns: [
        { field: 'id', header: 'ID', pinned: 'start' },
        { id: 'order', header: 'Order', columns: [{ field: 'qty', header: 'Qty' }, { field: 'price', header: 'Price' }] },
      ],
    });
    const files = await xlsx(engine, { freezeHeader: true });
    const sheet = files.get('xl/worksheets/sheet1.xml') as string;
    assert.match(sheet, /<mergeCell ref="A1:A2"\/>/);
    assert.match(sheet, /<mergeCell ref="B1:C1"\/>/);
    assert.match(sheet, /<pane xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight" state="frozen"\/>/);
    const cells = sheetCells(files);
    assert.equal(cells['B1'], 'Order');
    assert.equal(cells['C2'], 'Price');
  });

  it('stacked headers with left and right frozen columns: groups split at the freeze edges, no merge crosses the pane', async () => {
    const engine = makeEngine({ columns: stackedColumns });
    engine.dispatch({ type: 'columns.setFrozenCount', left: 2, right: 1 });
    const files = await xlsx(engine, { freezeHeader: true });
    const sheet = files.get('xl/worksheets/sheet1.xml') as string;
    const merges = [...sheet.matchAll(/<mergeCell ref="([A-Z0-9:]+)"\/>/g)].map((m) => m[1]);
    assert.deepEqual(merges, ['A1:A2', 'D1:D2'], 'ID and Region span both rows; Order and Info are split');
    assert.match(sheet, /<pane xSplit="2" ySplit="2" topLeftCell="C3" activePane="bottomRight" state="frozen"\/>/);
    const cells = sheetCells(files);
    assert.deepEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1'].map((r) => cells[r]), ['ID', 'Order', 'Order', 'Region', 'Info', 'Info']);
    assert.deepEqual(['B2', 'C2', 'E2', 'F2'].map((r) => cells[r]), ['Qty', 'Price', 'OK', 'When']);
    assert.deepEqual(['A3', 'B3', 'C3', 'D3'].map((r) => cells[r]), ['s0', 1, 10.5, 'North'], 'data follows the runtime column order');
    // A whole group in the frozen zone stays merged.
    engine.dispatch({ type: 'columns.setFrozenCount', left: 3, right: 0 });
    const whole = (await xlsx(engine, { freezeHeader: true })).get('xl/worksheets/sheet1.xml') as string;
    assert.deepEqual([...whole.matchAll(/<mergeCell ref="([A-Z0-9:]+)"\/>/g)].map((m) => m[1]), ['A1:A2', 'B1:C1', 'D1:D2', 'E1:F1']);
    assert.match(whole, /<pane xSplit="3" ySplit="2"/);
  });

  it('lookup (foreign key) columns write the display text, not the key', async () => {
    const engine = lookupEngine();
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'customerId', direction: 'asc' }] });
    const cells = sheetCells(await xlsx(engine as unknown as Source));
    assert.equal(cells['B1'], 'Customer');
    assert.deepEqual(['A2', 'A3', 'A4', 'A5'].map((r) => cells[r]), ['o4', 'o3', 'o2', 'o1'], 'sorted by display text');
    assert.deepEqual(['B3', 'B4', 'B5'].map((r) => cells[r]), ['Ana', 'Maria', 'Thomas']);
    assert.equal(cells['B2'], undefined, 'an unknown key writes an empty cell');
    const text = sheetCells(await xlsx(engine as unknown as Source, { values: 'text' }));
    assert.deepEqual(['B3', 'B4', 'B5'].map((r) => text[r]), ['Ana', 'Maria', 'Thomas']);
  });

  it('a pending remote lookup writes empty cells without throwing, then the display text', async () => {
    const calls: (readonly unknown[])[] = [];
    const releases: (() => void)[] = [];
    const engine = lookupEngine({
      load: (request) =>
        new Promise((resolve) => {
          calls.push(request.keys);
          releases.push(() => resolve(customers.filter((c) => request.keys.some((k) => String(k) === String(c.CustomerID)))));
        }),
    });
    const pending = sheetCells(await xlsx(engine as unknown as Source));
    assert.deepEqual(['A2', 'B2', 'C2'].map((r) => pending[r]), ['o1', undefined, 1], 'blank, never the key');
    await tick();
    assert.deepEqual(calls, [[3, 1, 2, 99]], 'one batched load although the writer yields between rows');
    for (const release of releases) release();
    await tick();
    const loaded = sheetCells(await xlsx(engine as unknown as Source));
    assert.deepEqual(['B2', 'B3', 'B4', 'B5'].map((r) => loaded[r]), ['Thomas', 'Maria', 'Ana', undefined]);
    engine.dispose();
  });

  it('cell overrides: formula, style; mergeRepeatedValues', async () => {
    const engine = makeEngine({ defaultQuery: { sorting: [{ columnId: 'region', direction: 'asc' }] } });
    const model = createExportModel(engine, {
      columns: ['region', 'qty', 'price'],
      cell: ({ column, rowId }) => (column.columnId === 'price' && rowId === 's0' ? { formula: 'B2*2', style: { bold: true, backgroundColor: '#ff0000' } } : null),
    });
    const files = unzip(await writeXlsx(model, { mergeRepeatedValues: true }));
    const sheet = files.get('xl/worksheets/sheet1.xml') as string;
    assert.match(sheet, /<f>B2\*2<\/f>/);
    assert.match(files.get('xl/styles.xml') as string, /<fgColor rgb="FFFF0000"\/>/);
    assert.match(sheet, /<mergeCell ref="A3:A5"\/>/, 'North x3 merged');
    assert.match(sheet, /<mergeCell ref="A6:A7"\/>/, 'South x2 merged');
  });

  it('a cell hook `text` without `value` writes a string cell on typed columns', async () => {
    const engine = makeEngine();
    const model = createExportModel(engine, {
      columns: ['qty', 'ok', 'when', 'price'],
      cell: ({ column, rowId }) => {
        if (rowId !== 's0') return null;
        if (column.columnId === 'qty') return { text: 'many' };
        if (column.columnId === 'ok') return { text: 'Yes' };
        if (column.columnId === 'when') return { text: 'Soon' };
        return { text: 'ignored', value: 7 };
      },
    });
    const cells = sheetCells(unzip(await writeXlsx(model)));
    assert.equal(cells['A2'], 'many');
    assert.equal(cells['B2'], 'Yes');
    assert.equal(cells['C2'], 'Soon');
    assert.equal(cells['D2'], 7, 'an explicit value still wins');
    assert.equal(typeof cells['A3'], 'number', 'other rows stay typed');
  });

  it('several grids: one sheet each, or stacked with a gap', async () => {
    const a = makeEngine();
    const b = makeEngine();
    const sheets = await xlsx([a, b], { sheetNames: ['First', 'First'] });
    assert.match(sheets.get('xl/workbook.xml') as string, /name="First".*name="First \(2\)"/);
    assert.ok(sheets.has('xl/worksheets/sheet2.xml'));
    const cells = sheetCells(await xlsx([a, b], { layout: 'stacked', gap: 2 }));
    assert.equal(cells['A10'], 'ID', '7 rows + 2 empty rows, then the second header');
  });
});

describe('exportXlsx', () => {
  it('maps pages, columns, fileName, styles, header and footer content', async () => {
    const engine = makeEngine({ pageSize: 2 });
    const file = await exportXlsx(engine, {
      pages: 'current',
      fileName: 'sales',
      columns: [{ field: 'qty', header: 'Quantity' }, { field: 'id' }],
      styles: { header: { bold: true, backgroundColor: '#00FF00', color: '#0000FF' } },
      header: { gap: 1, rows: [{ cells: [{ column: 0, value: 'Report', colSpan: 2, style: { bold: true } }] }] },
      footer: { gap: 1, rows: [{ cells: [{ value: 'End' }] }] },
    });
    assert.ok(file);
    assert.equal(file.fileName, 'sales.xlsx');
    assert.equal(file.mimeType, XLSX_MIME_TYPE);
    const files = unzip(file.data);
    const cells = sheetCells(files);
    assert.equal(cells['A1'], 'Report');
    assert.equal(cells['A3'], 'Quantity');
    assert.equal(cells['B3'], 'ID');
    assert.equal(cells['A5'], 2, 'current page only');
    assert.equal(cells['A6'], undefined);
    assert.equal(cells['A7'], 'End');
    assert.match(files.get('xl/worksheets/sheet1.xml') as string, /<mergeCell ref="A1:B1"\/>/);
    assert.match(files.get('xl/styles.xml') as string, /FF00FF00/);
  });

  it('runs hooks and events; onBeforeExport can prevent the export', async () => {
    const engine = makeEngine({ defaultQuery: { grouping: [{ columnId: 'region' }], aggregates: [{ columnId: 'qty', type: 'sum', placement: ['footer'] }] } });
    const formats: string[] = [];
    let complete: Promise<unknown> | null = null;
    const file = await exportXlsx(
      engine,
      { columns: [{ field: 'id' }, { field: 'qty' }] },
      {
        onBeforeExport: (event) => formats.push(event.format),
        cell: ({ column, value }) => (column.field === 'qty' ? { value: (value as number) * 10, style: { bold: true } } : null),
        headerCell: ({ text }) => ({ text: text.toUpperCase() }),
        aggregateCell: ({ text }) => ({ text: `Total ${text}` }),
        groupCaption: ({ formattedKey, count }) => `[${formattedKey}] ${count}`,
        onExport: (event) => {
          complete = event.file;
        },
      },
    );
    assert.ok(file && complete);
    const cells = sheetCells(unzip(file.data));
    assert.equal(cells['A1'], 'ID');
    assert.equal(cells['A2'], '[East] 1');
    assert.equal(cells['B3'], 40);
    assert.ok(Object.values(cells).includes('Total 21'));
    assert.deepEqual(formats, ['excel']);
    assert.equal(await exportXlsx(engine, {}, { onBeforeExport: (e) => e.preventDefault() }), null);
  });
});

describe('writeXlsx spans and hierarchy', () => {
  it('cell hook colSpan and rowSpan merge cells and skip the covered ones', async () => {
    const engine = makeEngine();
    const model = createExportModel(engine, {
      columns: ['id', 'region', 'qty', 'price'],
      cell: ({ column, rowId }) => (rowId === 's0' && column.columnId === 'region' ? { colSpan: 2 } : rowId === 's1' && column.columnId === 'id' ? { rowSpan: 2 } : null),
    });
    const files = unzip(await writeXlsx(model));
    const sheet = files.get('xl/worksheets/sheet1.xml') as string;
    assert.match(sheet, /<mergeCell ref="B2:C2"\/>/);
    assert.match(sheet, /<mergeCell ref="A3:A4"\/>/);
    const cells = sheetCells(files);
    assert.equal(cells['B2'], 'North');
    assert.equal(cells['C2'], undefined, 'covered by the column span');
    assert.equal(cells['A3'], 's1');
    assert.equal(cells['A4'], undefined, 'covered by the row span');
    assert.equal(cells['B4'], 'North', 'the next column of the covered row is written');
  });

  it('nested child models: rows one column and one outline level deeper per level, outlineLevelRow', async () => {
    const engine = makeHierarchy();
    const write = async (mode: 'expanded' | 'all' | 'none') => {
      const detail = hierarchyExportDetail(engine, mode);
      const files = unzip(await writeXlsx(createExportModel(engine, { hierarchy: mode, ...(detail ? { detail } : {}) })));
      const sheet = files.get('xl/worksheets/sheet1.xml') as string;
      return { sheet, cells: sheetCells(files), levels: [...sheet.matchAll(/<row r="\d+"(?: outlineLevel="(\d)")?>/g)].map((m) => Number(m[1] ?? 0)) };
    };
    const expanded = await write('expanded');
    // Header, E1, E2, then E2's orders (header + 2 rows) at level 1 from column B, then E3.
    assert.deepEqual(expanded.levels, [0, 0, 0, 1, 1, 1, 0]);
    assert.equal(expanded.cells['B4'], 'OrderID');
    assert.deepEqual([expanded.cells['B5'], expanded.cells['B6']], [101, 104]);
    assert.match(expanded.sheet, /outlineLevelRow="1"/);
    const all = await write('all');
    // Every employee: orders (header + 2 rows) at level 1, each order's customer (header + row) at level 2 from column C.
    assert.equal(all.levels.filter((l) => l === 1).length, 9);
    assert.equal(all.levels.filter((l) => l === 2).length, 12);
    assert.equal(all.cells['C5'], 'CustomerID');
    assert.deepEqual([all.cells['C6'], all.cells['D6']], ['C0', 'Zero']);
    assert.match(all.sheet, /outlineLevelRow="2"/);
    const none = await write('none');
    assert.deepEqual(none.levels, [0, 0, 0, 0]);
    assert.doesNotMatch(none.sheet, /outlineLevelRow/);
  });

  it('caps child levels at 7 outline levels', async () => {
    const engine = makeHierarchy(10);
    const detail = hierarchyExportDetail(engine, 'all');
    const sheet = unzip(await writeXlsx(createExportModel(engine, { hierarchy: 'all', ...(detail ? { detail } : {}) }))).get('xl/worksheets/sheet1.xml') as string;
    const levels = [...sheet.matchAll(/outlineLevel="(\d)"/g)].map((m) => Number(m[1]));
    assert.equal(Math.max(...levels), 7);
    assert.match(sheet, /outlineLevelRow="7"/);
  });
});
