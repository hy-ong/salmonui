// Export model and CSV: columns as exported (visibility, order, hidden,
// formatting), header rows from the stacked header tree (split at freeze
// edges), lookup columns exported by display text, scopes over the
// query pipeline (filtered, page, selected, all, custom rows), group captions
// and footers with aggregates, hooks, and the CSV writer (quoting, raw
// values, streaming chunks).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createFilterModule,
  createDataGridEngine,
  createGroupingModule,
  createPagingModule,
  createSelectionModule,
  createSortModule,
  type ColumnDef,
  type DataGridModule,
  type DataGridQueryInit,
  type LookupSource,
} from '@salmonui/data-grid/engine';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';
import {
  createExportModel,
  createExportModule,
  exportCsv,
  streamCsv,
  toExportModelOptions,
  writeCsv,
  type ExportModel,
  type ExportRow,
} from '@salmonui/data-grid/engine/export';

interface Sale {
  readonly id: string;
  readonly region: string;
  readonly qty: number;
  readonly price: number;
  readonly note: string;
  readonly when: Date;
}

function sales(): Sale[] {
  const regions = ['North', 'South', 'North', 'East', 'South', 'North'];
  return regions.map((region, i) => ({
    id: `s${i}`,
    region,
    qty: i + 1,
    price: 10 * (i + 1) + 0.5,
    note: i === 1 ? 'a, "quoted"\nline' : `note ${i}`,
    when: new Date(Date.UTC(2025, 0, i + 1)),
  }));
}

const columns: ColumnDef<Sale>[] = [
  { field: 'id', header: 'ID', primaryKey: true },
  { field: 'region', header: 'Region' },
  { field: 'qty', header: 'Qty', type: 'number', align: 'end' },
  { field: 'price', header: 'Price', type: 'number', format: 'N2', width: 120 },
  { field: 'note', header: 'Note', hidden: true },
  { field: 'when', header: 'When', type: 'date', format: 'yyyy-MM-dd' },
];

type Modules = readonly DataGridModule<Sale, any, any, string>[];

function make(options: { defaultQuery?: DataGridQueryInit; pageSize?: number; columns?: ColumnDef<Sale>[] } = {}) {
  return createDataGridEngine<Sale, Modules>({
    getRowId: (r) => r.id,
    columns: options.columns ?? columns,
    dataSource: sales(),
    dev: false,
    timeZone: 'UTC',
    locale: 'en-US',
    modules: [
      createFilterModule<Sale>(),
      createSortModule<Sale>(),
      createGroupingModule<Sale>(),
      createAggregatesModule<Sale>(),
      createPagingModule<Sale>(),
      createSelectionModule<Sale>(),
      createExportModule<Sale>(),
    ],
    paging: { enabled: options.pageSize !== undefined, pageSize: options.pageSize ?? 12 },
    selection: { type: 'multiple' },
    ...(options.defaultQuery ? { defaultQuery: options.defaultQuery } : {}),
  });
}

const kinds = (m: ExportModel<Sale>) => [...m.rows()].map((r) => r.kind);
const ids = (m: ExportModel<Sale>) => [...m.rows()].filter((r): r is Extract<ExportRow<Sale>, { kind: 'data' }> => r.kind === 'data').map((r) => r.id);

