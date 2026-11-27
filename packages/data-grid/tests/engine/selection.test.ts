import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFilterModule,
  createFocusModule,
  createDataGridEngine,
  createPagingModule,
  createSelectionApi,
  createSelectionModule,
  createSortModule,
  type ColumnDef,
  type SelectionOptions,
  type SelectionState,
  type SelectionSummary,
} from '@salmonui/data-grid/engine';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';

interface Item {
  readonly id: string;
  readonly n: number;
  readonly g: string;
}

const columns: ColumnDef<Item>[] = [
  { field: 'id', primaryKey: true },
  { field: 'n', type: 'number' },
  { field: 'g' },
];

function items(count: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < count; i++) out.push({ id: `r${i}`, n: (i * 7919) % count, g: i % 2 ? 'odd' : 'even' });
  return out;
}

function make(selection: SelectionOptions = {}, count = 10, extra: { paging?: boolean } = {}) {
  const modules = [createFilterModule<Item>(), createSortModule<Item>(), ...(extra.paging ? [createPagingModule<Item>()] : []), createSelectionModule<Item>(), createFocusModule<Item>()] as const;
  const engine = createDataGridEngine<Item, typeof modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: items(count),
    modules,
    selection,
    paging: { pageSize: 4 },
    dev: true,
    instrument: true,
  });
  const api = createSelectionApi(engine);
  const state = () => engine.getModuleState<SelectionState>('selection') as SelectionState;
  const summary = () => (engine as unknown as { selection: { getSummary(): SelectionSummary } }).selection.getSummary();
  return { engine, api, state, summary };
}

function rowNotifications(engine: ReturnType<typeof make>['engine'], ids: readonly string[]) {
  const hits: string[] = [];
  const offs = ids.map((id) => engine.subscribeRow(id, () => hits.push(id)));
  return { hits, off: () => offs.forEach((f) => f()) };
}

