import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFocusModule,
  createDataGridEngine,
  createSelectionModule,
  type CellSpanBlock,
  type CellSpanResolver,
  type ColumnDef,
  type FocusState,
  type FocusTarget,
  type SelectionState,
} from '@salmonui/data-grid/engine';
import { createEditModule, type EditState } from '@salmonui/data-grid/engine/edit';

// Span-aware focus, selection, and editing: the renderer's
// `cellSpans` resolver makes a span one cell at its anchor.

interface Item {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly d: string;
}

const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'a' }, { field: 'b' }, { field: 'c' }, { field: 'd' }];
const COLS = ['id', 'a', 'b', 'c', 'd'];
const rows: Item[] = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, a: `a${i}`, b: `b${i}`, c: `c${i}`, d: `d${i}` }));

// Blocks: r1 a..c (colSpan 3); r3..r4 id (rowSpan 2); r3..r4 b..c (2x2).
const BLOCKS: readonly CellSpanBlock[] = [
  { rowIndex: 1, columnIndex: 1, rowSpan: 1, colSpan: 3 },
  { rowIndex: 3, columnIndex: 0, rowSpan: 2, colSpan: 1 },
  { rowIndex: 3, columnIndex: 2, rowSpan: 2, colSpan: 2 },
];

function resolverOf(blocks: readonly CellSpanBlock[], calls?: { n: number }): CellSpanResolver {
  return (r, c) => {
    if (calls) calls.n++;
    for (const b of blocks) if (r >= b.rowIndex && r < b.rowIndex + b.rowSpan && c >= b.columnIndex && c < b.columnIndex + b.colSpan) return b;
    return null;
  };
}

function make(options: { spans?: CellSpanResolver | null; selection?: Record<string, unknown>; edit?: Record<string, unknown>; direction?: 'ltr' | 'rtl' } = {}) {
  const modules = [createSelectionModule<Item>(), createFocusModule<Item>(), createEditModule<Item>()] as const;
  const engine = createDataGridEngine<Item, typeof modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: rows,
    modules,
    direction: options.direction ?? 'ltr',
    selection: options.selection ?? { mode: 'cell', type: 'multiple', cellSelectionMode: 'box' },
    edit: options.edit ?? { mode: 'cell' },
    ...(options.spans === null ? {} : { cellSpans: options.spans ?? resolverOf(BLOCKS) }),
  });
  const focus = () => (engine.getModuleState<FocusState>('focus') as FocusState).target;
  const at = () => {
    const t = focus();
    return t && t.kind === 'cell' ? `${t.rowId}:${t.columnId}` : t ? `header:${t.columnId}` : null;
  };
  const set = (rowId: string, columnId: string) => engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId, columnId } });
  const move = (direction: string) => engine.dispatch({ type: 'focus.move', direction });
  const selection = () => engine.getModuleState<SelectionState>('selection') as SelectionState;
  return { engine, focus, at, set, move, selection };
}

const cell = (rowId: string, columnId: string): FocusTarget => ({ kind: 'cell', rowId, columnId });

describe('span-aware focus', () => {
  it('moving into a covered cell lands on the span anchor, moving out leaves from the span edge', () => {
    const { at, set, move } = make();
    set('r1', 'id');
    move('right');
    assert.equal(at(), 'r1:a', 'the colSpan anchor');
    move('right');
    assert.equal(at(), 'r1:d', 'ArrowRight leaves from the right edge (anchor + colSpan)');
    move('left');
    assert.equal(at(), 'r1:a', 'ArrowLeft back into the span lands on its anchor');
    move('left');
    assert.equal(at(), 'r1:id');
    set('r3', 'id');
    move('down');
    assert.equal(at(), 'r5:id', 'ArrowDown from a rowSpan 2 anchor moves two rows');
    move('up');
    assert.equal(at(), 'r3:id', 'ArrowUp into the span lands on its anchor');
    move('up');
    assert.equal(at(), 'r2:id');
  });

  it('keeps the aimed-at column through a column span and the aimed-at row through a row span', () => {
    const { at, focus, set, move } = make();
    set('r0', 'c');
    move('down');
    assert.equal(at(), 'r1:a', 'lands on the anchor of the span covering column c');
    move('down');
    assert.equal(at(), 'r2:c', 'and continues in column c below it');
    move('up');
    move('up');
    assert.equal(at(), 'r0:c');
    set('r4', 'a');
    move('left');
    assert.equal(at(), 'r3:id', 'row span anchor');
    move('right');
    assert.equal(at(), 'r4:a', 'back in the aimed-at row r4');
    move('right');
    assert.equal(at(), 'r3:b', 'the 2x2 block');
    move('right');
    assert.equal(at(), 'r4:d', 'leaves the block from its right edge in row r4');
    // A move in the other axis drops the intent.
    set('r4', 'a');
    move('left');
    move('down');
    assert.equal(at(), 'r5:id');
    assert.equal((focus() as FocusTarget).columnId, 'id');
  });

  it('Home, End, Ctrl+End and RTL resolve to anchors', () => {
    const { at, set, move } = make();
    set('r4', 'id');
    assert.equal(at(), 'r3:id', 'focus.set on a covered cell focuses the anchor');
    move('end');
    assert.equal(at(), 'r3:d');
    set('r1', 'd');
    move('home');
    assert.equal(at(), 'r1:id');
    move('lastCell');
    assert.equal(at(), 'r7:d');
    const rtl = make({ direction: 'rtl' });
    rtl.set('r1', 'id');
    rtl.move('left');
    assert.equal(rtl.at(), 'r1:a', 'ArrowLeft moves forward in RTL');
    rtl.move('left');
    assert.equal(rtl.at(), 'r1:d');
  });

  it('a span reaching the last row or column keeps focus in place', () => {
    const edge: CellSpanBlock[] = [{ rowIndex: 6, columnIndex: 3, rowSpan: 2, colSpan: 2 }];
    const { at, set, move } = make({ spans: resolverOf(edge) });
    set('r7', 'd');
    assert.equal(at(), 'r6:c');
    move('down');
    assert.equal(at(), 'r6:c');
    move('right');
    assert.equal(at(), 'r6:c');
    move('pageDown');
    assert.equal(at(), 'r6:c');
  });

  it('without a resolver focus moves cell by cell', () => {
    const { at, set, move } = make({ spans: null });
    set('r1', 'a');
    move('right');
    assert.equal(at(), 'r1:b');
    set('r4', 'id');
    assert.equal(at(), 'r4:id');
  });
});

