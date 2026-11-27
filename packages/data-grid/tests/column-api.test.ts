// Column API without a DOM and the JSX column form on the
// server: visibility before/after events through the
// DataGridInstance command hooks, `api.showColumns` / `api.hideColumns`, reactive
// `column.hidden` through `syncProps`, the `hideable` flag that keeps a
// column out of the chooser, and `<DataGridColumn>` children (flat and nested)
// against the `columns` array, plus the dev warning when both are passed.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataGrid, DataGridColumn as DataGridColumnElement, type DataGridColumn, type DataGridColumnReorderEvent, type DataGridColumnVisibilityChangeEvent, type DataGridProps } from '@salmonui/data-grid';
import { columnInfo } from '../dist/data-grid/column-info.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, people, type Person, newInstance } from './fixtures.ts';

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80, primaryKey: true },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 90 },
  { field: 'active', header: 'Active', type: 'boolean', width: 90 },
];

let seq = 0;
function make(props: Partial<DataGridProps<Person>> = {}) {
  let current = { data: people(5), columns, 'aria-label': 'People', ...props } as DataGridProps<Person>;
  const instance = newInstance<Person>(current as never, `:ca${seq++}:`);
  const unmount = instance.mount();
  const update = (next: Partial<DataGridProps<Person>>) => {
    current = { ...current, ...next } as DataGridProps<Person>;
    instance.syncProps(current as never);
  };
  const visible = () => instance.engine.getSnapshot().columns.visible.map((c) => c.columnId);
  return { instance, api: instance.api, unmount, update, visible };
}

describe('column visibility events and api', () => {
  it('api.hideColumns / showColumns by field fire onBeforeColumnVisibilityChange then onColumnVisibilityChange with hidden, shown and source', () => {
    const before: DataGridColumnVisibilityChangeEvent[] = [];
    const after: DataGridColumnVisibilityChangeEvent[] = [];
    const m = make({ onBeforeColumnVisibilityChange: (e) => before.push(e), onColumnVisibilityChange: (e) => after.push(e) });
    assert.equal(m.api.hideColumns(['age', 'active']).status, 'applied');
    assert.deepEqual(m.visible(), ['id', 'name']);
    assert.equal(before.length, 1);
    assert.equal(before[0]?.type, 'beforeColumnVisibilityChange');
    assert.deepEqual([...(before[0]?.hidden ?? [])], ['age', 'active']);
    assert.deepEqual([...(before[0]?.shown ?? [])], []);
    assert.equal(before[0]?.source, 'api');
    assert.equal(after.length, 1);
    assert.equal(after[0]?.type, 'columnVisibilityChange');
    assert.deepEqual([...(after[0]?.hidden ?? [])], ['age', 'active']);
    assert.equal(after[0]?.source, 'api');
    assert.equal(m.api.showColumns('age').status, 'applied');
    assert.deepEqual(m.visible(), ['id', 'name', 'age']);
    assert.deepEqual([...(after[1]?.shown ?? [])], ['age']);
    assert.deepEqual([...(after[1]?.hidden ?? [])], []);
    // Hiding an already hidden column changes nothing and fires nothing.
    m.api.hideColumns('active');
    assert.equal(before.length, 2);
    m.unmount();
  });

  it('onBeforeColumnVisibilityChange preventDefault() cancels hideColumns and skips the after-event', () => {
    let afterCalls = 0;
    const m = make({ onBeforeColumnVisibilityChange: (e) => e.preventDefault(), onColumnVisibilityChange: () => afterCalls++ });
    const result = m.api.hideColumns('name');
    assert.notEqual(result.status, 'applied');
    assert.deepEqual(m.visible(), ['id', 'name', 'age', 'active']);
    assert.equal(afterCalls, 0);
    m.unmount();
  });

  it('reactive column.hidden through syncProps hides and shows the column without visibility events', () => {
    let calls = 0;
    const m = make({ onBeforeColumnVisibilityChange: () => calls++, onColumnVisibilityChange: () => calls++ });
    m.update({ columns: columns.map((c) => (c.field === 'name' ? { ...c, hidden: true } : c)) });
    assert.deepEqual(m.visible(), ['id', 'age', 'active']);
    m.update({ columns: columns.map((c) => (c.field === 'name' ? { ...c, hidden: false } : c)) });
    assert.deepEqual(m.visible(), ['id', 'name', 'age', 'active']);
    // Prop sync is controlled state, not a user action: no events.
    assert.equal(calls, 0);
    m.unmount();
  });
});

describe('column reorder events', () => {
  it('onBeforeColumnReorder preventDefault keeps the order for pointer and api moves; onColumnReorder is not called', () => {
    const before: DataGridColumnReorderEvent[] = [];
    const after: DataGridColumnReorderEvent[] = [];
    let cancel = true;
    const m = make({
      reorderable: true,
      onBeforeColumnReorder: (e) => {
        before.push(e);
        if (cancel) e.preventDefault();
      },
      onColumnReorder: (e) => after.push(e),
    });
    // The header drop dispatches `columns.move` from the pointer, as `startReorder` does.
    const drop = (columnId: string, toIndex: number) => m.instance.dispatchFrom('pointer', { type: 'columns.move', columnId, toIndex });
    assert.notEqual(drop('age', 1).status, 'applied');
    assert.deepEqual(m.visible(), ['id', 'name', 'age', 'active']);
    assert.equal(before.length, 1);
    assert.deepEqual({ type: before[0]?.type, field: before[0]?.field, fromIndex: before[0]?.fromIndex, toIndex: before[0]?.toIndex, source: before[0]?.source }, { type: 'beforeColumnReorder', field: 'age', fromIndex: 2, toIndex: 1, source: 'pointer' });
    assert.equal(before[0]?.defaultPrevented, true);
    assert.equal(after.length, 0);
    assert.notEqual(m.api.moveColumn('age', 0).status, 'applied');
    assert.deepEqual(m.visible(), ['id', 'name', 'age', 'active']);
    assert.equal(before[1]?.source, 'api');
    assert.equal(after.length, 0);

    cancel = false;
    assert.equal(drop('age', 1).status, 'applied');
    assert.deepEqual(m.visible(), ['id', 'age', 'name', 'active']);
    assert.equal(after.length, 1);
    assert.deepEqual({ type: after[0]?.type, field: after[0]?.field, fromIndex: after[0]?.fromIndex, toIndex: after[0]?.toIndex, source: after[0]?.source }, { type: 'columnReorder', field: 'age', fromIndex: 2, toIndex: 1, source: 'pointer' });
    m.unmount();
  });
});