describe('selection module', () => {
  it('is out of the grid snapshot and single by default', () => {
    const { engine, api } = make();
    const before = engine.getSnapshot();
    api.selectRows(['r1', 'r2']);
    assert.equal(engine.getSnapshot(), before, 'selection never replaces the grid snapshot');
    assert.equal(before.modules['selection'], undefined);
    assert.deepEqual(api.getSelectedRowIds(), ['r2'], 'single keeps the last id');
  });

  it('multiple: replace, add, toggle, remove, range by visible order', () => {
    const { engine, api } = make({ type: 'multiple' });
    api.selectRows(['r1', 'r3']);
    assert.deepEqual(api.getSelectedRowIds(), ['r1', 'r3']);
    api.selectRows('r5', { mode: 'add' });
    api.toggleRowSelection('r1');
    assert.deepEqual([...api.getSelectedRowIds()].sort(), ['r3', 'r5']);
    api.selectRows(['r3'], { mode: 'remove' });
    assert.deepEqual(api.getSelectedRowIds(), ['r5']);
    // Range follows the visible (sorted) order, not source order.
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n', direction: 'desc' }] });
    const order = Array.from({ length: 10 }, (_, i) => engine.getRowIdAt(i) as string);
    api.selectRowRange(order[2] as string, order[5] as string);
    assert.deepEqual([...api.getSelectedRowIds()].sort(), order.slice(2, 6).sort());
    assert.equal(api.getSelectedRows().length, 4);
  });

  it('enableToggle and single selection', () => {
    const { api } = make({ type: 'single' });
    api.toggleRowSelection('r2');
    assert.deepEqual(api.getSelectedRowIds(), ['r2']);
    api.toggleRowSelection('r2');
    assert.deepEqual(api.getSelectedRowIds(), []);
    api.selectRows('r4', { mode: 'toggle' });
    api.selectRows('r4', { mode: 'toggle' });
    assert.deepEqual(api.getSelectedRowIds(), []);
    assert.equal(api.selectAll().status, 'rejected');
  });

  it('defaultSelectedRowIds and serializable state with restore', () => {
    const { api, engine } = make({ type: 'multiple', defaultSelectedRowIds: ['r0', 'r9'] });
    assert.deepEqual(api.getSelectedRowIds(), ['r0', 'r9']);
    api.selectCellRange({ rowId: 'r0', columnId: 'id' }, { rowId: 'r1', columnId: 'n' });
    const saved = api.getSelection();
    assert.ok(saved);
    const json = JSON.parse(JSON.stringify(saved));
    assert.deepEqual(json.rowIds, ['r0', 'r9']);
    api.clearSelection();
    assert.deepEqual(api.getSelectedRowIds(), []);
    api.setSelection(json);
    assert.deepEqual(api.getSelectedRowIds(), ['r0', 'r9']);
    assert.equal(engine.getCommandLog().length, 0, 'no command log unless recordCommands');
  });

  it('clears on sort, filter, and page unless persist', () => {
    const a = make({ type: 'multiple' }, 10, { paging: true });
    a.api.selectRows(['r1', 'r2']);
    a.engine.dispatch({ type: 'sort.toggle', columnId: 'n' });
    assert.deepEqual(a.api.getSelectedRowIds(), []);
    a.api.selectRows(['r1']);
    a.engine.dispatch({ type: 'paging.next' });
    assert.deepEqual(a.api.getSelectedRowIds(), []);

    const b = make({ type: 'multiple', persist: true, mode: 'both' }, 10, { paging: true });
    b.api.selectRows(['r1', 'r2']);
    b.api.selectCells([{ rowId: 'r1', columnId: 'n' }]);
    b.engine.dispatch({ type: 'sort.toggle', columnId: 'n' });
    b.engine.dispatch({ type: 'filter.byColumn', columnId: 'g', operator: 'equal', value: 'odd' });
    b.engine.dispatch({ type: 'paging.next' });
    assert.deepEqual([...b.api.getSelectedRowIds()].sort(), ['r1', 'r2'], 'ids persist across sort/filter/page');
    assert.equal(b.api.getSelection()?.cellRanges.length, 1, 'cell selection persists too (lifted limitation)');
  });

  it('select all filtered is O(1) by scope with excluded ids', () => {
    const { engine, api, state, summary } = make({ type: 'multiple' }, 10, { paging: true });
    engine.dispatch({ type: 'filter.byColumn', columnId: 'g', operator: 'equal', value: 'even' });
    api.selectAllFiltered();
    assert.equal(state().rows.scope, 'allFiltered');
    assert.equal(state().rows.ids.size, 0);
    assert.deepEqual(summary(), { scope: 'allFiltered', count: 5, total: 5, header: 'all', cellRangeCount: 0, columnCount: 0 });
    assert.equal(api.isRowSelected('r8'), true, 'a row on another page is selected');
    assert.equal(api.isRowSelected('r1'), false, 'a filtered-out row is not');
    api.toggleRowSelection('r2');
    assert.deepEqual(api.getSelection()?.excludedRowIds, ['r2']);
    assert.equal(summary().header, 'some');
    assert.deepEqual(api.getSelectedRowIds(), ['r0', 'r4', 'r6', 'r8']);
    engine.dispatch({ type: 'selection.toggleAll' });
    assert.equal(summary().header, 'all');
    engine.dispatch({ type: 'selection.toggleAll' });
    assert.equal(summary().header, 'none');
  });

  it('selectAllVisible selects the current page; without paging it is the filtered scope', () => {
    const paged = make({ type: 'multiple' }, 10, { paging: true });
    paged.api.selectAll();
    assert.deepEqual(paged.api.getSelectedRowIds(), ['r0', 'r1', 'r2', 'r3']);
    assert.equal(paged.summary().header, 'some');
    const flat = make({ type: 'multiple' });
    flat.api.selectAll();
    assert.equal(flat.state().rows.scope, 'allFiltered');
    assert.equal(flat.summary().header, 'all');
  });

  it('cell selection: flow and box ranges, extend, columns', () => {
    const box = make({ type: 'multiple', mode: 'cell', cellSelectionMode: 'box', columns: true });
    const sel = box.engine as unknown as { selection: { isCellSelected(r: string, c: string): boolean } };
    box.api.selectCellRange({ rowId: 'r1', columnId: 'n' }, { rowId: 'r3', columnId: 'g' });
    assert.equal(sel.selection.isCellSelected('r2', 'n'), true);
    assert.equal(sel.selection.isCellSelected('r2', 'id'), false);
    box.engine.dispatch({ type: 'selection.extendCellSelection', focus: { rowId: 'r4', columnId: 'id' } });
    assert.equal(sel.selection.isCellSelected('r4', 'id'), true);
    assert.equal(sel.selection.isCellSelected('r4', 'g'), false);
    assert.equal(box.api.selectRows('r1').status, 'rejected', 'row commands are rejected in cell mode');
    box.api.selectColumns('g');
    assert.equal(sel.selection.isCellSelected('r9', 'g'), true);

    const flow = make({ type: 'multiple', mode: 'cell', cellSelectionMode: 'flow' });
    const fs = flow.engine as unknown as typeof sel;
    flow.api.selectCellRange({ rowId: 'r1', columnId: 'g' }, { rowId: 'r3', columnId: 'n' });
    assert.equal(fs.selection.isCellSelected('r2', 'id'), true, 'flow covers whole middle rows');
    assert.equal(fs.selection.isCellSelected('r1', 'id'), false);
    assert.equal(fs.selection.isCellSelected('r3', 'g'), false);
    flow.api.clearSelection({ cells: true });
    assert.equal(fs.selection.isCellSelected('r2', 'id'), false);
  });

  it('cancelable through onBeforeCommand with a proposed-value preview', () => {
    const { engine, api } = make({ type: 'multiple' });
    const sel = engine as unknown as { selection: { preview(c: object): { selectedRowIds: readonly string[]; added: readonly string[]; removed: readonly string[] } | null } };
    api.selectRows(['r1', 'r2']);
    const seen: unknown[] = [];
    const off = engine.onBeforeCommand(({ command }) => {
      if (!command.type.startsWith('selection.')) return;
      const p = sel.selection.preview(command);
      seen.push(p && { ids: [...p.selectedRowIds].sort(), added: p.added, removed: p.removed });
      return false;
    });
    api.toggleRowSelection('r3');
    api.selectRows(['r2'], { mode: 'add' });
    off();
    assert.deepEqual(seen, [{ ids: ['r1', 'r2', 'r3'], added: ['r3'], removed: [] }, null]);
    assert.deepEqual(api.getSelectedRowIds(), ['r1', 'r2'], 'cancelled');
  });

  it('previews cell and column commands: proposed ranges, added / removed cells and columns', () => {
    type P = {
      changes: { rows: boolean; cells: boolean; columns: boolean };
      cellRanges: readonly unknown[];
      addedCells: readonly { rowId: string; columnId: string }[];
      removedCells: readonly { rowId: string; columnId: string }[];
      columnIds: readonly string[];
      addedColumns: readonly string[];
      removedColumns: readonly string[];
      added: readonly string[];
    };
    const { engine, api } = make({ type: 'multiple', mode: 'cell', columns: true, cellSelectionMode: 'box' });
    const preview = (c: object): P | null => (engine as unknown as { selection: { preview(c: object): P | null } }).selection.preview(c);
    const cell = (rowId: string, columnId: string) => ({ rowId, columnId });
    // Cell mode: a box range previews every covered cell; nothing is committed.
    const range = preview({ type: 'selection.setCellRange', anchor: cell('r1', 'id'), focus: cell('r2', 'n') })!;
    assert.deepEqual(range.changes, { rows: false, cells: true, columns: false });
    assert.equal(range.cellRanges.length, 1);
    assert.deepEqual(range.addedCells, [cell('r1', 'id'), cell('r1', 'n'), cell('r2', 'id'), cell('r2', 'n')]);
    assert.deepEqual(range.removedCells, []);
    assert.deepEqual(range.added, []);
    assert.equal(api.getSelection()?.cellRanges.length, 0, 'preview does not commit');
    api.selectCellRange(cell('r1', 'id'), cell('r2', 'n'));
    // Replacing the range: the cells that leave and join.
    const moved = preview({ type: 'selection.selectCells', cells: [cell('r2', 'n'), cell('r3', 'g')] })!;
    assert.deepEqual(moved.addedCells, [cell('r3', 'g')]);
    assert.deepEqual(moved.removedCells, [cell('r1', 'id'), cell('r1', 'n'), cell('r2', 'id')]);
    // Unchanged cells: null (no event).
    assert.equal(preview({ type: 'selection.setCellRange', anchor: cell('r1', 'id'), focus: cell('r2', 'n') }), null);
    // Row commands are rejected in cell mode: no preview.
    assert.equal(preview({ type: 'selection.selectRows', rowIds: ['r1'] }), null);
    // Columns.
    const cols = preview({ type: 'selection.selectColumns', columnIds: ['n', 'g'] })!;
    assert.deepEqual(cols.changes, { rows: false, cells: false, columns: true });
    assert.deepEqual([...cols.columnIds], ['n', 'g']);
    assert.deepEqual(cols.addedColumns, ['n', 'g']);
    api.selectColumns(['n', 'g']);
    const toggled = preview({ type: 'selection.selectColumns', columnIds: ['g'], mode: 'toggle' })!;
    assert.deepEqual(toggled.removedColumns, ['g']);
    assert.deepEqual(toggled.addedColumns, []);
    // clear: every part at once.
    const cleared = preview({ type: 'selection.clear' })!;
    assert.deepEqual(cleared.changes, { rows: false, cells: true, columns: true });
    assert.equal(cleared.removedCells.length, 4);
    assert.deepEqual(cleared.removedColumns, ['n', 'g']);
    // Flow ranges cover reading order across rows.
    const flow = make({ type: 'multiple', mode: 'both' });
    const fp = (flow.engine as unknown as { selection: { preview(c: object): P | null } }).selection.preview({ type: 'selection.setCellRange', anchor: cell('r1', 'g'), focus: cell('r2', 'n') })!;
    assert.deepEqual(fp.addedCells, [cell('r1', 'g'), cell('r2', 'id'), cell('r2', 'n')]);
    assert.deepEqual(fp.changes, { rows: false, cells: true, columns: false });
  });
});