describe('span-aware cell selection', () => {
  it('selecting a covered cell selects the span anchor', () => {
    const { engine, selection } = make();
    engine.dispatch({ type: 'selection.selectCells', cells: [{ rowId: 'r4', columnId: 'c' }] });
    assert.deepEqual(selection().cells.ranges, [{ anchor: { rowId: 'r3', columnId: 'b' }, focus: { rowId: 'r3', columnId: 'b' } }]);
  });

  it('box ranges grow to cover every span they touch; the anchor cell stays', () => {
    const { engine, selection } = make();
    engine.dispatch({ type: 'selection.selectCells', cells: [{ rowId: 'r0', columnId: 'id' }] });
    engine.dispatch({ type: 'selection.extendCellSelection', focus: { rowId: 'r1', columnId: 'b' } });
    assert.deepEqual(selection().cells.ranges, [{ anchor: { rowId: 'r0', columnId: 'id' }, focus: { rowId: 'r1', columnId: 'c' } }], 'r1 a..c is covered whole');
    engine.dispatch({ type: 'selection.extendCellSelection', focus: { rowId: 'r3', columnId: 'a' } });
    // r3 id spans r3..r4, so the range reaches r4; a..c of r1 keeps column c.
    assert.deepEqual(selection().cells.ranges, [{ anchor: { rowId: 'r0', columnId: 'id' }, focus: { rowId: 'r4', columnId: 'c' } }]);
    assert.deepEqual(selection().cells.anchor, { rowId: 'r0', columnId: 'id' });
    engine.dispatch({ type: 'selection.extendCellSelection', focus: { rowId: 'r0', columnId: 'a' } });
    assert.deepEqual(selection().cells.ranges, [{ anchor: { rowId: 'r0', columnId: 'id' }, focus: { rowId: 'r0', columnId: 'a' } }], 'shrinking works from the anchor cell');
  });

  it('a range extended upward keeps its anchor corner on the anchor side', () => {
    const { engine, selection } = make();
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r5', columnId: 'd' }, focus: { rowId: 'r4', columnId: 'c' } });
    assert.deepEqual(selection().cells.ranges, [{ anchor: { rowId: 'r5', columnId: 'd' }, focus: { rowId: 'r3', columnId: 'b' } }]);
    assert.equal(selection().cells.ranges.length, 1);
  });

  it('flow mode keeps the range between the two anchors', () => {
    const { engine, selection } = make({ selection: { mode: 'cell', type: 'multiple', cellSelectionMode: 'flow' } });
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r0', columnId: 'id' }, focus: { rowId: 'r1', columnId: 'b' } });
    assert.deepEqual(selection().cells.ranges, [{ anchor: { rowId: 'r0', columnId: 'id' }, focus: { rowId: 'r1', columnId: 'a' } }]);
  });

  it('skips the edge walk when the resolver is inactive', () => {
    const calls = { n: 0 };
    const spans = Object.assign(resolverOf([], calls), { active: () => false });
    const { engine } = make({ spans });
    engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: 'r0', columnId: 'id' }, focus: { rowId: 'r7', columnId: 'd' } });
    assert.equal(calls.n, 2, 'only the two corner cells are resolved');
  });
});

describe('span-aware editing', () => {
  const edit = (engine: ReturnType<typeof make>['engine']) => engine.getModuleState<EditState>('edit') as EditState;

  it('editing a covered cell edits the span anchor; updateCell writes any cell', () => {
    const { engine } = make();
    engine.dispatch({ type: 'edit.start', rowId: 'r4', columnId: 'c' });
    assert.deepEqual(edit(engine).active, { rowId: 'r3', columnId: 'b', isNew: false });
    engine.dispatch({ type: 'edit.cancel' });
    engine.dispatch({ type: 'edit.updateCell', rowId: 'r4', columnId: 'c', value: 'x' });
    assert.equal(engine.getRow('r4')?.c, 'x');
  });

  it('Tab and Enter in cell editing skip covered cells', () => {
    const { engine } = make();
    engine.dispatch({ type: 'edit.start', rowId: 'r1', columnId: 'a' });
    engine.dispatch({ type: 'edit.commitAndMove', direction: 'next' });
    assert.deepEqual(edit(engine).active, { rowId: 'r1', columnId: 'd', isNew: false });
    engine.dispatch({ type: 'edit.cancel' });
    engine.dispatch({ type: 'edit.start', rowId: 'r3', columnId: 'b' });
    engine.dispatch({ type: 'edit.commitAndMove', direction: 'down' });
    assert.deepEqual(edit(engine).active, { rowId: 'r5', columnId: 'b', isNew: false });
  });

  it('focus stays a plain target object', () => {
    const { focus, set } = make();
    set('r1', 'c');
    assert.deepEqual(focus(), cell('r1', 'a'));
  });
});