describe('export model: columns and headers', () => {
  it('exports visible leaves in runtime order with formatting', () => {
    const engine = make();
    const model = createExportModel(engine);
    assert.deepEqual(model.columns.map((c) => c.columnId), ['id', 'region', 'qty', 'price', 'when']);
    const price = model.columns[3]!;
    assert.equal(price.width, 120);
    assert.equal(model.columns[2]!.textAlign, 'end');
    const first = model.getRow(0);
    assert.equal(first.kind, 'data');
    if (first.kind !== 'data') return;
    assert.equal(price.text(first.row), '10.50');
    assert.equal(price.value(first.row), 10.5);
    assert.equal(model.columns[4]!.text(first.row), '2025-01-01');
    assert.ok(model.columns[4]!.value(first.row) instanceof Date);
    assert.deepEqual(model.headerRows.length, 1);
    assert.deepEqual(model.headerRows[0]!.map((h) => h.text), ['ID', 'Region', 'Qty', 'Price', 'When']);
  });

  it('honors runtime visibility, order, and includeHiddenColumns', () => {
    const engine = make();
    engine.dispatch({ type: 'columns.hide', keys: ['region'] });
    engine.dispatch({ type: 'columns.move', columnId: 'qty', toIndex: 0 });
    assert.deepEqual(createExportModel(engine).columns.map((c) => c.columnId), ['qty', 'id', 'price', 'when']);
    const all = createExportModel(engine, { includeHiddenColumns: true }).columns;
    assert.deepEqual(all.map((c) => c.columnId), ['qty', 'region', 'id', 'price', 'note', 'when']);
    assert.deepEqual(all.map((c) => c.visible), [true, false, true, true, false, true]);
    assert.deepEqual(createExportModel(engine, { columns: ['note', 'id', 'nope'] }).columns.map((c) => c.columnId), ['note', 'id']);
  });

  it('builds stacked header rows with col and row spans', () => {
    const engine = make({
      columns: [
        { field: 'id', header: 'ID' },
        { id: 'order', header: 'Order', columns: [{ field: 'qty', header: 'Qty' }, { field: 'price', header: 'Price' }] },
        { field: 'region', header: 'Region' },
      ],
    });
    const model = createExportModel(engine);
    assert.equal(model.headerRows.length, 2);
    assert.deepEqual(
      model.headerRows[0]!.map((h) => [h.text, h.colIndex, h.colSpan, h.rowSpan]),
      [['ID', 0, 1, 2], ['Order', 1, 2, 1], ['Region', 3, 1, 2]],
    );
    assert.deepEqual(model.headerRows[1]!.map((h) => [h.text, h.colIndex]), [['Qty', 1], ['Price', 2]]);
    const custom = createExportModel(engine, { headerRows: ({ headerRows }) => headerRows.slice(1) });
    assert.equal(custom.headerRows.length, 1);
  });
});

describe('export model: stacked headers with frozen columns', () => {
  // ID | Order (Qty, Price) | Region | Info (Note, When)
  const stacked: ColumnDef<Sale>[] = [
    { field: 'id', header: 'ID' },
    { id: 'order', header: 'Order', columns: [{ field: 'qty', header: 'Qty', type: 'number' }, { field: 'price', header: 'Price', type: 'number' }] },
    { field: 'region', header: 'Region' },
    { id: 'info', header: 'Info', columns: [{ field: 'note', header: 'Note' }, { field: 'when', header: 'When', type: 'date', format: 'yyyy-MM-dd' }] },
  ];
  const cells = (m: ExportModel<Sale>) => m.headerRows.map((r) => r.map((h) => [h.text, h.colIndex, h.colSpan, h.rowSpan]));

  it('frozen counts split a group at each freeze edge, as the grid header does', () => {
    const engine = make({ columns: stacked });
    engine.dispatch({ type: 'columns.setFrozenCount', left: 2, right: 1 });
    const model = createExportModel(engine);
    const snapshot = engine.getSnapshot().columns;
    assert.deepEqual(model.columns.map((c) => c.columnId), snapshot.visible.map((c) => c.columnId), 'export order is the runtime order');
    assert.deepEqual(model.columns.map((c) => c.freeze), ['left', 'left', null, null, null, 'right']);
    assert.deepEqual(model.frozen, { left: 2, right: 1, top: 0 });
    assert.deepEqual(cells(model), [
      [['ID', 0, 1, 2], ['Order', 1, 1, 1], ['Order', 2, 1, 1], ['Region', 3, 1, 2], ['Info', 4, 1, 1], ['Info', 5, 1, 1]],
      [['Qty', 1, 1, 1], ['Price', 2, 1, 1], ['Note', 4, 1, 1], ['When', 5, 1, 1]],
    ]);
  });

  it('pinning a leaf reorders it into its zone (left zone, center, right zone) and the header follows', () => {
    const engine = make({ columns: stacked });
    engine.dispatch({ type: 'columns.setFrozenCount', left: 2, right: 1 });
    engine.dispatch({ type: 'columns.setFreeze', columnId: 'region', freeze: 'left' });
    engine.dispatch({ type: 'columns.setFreeze', columnId: 'note', freeze: 'right' });
    const model = createExportModel(engine);
    const snapshot = engine.getSnapshot().columns;
    assert.deepEqual(snapshot.left.map((c) => c.columnId), ['id', 'qty', 'region']);
    assert.deepEqual(snapshot.right.map((c) => c.columnId), ['note', 'when']);
    assert.deepEqual(model.columns.map((c) => c.columnId), ['id', 'qty', 'region', 'price', 'note', 'when']);
    assert.deepEqual(model.frozen, { left: 3, right: 2, top: 0 });
    assert.deepEqual(cells(model), [
      [['ID', 0, 1, 2], ['Order', 1, 1, 1], ['Region', 2, 1, 2], ['Order', 3, 1, 1], ['Info', 4, 2, 1]],
      [['Qty', 1, 1, 1], ['Price', 3, 1, 1], ['Note', 4, 1, 1], ['When', 5, 1, 1]],
    ]);
  });

  it('a whole group in one zone stays merged; hidden columns join the zone before them', () => {
    const engine = make({ columns: stacked });
    engine.dispatch({ type: 'columns.setFrozenCount', left: 3 });
    engine.dispatch({ type: 'columns.hide', keys: ['when'] });
    assert.deepEqual(cells(createExportModel(engine))[0], [['ID', 0, 1, 2], ['Order', 1, 2, 1], ['Region', 3, 1, 2], ['Info', 4, 1, 1]]);
    const all = createExportModel(engine, { includeHiddenColumns: true });
    assert.deepEqual(all.columns.map((c) => [c.columnId, c.freeze]), [['id', 'left'], ['qty', 'left'], ['price', 'left'], ['region', null], ['note', null], ['when', null]]);
    assert.deepEqual(cells(all)[0], [['ID', 0, 1, 2], ['Order', 1, 2, 1], ['Region', 3, 1, 2], ['Info', 4, 2, 1]]);
  });

  it('CSV writes only the leaf header line in export order (no group rows)', () => {
    const engine = make({ columns: stacked });
    engine.dispatch({ type: 'columns.setFrozenCount', left: 2, right: 1 });
    engine.dispatch({ type: 'columns.setFreeze', columnId: 'region', freeze: 'left' });
    const lines = writeCsv(createExportModel(engine)).split('\r\n');
    assert.equal(lines[0], 'ID,Qty,Region,Price,Note,When');
    assert.equal(lines[1], 's0,1,North,10.5,note 0,2025-01-01');
    assert.ok(!lines.some((l) => l.includes('Order') || l.includes('Info')));
  });
});

