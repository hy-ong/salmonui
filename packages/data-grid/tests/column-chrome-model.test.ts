import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, type ColumnDef, type CompiledColumn } from '@salmonui/data-grid/engine';
import { createClipboardModule } from '@salmonui/data-grid/engine/clipboard';
import { createEditModule } from '@salmonui/data-grid/engine/edit';
import type { DataGridColumn, DataGridMenuItem, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { menuAction } from '../dist/data-grid/menu-action.js';
import { spanFlags } from '../dist/data-grid/spans.js';
import { planZone, SPAN_LOOKBACK } from '../dist/data-grid/span-plans.js';
import { editItemDisabled, subscribeToolbarEdit, toolbarEditBits } from '../dist/data-grid/toolbar-edit-state.js';
import { people, type Person, newInstance } from './fixtures.ts';

// Chrome models without a DOM: the DataGridChrome controller of a DataGridInstance
// (menu item lists, toolbar enablement, UI commands, pinning, events) and the
// span planner (`planZone`) under column virtualization. Opening overlays
// needs a root element; the tests that open one pass a minimal stand-in
// (container lookup and an anchor rect), never a real DOM.

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80, primaryKey: true },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 90 },
  { field: 'active', header: 'Active', type: 'boolean', width: 90 },
];

let seq = 0;
function make(props: Partial<DataGridProps<Person>> = {}) {
  const instance = newInstance<Person>({ data: people(5), columns, ...props } as never, `:t${seq++}:`);
  return { instance, chrome: instance.chrome, api: instance.api, engine: instance.engine };
}

type Made = ReturnType<typeof make>;
const leaf = (m: Made, id: string) => m.chrome.column(id) as CompiledColumn<Person>;
const menuIds = (items: readonly DataGridMenuItem[]) => items.map((i) => (i.separator ? '|' : i.id));
const byId = (items: readonly DataGridMenuItem[], id: string) => items.find((i) => i.id === id);
const zones = (m: Made) => {
  const c = m.engine.getSnapshot().columns;
  return { left: c.left.map((x) => x.columnId), center: c.center.map((x) => x.columnId), right: c.right.map((x) => x.columnId) };
};

/** Minimal root stand-in so overlays can open: a container and no active element. */
function attachRoot(m: Made): void {
  const doc = { activeElement: null, body: {} };
  m.instance.root = { closest: () => ({}), ownerDocument: doc, contains: () => false, querySelector: () => null } as never;
}
const anchorEl = { closest: () => null, getBoundingClientRect: () => ({ left: 1, top: 2, width: 3, height: 4 }) } as never;

