// The `editing` and `rowDrag` render features: detection, the SSR markup
// through the static registry (the at-rest add row, command buttons and drag handles render on the server),
// the `features` prop, and the inert hosts of a grid without them.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { editing, rowDrag } from '@salmonui/data-grid/features';
import type { DataGridColumn } from '@salmonui/data-grid';
import { readFeatures as readStatic } from '../dist/data-grid/features/registry-static.js';
import { requiredFeatures } from '../dist/data-grid/features/detect.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import type { DataGridFeature } from '../dist/data-grid/features/types.js';
import { count, newInstance, people, personColumns, render, type Person } from './fixtures.ts';

const commands: DataGridColumn<Person> = { id: 'commands', header: 'Commands', width: 160, commands: [{ type: 'edit' }, { type: 'delete' }] };
const PENDING = ' data-salmon-pending=""';

describe('editing and rowDrag detection', () => {
  it('requires editing when `editing` is set and rowDrag when `rowDrag` is set', () => {
    assert.deepEqual(requiredFeatures({ editing: true } as never), ['editing']);
    assert.deepEqual(requiredFeatures({ editing: {} } as never), ['editing']);
    assert.deepEqual(requiredFeatures({ editing: false } as never), []);
    assert.deepEqual(requiredFeatures({ rowDrag: true } as never), ['rowDrag']);
    assert.deepEqual(requiredFeatures({ rowDrag: {} } as never), ['rowDrag']);
    assert.deepEqual(requiredFeatures({ rowDrag: false } as never), []);
    assert.deepEqual(requiredFeatures({ editing: true, rowDrag: true, paging: true } as never), ['editing', 'paging', 'rowDrag']);
  });

  it('a command column alone does not require editing (its buttons render only with `editing`)', () => {
    assert.deepEqual(requiredFeatures({ columns: [commands] } as never), []);
    const html = render({ rows: 3, columns: [commands, ...personColumns] });
    assert.equal(count(html, /data-command=/), 0);
    assert.doesNotMatch(html, /data-salmon-pending/);
  });

  it('the static registry answers both synchronously', () => {
    const out = readStatic(['editing', 'rowDrag'], undefined) as readonly DataGridFeature[];
    assert.deepEqual(
      out.map((f) => f.name),
      ['editing', 'rowDrag'],
    );
    assert.equal(out[0], editing);
    assert.equal(out[1], rowDrag);
  });
});

describe('editing render feature (static registry, SSR)', () => {
  it('renders the at-rest add row and the command buttons on the server, with no placeholder', () => {
    const html = render({ rows: 10, editing: { showNewRow: true }, columns: [commands, ...personColumns] });
    assert.match(html, /role="grid"[^>]*data-salmon-pending=""/);
    assert.doesNotMatch(html, /aria-busy="true"/);
    assert.equal(count(html, /data-new-row=""/), 1);
    assert.match(html, /salmon-data-grid-added-rows--top/);
    assert.equal(count(html, /data-command="edit"/), 10);
    assert.equal(count(html, /salmon-data-grid-editor/), 0);
  });

  it('the features prop removes the gate: the same markup without the pending mark', () => {
    const props = { rows: 10, editing: { showNewRow: true }, columns: [commands, ...personColumns] } as const;
    const provided = render({ ...props, features: [editing] });
    assert.doesNotMatch(provided, /data-salmon-pending/);
    assert.equal(provided, render(props).replace(PENDING, ''));
  });

  it('a provided editing feature whose trigger does not hold changes nothing', () => {
    assert.equal(render({ rows: 5, features: [editing] }), render({ rows: 5 }));
  });
});

describe('rowDrag render feature (static registry, SSR)', () => {
  it('renders the drag handle column and one handle per row on the server', () => {
    const html = render({ rows: 8, rowDrag: true });
    assert.match(html, /role="grid"[^>]*data-salmon-pending=""/);
    assert.match(html, /role="columnheader"[^>]*data-column-id="__salmon_drag"/);
    assert.equal(count(html, /class="salmon-data-grid-row-drag-handle"/), 8);
    assert.match(html, /salmon-data-grid-row-drop-indicator/);
  });

  it('the features prop removes the gate: the same markup without the pending mark', () => {
    const provided = render({ rows: 8, rowDrag: true, features: [rowDrag] });
    assert.doesNotMatch(provided, /data-salmon-pending/);
    assert.equal(provided, render({ rows: 8, rowDrag: true }).replace(PENDING, ''));
  });
});

describe('inert editing and row drag hosts', () => {
  it('an instance with the features gets the hosts and parts', () => {
    const instance = newInstance<Person>({ data: people(5), columns: personColumns, editing: true, rowDrag: true }, ':hosts1:');
    assert.equal(instance.editing.active, true);
    assert.equal(instance.rowDragUi.enabled, true);
    assert.ok(instance.features.parts.EditSlot);
    assert.ok(instance.features.parts.RowDragLayer);
    assert.ok(instance.engine.getModuleState('edit'));
    assert.ok(instance.engine.getModuleState('rowDragDrop'));
  });

  it('the row drag handle column has no column menu (no header menu button)', () => {
    const instance = newInstance<Person>({ data: people(2), columns: personColumns, rowDrag: true, columnMenu: true } as never, ':hosts-menu:');
    const byId = instance.engine.getSnapshot().columns.byId;
    assert.ok(byId.get('__salmon_drag'));
    assert.equal(instance.chrome.columnMenuEnabled(byId.get('__salmon_drag') as never), false);
    assert.equal(instance.chrome.columnMenuEnabled(byId.get('name') as never), true);
  });

  it('without the features: no modules, no parts, and the API keeps its off values', async () => {
    const bare = new DataGridInstance<Person>({ data: people(5), columns: personColumns, editing: true, rowDrag: true } as never, ':hosts2:');
    assert.equal(bare.editing.active, false);
    assert.equal(bare.rowDragUi.enabled, false);
    assert.equal(bare.features.parts.EditSlot, null);
    assert.equal(bare.features.parts.RowDragLayer, null);
    assert.equal(bare.features.parts.rowDragColumn, null);
    assert.equal(bare.engine.getModuleState('edit'), undefined);
    assert.equal(bare.engine.getModuleState('rowDragDrop'), undefined);
    assert.equal(bare.engine.getSnapshot().columns.byId.has('__salmon_drag'), false);
    const plain = newInstance<Person>({ data: people(5), columns: personColumns }, ':hosts3:');
    for (const api of [bare.api, plain.api]) {
      assert.deepEqual(api.startEdit('p0'), { status: 'rejected', reason: 'editingDisabled' });
      assert.deepEqual(api.addRow({}), { status: 'rejected', reason: 'editingDisabled' });
      assert.deepEqual(api.copy(), { status: 'rejected', reason: 'clipboardUnavailable' });
      assert.deepEqual(api.getPendingChanges(), { addedRecords: [], changedRecords: [], deletedRecords: [] });
      assert.equal(api.hasUnsavedChanges(), false);
      assert.equal(api.getEditSnapshot(), undefined);
      assert.equal(await api.validateBatch(), true);
      assert.equal(api.moveRows('p0', 2).status, 'rejected');
    }
  });
});
