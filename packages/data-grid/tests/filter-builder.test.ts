// Advanced filter builder without a DOM: the draft tree model over
// `DataGridFilter[]` (folding top-level chains, round trips, validation), the
// open / close API and `onBeforeFilterBuilderOpen` on a DataGridInstance with a
// minimal root stand-in, the `filterBuilder` toolbar item, the filter events
// of an apply (`ui: 'builder'`), and the server markup (the dialog never
// renders on the server; the option changes no grid markup).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CompiledColumn } from '@salmonui/data-grid/engine';
import type { DataGridColumn, DataGridFilter, DataGridFilterBuilderOpenEvent, DataGridFilterChangeEvent, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { builderCommand, builderFilters, builderTree, columnInfo } from '../dist/data-grid/filter-builder-model.js';
import { editDraft, idSource, insertNode, newDraftRule, updateNode, type QueryFieldInfo, type TreeGroup, type TreeRule } from '../../core/dist/internal/query/model.js';
import { people, render, type Person, newInstance } from './fixtures.ts';

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80, primaryKey: true },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 90 },
  { field: 'active', header: 'Active', type: 'boolean', width: 90 },
  { field: 'joined', header: 'Joined', type: 'date', width: 120, hidden: true },
];

let seq = 0;
function make(props: Partial<DataGridProps<Person>> = {}) {
  const instance = newInstance<Person>({ data: people(40), columns, 'aria-label': 'People', ...props } as never, `:fb${seq++}:`);
  const unmount = instance.mount();
  const columnOf = (field: string): QueryFieldInfo | undefined => {
    const column = instance.chrome.column(field) as CompiledColumn<unknown> | undefined;
    return column ? columnInfo(column, undefined) : undefined;
  };
  return { instance, chrome: instance.chrome, api: instance.api, engine: instance.engine, columnOf, unmount };
}

/** Minimal root stand-in so overlays can open: a container, a rect, no active element. */
function attachRoot(m: ReturnType<typeof make>): void {
  const doc = { activeElement: null, body: {} };
  m.instance.root = { closest: () => ({}), ownerDocument: doc, contains: () => false, querySelector: () => null, focus() {}, getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 200 }) } as never;
}

const rowCount = (m: ReturnType<typeof make>) => m.engine.getSnapshot().rows.count;

