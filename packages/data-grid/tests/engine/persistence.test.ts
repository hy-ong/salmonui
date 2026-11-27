import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFilterModule,
  createDataGridEngine,
  createGroupingModule,
  createPagingModule,
  createSearchModule,
  createSelectionModule,
  createSortModule,
  type DataGridState,
} from '@salmonui/data-grid/engine';
import {
  createDataGridPersistence,
  createDataGridStateApi,
  deserializeDataGridState,
  getDataGridState,
  normalizeDataGridState,
  restoreDataGridState,
  serializeDataGridState,
} from '@salmonui/data-grid/engine/persistence';
import { people, personColumns, type Person } from './fixtures.ts';

function make(rows = people(30)) {
  return createDataGridEngine({
    id: 'orders',
    getRowId: (r: Person) => r.id,
    columns: personColumns,
    dataSource: rows,
    dev: true,
    instrument: true,
    paging: { pageSize: 10 },
    modules: [
      createSortModule<Person>(),
      createFilterModule<Person>(),
      createSearchModule<Person>(),
      createGroupingModule<Person>(),
      createPagingModule<Person>(),
      createSelectionModule<Person>(),
    ],
  });
}

function customize(engine: ReturnType<typeof make>): void {
  engine.batch(() => {
    engine.dispatch({ type: 'columns.setOrder', order: ['name', 'id'] });
    engine.dispatch({ type: 'columns.setWidths', widths: { name: 240 } });
    engine.dispatch({ type: 'columns.hide', keys: ['active'] });
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'age', direction: 'desc' }] });
    engine.dispatch({ type: 'filter.byColumn', columnId: 'name', operator: 'startsWith', value: 'Person 1' });
    engine.dispatch({ type: 'search.set', text: 'Person' });
    engine.dispatch({ type: 'grouping.set', grouping: [{ columnId: 'address.city' }] });
    engine.dispatch({ type: 'paging.setPageSize', pageSize: 5 });
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
  });
  engine.dispatch({ type: 'selection.selectRows', rowIds: ['p14'] });
}

const json = (state: DataGridState): string => serializeDataGridState(state);