describe('export model: scopes', () => {
  it('filtered covers every page of the current query; page covers the current page', () => {
    const engine = make({ pageSize: 2, defaultQuery: { sorting: [{ columnId: 'qty', direction: 'desc' }] } });
    engine.dispatch({ type: 'filter.byColumn', columnId: 'region', operator: 'notEqual', value: 'East' });
    assert.deepEqual(ids(createExportModel(engine)), ['s5', 's4', 's2', 's1', 's0']);
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    assert.deepEqual(ids(createExportModel(engine, { scope: 'page' })), ['s2', 's1']);
    assert.deepEqual(ids(createExportModel(engine, { scope: 'all' })), ['s0', 's1', 's2', 's3', 's4', 's5']);
  });

  it('selected exports the selected rows in view order', () => {
    const engine = make({ defaultQuery: { sorting: [{ columnId: 'qty', direction: 'desc' }] } });
    engine.dispatch({ type: 'selection.selectRows', rowIds: ['s1', 's4', 's2'] });
    assert.deepEqual(ids(createExportModel(engine, { scope: 'selected' })), ['s4', 's2', 's1']);
    engine.dispatch({ type: 'selection.selectAllFiltered' });
    assert.equal(createExportModel(engine, { scope: 'selected' }).dataRowCount, 6);
    assert.deepEqual(ids(createExportModel(engine, { rowIds: ['s3', 's0'] })), ['s3', 's0']);
  });

  it('custom rows use the grid columns', () => {
    const engine = make();
    const custom = sales().slice(0, 2).map((r) => ({ ...r, qty: r.qty * 100 }));
    const model = createExportModel(engine, { rows: custom });
    assert.equal(model.dataRowCount, 2);
    assert.equal(writeCsv(model).split('\r\n')[1], 's0,North,100,10.50,2025-01-01');
  });

  it('throws a clear error without the export module', () => {
    const engine = createDataGridEngine<Sale>({ getRowId: (r) => r.id, columns, dataSource: sales(), dev: false });
    assert.throws(() => createExportModel(engine), /createExportModule/);
  });
});

