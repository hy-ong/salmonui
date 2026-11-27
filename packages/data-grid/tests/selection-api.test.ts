// Selection API and events through the React layer without a DOM: `DataGridInstance` + `api`,
// the before/after selection events routed through `onBeforeCommand`, and the
// delegated body click handler driven by minimal element stand-ins.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DATA_GRID_SELECTION_COLUMN_ID, type DataGridColumn, type DataGridProps, type DataGridSelectionChangeEvent } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { people, personColumns, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make(props: Partial<DataGridProps<Person>> = {}): { instance: DataGridInstance<Person>; unmount: () => void } {
  const instance = newInstance<Person>({ data: people(10), columns: personColumns as DataGridColumn<Person>[], 'aria-label': 'People', ...props } as never, `:sel${seq++}:`);
  const unmount = instance.mount();
  return { instance, unmount };
}

const withCheckbox: DataGridColumn<Person>[] = [{ type: 'selection' }, ...personColumns];

// Minimal stand-ins for the delegated click handler: the root contains every
// element; a cell element answers `closest()` for its row and cell.
function attachRoot(instance: DataGridInstance<Person>): void {
  const doc = { activeElement: null, addEventListener() {}, removeEventListener() {}, querySelector: () => null, defaultView: null };
  instance.root = { contains: () => true, tabIndex: 0, ownerDocument: doc, focus() {} } as never;
}

function click(instance: DataGridInstance<Person>, rowId: string, columnId: string, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}): void {
  const rowEl = { dataset: { rowId } };
  const cellEl = { dataset: { columnId } };
  const target = {
    tagName: 'DIV',
    isContentEditable: false,
    closest: (selector: string) => (selector.includes('[data-row-id]') ? rowEl : selector.includes('.salmon-data-grid-cell') ? cellEl : null),
  };
  instance.interaction.onClick({
    defaultPrevented: false,
    button: 0,
    target,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: false,
    shiftKey: mods.shiftKey ?? false,
    nativeEvent: { pointerType: 'mouse' },
  } as never);
}

describe('clearSelection parts and selected cells / columns', () => {
  it('clearSelection({ rows: true }) clears only rows; { columns: true } only columns; { cells: true } only cells', () => {
    const { instance, unmount } = make({ selection: { mode: 'both', multiple: true, columns: true } });
    const api = instance.api;
    const fill = () => {
      api.selectRows(['p1', 'p2']);
      api.selectCells([{ rowId: 'p3', field: 'name' }]);
      api.selectColumns(['age']);
    };
    fill();
    assert.deepEqual([...api.getSelectedRowIds()], ['p1', 'p2']);
    assert.equal(api.getSelectedCells().length, 1);
    assert.deepEqual([...api.getSelectedColumns()], ['age']);

    assert.equal(api.clearSelection({ rows: true }).status, 'applied');
    assert.deepEqual([...api.getSelectedRowIds()], []);
    assert.deepEqual(api.getSelectedCells(), [{ rowId: 'p3', field: 'name' }]);
    assert.deepEqual([...api.getSelectedColumns()], ['age']);

    api.selectRows(['p1']);
    assert.equal(api.clearSelection({ columns: true }).status, 'applied');
    assert.deepEqual([...api.getSelectedColumns()], []);
    assert.deepEqual([...api.getSelectedRowIds()], ['p1']);
    assert.deepEqual(api.getSelectedCells(), [{ rowId: 'p3', field: 'name' }]);

    api.selectColumns('age');
    assert.equal(api.clearSelection({ cells: true }).status, 'applied');
    assert.deepEqual(api.getSelectedCells(), []);
    assert.deepEqual([...api.getSelectedRowIds()], ['p1']);
    assert.deepEqual([...api.getSelectedColumns()], ['age']);

    api.selectCells([{ rowId: 'p3', field: 'name' }]);
    api.clearSelection();
    assert.deepEqual([...api.getSelectedRowIds()], []);
    assert.deepEqual(api.getSelectedCells(), []);
    assert.deepEqual([...api.getSelectedColumns()], []);
    unmount();
  });

  it('getSelectedCells() lists anchor and focus of each range by field; getSelectedColumns() lists fields', () => {
    const { instance, unmount } = make({ selection: { mode: 'cell', multiple: true, columns: true } });
    const api = instance.api;
    assert.deepEqual(api.getSelectedCells(), []);
    assert.deepEqual([...api.getSelectedColumns()], []);
    api.selectCells([{ rowId: 'p1', field: 'name' }]);
    api.selectCells([{ rowId: 'p4', field: 'age' }], { mode: 'add' });
    assert.deepEqual(api.getSelectedCells(), [
      { rowId: 'p1', field: 'name' },
      { rowId: 'p4', field: 'age' },
    ]);
    api.selectCellRange({ rowId: 'p0', field: 'id' }, { rowId: 'p2', field: 'age' });
    assert.deepEqual(api.getSelectedCells(), [
      { rowId: 'p0', field: 'id' },
      { rowId: 'p2', field: 'age' },
    ]);
    assert.ok(Object.isFrozen(api.getSelectedCells()));
    api.selectColumns(['name', 'age']);
    assert.deepEqual([...api.getSelectedColumns()], ['name', 'age']);
    api.selectColumns('name', { mode: 'toggle' });
    assert.deepEqual([...api.getSelectedColumns()], ['age']);
    unmount();
  });
});

