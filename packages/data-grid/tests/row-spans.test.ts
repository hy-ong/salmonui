import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, createSortModule, createVariableRowMetrics, type ColumnDef, type CompiledColumn, type DataGridEngine } from '@salmonui/data-grid/engine';
import { parseRowSpanKey, spanFlags, ROW_SPAN_LOOKBACK } from '../dist/data-grid/spans.js';
import { computeRowSpans, planZone } from '../dist/data-grid/span-plans.js';
import { count, people, render, type Person } from './fixtures.ts';

// Row spans across virtualized rows: the body
// computes span facts per rendered window, carrying a span whose first row is
// above the window into the window's first row.

type Def = ColumnDef<Person> & { rowSpan?: unknown; colSpan?: unknown };

function make(columns: readonly Def[], rows = 200): DataGridEngine<Person> {
  return createDataGridEngine<Person>({ getRowId: (row) => row.id, columns: columns as readonly ColumnDef<Person>[], dataSource: people(rows), timeZone: 'UTC' });
}

const zones = (engine: DataGridEngine<Person>) => {
  const c = engine.getSnapshot().columns;
  return [c.left, c.center, c.right] as const;
};

const noClamp = (): void => {};

describe('row spans under row virtualization', () => {
  // Every 10th row spans 6 rows of `name`.
  const explicitSpan: readonly Def[] = [{ field: 'id' }, { field: 'name', rowSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex % 10 === 0 ? 6 : 1) }, { field: 'age' }];

  it('carries a span whose first row is above the window into the first rendered row', () => {
    const engine = make(explicitSpan);
    // Window [13, 30): the span of row 10 covers 10..15, so rows 13..15 are covered and row 13 carries it.
    const facts = computeRowSpans(engine, [{ start: 13, end: 30, scanFrom: 13 - ROW_SPAN_LOOKBACK }], zones(engine), undefined);
    assert.ok(facts);
    const first = parseRowSpanKey(facts.get(13));
    assert.deepEqual(first?.carried, [{ columnId: 'name', anchor: 10, rowSpan: 6, colSpan: 1 }]);
    assert.ok(first?.covered.has('name'));
    assert.ok(parseRowSpanKey(facts.get(15))?.covered.has('name'));
    assert.equal(facts.get(16), undefined, 'row 16 is outside every span');
    assert.deepEqual([...(parseRowSpanKey(facts.get(20))?.spans ?? [])], [['name', 6]]);
    assert.equal(parseRowSpanKey(facts.get(14))?.carried.length, 0, 'only the first rendered row carries');
  });

  it('plans the carried cell with the anchor row, the remaining aria-rowspan and a pulled-up block', () => {
    const engine = make(explicitSpan);
    const z = zones(engine);
    const facts = computeRowSpans(engine, [{ start: 13, end: 30, scanFrom: 0 }], z, undefined);
    const info = parseRowSpanKey(facts?.get(13));
    const center = z[1] as readonly CompiledColumn<Person>[];
    const rowId = engine.getRowIdAt(13) as string;
    const plan = planZone(engine, undefined, spanFlags(engine.getSnapshot().columns.visible, undefined), engine.getRow(rowId) as Person, rowId, 13, center, 0, center.length, info, noClamp);
    assert.ok(plan);
    const name = plan.find((p) => p.column.columnId === 'name');
    assert.equal(name?.anchorRowId, 'p10');
    assert.equal(name?.anchorRowIndex, 10);
    assert.equal(name?.rowSpan, 3, 'rows 13..15 of the span are rendered');
    assert.equal(name?.style?.height, 'calc(var(--salmon-data-grid-row-height) * 6)');
    assert.equal(name?.style?.marginBlockStart, 'calc(-1 * calc(var(--salmon-data-grid-row-height) * 3))');
    assert.equal(plan.length, center.length, 'no spacer is added next to the carried cell');
  });

  it('draws an explicit span that starts 10,000 rows above the window (no lookback limit)', () => {
    // Row 0 spans 20,000 rows; every other row of the name column is plain.
    const long: readonly Def[] = [{ field: 'id' }, { field: 'name', rowSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex === 0 ? 20_000 : rowIndex === 30_000 ? 3 : 1) }];
    const engine = make(long, 40_000);
    const section = (start: number) => ({ start, end: start + 20, scanFrom: Math.max(0, start - ROW_SPAN_LOOKBACK), group: [0, 40_000] as const });
    const far = parseRowSpanKey(computeRowSpans(engine, [section(10_000)], zones(engine), undefined)?.get(10_000));
    assert.deepEqual(far?.carried, [{ columnId: 'name', anchor: 0, rowSpan: 20_000, colSpan: 1 }]);
    assert.ok(far?.covered.has('name'), 'the window rows under the span are covered');
    // Scrolling back up and down again reads the same index; the span ends at row 19,999.
    assert.equal(parseRowSpanKey(computeRowSpans(engine, [section(5_000)], zones(engine), undefined)?.get(5_000))?.carried[0]?.anchor, 0);
    assert.equal(computeRowSpans(engine, [section(20_000)], zones(engine), undefined)?.get(20_000), undefined);
    const after = parseRowSpanKey(computeRowSpans(engine, [section(30_001)], zones(engine), undefined)?.get(30_001));
    assert.deepEqual(after?.carried, [{ columnId: 'name', anchor: 30_000, rowSpan: 3, colSpan: 1 }]);
  });

  it('the anchor index honours earlier spans: a row covered by a span is never an anchor', () => {
    // Row 0 spans 500 rows, so row 100 (which would span 1,000) is covered and starts nothing.
    const overlapping: readonly Def[] = [{ field: 'id' }, { field: 'name', rowSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex === 0 ? 500 : rowIndex === 100 ? 1_000 : 1) }];
    const engine = make(overlapping, 2_000);
    const at = (start: number) => parseRowSpanKey(computeRowSpans(engine, [{ start, end: start + 10, scanFrom: start, group: [0, 2_000] }], zones(engine), undefined)?.get(start));
    assert.equal(at(400)?.carried[0]?.anchor, 0);
    assert.equal(at(600), null, 'row 100 is covered by row 0, so its 1,000-row span does not exist');
  });

  it('the anchor index is rebuilt when the rows change (sort)', () => {
    const bySpan: readonly Def[] = [{ field: 'id' }, { field: 'name', rowSpan: ({ row }: { row: Person }) => (row.id === 'p0' ? 300 : 1) }, { field: 'age' }];
    const engine = createDataGridEngine<Person>({ getRowId: (row) => row.id, columns: bySpan as readonly ColumnDef<Person>[], dataSource: people(1_000), modules: [createSortModule<Person>()] as never, timeZone: 'UTC' });
    const at = (start: number) => parseRowSpanKey(computeRowSpans(engine, [{ start, end: start + 10, scanFrom: start, group: [0, 1_000] }], zones(engine), undefined)?.get(start));
    assert.equal(at(200)?.carried[0]?.anchor, 0);
    // Descending age puts p0 (age 20) at row 980.
    engine.dispatch({ type: 'sort.column', columnId: 'age', direction: 'desc' });
    assert.equal(engine.getRowIdAt(980), 'p0');
    assert.equal(at(200), null);
    assert.deepEqual(at(990)?.carried, [{ columnId: 'name', anchor: 980, rowSpan: 300, colSpan: 1 }]);
  });

  it('sizes a carried span from the row metrics with per-row heights', () => {
    const engine = make(explicitSpan);
    const z = zones(engine);
    const info = parseRowSpanKey(computeRowSpans(engine, [{ start: 13, end: 30, scanFrom: 13, group: [0, 200] }], z, undefined)?.get(13));
    const center = z[1] as readonly CompiledColumn<Person>[];
    const rowId = engine.getRowIdAt(13) as string;
    // Even rows 30 px, odd rows 50 px: rows 10..15 are 3 x 30 + 3 x 50 = 240 px, rows 10..12 are 30 + 50 + 30 = 110 px.
    const metrics = createVariableRowMetrics(200, (i) => (i % 2 === 0 ? 30 : 50));
    const plan = planZone(engine, undefined, spanFlags(engine.getSnapshot().columns.visible, undefined), engine.getRow(rowId) as Person, rowId, 13, center, 0, center.length, info, noClamp, metrics);
    const name = plan?.find((p) => p.column.columnId === 'name');
    assert.equal(name?.style?.height, '240px');
    assert.equal(name?.style?.marginBlockStart, 'calc(-1 * 110px)');
  });

  it('merges of equal values are bounded by the section and never cross it', () => {
    const merged: readonly Def[] = [{ field: 'id' }, { id: 'same', valueGetter: () => 'x', rowSpan: true }];
    const engine = make(merged);
    const facts = computeRowSpans(
      engine,
      [
        { start: 0, end: 2, scanFrom: 0 },
        { start: 50, end: 70, scanFrom: 2 },
      ],
      zones(engine),
      undefined,
    );
    assert.deepEqual([...(parseRowSpanKey(facts?.get(0))?.spans ?? [])], [['same', 2]], 'sticky top section');
    // The run starts at the scan start (rows 0..1 are another section) and reaches through the window end.
    const carried = parseRowSpanKey(facts?.get(50))?.carried[0];
    assert.equal(carried?.anchor, 2);
    assert.equal(carried?.rowSpan, 68);
  });

  it('a rowSpan + colSpan block is carried with its column span', () => {
    const block: readonly Def[] = [
      { field: 'id' },
      { field: 'name', rowSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex === 5 ? 4 : 1), colSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex === 5 ? 2 : 1) },
      { field: 'age' },
      { field: 'active' },
    ];
    const engine = make(block);
    const facts = computeRowSpans(engine, [{ start: 7, end: 20, scanFrom: 0 }], zones(engine), undefined);
    const info = parseRowSpanKey(facts?.get(7));
    assert.deepEqual(info?.carried, [{ columnId: 'name', anchor: 5, rowSpan: 4, colSpan: 2 }]);
    assert.deepEqual([...(info?.covered ?? [])].sort(), ['age', 'name']);
  });

  it('returns null on the default path (no row span column)', () => {
    const engine = make([{ field: 'id' }, { field: 'name' }]);
    assert.equal(computeRowSpans(engine, [{ start: 0, end: 20, scanFrom: 0 }], zones(engine), undefined), null);
  });

  it('server markup keeps row spans with row virtualization on', () => {
    const html = render({
      rows: 100,
      columns: [
        { field: 'id', header: 'ID', width: 80 },
        { field: 'name', header: 'Name', width: 160, rowSpan: ({ rowIndex }) => (rowIndex % 4 === 0 ? 2 : 1) },
      ],
    });
    assert.ok(count(html, /aria-rowspan="2"/) >= 3);
  });
});