describe('column menu items', () => {
  it('without sort, group or filter modules only the autosize, chooser and pin items remain', () => {
    const m = make({ columnMenu: true });
    assert.deepEqual(menuIds(m.chrome.columnMenuItems(leaf(m, 'name'))), ['autoSizeAll', 'autoSize', '|', 'columnChooser', '|', 'pinStart', 'pinEnd', 'unpin']);
  });

  it('autoSize does not depend on resizable, like autoSizeAll', () => {
    for (const resizable of [undefined, false, true]) {
      const m = make({ columnMenu: true, contextMenu: true, ...(resizable === undefined ? {} : { resizable }) });
      assert.ok(byId(m.chrome.columnMenuItems(leaf(m, 'name')), 'autoSize'), `column menu, resizable=${resizable}`);
      assert.ok(byId(m.chrome.contextMenuItems({ kind: 'header', field: 'name' }), 'autoSize'), `context menu, resizable=${resizable}`);
    }
  });

  it('the full default list with sorting, grouping, filtering and resizing, in the documented order', () => {
    const m = make({ columnMenu: true, sorting: true, grouping: {}, filtering: { ui: 'menu' }, resizable: true });
    assert.deepEqual(menuIds(m.chrome.columnMenuItems(leaf(m, 'name'))), [
      'autoSizeAll', 'autoSize', '|', 'group', 'ungroup', '|', 'sortAscending', 'sortDescending', 'clearSort', '|', 'filter', 'columnChooser', '|', 'pinStart', 'pinEnd', 'unpin',
    ]);
  });

  it('item disabled states follow the column: sort direction, grouped, and current zone', () => {
    const m = make({ columnMenu: true, sorting: { sortBy: [{ field: 'name', direction: 'asc' }] }, grouping: { groupBy: ['name'] } } as never);
    const items = m.chrome.columnMenuItems(leaf(m, 'name'));
    assert.equal(byId(items, 'sortAscending')?.disabled, true);
    assert.equal(byId(items, 'sortDescending')?.disabled, false);
    assert.equal(byId(items, 'clearSort')?.disabled, false);
    assert.equal(byId(items, 'group')?.disabled, true);
    assert.equal(byId(items, 'ungroup')?.disabled, false);
    assert.equal(byId(items, 'unpin')?.disabled, true, 'a center column cannot be unpinned');
    const other = m.chrome.columnMenuItems(leaf(m, 'age'));
    assert.equal(byId(other, 'clearSort')?.disabled, true);
    assert.equal(byId(other, 'ungroup')?.disabled, true);
  });

  it('a pinned column disables its own pin item and enables unpin', () => {
    const m = make({ columnMenu: true, columns: [{ ...columns[0]!, pinned: 'end' }, ...columns.slice(1)] });
    const items = m.chrome.columnMenuItems(leaf(m, 'id'));
    assert.equal(byId(items, 'pinEnd')?.disabled, true);
    assert.equal(byId(items, 'pinStart')?.disabled, false);
    assert.equal(byId(items, 'unpin')?.disabled, false);
  });

  it('a columnMenu array lists built-ins and custom items in order and drops built-ins that do not apply', () => {
    const custom: DataGridMenuItem = { id: 'audit', label: 'Audit', items: [{ id: 'audit.log', label: 'Log' }] };
    const m = make({ columnMenu: ['separator' as never, custom, 'filter', 'separator' as never, 'separator' as never, 'pinStart', 'separator' as never] as never });
    const items = m.chrome.columnMenuItems(leaf(m, 'name'));
    // Leading, doubled and trailing separators collapse; `filter` needs the filter module.
    assert.deepEqual(menuIds(items), ['audit', '|', 'pinStart']);
    assert.equal(items[0], custom);
  });

  it('columnChooser: false drops the chooser item', () => {
    const m = make({ columnMenu: true, columnChooser: false });
    assert.equal(byId(m.chrome.columnMenuItems(leaf(m, 'name')), 'columnChooser'), undefined);
  });

  it('column.menu: false and the selection column opt out; columnMenu off disables all', () => {
    const m = make({ columnMenu: true, columns: [{ type: 'selection' } as DataGridColumn<Person>, { ...columns[1]!, menu: false } as DataGridColumn<Person>, columns[2]!] });
    assert.equal(m.chrome.columnMenuEnabled(leaf(m, 'name')), false);
    assert.equal(m.chrome.columnMenuEnabled(leaf(m, 'age')), true);
    const selection = m.engine.getSnapshot().columns.visible[0] as CompiledColumn<Person>;
    assert.equal(m.chrome.columnMenuEnabled(selection), false);
    assert.deepEqual(menuIds(m.chrome.columnMenuItems(selection)).filter((id) => id.startsWith('pin') || id === 'unpin'), []);
    const off = make({});
    assert.equal(off.chrome.columnMenuEnabled(leaf(off, 'name')), false);
  });

  it('choosing sortAscending / sortDescending / clearSort sorts through the engine', () => {
    const m = make({ columnMenu: true, sorting: true });
    menuAction(m.chrome, { id: 'sortDescending', label: '' }, 'age', null, 'pointer');
    assert.deepEqual(m.engine.getSnapshot().query.sorting.map((s) => [s.columnId, s.direction]), [['age', 'desc']]);
    menuAction(m.chrome, { id: 'sortAscending', label: '' }, 'name', null, 'pointer');
    assert.deepEqual(m.engine.getSnapshot().query.sorting.map((s) => [s.columnId, s.direction]), [['name', 'asc']], 'menu sorting replaces (multi: false)');
    menuAction(m.chrome, { id: 'clearSort', label: '' }, 'name', null, 'pointer');
    assert.deepEqual(m.engine.getSnapshot().query.sorting, []);
  });

  it('choosing group / ungroup groups through the engine', () => {
    const m = make({ columnMenu: true, grouping: {} });
    menuAction(m.chrome, { id: 'group', label: '' }, 'active', null, 'pointer');
    assert.deepEqual(m.engine.getSnapshot().query.grouping.map((g) => g.columnId), ['active']);
    menuAction(m.chrome, { id: 'ungroup', label: '' }, 'active', null, 'pointer');
    assert.deepEqual(m.engine.getSnapshot().query.grouping, []);
  });

  it('onColumnMenuItemClick receives the item and column; preventDefault skips the built-in', () => {
    const events: { id: string; field: string; type: string; source: string }[] = [];
    const m = make({
      columnMenu: true,
      sorting: true,
      onColumnMenuItemClick: (e) => {
        events.push({ id: e.item.id, field: e.field, type: e.type, source: e.source });
        if (e.item.id === 'sortAscending') e.preventDefault();
      },
    });
    assert.equal(menuAction(m.chrome, { id: 'sortAscending', label: '' }, 'name', null, 'keyboard'), false);
    assert.deepEqual(m.engine.getSnapshot().query.sorting, []);
    assert.equal(menuAction(m.chrome, { id: 'custom', label: 'Custom' }, 'name', null, 'pointer'), true);
    assert.deepEqual(events, [
      { id: 'sortAscending', field: 'name', type: 'columnMenuItemClick', source: 'keyboard' },
      { id: 'custom', field: 'name', type: 'columnMenuItemClick', source: 'pointer' },
    ]);
  });

  it('onBeforeColumnMenuOpen can replace the items or cancel; onBeforeColumnMenuClose can keep it open', () => {
    let cancel = false;
    let keepOpen = true;
    const m = make({
      columnMenu: true,
      onBeforeColumnMenuOpen: (e) => {
        assert.equal(e.field, 'name');
        assert.equal(e.column.id, 'name');
        if (cancel) e.preventDefault();
        // The event is frozen in development: edit the items array in place.
        else e.items.splice(0, e.items.length, { id: 'only', label: 'Only' });
      },
      onBeforeColumnMenuClose: (e) => {
        if (keepOpen) e.preventDefault();
      },
    });
    attachRoot(m);
    assert.equal(m.chrome.openColumnMenu('name', 'api', anchorEl), true);
    const overlay = m.chrome.getOverlay();
    assert.equal(overlay?.kind, 'columnMenu');
    assert.deepEqual(overlay?.kind === 'columnMenu' ? menuIds(overlay.items) : null, ['only']);
    assert.deepEqual(overlay?.anchor, { left: 1, top: 2, width: 3, height: 4 });
    m.chrome.close(false, 'api');
    assert.equal(m.chrome.isOpen(), true, 'kept open by onBeforeColumnMenuClose');
    keepOpen = false;
    m.chrome.close(false, 'api');
    assert.equal(m.chrome.isOpen(), false);
    cancel = true;
    assert.equal(m.chrome.openColumnMenu('name', 'api', anchorEl), false);
    assert.equal(m.chrome.isOpen(), false);
    assert.equal(m.chrome.getServerOverlay(), null, 'overlays never render on the server');
  });

  it('a column menu does not open for an opted-out column or an unknown id', () => {
    const m = make({ columnMenu: true, columns: [{ ...columns[0]!, menu: false } as DataGridColumn<Person>, columns[1]!] });
    attachRoot(m);
    assert.equal(m.chrome.openColumnMenu('id', 'api', anchorEl), false);
    assert.equal(m.chrome.openColumnMenu('nope', 'api', anchorEl), false);
  });
});

