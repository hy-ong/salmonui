import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFilterModule, createDataGridEngine, createLocalDataSource, createSortModule, type ColumnDef, type FilterState, type SortState } from '@salmonui/data-grid/engine';

// Runtime options of the sort and filter modules (`sort.setOptions`,
// `filter.setOptions`): the reactive `allowSorting`, `allowMultiSorting`,
// `sortSettings.allowUnsort`, `allowFiltering`, `enableCaseSensitivity`, and
// `ignoreAccent` props of the React DataGrid dispatch them.

interface Item {
  readonly id: string;
  readonly name: string;
  readonly qty: number;
}

const rows: Item[] = [
  { id: 'a', name: 'Apple', qty: 3 },
  { id: 'b', name: 'apple', qty: 1 },
  { id: 'c', name: 'Crème', qty: 2 },
  { id: 'd', name: 'creme', qty: 2 },
];
const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'name' }, { field: 'qty', type: 'number' }];

function engine(options: { sort?: object; filter?: object } = {}) {
  return createDataGridEngine({
    columns,
    getRowId: (r: Item) => r.id,
    dataSource: createLocalDataSource(rows, { getRowId: (r) => r.id }),
    modules: [createSortModule<Item>(), createFilterModule<Item>()],
    ...(options.sort ? { sort: options.sort } : {}),
    ...(options.filter ? { filter: options.filter } : {}),
  });
}

const ids = (e: ReturnType<typeof engine>): string[] => {
  const out: string[] = [];
  for (let i = 0; i < e.getSnapshot().rows.count; i++) out.push(e.getRowIdAt(i) as string);
  return out;
};

describe('sort.setOptions', () => {
  it('toggles interactive sorting, multi-sort mode, and allowUnsort at runtime', () => {
    const e = engine({ sort: { enabled: false, mode: 'single' } });
    assert.equal(e.dispatch({ type: 'sort.toggle', columnId: 'qty' }).status, 'rejected');
    assert.equal(e.dispatch({ type: 'sort.setOptions', enabled: true }).status, 'applied');
    e.dispatch({ type: 'sort.toggle', columnId: 'qty' });
    e.dispatch({ type: 'sort.toggle', columnId: 'name', multi: true });
    assert.deepEqual(e.getSnapshot().query.sorting.map((s) => s.columnId), ['name'], 'single mode replaces');
    e.dispatch({ type: 'sort.setOptions', mode: 'multiple' });
    e.dispatch({ type: 'sort.toggle', columnId: 'qty', multi: true });
    assert.deepEqual(e.getSnapshot().query.sorting.map((s) => s.columnId), ['name', 'qty']);
    e.dispatch({ type: 'sort.setOptions', mode: 'single' });
    assert.deepEqual(e.getSnapshot().query.sorting.map((s) => s.columnId), ['name'], 'switching to single keeps the primary sort');
    e.dispatch({ type: 'sort.setOptions', allowUnsort: false });
    e.dispatch({ type: 'sort.toggle', columnId: 'name' });
    e.dispatch({ type: 'sort.toggle', columnId: 'name' });
    assert.equal(e.getSnapshot().query.sorting[0]?.direction, 'asc', 'without allowUnsort the third click sorts ascending again');
    const state = e.getModuleState<SortState>('sort') as SortState;
    assert.deepEqual([state.enabled, state.mode, state.allowUnsort], [true, 'single', false]);
  });

  it('is a no-op for unchanged options and rejects invalid values', () => {
    const e = engine();
    const before = e.getModuleState('sort');
    e.dispatch({ type: 'sort.setOptions', enabled: true, mode: 'multiple' });
    assert.equal(e.getModuleState('sort'), before);
    assert.equal(e.dispatch({ type: 'sort.setOptions', mode: 'many' as never }).status, 'rejected');
  });
});

describe('filter.setOptions', () => {
  it('enables filtering and switches case and accent sensitivity, re-running the filter stage', () => {
    const e = engine({ filter: { enabled: false } });
    assert.equal(e.dispatch({ type: 'filter.byColumn', columnId: 'name', operator: 'equal', value: 'apple' }).status, 'rejected');
    e.dispatch({ type: 'filter.setOptions', enabled: true });
    e.dispatch({ type: 'filter.byColumn', columnId: 'name', operator: 'equal', value: 'apple' });
    assert.deepEqual(ids(e), ['a', 'b']);
    e.dispatch({ type: 'filter.setOptions', caseSensitive: true });
    assert.deepEqual(ids(e), ['b']);
    e.dispatch({ type: 'filter.byColumn', columnId: 'name', operator: 'equal', value: 'creme' });
    assert.deepEqual(ids(e), ['d']);
    e.dispatch({ type: 'filter.setOptions', ignoreAccent: true });
    assert.deepEqual(ids(e), ['d'], 'case-sensitive still excludes Crème');
    e.dispatch({ type: 'filter.setOptions', caseSensitive: false });
    assert.deepEqual(ids(e), ['c', 'd']);
    const state = e.getModuleState<FilterState>('filter') as FilterState;
    assert.deepEqual([state.enabled, state.caseSensitive, state.ignoreAccent], [true, false, true]);
    assert.equal(e.dispatch({ type: 'filter.setOptions', enabled: 'yes' as never }).status, 'rejected');
  });
});