describe('selection events through the React layer', () => {
  it('onBeforeSelectionChange preventDefault() cancels the change and no onSelectionChange fires', () => {
    const before: DataGridSelectionChangeEvent<Person>[] = [];
    const after: DataGridSelectionChangeEvent<Person>[] = [];
    let cancel = true;
    const { instance, unmount } = make({
      selection: { multiple: true },
      onBeforeSelectionChange: (e) => {
        before.push(e);
        if (cancel) e.preventDefault();
      },
      onSelectionChange: (e) => after.push(e),
    });
    const api = instance.api;
    assert.notEqual(api.selectRows(['p1', 'p2']).status, 'applied');
    assert.deepEqual([...api.getSelectedRowIds()], []);
    assert.equal(before.length, 1);
    assert.equal(before[0]!.defaultPrevented, true);
    assert.deepEqual([...before[0]!.rowIds], ['p1', 'p2'], 'the before-event proposes the new selection');
    assert.equal(after.length, 0);

    cancel = false;
    assert.equal(api.selectRows(['p1', 'p2']).status, 'applied');
    assert.deepEqual([...api.getSelectedRowIds()], ['p1', 'p2']);
    assert.equal(after.length, 1);
    const e = after[0]!;
    assert.equal(e.type, 'selectionChange');
    assert.equal(e.source, 'api');
    assert.equal(e.target, 'row');
    assert.deepEqual([...e.added], ['p1', 'p2']);
    assert.deepEqual([...e.removed], []);
    assert.deepEqual(e.rows().map((r) => r.id), ['p1', 'p2']);
    assert.equal(e.scope, 'explicit');
    unmount();
  });

  it('a row selection event reports the cell and column selection at the time of the event (cells, columns)', () => {
    const after: DataGridSelectionChangeEvent<Person>[] = [];
    const { instance, unmount } = make({ selection: { mode: 'both', multiple: true, columns: true }, onSelectionChange: (e) => after.push(e) });
    instance.api.selectCells([{ rowId: 'p2', field: 'name' }]);
    instance.api.selectColumns(['age']);
    instance.api.selectRows(['p4']);
    const e = after.at(-1)!;
    assert.equal(e.target, 'row');
    assert.deepEqual([...e.rowIds], ['p4']);
    assert.deepEqual(e.cells, [{ rowId: 'p2', field: 'name' }]);
    assert.deepEqual([...e.columns], ['age']);
    unmount();
  });

  it('cell selection events: cellSelecting / cellSelected / cellDeselecting through the before / after events', () => {
    const before: DataGridSelectionChangeEvent<Person>[] = [];
    const after: DataGridSelectionChangeEvent<Person>[] = [];
    let cancel = false;
    const { instance, unmount } = make({
      selection: { mode: 'cell', multiple: true },
      onBeforeSelectionChange: (e) => {
        before.push(e);
        if (cancel) e.preventDefault();
      },
      onSelectionChange: (e) => after.push(e),
    });
    attachRoot(instance);
    click(instance, 'p2', 'name');
    assert.equal(before.length, 1);
    assert.equal(before[0]!.target, 'cell');
    assert.deepEqual(before[0]!.cells, [{ rowId: 'p2', field: 'name' }], 'the before-event proposes the new cells');
    assert.deepEqual(before[0]!.addedCells, [{ rowId: 'p2', field: 'name' }]);
    const e = after.at(-1)!;
    assert.equal(e.target, 'cell');
    assert.equal(e.source, 'pointer');
    assert.deepEqual(e.addedCells, [{ rowId: 'p2', field: 'name' }]);
    assert.deepEqual(e.removedCells, []);
    assert.deepEqual([...e.added], []);
    // A flow range through the API: every covered cell in reading order (p2 name was already selected).
    instance.api.selectCellRange({ rowId: 'p1', field: 'name' }, { rowId: 'p2', field: 'age' });
    assert.deepEqual(after.at(-1)!.addedCells, [
      { rowId: 'p1', field: 'name' },
      { rowId: 'p1', field: 'age' },
      { rowId: 'p1', field: 'active' },
      { rowId: 'p1', field: 'joined' },
      { rowId: 'p2', field: 'id' },
      { rowId: 'p2', field: 'age' },
    ]);
    assert.deepEqual(after.at(-1)!.removedCells, []);
    // Ctrl+click toggles a cell range off (cellDeselecting); cancelling keeps it.
    instance.api.selectCells([{ rowId: 'p5', field: 'age' }], { mode: 'add' });
    cancel = true;
    const n = after.length;
    click(instance, 'p5', 'age', { ctrlKey: true });
    assert.equal(after.length, n, 'cancelled: no after-event');
    assert.ok(instance.api.getSelectedCells().some((c) => c.rowId === 'p5'));
    assert.deepEqual(before.at(-1)!.removedCells, [{ rowId: 'p5', field: 'age' }]);
    assert.equal(before.at(-1)!.ctrlKey, true);
    cancel = false;
    click(instance, 'p5', 'age', { ctrlKey: true });
    assert.deepEqual(after.at(-1)!.removedCells, [{ rowId: 'p5', field: 'age' }]);
    assert.ok(!instance.api.getSelectedCells().some((c) => c.rowId === 'p5'));
    unmount();
  });

  it("mode 'both': a cell click raises a row event and a cell event; column events report added / removed columns", () => {
    const after: DataGridSelectionChangeEvent<Person>[] = [];
    const before: DataGridSelectionChangeEvent<Person>[] = [];
    const { instance, unmount } = make({
      selection: { mode: 'both', multiple: true, columns: true },
      onBeforeSelectionChange: (e) => {
        before.push(e);
        if (e.target === 'column' && e.addedColumns.includes('joined')) e.preventDefault();
      },
      onSelectionChange: (e) => after.push(e),
    });
    attachRoot(instance);
    click(instance, 'p3', 'age');
    assert.deepEqual(after.map((e) => e.target), ['row', 'cell']);
    assert.deepEqual([...after[0]!.added], ['p3']);
    assert.deepEqual(after[1]!.cells, [{ rowId: 'p3', field: 'age' }]);
    assert.deepEqual(after[1]!.addedCells, [{ rowId: 'p3', field: 'age' }]);
    assert.deepEqual([...after[1]!.rowIds], ['p3'], 'the cell event sees the row already selected');
    instance.api.selectColumns(['name', 'age']);
    const col = after.at(-1)!;
    assert.equal(col.target, 'column');
    assert.deepEqual([...col.columns], ['name', 'age']);
    assert.deepEqual([...col.addedColumns], ['name', 'age']);
    instance.api.selectColumns(['age'], { mode: 'toggle' });
    assert.deepEqual([...after.at(-1)!.removedColumns], ['age']);
    assert.deepEqual([...after.at(-1)!.columns], ['name']);
    // columnSelecting cancelled.
    assert.notEqual(instance.api.selectColumns(['joined'], { mode: 'add' }).status, 'applied');
    assert.deepEqual([...instance.api.getSelectedColumns()], ['name']);
    assert.equal(before.at(-1)!.defaultPrevented, true);
    // clear: one event for every part.
    instance.api.clearSelection();
    const cleared = after.at(-1)!;
    assert.equal(cleared.target, 'row');
    assert.deepEqual([...cleared.removed], ['p3']);
    assert.deepEqual(cleared.removedCells, [{ rowId: 'p3', field: 'age' }]);
    assert.deepEqual([...cleared.removedColumns], ['name']);
    unmount();
  });

  it('a checkbox click reports target checkbox and source pointer; a cancelled checkbox click selects nothing', () => {
    const before: DataGridSelectionChangeEvent<Person>[] = [];
    const after: DataGridSelectionChangeEvent<Person>[] = [];
    let cancel = false;
    const { instance, unmount } = make({
      columns: withCheckbox,
      selection: {},
      onBeforeSelectionChange: (e) => {
        before.push(e);
        if (cancel) e.preventDefault();
      },
      onSelectionChange: (e) => after.push(e),
    });
    attachRoot(instance);
    click(instance, 'p3', DATA_GRID_SELECTION_COLUMN_ID);
    assert.deepEqual([...instance.api.getSelectedRowIds()], ['p3']);
    const e = after.at(-1)!;
    assert.equal(e.target, 'checkbox');
    assert.equal(e.source, 'pointer');
    assert.equal(e.ctrlKey, false);
    assert.deepEqual([...e.added], ['p3']);
    cancel = true;
    const count = after.length;
    click(instance, 'p4', DATA_GRID_SELECTION_COLUMN_ID);
    assert.deepEqual([...instance.api.getSelectedRowIds()], ['p3']);
    assert.equal(after.length, count);
    assert.equal(before.at(-1)!.target, 'checkbox');
    unmount();
  });
});