describe('context menu items', () => {
  it('cell / row targets default to the editing, copy and export items, disabled with a reason without modules', () => {
    const m = make({ contextMenu: true });
    const items = m.chrome.contextMenuItems({ kind: 'cell', rowId: 'p0', field: 'name' });
    assert.deepEqual(menuIds(items), ['edit', 'delete', 'save', 'cancel', '|', 'copy', '|', 'exportExcel', 'exportPdf', 'exportCsv']);
    assert.deepEqual(byId(items, 'exportExcel'), { id: 'exportExcel', label: 'Export to Excel', disabled: true, disabledReason: 'Excel export is not available' });
    assert.equal(byId(items, 'exportPdf')?.disabledReason, 'PDF export is not available');
    // CSV export and print are built in (no writer package needed).
    assert.equal(byId(items, 'exportCsv')?.disabled, undefined);
    assert.equal(byId(items, 'copy')?.disabledReason, 'Clipboard is not available');
    assert.equal(byId(items, 'edit')?.disabledReason, 'Editing is not available');
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'row', rowId: 'p0' })), menuIds(items));
  });

  it('the edit and clipboard modules enable their items', () => {
    const m = make({ contextMenu: true, modules: [createEditModule<Person>(), createClipboardModule<Person>()] });
    const items = m.chrome.contextMenuItems({ kind: 'cell', rowId: 'p0', field: 'name' });
    for (const id of ['edit', 'delete', 'save', 'cancel', 'copy']) assert.deepEqual(Object.keys(byId(items, id) ?? {}).sort(), ['id', 'label'], id);
    assert.equal(byId(items, 'exportExcel')?.disabled, true);
  });

  it('the built-in copy writes lookup display text with the edit module, drafts included', async () => {
    const ages = [20, 21, 22].map((k) => ({ k, label: `Age ${k}` }));
    const lookupColumns: readonly DataGridColumn<Person>[] = [
      { field: 'id', header: 'ID', primaryKey: true },
      { field: 'age', header: 'Age', lookup: { data: ages, keyField: 'k', displayField: 'label' } } as DataGridColumn<Person>,
    ];
    const m = make({ columns: lookupColumns, contextMenu: true, modules: [createEditModule<Person>(), createClipboardModule<Person>()] });
    const written: string[] = [];
    const doc = { activeElement: null, body: {}, defaultView: { navigator: { clipboard: { writeText: async (t: string) => void written.push(t) } } } };
    m.instance.root = { closest: () => ({}), ownerDocument: doc, contains: () => false, querySelector: () => null } as never;
    m.api.selectRows(['p1']);
    assert.equal(m.chrome.runCommand('clipboard.copy'), true);
    assert.equal(written.at(-1), 'p1\tAge 21');
    m.engine.dispatch({ type: 'edit.start', rowId: 'p1', columnId: 'age' });
    m.engine.dispatch({ type: 'edit.setValue', rowId: 'p1', columnId: 'age', value: 22 });
    m.chrome.runCommand('clipboard.copy');
    assert.equal(written.at(-1), 'p1\tAge 22', 'a draft key is mapped to its display text');
  });

  it('a registered command handler enables an export item', () => {
    const m = make({ contextMenu: true });
    const off = m.api.registerCommandHandler('export.excel', () => true);
    assert.equal(byId(m.chrome.contextMenuItems({ kind: 'cell', rowId: 'p0', field: 'name' }), 'exportExcel')?.disabled, undefined);
    off();
    assert.equal(byId(m.chrome.contextMenuItems({ kind: 'cell', rowId: 'p0', field: 'name' }), 'exportExcel')?.disabled, true);
  });

  it('header targets default to autosize, group, sort and pin items', () => {
    const m = make({ contextMenu: true, sorting: true, grouping: {}, resizable: true });
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'header', field: 'name' })), [
      'autoSizeAll', 'autoSize', '|', 'group', 'ungroup', '|', 'sortAscending', 'sortDescending', '|', 'pinStart', 'pinEnd', 'unpin',
    ]);
  });

  it('pager targets list the page items only with paging', () => {
    assert.deepEqual(make({ contextMenu: true }).chrome.contextMenuItems({ kind: 'pager' }), []);
    const m = make({ contextMenu: true, paging: { pageSize: 2 } });
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'pager' })), ['firstPage', 'previousPage', 'nextPage', 'lastPage']);
  });

  it('a group caption target drops edit, delete and copy from a custom list', () => {
    const m = make({ contextMenu: ['edit', 'delete', 'copy', 'save', 'exportCsv'] });
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'groupCaption', rowId: '__g1' })), ['save', 'exportCsv']);
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'header', field: 'name' })), [], 'content items stay off the header');
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'cell', rowId: 'p1', field: 'name' })), ['edit', 'delete', 'copy', 'save', 'exportCsv']);
  });

  it('a contextMenu array shows each built-in on its own area: header, content, pager', () => {
    const m = make({ contextMenu: ['autoSize', 'sortAscending', 'pinStart', 'separator', 'copy', 'exportCsv', 'separator', 'firstPage', 'nextPage'] as never, sorting: true, paging: { pageSize: 2 } });
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'header', field: 'name' })), ['autoSize', 'sortAscending', 'pinStart']);
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'cell', rowId: 'p0', field: 'name' })), ['copy', 'exportCsv']);
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'row', rowId: 'p0' })), ['copy', 'exportCsv']);
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'pager' })), ['firstPage', 'nextPage'], 'page items stay off cells and headers');
  });

  it('custom items show on every target unless `targets` lists the kinds', () => {
    const everywhere: DataGridMenuItem = { id: 'everywhere', label: 'Everywhere' };
    const headerOnly: DataGridMenuItem = { id: 'headerOnly', label: 'Header', targets: ['header'] };
    const content: DataGridMenuItem = { id: 'content', label: 'Content', targets: ['cell', 'row'] };
    const pager: DataGridMenuItem = { id: 'pagerOnly', label: 'Pager', targets: ['pager'] };
    const m = make({ contextMenu: [everywhere, headerOnly, content, pager] });
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'header', field: 'name' })), ['everywhere', 'headerOnly']);
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'cell', rowId: 'p0', field: 'name' })), ['everywhere', 'content']);
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'groupCaption', rowId: '__g1' })), ['everywhere']);
    assert.deepEqual(menuIds(m.chrome.contextMenuItems({ kind: 'pager' })), ['everywhere', 'pagerOnly']);
  });

  it('custom items with nested items pass through unchanged', () => {
    const custom: DataGridMenuItem = { id: 'more', label: 'More', items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true }] };
    const m = make({ contextMenu: [custom, 'separator' as never, 'sortAscending'] as never });
    const items = m.chrome.contextMenuItems({ kind: 'cell', rowId: 'p0', field: 'name' });
    assert.deepEqual(menuIds(items), ['more'], 'sortAscending needs the sort module; the trailing separator is dropped');
    assert.equal(items[0], custom);
  });

  it('onBeforeContextMenuOpen gets the target and can replace items or cancel; an empty list does not open', () => {
    let mode: 'replace' | 'cancel' | 'empty' = 'replace';
    const targets: unknown[] = [];
    const m = make({
      contextMenu: true,
      onBeforeContextMenuOpen: (e) => {
        targets.push(e.target);
        if (mode === 'cancel') e.preventDefault();
        else e.items.splice(0, e.items.length, ...(mode === 'empty' ? [] : [{ id: 'x', label: 'X' }]));
      },
    });
    attachRoot(m);
    const target = { kind: 'cell', rowId: 'p2', field: 'age' } as const;
    assert.equal(m.chrome.openContextMenu(target, { left: 5, top: 6, width: 0, height: 0 }, 'pointer'), true);
    const overlay = m.chrome.getOverlay();
    assert.equal(overlay?.kind, 'contextMenu');
    assert.deepEqual(overlay?.kind === 'contextMenu' ? [overlay.target, menuIds(overlay.items)] : null, [target, ['x']]);
    m.chrome.close(false, 'api');
    mode = 'cancel';
    assert.equal(m.chrome.openContextMenu(target, { left: 0, top: 0, width: 0, height: 0 }, 'keyboard'), false);
    mode = 'empty';
    assert.equal(m.chrome.openContextMenu(target, { left: 0, top: 0, width: 0, height: 0 }, 'keyboard'), false);
    assert.equal(m.chrome.isOpen(), false);
    assert.deepEqual(targets, [target, target, target]);
  });

  it('onContextMenuItemClick gets the item, target and rowIds; preventDefault skips the command', () => {
    const calls: string[] = [];
    let prevent = false;
    const seen: { id: string; target: unknown; rowIds: readonly string[] }[] = [];
    const m = make({
      contextMenu: true,
      onContextMenuItemClick: (e) => {
        seen.push({ id: e.item.id, target: e.target, rowIds: e.rowIds });
        if (prevent) e.preventDefault();
      },
    });
    m.api.registerCommandHandler('export.csv', () => {
      calls.push('csv');
    });
    const target = { kind: 'cell', rowId: 'p3', field: 'name' } as const;
    menuAction(m.chrome, { id: 'exportCsv', label: '' }, 'name', target, 'pointer');
    prevent = true;
    assert.equal(menuAction(m.chrome, { id: 'exportCsv', label: '' }, 'name', target, 'pointer'), false);
    assert.deepEqual(calls, ['csv']);
    assert.deepEqual(seen, [
      { id: 'exportCsv', target, rowIds: ['p3'] },
      { id: 'exportCsv', target, rowIds: ['p3'] },
    ]);
  });

  it('the context menu does not open without a root (server / unmounted)', () => {
    const m = make({ contextMenu: true });
    assert.equal(m.chrome.openContextMenu({ kind: 'header', field: 'name' }, { left: 0, top: 0, width: 0, height: 0 }, 'api'), false);
  });
});