describe('filter builder draft model', () => {
  it('folds top-level per-column OR chains into groups and keeps AND conditions flat in the root', () => {
    const m = make({ filtering: { builder: true } });
    const filters: DataGridFilter[] = [
      { field: 'name', operator: 'startsWith', value: 'Person 1', logic: 'and' },
      { field: 'age', operator: 'lessThan', value: 25, logic: 'and' },
      { field: 'name', operator: 'equal', value: 'Person 2', logic: 'or' },
      { field: 'active', operator: 'equal', value: true, logic: 'and' },
    ];
    const root = builderTree(filters, m.columnOf, idSource());
    assert.equal(root.logic, 'and');
    assert.deepEqual(
      root.filters.map((c) => ('filters' in c ? `${c.logic}(${c.filters.map((x) => (x as TreeRule).field).join(',')})` : c.field)),
      ['or(name,name)', 'age', 'active'],
    );
    // Same rows as the flat top-level list.
    m.instance.dispatchFrom('api', builderCommand(filters));
    const flat = rowCount(m);
    assert.ok(flat > 0 && flat < 40);
    m.instance.dispatchFrom('api', builderCommand(builderFilters(root, m.columnOf).filters));
    assert.equal(rowCount(m), flat);
    m.unmount();
  });

  it('a single top-level group becomes the root and round-trips unchanged', () => {
    const m = make({ filtering: { builder: true } });
    const filters: DataGridFilter[] = [
      {
        logic: 'or',
        filters: [
          { field: 'age', operator: 'between', value: [20, 22] },
          { logic: 'and', filters: [{ field: 'active', operator: 'equal', value: false }, { field: 'name', operator: 'contains', value: '9' }] },
        ],
      },
    ];
    const root = builderTree(filters, m.columnOf, idSource());
    assert.equal(root.logic, 'or');
    assert.equal(root.filters.length, 2);
    assert.deepEqual(builderFilters(root, m.columnOf), { filters, invalid: [] });
    m.unmount();
  });

  it('edits: add a condition and a group, toggle logic, remove; incomplete values are reported as invalid', () => {
    const m = make({ filtering: { builder: true } });
    const next = idSource();
    let root: TreeGroup = builderTree([], m.columnOf, next);
    const a = newDraftRule('age', m.columnOf('age'), next());
    assert.equal(a.operator, 'equal');
    root = insertNode(root, root.id, a);
    root = updateNode(root, a.id, (n) => editDraft(n as TreeRule, { operator: 'greaterThan', text: '60' }, m.columnOf));
    const group: TreeGroup = { id: next(), logic: 'and', filters: [newDraftRule('name', m.columnOf('name'), next())] };
    root = insertNode(root, root.id, group);
    root = updateNode(root, group.id, (g) => ({ ...(g as TreeGroup), logic: 'or' }));
    const nameRule = (root.filters[1] as TreeGroup).filters[0] as TreeRule;
    assert.equal(nameRule.operator, 'contains');
    // The empty name value is invalid; nothing is applied.
    assert.deepEqual(builderFilters(root, m.columnOf).invalid, [nameRule.id]);
    root = updateNode(root, nameRule.id, (n) => editDraft(n as TreeRule, { text: 'Person 3' }, m.columnOf));
    root = { ...root, logic: 'or' };
    assert.deepEqual(builderFilters(root, m.columnOf).filters, [
      { logic: 'or', filters: [{ field: 'age', operator: 'greaterThan', value: 60 }, { logic: 'or', filters: [{ field: 'name', operator: 'contains', value: 'Person 3' }] }] },
    ]);
    // A negated group round-trips as a top-level group.
    const negated = updateNode(root, group.id, (g) => ({ ...(g as TreeGroup), not: true }));
    assert.deepEqual((builderFilters(negated, m.columnOf).filters[0] as unknown as { filters: unknown[] }).filters[1], { logic: 'or', not: true, filters: [{ field: 'name', operator: 'contains', value: 'Person 3' }] });
    const notRoot = builderFilters({ ...root, logic: 'and', not: true }, m.columnOf).filters;
    assert.equal(notRoot.length, 1);
    assert.equal((notRoot[0] as { not?: boolean }).not, true);
    assert.equal((builderTree(notRoot, m.columnOf, idSource()) as TreeGroup).not, true);
    // Removing the group leaves the condition; removing everything clears.
    root = updateNode(root, group.id, () => null);
    assert.equal(root.filters.length, 1);
    root = updateNode(root, a.id, () => null);
    assert.deepEqual(builderFilters(root, m.columnOf), { filters: [], invalid: [] });
    m.unmount();
  });

  it('a new field resets an operator the column does not offer and clears the value', () => {
    const m = make({ filtering: { builder: true } });
    const rule = editDraft(newDraftRule('name', m.columnOf('name'), 'r1'), { operator: 'startsWith', text: 'P' }, m.columnOf);
    const moved = editDraft(rule, { field: 'age' }, m.columnOf);
    assert.equal(moved.operator, 'equal');
    assert.equal(moved.text, '');
    // `in` lists (checklist filters) stay editable as comma-separated values.
    const root = builderTree([{ field: 'age', operator: 'in', value: [21, 22] }], m.columnOf, idSource());
    const list = root.filters[0] as TreeRule;
    assert.equal(list.text, '21, 22');
    const edited = updateNode(root, list.id, (n) => editDraft(n as TreeRule, { text: '21, 23' }, m.columnOf));
    assert.deepEqual(builderFilters(edited, m.columnOf).filters, [{ field: 'age', operator: 'in', value: [21, 23], logic: 'and' }]);
    m.unmount();
  });
});