describe('column chooser eligibility', () => {
  it('hideable: false compiles showInColumnChooser false and the public column view reports hideable false', () => {
    const m = make({ columns: columns.map((c) => (c.field === 'age' ? { ...c, hideable: false } : c)), columnChooser: true });
    const leaves = m.instance.engine.getSnapshot().columns.leaves;
    const flag = (id: string) => leaves.find((c) => c.columnId === id)?.flags.showInColumnChooser;
    assert.equal(flag('age'), false);
    assert.equal(flag('name'), true);
    const view = (id: string) => columnInfo(leaves.find((c) => c.columnId === id) as never) as { hideable: boolean };
    assert.equal(view('age').hideable, false);
    assert.equal(view('name').hideable, true);
    // The chooser lists leaves with flags.showInColumnChooser (overlays.tsx ColumnChooser).
    const chooserLeaves = leaves.filter((c) => c.flags.showInColumnChooser).map((c) => c.columnId);
    assert.deepEqual(chooserLeaves, ['id', 'name', 'active']);
    m.unmount();
  });
});

function renderGrid(props: Partial<DataGridProps<Person>> & { children?: unknown }): string {
  const element: ReactElement = createElement(DataGrid as (p: DataGridProps<Person>) => ReactElement, {
    id: 'cols',
    'aria-label': 'People',
    data: people(5),
    timeZone: 'UTC',
    ...props,
  } as DataGridProps<Person>);
  return renderToString(element);
}

const col = (props: DataGridColumn<Person>, ...children: ReactElement[]): ReactElement =>
  createElement(DataGridColumnElement as (p: DataGridColumn<Person> & { children?: unknown }) => null, { key: props.field ?? props.id ?? props.header, ...props } as never, ...children);

describe('SSR: <DataGridColumn> children', () => {
  it('flat <DataGridColumn> children render the same first-paint markup as the columns array', () => {
    const fromArray = renderGrid({ columns });
    const fromChildren = renderGrid({ children: columns.map((c) => col(c)) });
    assert.equal(fromChildren, fromArray);
    assert.equal(count(fromChildren, /role="columnheader"/), 4);
  });

  const nested: readonly DataGridColumn<Person>[] = [
    { field: 'id', header: 'ID', width: 80, primaryKey: true },
    {
      id: 'person',
      header: 'Person',
      columns: [
        { field: 'name', header: 'Name', width: 160 },
        { id: 'facts', header: 'Facts', columns: [
          { field: 'age', header: 'Age', type: 'number', width: 90 },
          { field: 'active', header: 'Active', type: 'boolean', width: 90 },
        ] },
      ],
    },
  ];

  it('nested <DataGridColumn> children produce stacked header rows equal to the columns[].columns form', () => {
    const fromArray = renderGrid({ columns: nested });
    const fromChildren = renderGrid({
      children: [
        col({ field: 'id', header: 'ID', width: 80, primaryKey: true }),
        col(
          { id: 'person', header: 'Person' },
          col({ field: 'name', header: 'Name', width: 160 }),
          col({ id: 'facts', header: 'Facts' }, col({ field: 'age', header: 'Age', type: 'number', width: 90 }), col({ field: 'active', header: 'Active', type: 'boolean', width: 90 })),
        ),
      ],
    });
    assert.equal(fromChildren, fromArray);
    // Three header levels: the groups, the sub-group, and the leaves.
    assert.equal(count(fromChildren, /class="salmon-data-grid-header-row"/), 3);
    assert.match(fromChildren, /aria-colspan="3" class="salmon-data-grid-header-cell salmon-data-grid-header-group"[^>]*data-group-id="person"/);
    assert.match(fromChildren, /aria-colspan="2" class="salmon-data-grid-header-cell salmon-data-grid-header-group"[^>]*data-group-id="facts"/);
  });

  it('passing both columns and <DataGridColumn> children warns once in development and the children win', () => {
    const warn = console.warn;
    const messages: string[] = [];
    console.warn = (...args: unknown[]) => {
      messages.push(args.map(String).join(' '));
    };
    try {
      const props = { id: 'both-warn', columns: [{ field: 'name', header: 'From array' }] as DataGridColumn<Person>[], children: [col({ field: 'age', header: 'From children', type: 'number' })] };
      const html = renderGrid(props);
      renderGrid(props);
      assert.match(html, /From children/);
      assert.doesNotMatch(html, /From array/);
      const hits = messages.filter((m) => m.includes('both `columns` and <DataGridColumn> children were passed'));
      assert.equal(hits.length, 1);
      assert.match(hits[0] ?? '', /^\[salmonui\] DataGrid: .*the children win\./);
    } finally {
      console.warn = warn;
    }
  });
});
