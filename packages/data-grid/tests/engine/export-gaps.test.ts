// Custom aggregate export: `type: 'custom'` aggregates reach the export
// model's grid footer, group footers, and group captions, and the
// `aggregateCell(ctx)` export hook sees them with `type: 'custom'` and the
// computed value.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createDataGridEngine,
  createGroupingModule,
  type ColumnDef,
  type DataGridModule,
  type DataGridQueryInit,
} from '@salmonui/data-grid/engine';
import { createExportModel, createExportModule, exportCsv, toExportModelOptions, type ExportAggregateCellHookContext, type ExportModel } from '@salmonui/data-grid/engine/export';

interface Sale {
  readonly id: string;
  readonly region: string;
  readonly qty: number;
}

const rows: Sale[] = [
  { id: 's0', region: 'North', qty: 1 },
  { id: 's1', region: 'South', qty: 2 },
  { id: 's2', region: 'North', qty: 3 },
  { id: 's3', region: 'East', qty: 4 },
  { id: 's4', region: 'South', qty: 5 },
  { id: 's5', region: 'North', qty: 6 },
];

const columns: ColumnDef<Sale>[] = [
  { field: 'id', header: 'ID', primaryKey: true },
  { field: 'region', header: 'Region' },
  { field: 'qty', header: 'Qty', type: 'number' },
];

/** Custom aggregate: the number of rows whose qty is even. */
const evens = (list: readonly unknown[]): number => (list as Sale[]).filter((r) => r.qty % 2 === 0).length;
/** Custom aggregate returning a string (written as is). */
const label = (list: readonly unknown[]): string => `${list.length} sold`;

type Modules = readonly DataGridModule<Sale, any, any, string>[];

function make(defaultQuery?: DataGridQueryInit, custom?: Record<string, (rows: readonly unknown[]) => unknown>) {
  return createDataGridEngine<Sale, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: rows,
    dev: false,
    locale: 'en-US',
    modules: [createGroupingModule<Sale>(), createAggregatesModule<Sale>(), createExportModule<Sale>()],
    ...(custom ? { aggregates: { custom } } : {}),
    ...(defaultQuery ? { defaultQuery } : {}),
  });
}

function groupFooters(model: ExportModel<Sale>): { text: string | undefined; value: unknown }[] {
  return [...model.rows()].flatMap((r) => (r.kind === 'groupFooter' ? [{ text: r.aggregates[2]?.text, value: r.aggregates[2]?.value }] : []));
}

describe('custom aggregate export', () => {
  it('a defaultQuery custom aggregate writes its value to the grid footer, group footers, and group captions', () => {
    const engine = make({
      grouping: [{ columnId: 'region' }],
      aggregates: [
        { columnId: 'qty', type: 'custom', custom: evens, placement: ['groupCaption', 'groupFooter', 'footer'] },
        { columnId: 'region', type: 'custom', custom: label, placement: ['footer'] },
      ],
    });
    const model = createExportModel(engine);
    const footer = model.footerRows[0]!;
    assert.deepEqual({ type: footer.aggregates[2]?.type, value: footer.aggregates[2]?.value, text: footer.aggregates[2]?.text }, { type: 'custom', value: 3, text: '3' });
    assert.deepEqual({ value: footer.aggregates[1]?.value, text: footer.aggregates[1]?.text }, { value: '6 sold', text: '6 sold' });
    // Groups in source order of first appearance: North (1, 3, 6), South (2, 5), East (4).
    const captions = [...model.rows()].flatMap((r) => (r.kind === 'group' ? [[r.caption, r.aggregates[2]?.text]] : []));
    assert.equal(captions.length, 3);
    const byRegion = new Map(captions.map(([caption, text]) => [String(caption).split(':')[1]?.trim().split(' ')[0], text]));
    assert.deepEqual(Object.fromEntries(byRegion), { North: '1', South: '1', East: '1' });
    assert.deepEqual(groupFooters(model).map((f) => f.value).sort(), [1, 1, 1]);
  });

  it('a registered custom aggregate (aggregates.custom + customId) exports through aggregates.set', () => {
    const engine = make(undefined, { evens });
    engine.dispatch({ type: 'aggregates.set', aggregates: [{ columnId: 'qty', type: 'custom', customId: 'evens', placement: ['footer'] }] });
    const model = createExportModel(engine);
    assert.equal(model.footerRows.length, 1);
    assert.equal(model.footerRows[0]!.aggregates[2]?.text, '3');
  });

  it('aggregateCell(ctx) receives custom aggregates with type custom and replaces their text', async () => {
    const query: DataGridQueryInit = { grouping: [{ columnId: 'region' }], aggregates: [{ columnId: 'qty', type: 'custom', custom: evens, placement: ['groupFooter', 'footer'] }] };
    const seen: ExportAggregateCellHookContext[] = [];
    const aggregateCell = (ctx: ExportAggregateCellHookContext) => {
      seen.push(ctx);
      return ctx.type === 'custom' ? { text: `even=${String(ctx.value)}`, style: { bold: true } } : null;
    };
    const model = createExportModel(make(query), toExportModelOptions(undefined, { aggregateCell }));
    const footer = model.footerRows[0]!.aggregates[2]!;
    assert.equal(footer.text, 'even=3');
    assert.deepEqual(footer.style, { bold: true });
    assert.deepEqual(groupFooters(model).map((f) => f.text), ['even=1', 'even=1', 'even=1']);
    // Rows are built on read: the hook ran once per custom cell read above.
    assert.equal(seen.length, 4);
    assert.ok(seen.every((c) => c.type === 'custom' && c.columnId === 'qty'));
    const atFooter = seen.find((c) => c.placement === 'footer');
    assert.deepEqual({ value: atFooter?.value, text: atFooter?.text }, { value: 3, text: '3' });
    assert.deepEqual(seen.filter((c) => c.placement === 'groupFooter').map((c) => c.value), [1, 1, 1]);
    // The CSV writer writes the hooked custom footer line.
    const csv = await exportCsv(make(query), undefined, { aggregateCell });
    const lines = (csv?.data ?? '').split('\r\n').filter(Boolean);
    assert.equal(lines.at(-1), ',,even=3');
  });
});
