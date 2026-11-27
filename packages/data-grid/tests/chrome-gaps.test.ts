import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ColumnId } from '@salmonui/data-grid/engine';
import { createEditModule } from '@salmonui/data-grid/engine/edit';
import type { DataGridAdaptiveDialogOpenEvent, DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridAdaptiveInteraction } from '../dist/data-grid/adaptive-interaction.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { menuAction } from '../dist/data-grid/menu-action.js';
import { people, type Person, newInstance } from './fixtures.ts';

// Column menu and context menu actions without a DOM and the
// adaptive dialog event: the DataGridChrome controller of a DataGridInstance
// run through `menuAction`, the same entry point the rendered menus call.
// Overlays that open need a root; a minimal stand-in supplies the container,
// the anchor rect and `querySelector` (no header element is rendered).

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80, primaryKey: true },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 90 },
  { field: 'active', header: 'Active', type: 'boolean', width: 90 },
];

// `chrome.headerElement` escapes the column id; Node has no CSS global.
(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s: string) => s };

let seq = 0;
function make(props: Partial<DataGridProps<Person>> = {}) {
  const instance = newInstance<Person>({ data: people(5), columns, ...props } as never, `:gaps${seq++}:`);
  return { instance, chrome: instance.chrome, api: instance.api, engine: instance.engine };
}
type Made = ReturnType<typeof make>;

const ROOT_RECT = { left: 10, top: 20, width: 600, height: 400 };
/** Root stand-in: a container, an anchor rect, no rendered header cells. */
function attachRoot(m: Made): void {
  const doc = { activeElement: null, body: {} };
  m.instance.root = { closest: () => ({}), ownerDocument: doc, contains: () => false, querySelector: () => null, getBoundingClientRect: () => ROOT_RECT, focus: () => undefined } as never;
}
const anchorEl = { closest: () => null, getBoundingClientRect: () => ({ left: 1, top: 2, width: 3, height: 4 }) } as never;
const item = (id: string) => ({ id, label: '' });
/** Records `columns.setWidths` and stubs the DOM measurement (`measureColumns`). */
function stubMeasure(m: Made): { measured: (readonly ColumnId[])[]; widths: () => Record<string, number> } {
  const measured: (readonly ColumnId[])[] = [];
  m.instance.measureColumns = ((ids: readonly ColumnId[]) => {
    measured.push([...ids]);
    return new Map(ids.map((id, i) => [id, 100 + i]));
  }) as never;
  return { measured, widths: () => Object.fromEntries(m.engine.getSnapshot().columns.visible.map((c) => [c.columnId, m.instance.layout.getColumnLayout().widths.get(c.columnId) ?? -1])) };
}

describe('column menu actions', () => {
  it('autoSize fits only its column; autoSizeAll fits every visible column', () => {
    const m = make({ columnMenu: true });
    const { measured, widths } = stubMeasure(m);
    assert.equal(menuAction(m.chrome, item('autoSize'), 'age', null, 'pointer'), true);
    assert.deepEqual(measured, [['age']]);
    assert.equal(widths()['age'], 100);
    assert.equal(widths()['name'], 160, 'other columns keep their width');
    assert.equal(menuAction(m.chrome, item('autoSizeAll'), 'age', null, 'pointer'), true);
    assert.deepEqual(measured[1], ['id', 'name', 'age', 'active']);
    assert.deepEqual(widths(), { id: 100, name: 101, age: 102, active: 103 });
  });

  it('filter replaces the column menu with that column\'s filter menu; columnChooser with the chooser', () => {
    const m = make({ columnMenu: true, filtering: { ui: 'menu' } });
    attachRoot(m);
    assert.equal(m.chrome.openColumnMenu('name', 'pointer', anchorEl), true);
    assert.equal(m.chrome.getOverlay()?.kind, 'columnMenu');
    assert.equal(menuAction(m.chrome, item('filter'), 'name', null, 'pointer'), true);
    const filter = m.chrome.getOverlay();
    assert.equal(filter?.kind, 'filterMenu');
    assert.equal(filter?.kind === 'filterMenu' ? filter.columnId : null, 'name');
    m.chrome.close(false, 'api');
    assert.equal(m.chrome.isOpen(), false);

    assert.equal(m.chrome.openColumnMenu('age', 'pointer', anchorEl), true);
    assert.equal(menuAction(m.chrome, item('columnChooser'), 'age', null, 'pointer'), true);
    const chooser = m.chrome.getOverlay();
    assert.equal(chooser?.kind, 'columnChooser');
    // The chooser opens where the column menu was anchored.
    assert.deepEqual(chooser?.anchor, { left: 1, top: 2, width: 3, height: 4 });
  });

  it('filter does nothing for a column that cannot filter; the menu closes', () => {
    const m = make({ columnMenu: true, filtering: { ui: 'menu' }, columns: [columns[0]!, { ...columns[1]!, filterable: false } as DataGridColumn<Person>] });
    attachRoot(m);
    m.chrome.openColumnMenu('name', 'pointer', anchorEl);
    menuAction(m.chrome, item('filter'), 'name', null, 'pointer');
    assert.equal(m.chrome.isOpen(), false);
  });
});