describe('export model: groups and aggregates', () => {
  const query: DataGridQueryInit = {
    grouping: [{ columnId: 'region' }],
    aggregates: [
      { columnId: 'qty', type: 'sum', placement: ['groupCaption', 'groupFooter', 'footer'] },
      { columnId: 'qty', type: 'max', placement: ['footer'] },
      { columnId: 'price', type: 'average', placement: ['groupFooter'] },
    ],
  };

  it('writes captions, data rows, group footers, and grid footer lines', () => {
    const engine = make({ defaultQuery: query });
    const model = createExportModel(engine);
    assert.equal(model.groupDepth, 1);
    assert.deepEqual(kinds(model), [
      'group', 'data', 'groupFooter',
      'group', 'data', 'data', 'data', 'groupFooter',
      'group', 'data', 'data', 'groupFooter',
    ]);
    const caption = model.getRow(3);
    assert.equal(caption.kind, 'group');
    if (caption.kind !== 'group') return;
    assert.equal(caption.caption, 'Region: North - 3 items');
    assert.equal(caption.aggregates[2]?.value, 1 + 3 + 6);
    const footer = model.getRow(7);
    assert.equal(footer.kind, 'groupFooter');
    if (footer.kind !== 'groupFooter') return;
    assert.equal(footer.aggregates[2]?.text, '10');
    assert.equal(footer.aggregates[3]?.text, (Math.round(((10.5 + 30.5 + 60.5) / 3) * 100) / 100).toFixed(2));
    assert.equal(model.footerRows.length, 2, 'sum and max stack on qty');
    assert.equal(model.footerRows[0]!.aggregates[2]?.value, 21);
    assert.equal(model.footerRows[1]!.aggregates[2]?.value, 6);
  });

  it('collapsed groups: included by default, excluded on request; flatten drops captions', () => {
    const engine = make({ defaultQuery: query });
    engine.dispatch({ type: 'grouping.collapseAll' });
    assert.equal(createExportModel(engine).dataRowCount, 6);
    const visible = createExportModel(engine, { collapsedGroups: 'exclude' });
    assert.deepEqual(kinds(visible), ['group', 'group', 'group']);
    const flat = createExportModel(engine, { groups: 'flatten' });
    assert.deepEqual(kinds(flat), ['data', 'data', 'data', 'data', 'data', 'data']);
    assert.equal(flat.groupDepth, 0);
  });

  it('page scope keeps the groups of the page with page-wise counts', () => {
    const engine = make({ defaultQuery: query, pageSize: 2 });
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    const model = createExportModel(engine, { scope: 'page' });
    assert.equal(model.dataRowCount, 2);
    const captions = [...model.rows()].filter((r) => r.kind === 'group').map((r) => (r.kind === 'group' ? r.caption : ''));
    assert.deepEqual(captions, ['Region: North - 2 items']);
  });

  it('hooks customize captions, aggregates, cells, and details', () => {
    const engine = make({ defaultQuery: query });
    const model = createExportModel(engine, {
      groupCaption: (c) => `${c.formattedKey} (${c.count})`,
      aggregate: (a) => (a.placement === 'footer' ? `${a.type}=${a.text}` : undefined),
      cell: ({ column, cell }) => (column.columnId === 'qty' ? { text: `#${cell.text}`, style: { bold: true } } : null),
      detail: ({ rowId }) => (rowId === 's3' ? { text: ['detail of s3'] } : null),
    });
    const rows = [...model.rows()];
    const first = rows[0]!;
    assert.equal(first.kind === 'group' && first.caption, 'East (1)');
    assert.equal(model.footerRows[0]!.aggregates[2]?.text, 'sum=21');
    const detailIndex = rows.findIndex((r) => r.kind === 'detail');
    assert.equal(rows[detailIndex - 1]?.kind === 'data' && rows[detailIndex - 1]?.id, 's3');
    const data = rows[1]!;
    assert.equal(data.kind, 'data');
    if (data.kind !== 'data') return;
    const cell = model.cell(data, model.columns[2]!);
    assert.equal(cell.text, '#4');
    assert.deepEqual(cell.style, { bold: true });
    assert.equal(model.hasCellHook, true);
  });
});