describe('openFilterBuilder, closeFilterBuilder and onBeforeFilterBuilderOpen', () => {
  it('opens only with filtering.builder; closeFilterBuilder closes it', () => {
    const off = make({ filtering: true });
    attachRoot(off);
    off.api.openFilterBuilder();
    assert.equal(off.chrome.getOverlay(), null);
    off.unmount();

    const m = make({ filtering: { builder: true } });
    attachRoot(m);
    m.api.openFilterBuilder();
    assert.equal(m.chrome.getOverlay()?.kind, 'filterBuilder');
    m.api.closeFilterBuilder();
    assert.equal(m.chrome.getOverlay(), null);
    m.unmount();
  });

  it('onBeforeFilterBuilderOpen carries the applied filters and preventDefault() keeps the dialog closed', () => {
    const seen: DataGridFilterBuilderOpenEvent[] = [];
    let cancel = true;
    const m = make({
      filtering: { builder: { includeHidden: true }, filters: [{ field: 'age', operator: 'greaterThan', value: 60 }] },
      onBeforeFilterBuilderOpen: (e) => {
        seen.push(e);
        if (cancel) e.preventDefault();
      },
    });
    attachRoot(m);
    m.api.openFilterBuilder();
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.type, 'beforeFilterBuilderOpen');
    assert.equal(seen[0]?.source, 'api');
    assert.deepEqual(seen[0]?.filters, [{ field: 'age', operator: 'greaterThan', value: 60, logic: 'and' }]);
    assert.equal(m.chrome.getOverlay(), null);
    cancel = false;
    m.api.openFilterBuilder();
    assert.equal(m.chrome.getOverlay()?.kind, 'filterBuilder');
    m.unmount();
  });

  it("the 'filterBuilder' toolbar item is enabled only with filtering.builder and opens the dialog", () => {
    const m = make({ filtering: { builder: true }, toolbar: ['filterBuilder'] });
    attachRoot(m);
    const [item] = m.chrome.toolbarItems();
    assert.equal(item?.builtIn, 'filterBuilder');
    assert.equal(item?.label, 'Filter builder');
    assert.equal(m.chrome.toolbarItemState(item as never).disabled, false);
    assert.equal(m.chrome.toolbarItemState(item as never, { filtering: true }).disabled, true);
    m.chrome.runToolbarItem(item as never, null, 'pointer');
    assert.equal(m.chrome.getOverlay()?.kind, 'filterBuilder');
    m.unmount();
  });
});

describe("filter events of an apply carry ui: 'builder'", () => {
  it("onBeforeFilterChange / onFilterChange report ui: 'builder' for the builder and no ui for other filter changes", () => {
    const before: DataGridFilterChangeEvent[] = [];
    const after: DataGridFilterChangeEvent[] = [];
    const m = make({ filtering: { builder: true }, onBeforeFilterChange: (e) => before.push(e), onFilterChange: (e) => after.push(e) });
    const next: DataGridFilter[] = [{ logic: 'or', filters: [{ field: 'age', operator: 'lessThan', value: 21 }, { field: 'age', operator: 'greaterThan', value: 68 }] }];
    const result = m.instance.dispatchFrom('keyboard', builderCommand(next));
    assert.equal(result.status, 'applied');
    assert.equal(before[0]?.ui, 'builder');
    assert.equal(before[0]?.source, 'keyboard');
    // Members of a group report their (ignored) logic as 'and', like every filter event.
    const reported = [{ logic: 'or', filters: [{ field: 'age', operator: 'lessThan', value: 21, logic: 'and' }, { field: 'age', operator: 'greaterThan', value: 68, logic: 'and' }] }];
    assert.deepEqual(before[0]?.filters, reported);
    assert.equal(after[0]?.ui, 'builder');
    assert.deepEqual(after[0]?.filters, reported);
    assert.deepEqual(after[0]?.previousFilters, []);
    assert.equal(rowCount(m), 1);
    m.api.filterColumn('name', 'contains', '1');
    assert.equal(after.length, 2);
    assert.equal(after[1]?.ui, undefined);
    assert.equal('ui' in (after[1] as object), false);
    m.unmount();
  });

  it('a cancelled builder change keeps the filters', () => {
    const m = make({ filtering: { builder: true }, onBeforeFilterChange: (e) => e.preventDefault() });
    const result = m.instance.dispatchFrom('pointer', builderCommand([{ field: 'age', operator: 'equal', value: 30 }]));
    assert.equal(result.status, 'rejected');
    assert.equal(rowCount(m), 40);
    m.unmount();
  });
});

describe('filter builder on the server', () => {
  it('filtering.builder changes no grid markup and the dialog is not in the server HTML', () => {
    const plain = render({ rows: 20, filtering: true });
    const builder = render({ rows: 20, filtering: { builder: { includeHidden: true } } });
    assert.equal(builder, plain);
    assert.doesNotMatch(builder, /salmon-data-grid-filter-builder/);
    const withToolbar = render({ rows: 20, filtering: { builder: true }, toolbar: ['filterBuilder'] });
    assert.match(withToolbar, /<button[^>]*data-toolbar-item="filterBuilder"[^>]*>/);
    assert.doesNotMatch(withToolbar.match(/<button[^>]*data-toolbar-item="filterBuilder"[^>]*>/)?.[0] ?? '', /aria-disabled/);
    assert.match(withToolbar, />Filter builder</);
    assert.doesNotMatch(withToolbar, /role="dialog"/);
    // Without the builder option the item renders disabled.
    assert.match(render({ rows: 5, filtering: true, toolbar: ['filterBuilder'] }).match(/<button[^>]*data-toolbar-item="filterBuilder"[^>]*>/)?.[0] ?? '', /aria-disabled="true"/);
  });
});