describe('toolbar model', () => {
  it('resolves built-in defaults and merges item objects over them', () => {
    const m = make({ toolbar: ['add', { id: 'print', label: 'Print now', align: 'end' }, { id: 'mine', label: 'Mine' }, 'search'] });
    assert.deepEqual(m.chrome.toolbarItems(), [
      { id: 'add', label: 'Add', builtIn: 'add', align: 'start' },
      { id: 'print', label: 'Print now', builtIn: 'print', align: 'end' },
      { id: 'mine', label: 'Mine' },
      { id: 'search', label: 'Search', builtIn: 'search', align: 'end' },
    ]);
  });

  it('enablement: module commands, registered handlers, grouping, search, and the disabled flag', () => {
    const m = make({ toolbar: ['add', 'print', 'exportPdf', 'expandAll', 'search', 'columnChooser', { id: 'x', disabled: true }] });
    const state = () => Object.fromEntries(m.chrome.toolbarItems().map((i) => [i.id, m.chrome.toolbarItemState(i)]));
    assert.deepEqual(state(), {
      add: { disabled: true, reason: 'Editing is not available' },
      print: { disabled: false, reason: undefined },
      exportPdf: { disabled: true, reason: 'PDF export is not available' },
      expandAll: { disabled: true, reason: 'Grouping is not available' },
      search: { disabled: true, reason: 'Search is not available' },
      columnChooser: { disabled: false, reason: undefined },
      x: { disabled: true, reason: undefined },
    });
    const v0 = m.chrome.getToolbarVersion();
    let notified = 0;
    m.chrome.subscribeToolbar(() => notified++);
    const off = m.api.registerCommandHandler('export.pdf', () => true);
    assert.equal(m.chrome.getToolbarVersion(), v0 + 1);
    assert.equal(notified, 1);
    assert.deepEqual(state().exportPdf, { disabled: false, reason: undefined });
    off();
    assert.equal(notified, 2);
    assert.equal(state().exportPdf?.disabled, true);
  });

  it('edit items follow the edit state outside batch mode: Add/Edit/Delete lock while editing, Save/Cancel need an edit', () => {
    const m = make({ modules: [createEditModule<Person>()], toolbar: ['add', 'edit', 'delete', 'save', 'cancel', 'print'] });
    const disabled = () => Object.fromEntries(m.chrome.toolbarItems().map((i) => [i.id, m.chrome.toolbarItemState(i, undefined, (b) => editItemDisabled(b, toolbarEditBits(m.engine))).disabled]));
    // At rest with no target row: only Add (and non-edit items).
    assert.deepEqual(disabled(), { add: false, edit: true, delete: true, save: true, cancel: true, print: false });
    // A focused cell alone is no target while selection is on (no selected record).
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p1', columnId: 'name' } });
    assert.equal(disabled().edit, true);
    // A selected row is the target row.
    m.engine.dispatch({ type: 'selection.selectRows', rowIds: ['p1'] });
    assert.deepEqual(disabled(), { add: false, edit: false, delete: false, save: true, cancel: true, print: false });
    const bitsAtRest = toolbarEditBits(m.engine);
    // Moving focus to another cell does not change the selected bits (the toolbar does not re-render).
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p2', columnId: 'age' } });
    assert.equal(toolbarEditBits(m.engine), bitsAtRest);
    m.engine.dispatch({ type: 'edit.start', rowId: 'p1', columnId: 'name' });
    assert.deepEqual(disabled(), { add: true, edit: true, delete: true, save: false, cancel: false, print: false });
    m.engine.dispatch({ type: 'edit.cancel' });
    assert.deepEqual(disabled(), { add: false, edit: false, delete: false, save: true, cancel: true, print: false });
    // Permissions: add / edit / delete false disable their item; an explicit disabled always wins.
    m.engine.dispatch({ type: 'edit.setOptions', options: { add: false, delete: false } } as never);
    assert.deepEqual(disabled(), { add: true, edit: false, delete: true, save: true, cancel: true, print: false });
    m.engine.dispatch({ type: 'edit.setOptions', options: { edit: false } } as never);
    assert.deepEqual(disabled(), { add: true, edit: true, delete: true, save: true, cancel: true, print: false });
    // Selection cleared: no target row.
    m.engine.dispatch({ type: 'selection.selectRows', rowIds: [] });
    assert.equal(disabled().edit, true);
  });

  it('with selection off a focused body cell is the target row', () => {
    const m = make({ modules: [createEditModule<Person>()], selection: false, toolbar: ['edit', 'delete'] });
    const disabled = () => Object.fromEntries(m.chrome.toolbarItems().map((i) => [i.id, m.chrome.toolbarItemState(i, undefined, (b) => editItemDisabled(b, toolbarEditBits(m.engine))).disabled]));
    assert.deepEqual(disabled(), { edit: true, delete: true });
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p1', columnId: 'name' } });
    assert.deepEqual(disabled(), { edit: false, delete: false });
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'header', columnId: 'name', level: 0 } });
    assert.deepEqual(disabled(), { edit: true, delete: true });
  });

  it('batch mode: Save/Cancel enable with pending changes or an open cell editor; Add/Edit/Delete stay enabled', () => {
    const m = make({ modules: [createEditModule<Person>()], toolbar: ['add', 'edit', 'delete', 'save', 'cancel'] });
    m.engine.dispatch({ type: 'edit.setOptions', options: { mode: 'batch' } } as never);
    const disabled = () => Object.fromEntries(m.chrome.toolbarItems().map((i) => [i.id, m.chrome.toolbarItemState(i, undefined, (b) => editItemDisabled(b, toolbarEditBits(m.engine))).disabled]));
    m.engine.dispatch({ type: 'selection.selectRows', rowIds: ['p1'] });
    assert.deepEqual(disabled(), { add: false, edit: false, delete: false, save: true, cancel: true });
    m.engine.dispatch({ type: 'edit.start', rowId: 'p1', columnId: 'name' });
    assert.deepEqual(disabled(), { add: false, edit: false, delete: false, save: false, cancel: false });
    m.engine.dispatch({ type: 'edit.setValue', rowId: 'p1', columnId: 'name', value: 'Changed' });
    m.engine.dispatch({ type: 'edit.commit' });
    assert.equal(m.engine.getModuleState<{ active: unknown }>('edit')?.active, null);
    assert.deepEqual(disabled(), { add: false, edit: false, delete: false, save: false, cancel: false });
    m.engine.dispatch({ type: 'edit.cancelBatch' });
    assert.deepEqual(disabled(), { add: false, edit: false, delete: false, save: true, cancel: true });
    // A batch delete mark is a pending change too.
    m.engine.dispatch({ type: 'edit.deleteRecords', rowIds: ['p2'] });
    assert.equal(disabled().save, false);
  });

  it('subscribeToolbarEdit notifies on selection, focus, and edit changes (module slices outside the snapshot)', () => {
    const m = make({ modules: [createEditModule<Person>()], toolbar: ['edit'] });
    let n = 0;
    const off = subscribeToolbarEdit(m.engine, () => n++);
    m.engine.dispatch({ type: 'selection.selectRows', rowIds: ['p1'] });
    assert.ok(n > 0, 'selection');
    const afterSelection = n;
    m.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'p1', columnId: 'name' } });
    assert.ok(n > afterSelection, 'focus');
    const afterFocus = n;
    m.engine.dispatch({ type: 'edit.start', rowId: 'p1', columnId: 'name' });
    assert.ok(n > afterFocus, 'edit');
    off();
    const final = n;
    m.engine.dispatch({ type: 'edit.cancel' });
    assert.equal(n, final, 'unsubscribed');
  });

  it('without editing the edit state decides nothing (module availability and reasons stay)', () => {
    const m = make({ toolbar: ['save'] });
    assert.equal(toolbarEditBits(m.engine), 0);
    assert.deepEqual(m.chrome.toolbarItemState(m.chrome.toolbarItems()[0]!), { disabled: true, reason: 'Editing is not available' });
  });

  it('runs the built-in command of a toolbar item through the handler registry', () => {
    const calls: unknown[] = [];
    const m = make({ toolbar: ['exportExcel'] });
    m.api.registerCommandHandler('export.excel', (payload) => {
      calls.push(payload);
    });
    const [item] = m.chrome.toolbarItems();
    m.chrome.runToolbarItem(item!, null, 'pointer');
    assert.deepEqual(calls, [{}]);
  });

  it('onToolbarItemClick sees the public item (no builtIn) and preventDefault skips the built-in', () => {
    const seen: unknown[] = [];
    let prevent = true;
    const calls: string[] = [];
    const m = make({
      toolbar: [{ id: 'print', title: 'Print it' }],
      onToolbarItemClick: (e) => {
        seen.push([e.type, e.source, e.item]);
        if (prevent) e.preventDefault();
      },
    });
    m.api.registerCommandHandler('grid.print', () => {
      calls.push('print');
    });
    const [item] = m.chrome.toolbarItems();
    m.chrome.runToolbarItem(item!, null, 'keyboard');
    assert.deepEqual(calls, []);
    prevent = false;
    m.chrome.runToolbarItem(item!, null, 'pointer');
    assert.deepEqual(calls, ['print']);
    assert.deepEqual(seen, [
      ['toolbarItemClick', 'keyboard', { id: 'print', label: 'Print', align: 'start', title: 'Print it' }],
      ['toolbarItemClick', 'pointer', { id: 'print', label: 'Print', align: 'start', title: 'Print it' }],
    ]);
  });

  it('a custom item only raises onToolbarItemClick', () => {
    let clicked = '';
    const m = make({ toolbar: [{ id: 'refresh', label: 'Refresh' }], onToolbarItemClick: (e) => (clicked = e.item.id) });
    const [item] = m.chrome.toolbarItems();
    m.chrome.runToolbarItem(item!, null, 'pointer');
    assert.equal(clicked, 'refresh');
  });

  it('expandAll / collapseAll dispatch the grouping commands', () => {
    const m = make({ toolbar: ['collapseAll', 'expandAll'], grouping: { groupBy: ['active'] } });
    const [collapse, expand] = m.chrome.toolbarItems();
    assert.equal(m.chrome.toolbarItemState(collapse!).disabled, false);
    const dispatched: string[] = [];
    const original = m.instance.dispatchFrom.bind(m.instance);
    m.instance.dispatchFrom = ((source: never, cmd: { type: string }) => (dispatched.push(cmd.type), original(source, cmd as never))) as never;
    m.chrome.runToolbarItem(collapse!, null, 'pointer');
    m.chrome.runToolbarItem(expand!, null, 'pointer');
    assert.deepEqual(dispatched, ['grouping.collapseAll', 'grouping.expandAll']);
  });
});