describe('context menu actions', () => {
  const cellTarget = (rowId: string, field = 'name') => ({ kind: 'cell', rowId, field }) as const;

  // With the edit module the React edit host owns these commands and runs them once its lazy
  // chunk is mounted (a browser concern, see tests/browser/chrome-gaps.spec.ts); here the
  // commands are taken by registered handlers to check what the items send.
  it('edit, delete, save and cancel send their edit commands with the target row and column', () => {
    const calls: [string, unknown][] = [];
    const m = make({ contextMenu: true, modules: [createEditModule<Person>()] });
    for (const command of ['edit.begin', 'edit.delete', 'edit.save', 'edit.cancel']) m.api.registerCommandHandler(command, (payload) => void calls.push([command, payload]));
    const items = m.chrome.contextMenuItems(cellTarget('p1'));
    for (const id of ['edit', 'delete', 'save', 'cancel']) assert.equal(items.find((i) => i.id === id)?.disabled, undefined, `${id} enabled`);
    menuAction(m.chrome, item('edit'), 'name', cellTarget('p1'), 'pointer');
    menuAction(m.chrome, item('delete'), 'name', cellTarget('p3'), 'pointer');
    menuAction(m.chrome, item('save'), 'name', cellTarget('p1'), 'keyboard');
    menuAction(m.chrome, item('cancel'), 'name', cellTarget('p1'), 'pointer');
    assert.deepEqual(calls, [
      ['edit.begin', { rowId: 'p1', columnId: 'name' }],
      ['edit.delete', { rowIds: ['p3'] }],
      ['edit.save', {}],
      ['edit.cancel', {}],
    ]);
  });

  it('delete acts on the whole selection when the target row is selected', () => {
    const calls: unknown[] = [];
    const m = make({ contextMenu: true, selection: { multiple: true }, modules: [createEditModule<Person>()] });
    m.api.registerCommandHandler('edit.delete', (payload) => void calls.push(payload));
    m.api.selectRows(['p1', 'p2']);
    menuAction(m.chrome, item('delete'), 'name', cellTarget('p2'), 'pointer');
    menuAction(m.chrome, item('delete'), 'name', cellTarget('p4'), 'pointer');
    assert.deepEqual(calls, [{ rowIds: ['p1', 'p2'] }, { rowIds: ['p4'] }]);
  });

  it('sortAscending / sortDescending and group / ungroup from a header target', () => {
    const m = make({ contextMenu: true, sorting: true, grouping: {} });
    const header = { kind: 'header', field: 'age' } as const;
    menuAction(m.chrome, item('sortDescending'), 'age', header, 'pointer');
    assert.deepEqual(m.engine.getSnapshot().query.sorting.map((s) => [s.columnId, s.direction]), [['age', 'desc']]);
    menuAction(m.chrome, item('sortAscending'), 'age', header, 'pointer');
    assert.deepEqual(m.engine.getSnapshot().query.sorting.map((s) => [s.columnId, s.direction]), [['age', 'asc']]);
    menuAction(m.chrome, item('group'), 'active', { kind: 'header', field: 'active' }, 'pointer');
    assert.deepEqual(m.engine.getSnapshot().query.grouping.map((g) => g.columnId), ['active']);
    menuAction(m.chrome, item('ungroup'), 'active', { kind: 'header', field: 'active' }, 'pointer');
    assert.deepEqual(m.engine.getSnapshot().query.grouping, []);
  });

  it('exportExcel / exportPdf run the export commands', () => {
    const calls: string[] = [];
    const m = make({ contextMenu: true });
    m.api.registerCommandHandler('export.excel', () => void calls.push('excel'));
    m.api.registerCommandHandler('export.pdf', () => void calls.push('pdf'));
    menuAction(m.chrome, item('exportExcel'), 'name', cellTarget('p0'), 'pointer');
    menuAction(m.chrome, item('exportPdf'), 'name', cellTarget('p0'), 'keyboard');
    assert.deepEqual(calls, ['excel', 'pdf']);
  });

  it('firstPage / previousPage / nextPage / lastPage move the pager', () => {
    const m = make({ contextMenu: true, paging: { pageSize: 2 } });
    const page = () => (m.engine.getModuleState<{ page: number }>('paging') as { page: number }).page;
    const pager = { kind: 'pager' } as const;
    assert.equal(page(), 1);
    menuAction(m.chrome, item('nextPage'), null, pager, 'pointer');
    assert.equal(page(), 2);
    menuAction(m.chrome, item('lastPage'), null, pager, 'pointer');
    assert.equal(page(), 3);
    menuAction(m.chrome, item('previousPage'), null, pager, 'pointer');
    assert.equal(page(), 2);
    menuAction(m.chrome, item('firstPage'), null, pager, 'pointer');
    assert.equal(page(), 1);
  });
});