describe('state persistence', () => {
  it('reads columns, sorting, filters, grouping, paging, search, selection, and scroll', () => {
    const engine = make();
    customize(engine);
    const state = getDataGridState(engine);
    assert.equal(state.version, 1);
    assert.deepEqual(state.columns?.slice(0, 3).map((c) => [c.id, c.hidden, c.width]), [
      ['name', false, 240],
      ['id', false, undefined],
      ['age', false, undefined],
    ]);
    assert.equal(state.columns?.find((c) => c.id === 'active')?.hidden, true);
    assert.deepEqual(state.sorting, [{ field: 'age', direction: 'desc' }]);
    assert.deepEqual(state.filters, [{ field: 'name', operator: 'startsWith', value: 'Person 1', logic: 'and' }]);
    assert.deepEqual(state.grouping, ['address.city']);
    assert.deepEqual(state.paging, { page: 2, pageSize: 5 });
    assert.equal(state.search?.text, 'Person');
    assert.deepEqual(state.selection?.rowIds, ['p14']);
    assert.deepEqual(state.scroll, { top: 0, left: 0 });
    assert.ok(Object.isFrozen(state.columns));
  });

  it('round-trips into a fresh engine in one batch without recompiling', () => {
    const source = make();
    customize(source);
    const saved = serializeDataGridState(getDataGridState(source));
    const target = make();
    let notifications = 0;
    target.subscribe(() => notifications++);
    const result = restoreDataGridState(target, saved);
    assert.equal(result.status, 'applied');
    assert.equal(notifications, 1, 'one batch');
    assert.equal(json(getDataGridState(target)), saved);
    assert.equal(target.getInstrumentation()?.columnCompiles, 1);
    assert.deepEqual(
      target.getSnapshot().columns.visible.slice(0, 2).map((c) => c.columnId),
      ['name', 'id'],
    );
    const commands = target.getInstrumentation()?.commands ?? 0;
    restoreDataGridState(target, saved);
    assert.equal((target.getInstrumentation()?.commands ?? 0) - commands, 0, 'restoring the same state dispatches nothing');
  });

  it('restores a partial state and reports unknown columns', () => {
    const engine = make();
    const result = restoreDataGridState(engine, {
      version: 1,
      sorting: [
        { field: 'name', direction: 'asc' },
        { field: 'gone', direction: 'desc' },
      ],
      filters: [{ field: 'age', operator: 'greaterThan', value: 40, logic: 'and' }],
      paging: { page: 1, pageSize: 3 },
    });
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.ignoredColumns, ['gone']);
    assert.deepEqual(engine.getSnapshot().query.sorting, [{ columnId: 'name', direction: 'asc' }]);
    assert.equal(engine.getSnapshot().query.filters.length, 1);
    assert.equal(engine.getSnapshot().rows.count, 3);
  });

  it('persists and restores negated filter groups', () => {
    const engine = make();
    const group = { kind: 'group' as const, logic: 'and' as const, not: true, filters: [{ field: 'age', operator: 'greaterThan', value: 40, logic: 'and' as const }] };
    restoreDataGridState(engine, { version: 1, filters: [group], paging: { page: 1, pageSize: 100 } });
    const entry = engine.getSnapshot().query.filters[0] as { kind?: string; not?: boolean };
    assert.equal(entry.kind, 'group');
    assert.equal(entry.not, true);
    assert.deepEqual(getDataGridState(engine).filters, [group]);
    assert.deepEqual(normalizeDataGridState({ version: 1, filters: [group] }).filters, [group]);
  });

  it('exclude limits reads and restores; the state API resets', () => {
    const engine = make();
    const api = createDataGridStateApi(engine);
    customize(engine);
    const only = api.getState({ exclude: ['columns', 'pinning', 'filters', 'grouping', 'search', 'selection', 'scroll'] });
    assert.deepEqual(Object.keys(only).sort(), ['paging', 'sorting', 'version']);
    const target = make();
    restoreDataGridState(target, getDataGridState(engine), { exclude: ['filters', 'grouping', 'search', 'paging', 'selection'] });
    assert.equal(target.getSnapshot().query.sorting.length, 1);
    assert.equal(target.getSnapshot().query.filters.length, 0);
    assert.equal(target.getSnapshot().query.grouping.length, 0);
    assert.equal(api.resetState().status, 'applied');
    assert.equal(engine.getSnapshot().query.sorting.length, 0);
    assert.equal(engine.getSnapshot().query.grouping.length, 0);
    assert.equal(api.restoreState(only).status, 'applied');
    assert.equal(engine.getSnapshot().query.sorting.length, 1);
  });

  it('serializes deterministically and URL-safely; rejects unknown versions', () => {
    const engine = make();
    customize(engine);
    const state = getDataGridState(engine);
    const text = serializeDataGridState(state);
    assert.match(text, /^[A-Za-z0-9_-]+$/);
    assert.equal(serializeDataGridState(deserializeDataGridState(text)), text);
    assert.equal(serializeDataGridState(deserializeDataGridState(JSON.stringify(state))), text);
    const unicode = normalizeDataGridState({ version: 1, search: { text: 'Crème 東京 😀', fields: [], operator: 'contains', matchCase: false, ignoreAccents: false } });
    assert.equal(deserializeDataGridState(serializeDataGridState(unicode)).search?.text, 'Crème 東京 😀');
    assert.throws(() => deserializeDataGridState(JSON.stringify({ version: 2 })), /version 2/);
    const migrated = deserializeDataGridState(JSON.stringify({ version: 0, sort: 'age' }), {
      migrate: (raw) => ({ version: 1, sorting: [{ field: String(raw['sort']), direction: 'asc' }] }),
    });
    assert.equal(migrated.sorting?.[0]?.field, 'age');
    assert.throws(() => deserializeDataGridState('not a state!'), /deserializeDataGridState/);
  });

  it('binds an injected storage: coalesced saves, load, reset', async () => {
    const store = new Map<string, unknown>();
    const saves: string[] = [];
    const storage = {
      load: async (key: string) => store.get(key) ?? null,
      save: async (key: string, state: DataGridState) => {
        saves.push(key);
        store.set(key, JSON.stringify(state));
      },
      remove: (key: string) => store.delete(key),
    };
    const a = make();
    const persistence = createDataGridPersistence(a, { storage });
    assert.equal(await persistence.load(), null);
    customize(a);
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(saves, ['orders'], 'one coalesced save');
    await persistence.save();
    assert.equal(saves.length, 1, 'unchanged state is not saved again');

    const b = make();
    const restored = createDataGridPersistence(b, { storage });
    const result = await restored.load();
    assert.equal(result?.status, 'applied');
    assert.equal(json(getDataGridState(b)), json(getDataGridState(a)));
    await Promise.resolve();
    assert.equal(saves.length, 1, 'restoring does not save');
    const reset = await restored.reset();
    assert.equal(reset.status, 'applied');
    assert.equal(b.getSnapshot().query.sorting.length, 0);
    assert.equal(store.has('orders'), false);
    restored.dispose();
    persistence.dispose();
  });

  it('persists runtime pinning: counts and per-column pins', () => {
    const source = make();
    source.batch(() => {
      source.dispatch({ type: 'columns.setFrozenCount', left: 1 });
      source.dispatch({ type: 'columns.setFreeze', columnId: 'age', freeze: 'right' });
    });
    const state = getDataGridState(source);
    assert.deepEqual(state.pinning, { start: 1, end: 0, columns: { age: 'end' } });
    const target = make();
    const result = restoreDataGridState(target, serializeDataGridState(state));
    assert.equal(result.status, 'applied');
    const snap = target.getSnapshot().columns;
    assert.deepEqual(snap.left.map((c) => c.columnId), ['id']);
    assert.deepEqual(snap.right.map((c) => c.columnId), ['age']);
    assert.equal(target.getInstrumentation()?.columnCompiles, 1, 'no recompile');
    assert.equal(json(getDataGridState(target)), json(state));
    const without = make();
    restoreDataGridState(without, state, { exclude: ['pinning'] });
    assert.equal(without.getSnapshot().columns.left.length, 0);
    assert.deepEqual(normalizeDataGridState({ version: 1, pinning: { start: -1, end: 2.7, columns: { a: 'start', b: 'x' } } }).pinning, { start: 0, end: 2, columns: { a: 'start', b: null } });
  });

  it('saves after a pin change even when only pinning is tracked', async () => {
    const saves: DataGridState[] = [];
    const engine = make();
    const persistence = createDataGridPersistence(engine, { storage: { load: () => null, save: (_key, state) => saves.push(state) }, exclude: ['columns', 'scroll'] });
    engine.dispatch({ type: 'columns.setFrozenCount', left: 2 });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(saves.length, 1);
    assert.equal(saves[0]?.pinning?.start, 2);
    persistence.dispose();
  });
});
