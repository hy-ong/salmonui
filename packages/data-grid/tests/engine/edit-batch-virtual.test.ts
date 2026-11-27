import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFocusModule, createDataGridEngine, createSelectionModule, type ColumnDef, type EditMethods, type EditState } from '@salmonui/data-grid/engine';
import { createEditApi, createEditModule, EDIT_DELETED, EDIT_DIRTY } from '@salmonui/data-grid/engine/edit';

// batch editing is independent of the rendered window.
// Drafts, delete marks, and added rows are keyed by row id in the module, so
// a renderer may mount and unmount rows freely; moves address rows through
// the row model (not the DOM), and a save writes rows that are not rendered.

interface Item {
  readonly id: string;
  readonly name: string;
  readonly qty: number;
}

const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'name' }, { field: 'qty', type: 'number' }];
const ROWS = 100_000;

function make() {
  const rows: Item[] = Array.from({ length: ROWS }, (_, i) => ({ id: `r${i}`, name: `n${i}`, qty: i }));
  const modules = [createSelectionModule<Item>(), createFocusModule<Item>(), createEditModule<Item>()] as const;
  const engine = createDataGridEngine<Item, typeof modules>({ getRowId: (r) => r.id, columns, dataSource: rows, modules, edit: { mode: 'batch' } });
  const api = createEditApi(engine);
  const m = (engine as unknown as { edit: { [K in keyof EditMethods<Item>]: EditMethods<Item>[K] extends (ctx: any, ...a: infer A) => infer R ? (...a: A) => R : never } }).edit;
  const state = () => engine.getModuleState<EditState>('edit') as EditState;
  return { engine, api, m, state };
}

describe('batch editing with virtualization', () => {
  it('Enter-style moves walk the row model far past any window and keep every draft', () => {
    const { engine, api, m, state } = make();
    api.startEdit('r0', 'name');
    for (let i = 0; i < 60; i++) {
      api.setEditValue(state().active!.rowId, 'name', `d${i}`);
      assert.equal(engine.dispatch({ type: 'edit.commitAndMove', direction: 'down' }).status, 'applied');
    }
    assert.deepEqual(state().active, { rowId: 'r60', columnId: 'name', isNew: false });
    assert.equal(state().dirtyCellCount, 60);
    assert.equal(m.getDisplay('r0', 'name')?.formattedValue, 'd0');
    assert.ok(m.cellFlags('r59', 'name') & EDIT_DIRTY);
    // Tab past the last column wraps rows (tabToNextRow defaults on in batch).
    assert.deepEqual(m.nextEditableCell('r99998', 'qty', 'next'), { rowId: 'r99999', columnId: 'name' });
    assert.equal(m.nextEditableCell('r99999', 'qty', 'next'), null);
  });

  it('a save writes changed, deleted and added rows wherever they are; cancel drops them', () => {
    const { engine, api, m, state } = make();
    assert.equal(api.updateCell('r50000', 'name', 'far').status, 'applied');
    assert.equal(api.updateCell('r99999', 'qty', 7).status, 'applied');
    assert.equal(api.deleteRows(['r70000']).status, 'applied');
    assert.ok(m.rowFlags('r70000') & EDIT_DELETED);
    assert.equal(api.addRow({ id: 'a1', name: 'added' }).status, 'applied');
    api.cancelEdit();
    assert.deepEqual(state().addedRowIds.length, 1);
    const preview = m.previewWrite('batch');
    assert.deepEqual(preview.changed.map((c) => c.rowId).sort(), ['r50000', 'r99999']);
    assert.deepEqual(preview.deleted, ['r70000']);
    assert.equal(preview.added.length, 1);
    assert.equal(api.save().status, 'applied');
    assert.equal(engine.getRow('r50000')?.name, 'far');
    assert.equal(engine.getRow('r99999')?.qty, 7);
    assert.equal(engine.getRow('r70000'), undefined);
    assert.equal(engine.getRow('a1')?.name, 'added');
    api.updateCell('r60000', 'name', 'tmp');
    assert.equal(api.cancelEdit().status, 'applied');
    assert.equal(m.hasUnsavedChanges(), false);
    assert.equal(engine.getRow('r60000')?.name, 'n60000');
  });
});
