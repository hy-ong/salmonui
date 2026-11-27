import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFocusModule, createDataGridEngine, createSelectionModule, createSortModule, type ColumnDef, type EditMethods, type EditOptions, type EditState, type DataSource, type WriteRequest, type WriteResult } from '@salmonui/data-grid/engine';
import { createEditApi, createEditModule, EDIT_EDITING, EDIT_LOCKED, EDIT_NEW, EDIT_ROW_EDITING } from '@salmonui/data-grid/engine/edit';
import { BLANK_ROW_ID_PREFIX, createInitialEditState, showsNewRow } from '@salmonui/data-grid/engine/edit-state';

// the always-visible add row (`showNewRow`).

interface Item {
  readonly id: string;
  readonly name: string;
  readonly qty: number;
}

const columns: ColumnDef<Item>[] = [
  { field: 'id', primaryKey: true },
  { field: 'name', validation: { required: true } },
  { field: 'qty', type: 'number', defaultValue: 1 },
];

function items(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({ id: `r${i}`, name: `n${i}`, qty: i }));
}

function make(edit: EditOptions<Item> = {}, dataSource: DataSource<Item> | Item[] = items(5)) {
  const modules = [createSortModule<Item>(), createSelectionModule<Item>(), createFocusModule<Item>(), createEditModule<Item>()] as const;
  const engine = createDataGridEngine<Item, typeof modules>({ getRowId: (r) => r.id, columns, dataSource, modules, edit: { showNewRow: true, ...edit } });
  const api = createEditApi(engine);
  const m = (engine as unknown as { edit: { [K in keyof EditMethods<Item>]: EditMethods<Item>[K] extends (ctx: any, ...a: infer A) => infer R ? (...a: A) => R : never } }).edit;
  const state = () => engine.getModuleState<EditState>('edit') as EditState;
  return { engine, api, m, state };
}

const blank = (n: number) => `${BLANK_ROW_ID_PREFIX}${n}`;

