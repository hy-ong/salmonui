import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FocusState, SelectionState } from '@salmonui/data-grid/engine';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { createSpanResolver } from '../dist/data-grid/span-resolver.js';
import { people, type Person, newInstance } from './fixtures.ts';

// Span-aware focus, selection, and editing through the React span resolver:
// the resolver answers for any row, rendered or not.

let seq = 0;
function make(columns: readonly DataGridColumn<Person>[], props: Partial<DataGridProps<Person>> = {}, rows = 2000) {
  const instance = newInstance<Person>({ data: people(rows), columns, ...props } as never, `:span${seq++}:`);
  const engine = instance.engine;
  const at = (): string | null => {
    const t = (engine.getModuleState<FocusState>('focus') as FocusState).target;
    return t && t.kind === 'cell' ? `${t.rowId}:${t.columnId}` : null;
  };
  const set = (rowId: string, columnId: string) => engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId, columnId } });
  const move = (direction: string) => engine.dispatch({ type: 'focus.move', direction });
  return { instance, engine, at, set, move };
}

const base: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', primaryKey: true },
  { field: 'name', header: 'Name' },
  { field: 'age', header: 'Age' },
  { field: 'active', header: 'Active' },
];

describe('span resolver', () => {
  it('answers null and inactive without spans (the default path)', () => {
    const { instance, engine } = make(base);
    const resolver = createSpanResolver(instance);
    assert.equal(resolver(5, 1), null);
    assert.equal(resolver.active?.(), false);
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p5', columnId: 'name' } });
    engine.dispatch({ type: 'focus.move', direction: 'right' });
    assert.deepEqual((engine.getModuleState<FocusState>('focus') as FocusState).target, { kind: 'cell', rowId: 'p5', columnId: 'age' });
  });

  it('column spans: moves skip covered cells and leave from the span edge', () => {
    const columns: DataGridColumn<Person>[] = [base[0] as DataGridColumn<Person>, { ...(base[1] as DataGridColumn<Person>), colSpan: ({ rowIndex }) => (rowIndex === 3 ? 2 : 1) }, base[2] as DataGridColumn<Person>, base[3] as DataGridColumn<Person>];
    const { at, set, move } = make(columns);
    set('p3', 'id');
    move('right');
    assert.equal(at(), 'p3:name');
    move('right');
    assert.equal(at(), 'p3:active');
    set('p2', 'age');
    move('down');
    assert.equal(at(), 'p3:name', 'down into the span lands on its anchor');
    move('down');
    assert.equal(at(), 'p4:age', 'and continues in the aimed-at column');
  });

  it('explicit row spans resolve far outside any rendered window', () => {
    const columns: DataGridColumn<Person>[] = [base[0] as DataGridColumn<Person>, { ...(base[1] as DataGridColumn<Person>), rowSpan: ({ rowIndex }) => (rowIndex % 10 === 0 ? 4 : 1) }, base[2] as DataGridColumn<Person>];
    const { instance, at, set, move } = make(columns);
    const resolver = createSpanResolver(instance);
    assert.deepEqual(resolver(1502, 1), { rowIndex: 1500, columnIndex: 1, rowSpan: 4, colSpan: 1 });
    assert.equal(resolver(1504, 1), null);
    set('p1502', 'name');
    assert.equal(at(), 'p1500:name');
    move('down');
    assert.equal(at(), 'p1504:name');
    move('up');
    assert.equal(at(), 'p1500:name');
  });

  it('explicit row spans resolve from any distance above, and follow data changes', () => {
    const columns: DataGridColumn<Person>[] = [base[0] as DataGridColumn<Person>, { ...(base[1] as DataGridColumn<Person>), rowSpan: ({ row }) => (row.name === 'Big' ? 3_000 : 1) }];
    const big = (id: string) => people(5_000).map((p) => (p.id === id ? { ...p, name: 'Big' } : p));
    const { instance, engine } = make(columns, { data: big('p100') }, 5_000);
    (engine as unknown as { connect(): void }).connect();
    const resolver = createSpanResolver(instance);
    assert.deepEqual(resolver(2_900, 1), { rowIndex: 100, columnIndex: 1, rowSpan: 3_000, colSpan: 1 });
    assert.equal(resolver(3_100, 1), null);
    (instance as unknown as { source: { setRows(rows: readonly Person[]): void } }).source.setRows(big('p1000'));
    assert.equal(resolver(500, 1), null, 'the index is rebuilt for the new rows');
    assert.deepEqual(resolver(3_999, 1), { rowIndex: 1_000, columnIndex: 1, rowSpan: 3_000, colSpan: 1 });
  });

  it('equal-value merges follow their whole run, longer than the render lookback', () => {
    // `active` is true for rows 0..149 and false after.
    const columns: DataGridColumn<Person>[] = [base[0] as DataGridColumn<Person>, { id: 'band', header: 'Band', type: 'string', valueGetter: (row) => (Number(row.id.slice(1)) < 150 ? 'low' : 'high'), rowSpan: true }];
    const { instance, at, set, move } = make(columns, {}, 400);
    const resolver = createSpanResolver(instance);
    assert.deepEqual(resolver(120, 1), { rowIndex: 0, columnIndex: 1, rowSpan: 150, colSpan: 1 });
    set('p120', 'band');
    assert.equal(at(), 'p0:band');
    move('down');
    assert.equal(at(), 'p150:band');
  });

  it('spans stay inside the sticky row section', () => {
    const columns: DataGridColumn<Person>[] = [base[0] as DataGridColumn<Person>, { id: 'same', header: 'Same', type: 'string', valueGetter: () => 'x', rowSpan: true }];
    const { instance } = make(columns, { stickyRows: 2 }, 50);
    const resolver = createSpanResolver(instance);
    assert.deepEqual(resolver(1, 1), { rowIndex: 0, columnIndex: 1, rowSpan: 2, colSpan: 1 });
    assert.deepEqual(resolver(10, 1), { rowIndex: 2, columnIndex: 1, rowSpan: 48, colSpan: 1 });
  });

  it('mergeCells both: blocks of equal values', () => {
    const columns: DataGridColumn<Person>[] = [base[0] as DataGridColumn<Person>, { id: 'x', header: 'X', type: 'string', valueGetter: (row) => (Number(row.id.slice(1)) < 3 ? 'm' : `x${row.id}`) }, { id: 'y', header: 'Y', type: 'string', valueGetter: (row) => (Number(row.id.slice(1)) < 3 ? 'm' : `y${row.id}`) }];
    const { instance, at, set, move } = make(columns, { mergeCells: true }, 20);
    const resolver = createSpanResolver(instance);
    assert.deepEqual(resolver(2, 2), { rowIndex: 0, columnIndex: 1, rowSpan: 3, colSpan: 2 });
    set('p1', 'y');
    assert.equal(at(), 'p0:x');
    move('down');
    assert.equal(at(), 'p3:x');
  });

  it('box range selection covers whole spans', () => {
    const columns: DataGridColumn<Person>[] = [base[0] as DataGridColumn<Person>, { ...(base[1] as DataGridColumn<Person>), colSpan: ({ rowIndex }) => (rowIndex === 3 ? 3 : 1) }, base[2] as DataGridColumn<Person>, base[3] as DataGridColumn<Person>];
    const { engine } = make(columns, { selection: { mode: 'cell', multiple: true, cellRange: 'box' } });
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'p1', columnId: 'id' }, focus: { rowId: 'p3', columnId: 'name' } });
    const ranges = (engine.getModuleState<SelectionState>('selection') as SelectionState).cells.ranges;
    assert.deepEqual(ranges, [{ anchor: { rowId: 'p1', columnId: 'id' }, focus: { rowId: 'p3', columnId: 'active' } }]);
  });

  it('spans follow data changes (updateCell)', () => {
    const columns: DataGridColumn<Person>[] = [base[0] as DataGridColumn<Person>, { field: 'name', header: 'Name', rowSpan: true }];
    const { instance, engine } = make(columns, {}, 10);
    (engine as unknown as { connect(): void }).connect();
    const resolver = createSpanResolver(instance);
    assert.equal(resolver(1, 1), null, 'names differ');
    const rows = people(10).map((p) => (p.id === 'p1' ? { ...p, name: 'Person 0' } : p));
    (instance as unknown as { source: { setRows(rows: readonly Person[]): void } }).source.setRows(rows);
    assert.deepEqual(resolver(1, 1), { rowIndex: 0, columnIndex: 1, rowSpan: 2, colSpan: 1 });
  });
});