describe('onBeforeAdaptiveDialogOpen', () => {
  function adaptive(props: Partial<DataGridProps<Person>>) {
    const events: { type: string; kind: string; field: string | undefined; source: string }[] = [];
    let prevent = false;
    const m = make({
      adaptive: true,
      ...props,
      onBeforeAdaptiveDialogOpen: (e: DataGridAdaptiveDialogOpenEvent) => {
        events.push({ type: e.type, kind: e.kind, field: e.field, source: e.source });
        if (prevent) e.preventDefault();
      },
    });
    attachRoot(m);
    const dialogs: string[] = [];
    const host = { setDialog: (d: { kind: string }) => void dialogs.push(d.kind), close: () => undefined, returnFocusElement: () => null };
    const interaction = new DataGridAdaptiveInteraction<Person>(m.instance, host as never);
    return { m, interaction, events, dialogs, setPrevent: (v: boolean) => (prevent = v) };
  }

  it('fires with kind "sort" before the sort sheet; preventDefault keeps it closed', () => {
    const t = adaptive({ sorting: true });
    assert.equal(t.interaction.openSortDialog('pointer'), true);
    assert.deepEqual(t.dialogs, ['sort']);
    t.setPrevent(true);
    assert.equal(t.interaction.openSortDialog('api'), false);
    assert.deepEqual(t.dialogs, ['sort'], 'no second sheet');
    assert.deepEqual(t.events, [
      { type: 'beforeAdaptiveDialogOpen', kind: 'sort', field: undefined, source: 'pointer' },
      { type: 'beforeAdaptiveDialogOpen', kind: 'sort', field: undefined, source: 'api' },
    ]);
  });

  it('fires with kind "filter" and the field; preventDefault keeps the column list and the column sheet closed', () => {
    const t = adaptive({ filtering: { ui: 'excel' } });
    assert.equal(t.interaction.openFilterDialog(undefined, 'pointer'), true);
    assert.deepEqual(t.dialogs, ['filterColumns']);
    assert.equal(t.interaction.openFilterDialog('age', 'api'), true);
    assert.equal(t.m.chrome.getOverlay()?.kind, 'filterMenu');
    t.m.chrome.close(false, 'api');
    t.setPrevent(true);
    assert.equal(t.interaction.openFilterDialog(undefined, 'pointer'), false);
    assert.equal(t.interaction.openFilterDialog('name', 'api'), false);
    assert.deepEqual(t.dialogs, ['filterColumns']);
    assert.equal(t.m.chrome.isOpen(), false);
    assert.deepEqual(
      t.events.map((e) => [e.kind, e.field, e.source]),
      [
        ['filter', undefined, 'pointer'],
        ['filter', 'age', 'api'],
        ['filter', undefined, 'pointer'],
        ['filter', 'name', 'api'],
      ],
    );
  });

  it('does not fire when the feature is off (no sorting / filtering)', () => {
    const t = adaptive({});
    assert.equal(t.interaction.openSortDialog('api'), false);
    assert.equal(t.interaction.openFilterDialog(undefined, 'api'), false);
    assert.deepEqual(t.events, []);
  });
});
