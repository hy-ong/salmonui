// Controlled props and versioned persistence without a DOM: every reactive state prop changed after mount is applied to the
// engine through `syncProps`, a structurally equal new object dispatches
// nothing, and `persistState: { version, migrate }` discards, upgrades or
// drops a stored state saved under another application version.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import type { DataGridState, DataGridStateStorageAdapter } from '@salmonui/data-grid/engine/persistence';
import type { SortState } from '@salmonui/data-grid/engine';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { people, personColumns, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make(props: Partial<DataGridProps<Person>>) {
  let current = { data: people(40), columns: personColumns, 'aria-label': 'People', ...props } as DataGridProps<Person>;
  const instance = newInstance<Person>(current as never, `:s${seq++}:`);
  const unmount = instance.mount();
  const commands: string[] = [];
  instance.engine.onCommand((e) => commands.push(e.command.type));
  const update = (next: Partial<DataGridProps<Person>>) => {
    current = { ...current, ...next } as DataGridProps<Person>;
    instance.syncProps(current as never);
  };
  const state = () => instance.api.getState();
  return { instance, api: instance.api, update, commands, state, unmount };
}

const clone = <T>(value: T): T => structuredClone(value);

describe('controlled props through syncProps', () => {
  it('sorting.sortBy, filtering.filters, grouping.groupBy and paging page / pageSize changes are applied; equal objects are no-ops', () => {
    const sortBy = [{ field: 'age', direction: 'asc' as const }];
    const filters = [{ field: 'name', operator: 'contains' as const, value: 'Person' }];
    const m = make({
      sorting: { sortBy },
      filtering: { filters },
      grouping: { groupBy: [] },
      paging: { pageSize: 10, page: 1 },
    });
    const sortOf = () => m.instance.engine.getModuleState<SortState>('sort')?.sorting.map((s) => `${s.columnId}:${s.direction}`);

    // Structurally equal new objects: nothing dispatched, nothing changed.
    const before = JSON.stringify(m.state());
    m.update({ sorting: { sortBy: clone(sortBy) }, filtering: { filters: clone(filters) }, grouping: { groupBy: [] }, paging: { pageSize: 10, page: 1 } });
    assert.deepEqual(m.commands, []);
    assert.equal(JSON.stringify(m.state()), before);

    m.update({ sorting: { sortBy: [{ field: 'name', direction: 'desc' }] } });
    assert.deepEqual(sortOf(), ['name:desc']);
    assert.deepEqual(m.commands, ['sort.set']);

    m.update({ filtering: { filters: [{ field: 'age', operator: 'greaterThan', value: 50 }] } });
    assert.equal(m.instance.engine.getSnapshot().rows.count > 0, true);
    assert.equal(m.api.getFilteredRows().every((r) => r.age > 50), true);
    assert.equal(m.commands.at(-1), 'filter.set');

    m.update({ filtering: { filters: [] } });
    assert.equal(m.api.getFilteredRows().length, 40);

    m.update({ grouping: { groupBy: ['active'] } });
    assert.deepEqual(m.state().grouping, ['active']);
    assert.equal(m.commands.at(-1), 'grouping.set');
    m.update({ grouping: { groupBy: [] } });
    assert.deepEqual(m.state().grouping, []);

    m.update({ paging: { pageSize: 10, page: 3 } });
    assert.equal(m.api.getPageInfo()?.page, 3);
    // A pageSize change alone keeps the first row on screen (row 21 -> page 5 of size 5).
    m.update({ paging: { pageSize: 5, page: 3 } });
    assert.equal(m.api.getPageInfo()?.pageSize, 5);
    assert.equal(m.api.getPageInfo()?.page, 5);
    // pageSize and page changed together: the page prop is applied after the size.
    m.update({ paging: { pageSize: 10, page: 2 } });
    assert.equal(m.api.getPageInfo()?.pageSize, 10);
    assert.equal(m.api.getPageInfo()?.page, 2);
    m.update({ paging: { pageSize: 5, page: 2 } });
    assert.equal(m.api.getPageInfo()?.pageSize, 5);

    // Equal again after the changes: no further commands.
    const count = m.commands.length;
    m.update({ sorting: { sortBy: [{ field: 'name', direction: 'desc' }] }, filtering: { filters: [] }, grouping: { groupBy: [] }, paging: { pageSize: 5, page: 2 } });
    assert.equal(m.commands.length, count);
    m.unmount();
  });

  it('column hidden, width, pinned and array order changes are applied as commands; an equal columns array is a no-op', () => {
    const m = make({});
    const leaves = () => m.instance.engine.getSnapshot().columns.visible.map((c) => c.columnId);
    const widthOf = (id: string) => m.instance.layout.getColumnLayout().widths.get(id);
    assert.deepEqual(leaves(), ['id', 'name', 'age', 'active', 'joined']);

    m.update({ columns: personColumns.map((c) => ({ ...c })) as DataGridColumn<Person>[] });
    assert.deepEqual(m.commands, []);

    m.update({ columns: personColumns.map((c) => (c.field === 'age' ? { ...c, hidden: true } : c)) });
    assert.deepEqual(leaves(), ['id', 'name', 'active', 'joined']);
    assert.deepEqual(m.commands, ['columns.setVisibility']);

    m.update({ columns: personColumns.map((c) => (c.field === 'name' ? { ...c, width: 222 } : c)) });
    assert.deepEqual(leaves(), ['id', 'name', 'age', 'active', 'joined']);
    assert.equal(widthOf('name'), 222);

    m.update({ columns: personColumns.map((c) => (c.field === 'name' ? { ...c, width: 222, pinned: 'end' as const } : c)) });
    assert.deepEqual(m.state().pinning?.columns, { name: 'end' });
    assert.equal(m.commands.at(-1), 'columns.setFreeze');

    const reordered = [personColumns[0], personColumns[4], personColumns[1], personColumns[2], personColumns[3]].map((c) =>
      c?.field === 'name' ? { ...c, width: 222, pinned: 'end' as const } : c,
    ) as DataGridColumn<Person>[];
    m.update({ columns: reordered });
    assert.deepEqual((m.state().columns ?? []).map((c) => c.id), ['id', 'joined', 'name', 'age', 'active']);
    assert.equal(m.commands.at(-1), 'columns.setOrder');

    const count = m.commands.length;
    m.update({ columns: reordered.map((c) => ({ ...c })) });
    assert.equal(m.commands.length, count);
    m.unmount();
  });

  it('selection.rowIds changes select the rows; an equal list and the already-selected rows are no-ops', () => {
    const m = make({ selection: { multiple: true, rowIds: ['p1'] } });
    assert.deepEqual([...m.api.getSelectedRowIds()], ['p1']);
    m.update({ selection: { multiple: true, rowIds: ['p1'] } });
    assert.deepEqual(m.commands, []);
    m.update({ selection: { multiple: true, rowIds: ['p2', 'p3'] } });
    assert.deepEqual([...m.api.getSelectedRowIds()].sort(), ['p2', 'p3']);
    assert.deepEqual(m.commands, ['selection.selectRows']);
    // A new list naming the rows the engine already has selected dispatches nothing.
    m.update({ selection: { multiple: true, rowIds: ['p3', 'p2'] } });
    assert.deepEqual(m.commands, ['selection.selectRows']);
    m.unmount();
  });
});

function memoryStorage(initial: Record<string, unknown> = {}): DataGridStateStorageAdapter & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    load: (key) => (data.has(key) ? (data.get(key) as DataGridState | string) : null),
    save: (key, state) => {
      data.set(key, JSON.stringify(state));
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}

/** A grid state with an age-descending sort, saved under the application `appVersion`. */
function storedState(appVersion: number | undefined): string {
  const m = make({ sorting: { sortBy: [{ field: 'age', direction: 'desc' }] } });
  const state = m.api.getState() as Record<string, unknown>;
  m.unmount();
  return JSON.stringify(appVersion === undefined ? state : { ...state, appVersion });
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function mountWith(storage: DataGridStateStorageAdapter, persist: Record<string, unknown>) {
  const m = make({ id: `persist${seq}`, sorting: true, persistState: { key: 'k', storage, ...persist } as never });
  await tick();
  const sorting = m.instance.engine.getModuleState<SortState>('sort')?.sorting.map((s) => `${s.columnId}:${s.direction}`);
  return { m, sorting };
}

describe('persistState version and migrate', () => {
  it('a stored state saved under the same persistState.version is restored', async () => {
    const { m, sorting } = await mountWith(memoryStorage({ k: storedState(2) }), { version: 2 });
    assert.deepEqual(sorting, ['age:desc']);
    m.unmount();
  });

  it('a stored state saved under another version (or none) is discarded without migrate', async () => {
    for (const saved of [1, undefined]) {
      const { m, sorting } = await mountWith(memoryStorage({ k: storedState(saved) }), { version: 2 });
      assert.deepEqual(sorting, [], `saved under ${saved}`);
      m.unmount();
    }
  });

  it('migrate upgrades a state of another version and receives the stored version', async () => {
    const calls: number[] = [];
    const migrate = (state: Record<string, unknown>, version: number) => {
      calls.push(version);
      return { ...state, sorting: [{ field: 'name', direction: 'asc' }] } as unknown as DataGridState;
    };
    const { m, sorting } = await mountWith(memoryStorage({ k: storedState(1) }), { version: 2, migrate });
    assert.deepEqual(calls.includes(1), true);
    assert.deepEqual(sorting, ['name:asc']);
    m.unmount();
  });

  it('a stored state is discarded when migrate returns null', async () => {
    let called = 0;
    const { m, sorting } = await mountWith(memoryStorage({ k: storedState(1) }), {
      version: 2,
      migrate: () => {
        called++;
        return null;
      },
    });
    assert.equal(called > 0, true);
    assert.deepEqual(sorting, []);
    m.unmount();
  });

  it('saved states are tagged with the application version', async () => {
    const storage = memoryStorage();
    const { m } = await mountWith(storage, { version: 7 });
    m.api.sortColumn('age', 'asc');
    await tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
    const raw = storage.data.get('k');
    assert.equal(typeof raw, 'string');
    assert.equal((JSON.parse(raw as string) as { appVersion: number }).appVersion, 7);
    m.unmount();
  });
});