describe('pointer selection options', () => {
  it('checkboxOnly: a row click does not select, the checkbox does', () => {
    const { instance, unmount } = make({ columns: withCheckbox, selection: { checkboxOnly: true } });
    attachRoot(instance);
    click(instance, 'p1', 'name');
    assert.deepEqual([...instance.api.getSelectedRowIds()], []);
    click(instance, 'p1', DATA_GRID_SELECTION_COLUMN_ID);
    assert.deepEqual([...instance.api.getSelectedRowIds()], ['p1']);
    click(instance, 'p2', 'age');
    assert.deepEqual([...instance.api.getSelectedRowIds()], ['p1'], 'a row click leaves the checkbox selection alone');
    unmount();
  });

  it("checkboxRowClick 'replace': a plain row click resets the checkbox selection; 'add' toggles", () => {
    const replace = make({ columns: withCheckbox, selection: { checkboxRowClick: 'replace' } });
    attachRoot(replace.instance);
    click(replace.instance, 'p1', DATA_GRID_SELECTION_COLUMN_ID);
    click(replace.instance, 'p2', DATA_GRID_SELECTION_COLUMN_ID);
    assert.deepEqual([...replace.instance.api.getSelectedRowIds()], ['p1', 'p2']);
    click(replace.instance, 'p5', 'name');
    assert.deepEqual([...replace.instance.api.getSelectedRowIds()], ['p5']);
    replace.unmount();

    const add = make({ columns: withCheckbox, selection: { checkboxRowClick: 'add' } });
    attachRoot(add.instance);
    click(add.instance, 'p1', DATA_GRID_SELECTION_COLUMN_ID);
    click(add.instance, 'p5', 'name');
    assert.deepEqual([...add.instance.api.getSelectedRowIds()], ['p1', 'p5']);
    click(add.instance, 'p1', 'name');
    assert.deepEqual([...add.instance.api.getSelectedRowIds()], ['p5']);
    add.unmount();
  });

  it('toggle (default true): clicking the only selected row deselects it; toggle: false keeps it', () => {
    const on = make({ selection: {} });
    attachRoot(on.instance);
    click(on.instance, 'p2', 'name');
    assert.deepEqual([...on.instance.api.getSelectedRowIds()], ['p2']);
    click(on.instance, 'p2', 'name');
    assert.deepEqual([...on.instance.api.getSelectedRowIds()], []);
    on.unmount();

    const off = make({ selection: { toggle: false } });
    attachRoot(off.instance);
    click(off.instance, 'p2', 'name');
    click(off.instance, 'p2', 'name');
    assert.deepEqual([...off.instance.api.getSelectedRowIds()], ['p2']);
    click(off.instance, 'p3', 'name');
    assert.deepEqual([...off.instance.api.getSelectedRowIds()], ['p3']);
    off.unmount();
  });

  it('additive: plain clicks toggle rows without Ctrl in multiple mode; without it a plain click replaces', () => {
    const additive = make({ selection: { multiple: true, additive: true } });
    attachRoot(additive.instance);
    click(additive.instance, 'p1', 'name');
    click(additive.instance, 'p3', 'name');
    click(additive.instance, 'p5', 'name');
    assert.deepEqual([...additive.instance.api.getSelectedRowIds()], ['p1', 'p3', 'p5']);
    click(additive.instance, 'p3', 'name');
    assert.deepEqual([...additive.instance.api.getSelectedRowIds()], ['p1', 'p5']);
    additive.unmount();

    const plain = make({ selection: { multiple: true } });
    attachRoot(plain.instance);
    click(plain.instance, 'p1', 'name');
    click(plain.instance, 'p3', 'name');
    assert.deepEqual([...plain.instance.api.getSelectedRowIds()], ['p3']);
    click(plain.instance, 'p5', 'name', { ctrlKey: true });
    assert.deepEqual([...plain.instance.api.getSelectedRowIds()], ['p3', 'p5']);
    plain.unmount();
  });
});