describe('edit module: always-visible add row', () => {
  it('the at-rest state names the add row in row mode only (pure ./edit-state)', () => {
    assert.equal(createInitialEditState({ edit: { showNewRow: true } } as never).newRowId, blank(1));
    for (const edit of [{}, { showNewRow: true, mode: 'batch' }, { showNewRow: true, mode: 'dialog' }, { showNewRow: true, mode: 'cell' }, { showNewRow: true, add: false }, { showNewRow: true, enabled: false }]) {
      assert.equal(createInitialEditState({ edit } as never).newRowId, null, JSON.stringify(edit));
    }
    const { state } = make();
    assert.equal(state().newRowId, blank(1));
    assert.ok(showsNewRow(state().options));
  });

  it('is shown in edit state before any command, is not an added row, and is no unsaved change', () => {
    const { m, state, api } = make();
    const id = blank(1);
    const flags = m.cellFlags(id, 'name');
    assert.ok(flags & EDIT_EDITING && flags & EDIT_ROW_EDITING && flags & EDIT_NEW);
    assert.equal(flags & EDIT_LOCKED, 0);
    assert.ok(m.cellFlags(id, 'id') & EDIT_EDITING, 'the key is editable on the add row');
    assert.equal(m.getValue(id, 'qty'), 1, 'defaultValue');
    assert.deepEqual(state().addedRowIds, []);
    assert.equal(state().active, null);
    assert.equal(m.hasUnsavedChanges(), false);
    assert.deepEqual(api.getPendingChanges().addedRecords, []);
  });

  it('typing and saving writes the record and shows a fresh blank row', () => {
    const { engine, api, m, state } = make();
    const id = blank(1);
    assert.equal(api.startEdit(id, 'id').status, 'applied');
    assert.deepEqual(state().active, { rowId: id, columnId: 'id', isNew: true });
    api.setEditValue(id, 'id', 'k1');
    api.setEditValue(id, 'name', 'Kay');
    assert.equal(m.hasUnsavedChanges(), true, 'typed values are unsaved');
    assert.equal(api.save().status, 'applied');
    assert.equal(engine.getRow('k1')?.name, 'Kay');
    assert.equal(engine.getRow('k1')?.qty, 1);
    assert.equal(state().active, null);
    assert.equal(state().newRowId, blank(2));
    assert.equal(m.getValue(blank(2), 'name'), undefined);
    assert.deepEqual(state().addedRowIds, []);
    assert.equal(m.hasUnsavedChanges(), false);
  });

  it('validation blocks the save; Escape clears the row under a fresh id', () => {
    const { api, m, state } = make();
    const id = blank(1);
    api.startEdit(id, 'name');
    api.setEditValue(id, 'id', 'k2');
    assert.equal(api.save().status, 'rejected');
    assert.deepEqual(m.getErrors(id, 'name'), ['This field is required.']);
    assert.equal(api.cancelEdit().status, 'applied');
    assert.equal(state().newRowId, blank(2));
    assert.equal(state().active, null);
    assert.deepEqual(m.getErrors(blank(2), 'name'), []);
    assert.equal(m.getValue(blank(2), 'id'), undefined);
    assert.equal(m.hasUnsavedChanges(), false);
  });

  it('saving or leaving the untouched row writes nothing and keeps its id', () => {
    const writes: WriteRequest<Item>[] = [];
    let rows = items(3);
    const source: DataSource<Item> = {
      read: (req: { version?: number }) => ({ rows, total: rows.length, version: req.version }),
      write: (req: WriteRequest<Item>) => {
        writes.push(req);
        rows = [...rows, ...req.added.map((a) => a.row)];
        return { added: req.added.map((a) => ({ tempId: a.tempId, row: a.row })) } as unknown as WriteResult<Item>;
      },
    } as unknown as DataSource<Item>;
    const { api, state, m } = make({}, source);
    api.startEdit(blank(1), 'name');
    assert.deepEqual(m.previewWrite('active').added, [], 'no save event payload for an untouched add row');
    assert.equal(api.save().status, 'applied');
    assert.equal(writes.length, 0);
    assert.equal(state().newRowId, blank(1));
    api.startEdit(blank(1), 'name');
    assert.equal(api.startEdit('r1', 'name').status, 'applied', 'starting another row leaves the untouched add row');
    assert.equal(writes.length, 0);
    assert.equal(state().active?.rowId, 'r1');
  });

  it('is locked while another row edits; a touched add row is saved when another row starts', () => {
    const { engine, api, m, state } = make();
    assert.equal(api.startEdit('r1', 'name').status, 'applied');
    assert.ok(m.cellFlags(blank(1), 'name') & EDIT_LOCKED);
    assert.ok(m.rowFlags(blank(1)) & EDIT_LOCKED);
    api.cancelEdit();
    assert.equal(m.cellFlags(blank(1), 'name') & EDIT_LOCKED, 0);
    api.startEdit(blank(1), 'id');
    api.setEditValue(blank(1), 'id', 'k3');
    api.setEditValue(blank(1), 'name', 'Kim');
    assert.equal(api.startEdit('r2', 'name').status, 'applied');
    assert.equal(engine.getRow('k3')?.name, 'Kim');
    assert.equal(state().newRowId, blank(2));
    assert.equal(state().active?.rowId, 'r2');
  });

  it('addRow edits the add row (values go into it) instead of opening another added row', () => {
    const { api, m, state } = make();
    assert.equal(api.addRow({ id: 'k4', name: 'Kat' }).status, 'applied');
    assert.deepEqual(state().addedRowIds, []);
    assert.deepEqual(state().active, { rowId: blank(1), columnId: 'id', isNew: true });
    assert.equal(m.getValue(blank(1), 'name'), 'Kat');
    assert.equal(api.deleteRows([blank(1)]).status, 'rejected', 'the add row is not deletable');
  });

  it('Tab moves across the add row; Tab past the last cell saves it', () => {
    const { engine, api, state } = make();
    api.startEdit(blank(1), 'id');
    api.setEditValue(blank(1), 'id', 'k5');
    engine.dispatch({ type: 'edit.commitAndMove', direction: 'next' });
    assert.equal(state().active?.columnId, 'name');
    api.setEditValue(blank(1), 'name', 'Ken');
    engine.dispatch({ type: 'edit.commitAndMove', direction: 'next' });
    engine.dispatch({ type: 'edit.commitAndMove', direction: 'next' });
    assert.equal(engine.getRow('k5')?.name, 'Ken');
    assert.equal(state().newRowId, blank(2));
  });

  it('an async write keeps the saved row as a pending added row while the fresh blank row shows', async () => {
    let rows = items(2);
    let release: () => void = () => {};
    const source = {
      read: (req: { version?: number }) => ({ rows, total: rows.length, version: req.version }),
      write: (req: WriteRequest<Item>) =>
        new Promise<WriteResult<Item>>((resolve) => {
          release = () => {
            rows = [...rows, ...req.added.map((a) => a.row)];
            resolve({ added: req.added.map((a) => ({ tempId: a.tempId, row: a.row })) } as unknown as WriteResult<Item>);
          };
        }),
    } as unknown as DataSource<Item>;
    const { api, state } = make({}, source);
    api.startEdit(blank(1), 'id');
    api.setEditValue(blank(1), 'id', 'k6');
    api.setEditValue(blank(1), 'name', 'Kip');
    assert.equal(api.save().status, 'applied');
    assert.deepEqual(state().addedRowIds, [blank(1)]);
    assert.equal(state().newRowId, blank(2));
    release();
    await api.whenEditSettled();
    assert.deepEqual(state().addedRowIds, []);
  });

  it('turning showNewRow off or switching mode drops the row; turning it on shows it', () => {
    const { engine, state, m } = make();
    engine.dispatch({ type: 'edit.setOptions', options: { showNewRow: false } });
    assert.equal(state().newRowId, null);
    assert.equal(m.hasUnsavedChanges(), false);
    engine.dispatch({ type: 'edit.setOptions', options: { showNewRow: true } });
    assert.ok(state().newRowId?.startsWith(BLANK_ROW_ID_PREFIX));
    engine.dispatch({ type: 'edit.setOptions', options: { mode: 'batch' } });
    assert.equal(state().newRowId, null);
  });
});
