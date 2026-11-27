// Named saved views: createSavedViews over a key-value store,
// end to end with data-grid-core getDataGridState / restoreDataGridState.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMemoryStore, createSavedViews, SAVED_VIEW_SCHEMA_VERSION, type SavedView } from '@salmonui/data';
import { createSavedViews as fromSubpath } from '@salmonui/data/views';
import { createDataGridEngine, createSortModule } from '@salmonui/data-grid/engine';
import { getDataGridState, restoreDataGridState, serializeDataGridState, type DataGridState } from '@salmonui/data-grid/engine/persistence';

const state = (n: number): DataGridState => ({ version: 1, sorting: [{ columnId: `c${n}`, direction: 'asc' }] }) as unknown as DataGridState;

function setup(map = new Map<string, string>()) {
  let clock = 1000;
  let ids = 0;
  const views = createSavedViews<DataGridState>(createMemoryStore(map), {
    gridId: 'orders',
    now: () => clock,
    createId: () => `v${++ids}`,
  });
  return { map, views, tick: (ms = 10) => (clock += ms) };
}

describe('createSavedViews', () => {
  it('is exported from the root and the ./views subpath', () => {
    assert.equal(fromSubpath, createSavedViews);
    assert.equal(SAVED_VIEW_SCHEMA_VERSION, 1);
  });

  it('creates, lists, gets, replaces, renames and removes views under one key per grid', async () => {
    const { map, views, tick } = setup();
    assert.deepEqual(await views.list(), []);
    const a = await views.save({ name: 'Open orders', description: 'Unshipped', state: state(1) });
    tick();
    const b = await views.save({ name: 'By country', state: state(2) });
    assert.deepEqual(a, { id: 'v1', name: 'Open orders', description: 'Unshipped', state: state(1), createdAt: 1000, updatedAt: 1000, schemaVersion: 1 });
    assert.equal(b.id, 'v2');
    assert.deepEqual([...map.keys()], ['salmonui:grid-views:orders']);
    assert.deepEqual((await views.list()).map((v) => v.name), ['Open orders', 'By country']);
    assert.deepEqual(await views.get('v2'), b);
    assert.equal(await views.get('missing'), null);

    tick();
    const replaced = await views.save({ id: 'v1', name: 'Open orders', state: state(3) });
    assert.equal(replaced.createdAt, 1000, 'replacing keeps createdAt');
    assert.equal(replaced.updatedAt, 1020);
    assert.equal(replaced.description, undefined);
    assert.deepEqual((await views.list()).map((v) => v.id), ['v1', 'v2'], 'replacing keeps the position');

    const renamed = await views.rename('v2', 'Per country', 'Grouped');
    assert.equal(renamed?.name, 'Per country');
    assert.equal(renamed?.description, 'Grouped');
    assert.equal((await views.rename('v2', 'Countries'))?.description, 'Grouped', 'description is kept when omitted');
    assert.equal(await views.rename('missing', 'x'), null);

    assert.equal(await views.remove('v1'), true);
    assert.equal(await views.remove('v1'), false);
    assert.deepEqual((await views.list()).map((v) => v.id), ['v2']);
    await views.clear();
    assert.equal(map.size, 0, 'an empty view list removes the key');
  });

  it('serializes concurrent writes so no view is lost', async () => {
    const { views } = setup();
    await Promise.all(Array.from({ length: 10 }, (_, i) => views.save({ name: `View ${i}`, state: state(i) })));
    assert.equal((await views.list()).length, 10);
  });

  it('works over an async store and notifies subscribers after each change', async () => {
    const map = new Map<string, string>();
    const sync = createMemoryStore(map);
    const store = {
      getItem: async (k: string) => sync.getItem(k),
      setItem: async (k: string, v: string) => sync.setItem(k, v),
      removeItem: async (k: string) => sync.removeItem(k),
    };
    const views = createSavedViews(store, { gridId: 'g', prefix: 'app:' });
    const seen: number[] = [];
    const off = views.subscribe((list) => seen.push(list.length));
    const v = await views.save({ name: 'One', state: state(1) });
    assert.equal(typeof v.id, 'string');
    assert.ok(v.id.length > 0);
    assert.ok(map.has('app:g'));
    await views.save({ name: 'Two', state: state(2) });
    off();
    await views.remove(v.id);
    assert.deepEqual(seen, [1, 2]);
  });

  it('skips unreadable records and migrates older record schemas', async () => {
    const map = new Map<string, string>();
    map.set('salmonui:grid-views:orders', 'not json');
    assert.deepEqual(await setup(map).views.list(), []);

    map.set(
      'salmonui:grid-views:orders',
      JSON.stringify({
        v: 1,
        views: [
          { id: 'old', title: 'Legacy', grid: state(1), created: 5 },
          { id: 'bad', name: 'No state', createdAt: 1, updatedAt: 1, schemaVersion: 1 },
          { id: 'ok', name: 'Current', state: state(2), createdAt: 1, updatedAt: 2, schemaVersion: 1 },
        ],
      }),
    );
    const migrated: number[] = [];
    const views = createSavedViews(createMemoryStore(map), {
      gridId: 'orders',
      migrate: (raw, schemaVersion): SavedView | null => {
        migrated.push(schemaVersion);
        if (typeof raw['title'] !== 'string') return null;
        return { id: raw['id'] as string, name: raw['title'], state: raw['grid'] as DataGridState, createdAt: raw['created'] as number, updatedAt: raw['created'] as number, schemaVersion: SAVED_VIEW_SCHEMA_VERSION };
      },
    });
    assert.deepEqual((await views.list()).map((v) => `${v.id}:${v.name}`), ['old:Legacy', 'ok:Current']);
    assert.deepEqual(migrated, [0, 1], 'the legacy record and the invalid current one go through migrate');
  });

  it('round-trips a grid view through getDataGridState and restoreDataGridState', async () => {
    type Row = { id: string; n: number };
    const make = () =>
      createDataGridEngine({
        id: 'orders',
        getRowId: (r: Row) => r.id,
        columns: [{ field: 'id' }, { field: 'n', type: 'number' as const }],
        dataSource: [
          { id: 'a', n: 2 },
          { id: 'b', n: 1 },
        ],
        modules: [createSortModule<Row>()],
      });
    const { views } = setup();
    const a = make();
    a.sort.set({ sorting: [{ columnId: 'n', direction: 'desc' }] });
    const saved = await views.save({ name: 'Largest first', state: getDataGridState(a) });
    const b = make();
    const view = await views.get(saved.id);
    assert.ok(view);
    assert.equal(restoreDataGridState(b, view.state).status, 'applied');
    assert.equal(serializeDataGridState(getDataGridState(b)), serializeDataGridState(getDataGridState(a)));
  });
});