describe('keyBindings after mount', () => {
  it('a changed keyBindings value rebuilds the keymap; an equal value with a new identity keeps it', () => {
    const base: Partial<DataGridProps<Person>> = { data: people(10), columns: personColumns as DataGridColumn<Person>[], 'aria-label': 'People', selection: { multiple: true } };
    const { instance, unmount } = make({ ...base, keyBindings: { 'selection.selectAll': ['Mod+Shift+L'] } });
    // `Mod` is Cmd on macOS (Node reports the host platform through `navigator`), else Ctrl.
    const mac = instance.interaction.keymap.platform === 'mac';
    const key = (k: string, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}) => ({ key: k, code: '', ctrlKey: !mac && (mods.ctrlKey ?? false), shiftKey: mods.shiftKey ?? false, altKey: false, metaKey: mac && (mods.ctrlKey ?? false) });
    const resolve = (k: ReturnType<typeof key>) => instance.interaction.keymap.resolve(k as never, 'body');
    assert.equal(resolve(key('L', { ctrlKey: true, shiftKey: true })), 'selection.selectAll');
    assert.equal(resolve(key('a', { ctrlKey: true })), null);
    const before = instance.interaction.keymap;
    instance.syncProps({ ...base, keyBindings: { 'selection.selectAll': ['Mod+Shift+L'] } } as never);
    assert.equal(instance.interaction.keymap, before, 'same value: not rebuilt');
    instance.syncProps({ ...base, keyBindings: { 'selection.selectAll': ['Mod+Shift+K'], 'focus.down': ['ArrowDown', 'J'] } } as never);
    assert.notEqual(instance.interaction.keymap, before);
    assert.equal(resolve(key('K', { ctrlKey: true, shiftKey: true })), 'selection.selectAll');
    assert.equal(resolve(key('L', { ctrlKey: true, shiftKey: true })), null);
    assert.equal(resolve(key('J')), 'focus.down');
    // Removing the prop restores the defaults.
    instance.syncProps({ ...base } as never);
    assert.equal(resolve(key('a', { ctrlKey: true })), 'selection.selectAll');
    assert.equal(resolve(key('J')), null);
    unmount();
  });
});