describe('UI commands', () => {
  it('the latest handler runs first; returning false falls back to the previous one', () => {
    const m = make();
    const calls: string[] = [];
    m.api.registerCommandHandler('export.pdf', () => {
      calls.push('first');
    });
    const off = m.api.registerCommandHandler('export.pdf', (payload) => {
      calls.push(`second:${String(payload['x'])}`);
      return false;
    });
    assert.equal(m.api.runCommand('export.pdf', { x: 1 }), true);
    assert.deepEqual(calls, ['second:1', 'first']);
    off();
    assert.equal(m.api.runCommand('export.pdf'), true);
    assert.deepEqual(calls, ['second:1', 'first', 'first']);
  });

  it('a command without handler or module returns false and warns once in development', () => {
    const m = make({ id: 'ui-cmd-grid' });
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(' '));
    try {
      assert.equal(m.api.runCommand('export.excel'), false);
      assert.equal(m.api.runCommand('export.excel'), false);
    } finally {
      console.warn = original;
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /ui-cmd-grid.*"export\.excel" has no handler \(Excel export\)/);
  });

  it('commandAvailable reflects the core edit and clipboard modules', () => {
    const m = make({ modules: [createEditModule<Person>()] });
    assert.equal(m.chrome.commandAvailable('edit.save'), true);
    assert.equal(m.chrome.commandAvailable('edit.add'), true);
    assert.equal(m.chrome.commandAvailable('clipboard.copy'), false);
    assert.equal(m.chrome.commandAvailable('grid.print'), true, 'print is built in');
  });
});