describe('CSV', () => {
  it('quotes fields with delimiters, quotes, and line breaks', () => {
    const engine = make({ columns: columns.map((c) => (c.field === 'note' ? { ...c, hidden: false } : c)) });
    const csv = writeCsv(createExportModel(engine));
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'ID,Region,Qty,Price,Note,When');
    assert.equal(lines[1], 's0,North,1,10.50,note 0,2025-01-01');
    assert.ok(csv.includes('"a, ""quoted""\nline"'));
    assert.ok(csv.endsWith('\r\n'));
  });

  it('supports delimiter, raw values, no headers, BOM, quoteAll, and formula escaping', () => {
    const engine = make();
    const model = createExportModel(engine, { columns: ['id', 'price', 'when'] });
    assert.equal(writeCsv(model, { delimiter: ';', values: 'raw', includeHeaders: false }).split('\r\n')[0], 's0;10.5;2025-01-01T00:00:00.000Z');
    assert.ok(writeCsv(model, { bom: true }).startsWith('﻿ID'));
    assert.equal(writeCsv(model, { quoteAll: true, lineBreak: '\n' }).split('\n')[1], '"s0","10.50","2025-01-01"');
    const evil = createExportModel(engine, { columns: ['id'], cell: () => ({ text: '=1+1' }) });
    assert.equal(writeCsv(evil, { escapeFormulas: true, includeHeaders: false }), "'=1+1\r\n".repeat(6));
    assert.throws(() => writeCsv(model, { delimiter: '"' }));
  });

  it('writes group captions and aggregate lines', () => {
    const engine = make({ defaultQuery: { grouping: [{ columnId: 'region' }], aggregates: [{ columnId: 'qty', type: 'sum', placement: ['footer', 'groupFooter'] }] } });
    const lines = writeCsv(createExportModel(engine, { columns: ['id', 'qty'] })).trimEnd().split('\r\n');
    assert.deepEqual(lines.slice(0, 4), ['ID,Qty', 'Region: East - 1 item,', 's3,4', ',4']);
    assert.equal(lines.at(-1), ',21');
    assert.equal(writeCsv(createExportModel(engine, { columns: ['id'] }), { aggregateRows: false }).trimEnd().split('\r\n').length, 7);
  });

  it('streamCsv streams the same text in chunks and yields between them', async () => {
    const engine = make();
    const model = createExportModel(engine);
    let yields = 0;
    const chunks: string[] = [];
    for await (const chunk of streamCsv(model, { chunkRows: 2, yield: async () => void yields++ })) chunks.push(chunk);
    assert.equal(chunks.join(''), writeCsv(model));
    assert.equal(chunks.length, 3);
    assert.equal(yields, 2);
  });
});

describe('exportCsv (public API)', () => {
  it('maps pages, delimiter, columns, rows, fileName, hooks, and events', async () => {
    const engine = make({ pageSize: 2 });
    const page = await exportCsv(engine, { pages: 'current', delimiter: ';', columns: [{ field: 'qty', header: 'Quantity' }, { field: 'id' }], fileName: 'out' });
    assert.ok(page);
    assert.equal(page.fileName, 'out.csv');
    assert.equal(page.mimeType, 'text/csv');
    assert.equal(page.data, 'Quantity;ID\r\n1;s0\r\n2;s1\r\n');
    let completed: Promise<unknown> | null = null;
    const all = await exportCsv(engine, { includeHiddenColumns: true }, {
      cell: ({ column, text }) => (column.field === 'id' ? { text: `#${text}` } : null),
      headerCell: ({ text }) => ({ text: text.toUpperCase() }),
      onExport: (event) => {
        completed = event.file;
      },
    });
    assert.ok(all && completed);
    assert.equal(all.data.trimEnd().split('\r\n').length, 7);
    assert.ok(all.data.split('\r\n')[0]?.includes('NOTE'));
    assert.ok(all.data.includes('#s5'));
    const custom = await exportCsv(engine, { rows: sales().slice(0, 1), columns: [{ field: 'id' }] });
    assert.equal(custom?.data, 'ID\r\ns0\r\n');
    assert.equal(custom?.fileName, 'export.csv');
    let prevented = false;
    assert.equal(
      await exportCsv(engine, {}, {
        onBeforeExport: (event) => {
          assert.equal(event.format, 'csv');
          event.preventDefault();
          prevented = event.defaultPrevented;
        },
      }),
      null,
    );
    assert.ok(prevented);
  });

  it('carries a cell image to the model and writes the text in CSV', async () => {
    const engine = make();
    const image = { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), width: 16, height: 16 };
    const model = createExportModel(engine, toExportModelOptions<Sale, string>({}, { cell: ({ column, text }) => (column.field === 'id' ? { image, text: `[${text}]` } : null) }));
    const row = model.getRow(0);
    assert.equal(row.kind, 'data');
    if (row.kind !== 'data') return;
    const cell = model.cell(row, model.columns[0] as ExportModel<Sale>['columns'][number]);
    assert.equal(cell.image, image);
    assert.equal(cell.text, '[s0]');
    assert.equal(model.cell(row, model.columns[1] as ExportModel<Sale>['columns'][number]).image, undefined);
    const csv = await exportCsv(engine, { columns: [{ field: 'id' }] }, { cell: ({ text }) => ({ image, text: `[${text}]` }) });
    assert.equal(csv?.data.split('\r\n')[1], '[s0]');
  });

  it('installs no model hook when no handler is bound', () => {
    const engine = make();
    const model = createExportModel(engine, toExportModelOptions<Sale, string>({ pages: 'all' }, {}));
    assert.equal(model.hasCellHook, false);
  });
});