describe('selection notifications and cost', () => {
  it('toggling one row notifies that row and the module channel only', () => {
    const { engine, api } = make({ type: 'multiple' }, 1000);
    const ids = Array.from({ length: 30 }, (_, i) => `r${i}`);
    const rows = rowNotifications(engine, ids);
    let module = 0;
    engine.subscribeModule('selection', () => module++);
    let grid = 0;
    engine.subscribe(() => grid++);
    api.toggleRowSelection('r7');
    assert.deepEqual(rows.hits, ['r7']);
    assert.equal(module, 1);
    assert.equal(grid, 0, 'grid subscribers are not notified');
    api.toggleRowSelection('r7');
    assert.deepEqual(rows.hits, ['r7', 'r7']);
    rows.off();
  });

  it('100k rows: toggle is O(1), select all filtered is O(1), a 50k range is fast @perf', () => {
    const { engine, api, state, summary } = make({ type: 'multiple' }, 100_000);
    const rendered = Array.from({ length: 30 }, (_, i) => `r${i + 1000}`);
    const rows = rowNotifications(engine, rendered);
    // Select everything explicitly first so a toggle has a large set to (not) copy.
    api.selectRowRange('r0', 'r99999');
    assert.equal(state().rows.ids.size, 100_000);
    const set = state().rows.ids;
    rows.hits.length = 0;
    let t = performance.now();
    for (let i = 0; i < 1000; i++) api.toggleRowSelection(`r${i * 50}`);
    const toggleMs = (performance.now() - t) / 1000;
    assert.equal(state().rows.ids, set, 'toggles update the set in place (no copy)');
    assertBudget(toggleMs, 0.2, 'toggle row selection (100k rows)', { strict: true });
    assert.deepEqual(rows.hits, ['r1000'], 'only the subscribed row that flipped');

    t = performance.now();
    api.selectAllFiltered();
    const allMs = performance.now() - t;
    assert.equal(summary().count, 100_000);
    assertBudget(allMs, 5, 'select all filtered (100k rows)', { strict: true });

    api.clearSelection();
    rows.hits.length = 0;
    api.selectRows('r0');
    t = performance.now();
    api.selectRowRange('r0', 'r49999');
    const rangeMs = performance.now() - t;
    assert.equal(summary().count, 50_000);
    assertBudget(rangeMs, 16, '50k range selection', { strict: true });
    // Large changes notify the subscribed rows, never all 50k ids.
    assert.equal(new Set(rows.hits).size, rendered.length);
    console.log(`[perf] toggle ${toggleMs.toFixed(4)} ms, select-all-filtered ${allMs.toFixed(3)} ms, 50k range ${rangeMs.toFixed(2)} ms (core)`);
    rows.off();
  });
});