describe('column chooser enablement', () => {
  it('chooserEnabled follows the columnChooser prop or a toolbar columnChooser item', () => {
    assert.equal(make().chrome.chooserEnabled(), false);
    assert.equal(make({ columnChooser: true }).chrome.chooserEnabled(), true);
    assert.equal(make({ columnChooser: { searchOperator: 'startsWith' } }).chrome.chooserEnabled(), true);
    assert.equal(make({ columnChooser: false }).chrome.chooserEnabled(), false);
    assert.equal(make({ columnChooser: false, toolbar: ['columnChooser'] }).chrome.chooserEnabled(), false);
    assert.equal(make({ toolbar: ['columnChooser'] }).chrome.chooserEnabled(), true);
    assert.equal(make({ toolbar: [{ id: 'columnChooser', label: 'Cols' }] }).chrome.chooserEnabled(), true);
  });

  it('the toolbar columnChooser item opens the chooser and onBeforeColumnChooserOpen can cancel', () => {
    let cancel = false;
    let seen: readonly string[] = [];
    const m = make({
      toolbar: ['columnChooser'],
      onBeforeColumnChooserOpen: (e) => {
        seen = e.columns.map((c) => c.id);
        if (cancel) e.preventDefault();
      },
    });
    attachRoot(m);
    const [item] = m.chrome.toolbarItems();
    m.chrome.runToolbarItem(item!, anchorEl, 'pointer');
    assert.equal(m.chrome.getOverlay()?.kind, 'columnChooser');
    assert.deepEqual(m.chrome.getOverlay()?.anchor, { left: 1, top: 2, width: 3, height: 4 });
    assert.deepEqual(seen, ['id', 'name', 'age', 'active']);
    m.chrome.close(false, 'api');
    cancel = true;
    m.chrome.runToolbarItem(item!, anchorEl, 'pointer');
    assert.equal(m.chrome.isOpen(), false);
  });

  it('onBeforeColumnChooserOpen lists the chooser columns only: hideable: false and the selection column are left out', () => {
    let seen: readonly string[] = [];
    const m = make({
      columns: [{ type: 'selection' } as DataGridColumn<Person>, { ...columns[0]!, hideable: false }, ...columns.slice(1)],
      selection: { multiple: true },
      onBeforeColumnChooserOpen: (e) => {
        seen = e.columns.map((c) => c.id);
      },
    });
    attachRoot(m);
    m.chrome.openColumnChooser({ left: 0, top: 0, width: 0, height: 0 }, null, 'api');
    assert.deepEqual(seen, ['name', 'age', 'active']);
  });
});

describe('columnChooser: false', () => {
  it('disables the toolbar item and makes api.openColumnChooser() a no-op with a dev warning', () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => warnings.push(String(message));
    try {
      const m = make({ id: 'chooser-off', columnChooser: false, toolbar: ['columnChooser'], columnMenu: true });
      attachRoot(m);
      const [item] = m.chrome.toolbarItems();
      assert.deepEqual(m.chrome.toolbarItemState(item!), { disabled: true, reason: undefined });
      m.chrome.runToolbarItem(item!, anchorEl, 'pointer');
      assert.equal(m.chrome.isOpen(), false, 'toolbar item');
      m.api.openColumnChooser();
      assert.equal(m.chrome.isOpen(), false, 'api');
      menuAction(m.chrome, { id: 'columnChooser' }, null, null, 'pointer');
      assert.equal(m.chrome.isOpen(), false, 'menu action');
      assert.equal(byId(m.chrome.columnMenuItems(leaf(m, 'name')), 'columnChooser'), undefined);
      assert.equal(warnings.filter((w) => /openColumnChooser\(\) is ignored because columnChooser is false/.test(w)).length, 1);
      // The render-time state follows the render props (Toolbar passes them).
      assert.deepEqual(m.chrome.toolbarItemState(item!, { columnChooser: true }), { disabled: false, reason: undefined });
    } finally {
      console.warn = original;
    }
  });
});