describe('export: lookup (foreign key) columns', () => {
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
  const orders: Order[] = [
    { id: 'o1', customerId: 3, qty: 1 },
    { id: 'o2', customerId: 1, qty: 2 },
    { id: 'o3', customerId: 2, qty: 3 },
    { id: 'o4', customerId: 99, qty: 4 }, // unknown key
  ];
  const resolved = 'ID,Customer,Qty\r\no1,Thomas,1\r\no2,Maria,2\r\no3,Ana,3\r\no4,,4\r\n';
  const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  function makeOrders(data: readonly unknown[] | LookupSource = customers) {
    return createDataGridEngine({
      getRowId: (r: Order) => r.id,
      columns: [
        { field: 'id', header: 'ID' },
        { field: 'customerId', header: 'Customer', lookup: { data, keyField: 'CustomerID', displayField: 'ContactName' } },
        { field: 'qty', header: 'Qty', type: 'number' },
      ],
      dataSource: orders,
      dev: false,
      modules: [createLookupModule<Order>(), createSortModule<Order>(), createFilterModule<Order>(), createExportModule<Order>()],
    });
  }

  it('CSV writes the display text, not the key; an unknown key is blank', () => {
    const model = createExportModel(makeOrders());
    assert.equal(writeCsv(model), resolved);
    const customer = model.columns[1]!;
    assert.equal(customer.type, 'string');
    assert.equal(customer.value(orders[0]!), 'Thomas', 'the typed value is the display value');
  });

  it("values: 'raw' still writes the display value (raw skips formatting, it does not undo the lookup)", () => {
    const engine = makeOrders();
    assert.equal(engine.getCellValue('o1', 'customerId'), 3, 'getCellValue keeps the key');
    assert.equal(writeCsv(createExportModel(engine), { values: 'raw' }), resolved);
  });

  it('exports in display-text sort order and with display-text filters', () => {
    const engine = makeOrders();
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'customerId', direction: 'asc' }] });
    assert.equal(writeCsv(createExportModel(engine), { includeHeaders: false }), 'o4,,4\r\no3,Ana,3\r\no2,Maria,2\r\no1,Thomas,1\r\n');
    engine.dispatch({ type: 'filter.byColumn', columnId: 'customerId', operator: 'startsWith', value: 'ma' });
    assert.equal(writeCsv(createExportModel(engine), { includeHeaders: false }), 'o2,Maria,2\r\n');
  });

  it('a pending remote lookup exports blank cells (never the key) without throwing; after the load, the display text', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const remote: LookupSource = {
      load(request) {
        calls++;
        return new Promise((resolve) => {
          release = () => resolve(customers.filter((c) => request.keys.some((k) => String(k) === String(c.CustomerID))));
        });
      },
    };
    const engine = makeOrders(remote);
    const pending = writeCsv(createExportModel(engine));
    assert.equal(pending, 'ID,Customer,Qty\r\no1,,1\r\no2,,2\r\no3,,3\r\no4,,4\r\n');
    await tick();
    assert.equal(calls, 1, 'reading the cells queued one batched load');
    assert.equal(engine.lookup.getStatus('customerId')?.status, 'loading');
    assert.equal(writeCsv(createExportModel(engine)), pending, 'still blank while loading');
    release();
    await tick();
    assert.equal(writeCsv(createExportModel(engine)), resolved);
    assert.equal(calls, 1);
    engine.dispose();
  });
});