describe('pin and unpin', () => {
  it('api.pinColumn pins start / end and unpins; unknown fields reject', () => {
    const m = make();
    assert.equal(m.api.pinColumn('age', 'start').status, 'applied');
    assert.equal(m.api.pinColumn('id', 'end').status, 'applied');
    assert.deepEqual(zones(m), { left: ['age'], center: ['name', 'active'], right: ['id'] });
    m.api.pinColumn('age', null);
    assert.deepEqual(zones(m).left, []);
    const r = m.api.pinColumn('nope', 'start');
    assert.equal(r.status, 'rejected');
  });

  it('onBeforeColumnPinChange can cancel; onColumnPinChange reports pinned and previousPinned', () => {
    const before: unknown[] = [];
    const after: unknown[] = [];
    let cancel = true;
    const m = make({
      onBeforeColumnPinChange: (e) => {
        before.push([e.field, e.pinned, e.previousPinned]);
        if (cancel) e.preventDefault();
      },
      onColumnPinChange: (e) => after.push([e.type, e.source, e.field, e.pinned, e.previousPinned]),
    });
    const prevented = m.chrome.pin('name', 'end', 'api');
    assert.deepEqual(prevented, { status: 'rejected', reason: 'prevented' });
    assert.deepEqual(zones(m).right, []);
    cancel = false;
    m.chrome.pin('name', 'end', 'keyboard');
    m.chrome.pin('name', 'start', 'pointer');
    // Pinning to the zone it is already in raises nothing.
    m.chrome.pin('name', 'start', 'pointer');
    assert.deepEqual(before, [
      ['name', 'end', null],
      ['name', 'end', null],
      ['name', 'start', 'end'],
    ]);
    assert.deepEqual(after, [
      ['columnPinChange', 'keyboard', 'name', 'end', null],
      ['columnPinChange', 'pointer', 'name', 'start', 'end'],
    ]);
  });

  it('the pinStart / pinEnd / unpin menu items pin through the same path', () => {
    const m = make({ columnMenu: true });
    menuAction(m.chrome, { id: 'pinEnd', label: '' }, 'name', null, 'pointer');
    assert.deepEqual(zones(m).right, ['name']);
    menuAction(m.chrome, { id: 'pinStart', label: '' }, 'name', null, 'pointer');
    assert.deepEqual(zones(m).left, ['name']);
    menuAction(m.chrome, { id: 'unpin', label: '' }, 'name', null, 'pointer');
    // Unpinning from the start puts the column at the start edge of the center zone.
    assert.deepEqual(zones(m), { left: [], center: ['name', 'id', 'age', 'active'], right: [] });
  });

  it('pinning a column to the start also pins the selection column', () => {
    const m = make({ selection: { multiple: true }, columns: [{ type: 'selection' } as DataGridColumn<Person>, ...columns] });
    const selectionId = (m.engine.getSnapshot().columns.visible[0] as CompiledColumn<Person>).columnId;
    m.api.pinColumn('age', 'start');
    assert.deepEqual(zones(m).left, [selectionId, 'age']);
  });

  it('pinnedColumns counts reach the engine as the frozen count', () => {
    const m = make({ pinnedColumns: { start: 1, end: 2 } });
    assert.deepEqual(zones(m), { left: ['id'], center: ['name'], right: ['age', 'active'] });
    // Unpinning a counted column keeps the other counted columns pinned.
    m.api.pinColumn('active', null);
    assert.deepEqual(zones(m).right, ['age']);
  });
});

describe('span planner under column virtualization', () => {
  type Wide = { id: string } & Record<string, string>;
  const wideColumns = (spans: Record<number, number>): ColumnDef<Wide>[] =>
    Array.from({ length: 40 }, (_, i) => ({ field: `c${i}`, width: 100, ...(spans[i] ? { colSpan: () => spans[i] } : {}) }) as ColumnDef<Wide>);
  const engineFor = (spans: Record<number, number>) => {
    const row: Wide = { id: 'r0' };
    for (let i = 0; i < 40; i++) row[`c${i}`] = `v${i}`;
    const engine = createDataGridEngine<Wide>({ getRowId: (r) => r.id, columns: wideColumns(spans), dataSource: [row] });
    return { engine, row, zone: engine.getSnapshot().columns.center };
  };
  const plan = (spans: Record<number, number>, start: number, end: number) => {
    const { engine, row, zone } = engineFor(spans);
    const clamped: string[] = [];
    const out = planZone(engine, undefined, spanFlags(zone, undefined), row, 'r0', 0, zone, start, end, null, (id: string) => clamped.push(id));
    return { out, clamped };
  };

  it('a span that starts before the rendered slice is drawn at the slice front, pulled back by its hidden part', () => {
    const { out } = plan({ 3: 4 }, 5, 10);
    assert.ok(out);
    assert.deepEqual(out.map((p) => [p.column.columnId, p.index, p.colSpan]), [['c3', 3, 4], ['c7', 7, 1], ['c8', 8, 1], ['c9', 9, 1]]);
    assert.deepEqual(out[0]!.style, {
      width: 'calc(var(--salmon-data-grid-cw-3) + var(--salmon-data-grid-cw-4) + var(--salmon-data-grid-cw-5) + var(--salmon-data-grid-cw-6))',
      marginInlineStart: 'calc(-1 * calc(var(--salmon-data-grid-cw-3) + var(--salmon-data-grid-cw-4)))',
    });
  });

  it(`looks back ${SPAN_LOOKBACK} columns; a span starting further back is not drawn`, () => {
    assert.equal(SPAN_LOOKBACK, 16);
    const near = plan({ 4: 30 }, 20, 25).out;
    assert.equal(near?.[0]?.column.columnId, 'c4');
    assert.equal(near?.length, 1);
    // Starts 17 columns before the slice: outside the lookback, the slice renders plain cells.
    const far = plan({ 3: 30 }, 20, 25).out;
    assert.equal(far, null);
  });

  it('a span that ends before the slice does not affect it', () => {
    const { out } = plan({ 2: 2 }, 5, 10);
    assert.deepEqual(out?.map((p) => [p.index, p.colSpan]), [[5, 1], [6, 1], [7, 1], [8, 1], [9, 1]]);
    assert.ok(out?.every((p) => p.style === undefined));
  });

  it('a span inside the slice covers its columns; one past the zone end is clamped and reported', () => {
    const { out, clamped } = plan({ 37: 9 }, 30, 40);
    assert.deepEqual(out?.map((p) => [p.column.columnId, p.colSpan]).slice(-1), [['c37', 3]]);
    assert.deepEqual(clamped, ['c37']);
  });

  it('no spans: the default path (null plan)', () => {
    const { engine, row, zone } = engineFor({});
    assert.deepEqual(spanFlags(zone, undefined), { col: false, row: false });
    assert.equal(planZone(engine, undefined, spanFlags(zone, undefined), row, 'r0', 0, zone, 0, 10, null, () => {}), null);
    assert.deepEqual(spanFlags(zone, 'columns'), { col: true, row: false });
    assert.deepEqual(spanFlags(zone, 'rows'), { col: false, row: true });
    assert.deepEqual(spanFlags(zone, true), { col: true, row: true });
  });
});

describe('DataGridApi row index lookups', () => {
  it('getRowIdAt is the inverse of getRowIndex in the visible (sorted) order', () => {
    const m = make({ sorting: { sortBy: [{ field: 'id', direction: 'desc' }] } } as never);
    const first = m.api.getRowIdAt(0) as string;
    assert.equal(m.api.getRowIndex(first), 0);
    assert.equal(first, m.engine.getRowIdAt(0));
    assert.notEqual(first, 'p0', 'descending order');
    assert.equal(m.api.getRowIdAt(-1), undefined);
  });
});

describe('unstable template identity warning', () => {
  it('warns once per template after consecutive commits with a new function identity', () => {
    const warnings: string[] = [];
    const onWarning = (w: { code: string; message: string }) => warnings.push(`${w.code}: ${w.message}`);
    const stableCell = () => 'x';
    const props = (n: number, inline: boolean) =>
      ({
        data: people(5),
        columns: [...columns, { field: 'name', id: 'tpl', header: 'T', renderCell: inline ? () => `c${n}` : stableCell }],
        getRowProps: inline ? () => ({ 'data-n': String(n) }) : undefined,
        onWarning,
      }) as never;
    const m = make(props(0, false) as never);
    for (let n = 1; n <= 2; n++) m.instance.syncProps(props(n, true));
    m.instance.flushWarnings();
    assert.equal(warnings.filter((w) => w.startsWith('template-identity-unstable')).length, 0, 'one or two changes are fine');
    for (let n = 3; n <= 6; n++) m.instance.syncProps(props(n, true));
    m.instance.flushWarnings();
    const unstable = warnings.filter((w) => w.startsWith('template-identity-unstable'));
    assert.equal(unstable.length, 2, unstable.join('\n'));
    assert.ok(unstable.some((w) => w.includes('getRowProps')));
    assert.ok(unstable.some((w) => w.includes('columns.tpl.renderCell')));
  });

  it('stable templates never warn', () => {
    const warnings: string[] = [];
    const renderCell = () => 'x';
    const cols = [...columns, { field: 'name', id: 'tpl', header: 'T', renderCell }];
    const m = make({ columns: cols, onWarning: (w: { code: string }) => warnings.push(w.code) } as never);
    for (let n = 0; n < 5; n++) m.instance.syncProps({ data: people(5), columns: [...cols], onWarning: (w: { code: string }) => warnings.push(w.code) } as never);
    m.instance.flushWarnings();
    assert.equal(warnings.includes('template-identity-unstable'), false);
  });
});

describe('onWarning delivery', () => {
  it('queues warnings raised while compiling columns (render) and delivers them after commit, deduped', () => {
    const codes: string[] = [];
    const bad = [...columns, { field: 'name', header: 'Again', width: -5 } as DataGridColumn<Person>];
    const m = make({ columns: bad, onWarning: (w) => codes.push(w.code) });
    assert.equal(codes.length, 0, 'nothing during construction (render)');
    m.instance.flushWarnings();
    assert.ok(codes.includes('column-width-invalid'), codes.join());
    const n = codes.length;
    m.instance.syncProps({ data: people(5), columns: [...bad], onWarning: (w: { code: string }) => codes.push(w.code) } as never);
    m.instance.flushWarnings();
    assert.equal(codes.length, n, 'the same warning is not repeated');
  });
});

describe('keyboard column resize events', () => {
  it('Ctrl+Alt+Arrow fires start / resize / end with the committed width; start can cancel', () => {
    const events: string[] = [];
    let cancel = false;
    const m = make({
      resizable: true,
      onColumnResizeStart: (e) => {
        events.push(`${e.type}:${e.field}:${e.width}:${e.source}`);
        if (cancel) e.preventDefault();
      },
      onColumnResize: (e) => events.push(`${e.type}:${e.width}:${e.previousWidth}`),
      onColumnResizeEnd: (e) => events.push(`${e.type}:${e.width}:${e.previousWidth}`),
    });
    assert.equal(m.instance.headerCommand('resizeWider', 'name'), true);
    assert.deepEqual(events, ['columnResizeStart:name:160:keyboard', 'columnResize:170:160', 'columnResizeEnd:170:160']);
    events.length = 0;
    m.instance.headerCommand('resizeNarrower', 'name');
    assert.equal(events.at(-1), 'columnResizeEnd:160:170');
    events.length = 0;
    cancel = true;
    m.instance.headerCommand('resizeWider', 'name');
    assert.deepEqual(events, ['columnResizeStart:name:160:keyboard'], 'prevented: no resize, no end');
    assert.equal(m.instance.layout.getColumnLayout().widths.get('name'), 160);
  });
});
