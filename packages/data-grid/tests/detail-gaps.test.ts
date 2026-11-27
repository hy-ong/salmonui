import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { defineChildGrid, type DataGridColumn, type DataGridDetailToggleEvent, type DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { detailUiOf } from '../dist/data-grid/detail-config.js';
import { people, type Person, newInstance } from './fixtures.ts';

// Detail row and child grid commands through the React `DataGridApi` without a
// DOM: the `DataGridInstance` API methods, the
// cancelable `onBeforeDetailToggle` and the `onDetailToggle` payloads. The
// detail controller's command hooks are attached with `detailUiOf(instance).mount()`
// (what the client mount runs); pointer and keyboard toggles are covered by
// tests/browser/detail-gaps.spec.ts.

interface Order {
  readonly orderId: string;
  readonly personId: string;
  readonly total: number;
}

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80, primaryKey: true },
  { field: 'name', header: 'Name', width: 160 },
];
const orders: Order[] = Array.from({ length: 12 }, (_, i) => ({ orderId: `o${i}`, personId: `p${i % 6}`, total: 100 + i }));
const childGrid = defineChildGrid<Order, Person>({
  data: orders,
  parentField: 'id',
  childField: 'personId',
  columns: [
    { field: 'orderId', header: 'Order', primaryKey: true },
    { field: 'total', header: 'Total', type: 'number' },
  ],
});

type Logged = { type: string; rowId: string; expanded: boolean; source: string; row: string | null };

let seq = 0;
function make(props: Partial<DataGridProps<Person>>) {
  const log: Logged[] = [];
  let cancel: ((e: DataGridDetailToggleEvent<Person>) => boolean) | null = null;
  const record = (e: DataGridDetailToggleEvent<Person>) => log.push({ type: e.type, rowId: e.rowId, expanded: e.expanded, source: e.source, row: e.row?.id ?? null });
  const instance = newInstance<Person>(
    {
      data: people(6),
      columns,
      onBeforeDetailToggle: (e: DataGridDetailToggleEvent<Person>) => {
        record(e);
        if (cancel?.(e)) e.preventDefault();
      },
      onDetailToggle: record,
      ...props,
    } as never,
    `:dg${seq++}:`,
  );
  const unmount = detailUiOf(instance)?.mount() ?? (() => {});
  return {
    instance,
    api: instance.api,
    log,
    setCancel: (fn: typeof cancel) => {
      cancel = fn;
    },
    unmount,
  };
}

const renderDetail = ({ row }: { row: Person }) => createElement('p', null, row.name);

describe('detail DataGridApi methods', () => {
  it('expandDetail, collapseDetail, toggleDetail, expandAllDetails, collapseAllDetails and isDetailExpanded return and reflect the state', () => {
    const m = make({ renderDetail });
    const { api } = m;
    assert.equal(api.isDetailExpanded('p1'), false);
    assert.equal(api.expandDetail('p1').status, 'applied');
    assert.equal(api.isDetailExpanded('p1'), true);
    assert.equal(api.isDetailExpanded('p2'), false);
    // toggleDetail without `expanded` flips; with `expanded` it sets.
    assert.equal(api.toggleDetail('p1').status, 'applied');
    assert.equal(api.isDetailExpanded('p1'), false);
    assert.equal(api.toggleDetail('p2', true).status, 'applied');
    assert.equal(api.isDetailExpanded('p2'), true);
    api.toggleDetail('p2', true);
    assert.equal(api.isDetailExpanded('p2'), true, 'toggleDetail(rowId, true) on an expanded row keeps it expanded');
    api.toggleDetail('p2', false);
    assert.equal(api.isDetailExpanded('p2'), false);
    api.expandDetail('p3');
    assert.equal(api.collapseDetail('p3').status, 'applied');
    assert.equal(api.isDetailExpanded('p3'), false);
    const singles = m.log.slice();
    // Expand all / collapse all, with an explicit collapse in expand-all mode.
    assert.equal(api.expandAllDetails().status, 'applied');
    assert.deepEqual(people(6).map((p) => api.isDetailExpanded(p.id)), [true, true, true, true, true, true]);
    api.collapseDetail('p4');
    assert.equal(api.isDetailExpanded('p4'), false);
    assert.equal(api.isDetailExpanded('p5'), true);
    assert.equal(api.collapseAllDetails().status, 'applied');
    assert.deepEqual(people(6).map((p) => api.isDetailExpanded(p.id)), [false, false, false, false, false, false]);
    // Events: one before/after pair per single-row change, source `api`.
    const after = singles.filter((e) => e.type === 'detailToggle' && e.rowId === 'p1');
    assert.deepEqual(after.map((e) => [e.expanded, e.source]), [
      [true, 'api'],
      [false, 'api'],
    ]);
    assert.equal(singles.find((e) => e.type === 'beforeDetailToggle')?.row, 'p1', 'event row is the parent row');
    // Expand all / collapse all raise onDetailToggle for the rendered rows whose state changed (no before-event;
    // the only before-event is the explicit collapseDetail('p4') in between).
    const bulk = m.log.slice(singles.length);
    assert.deepEqual(bulk.filter((e) => e.type === 'beforeDetailToggle').map((e) => e.rowId), ['p4']);
    assert.ok(bulk.some((e) => e.type === 'detailToggle' && e.rowId === 'p1' && e.expanded));
    assert.ok(bulk.some((e) => e.type === 'detailToggle' && e.rowId === 'p5' && !e.expanded));
    m.unmount();
  });

  it('without renderDetail or childGrid every detail method is rejected and nothing is expanded', () => {
    const m = make({});
    const result = m.api.expandDetail('p1');
    assert.equal(result.status, 'rejected');
    assert.match(String((result as { reason?: string }).reason), /detail rows are off/);
    assert.equal(m.api.toggleDetail('p1').status, 'rejected');
    assert.equal(m.api.expandAllDetails().status, 'rejected');
    assert.equal(m.api.collapseAllDetails().status, 'rejected');
    assert.equal(m.api.collapseDetail('p1').status, 'rejected');
    assert.equal(m.api.isDetailExpanded('p1'), false);
    assert.equal(m.api.getChildGrid('p1'), null);
    m.unmount();
  });
});

describe('cancelable onBeforeDetailToggle', () => {
  it('preventDefault() in onBeforeDetailToggle cancels the expand and the collapse; onDetailToggle does not fire', () => {
    const m = make({ renderDetail });
    m.setCancel((e) => e.rowId === 'p2');
    const result = m.api.expandDetail('p2');
    assert.notEqual(result.status, 'applied');
    assert.equal(m.api.isDetailExpanded('p2'), false);
    assert.deepEqual(
      m.log.map((e) => [e.type, e.rowId, e.expanded]),
      [['beforeDetailToggle', 'p2', true]],
      'the before-event announces the proposed state; no after-event',
    );
    // Other rows still toggle.
    m.api.toggleDetail('p1');
    assert.equal(m.api.isDetailExpanded('p1'), true);
    // Cancel a collapse.
    m.setCancel((e) => e.rowId === 'p1' && !e.expanded);
    m.log.length = 0;
    assert.notEqual(m.api.collapseDetail('p1').status, 'applied');
    assert.equal(m.api.isDetailExpanded('p1'), true);
    assert.deepEqual(m.log.map((e) => [e.type, e.expanded]), [['beforeDetailToggle', false]]);
    // Without the cancel the collapse goes through.
    m.setCancel(null);
    m.log.length = 0;
    assert.equal(m.api.collapseDetail('p1').status, 'applied');
    assert.deepEqual(m.log.map((e) => [e.type, e.expanded]), [
      ['beforeDetailToggle', false],
      ['detailToggle', false],
    ]);
    // No event for a no-op (already collapsed).
    m.log.length = 0;
    m.api.collapseDetail('p1');
    assert.deepEqual(m.log, []);
    m.unmount();
  });
});

describe('child grid parents', () => {
  it('child-grid parents: methods, toggle events and a cancelable before-event', () => {
    const m = make({ childGrid });
    const { api } = m;
    assert.equal(api.expandDetail('p1').status, 'applied');
    assert.equal(api.isDetailExpanded('p1'), true);
    assert.deepEqual(m.log.map((e) => [e.type, e.rowId, e.expanded, e.source]), [
      ['beforeDetailToggle', 'p1', true, 'api'],
      ['detailToggle', 'p1', true, 'api'],
    ]);
    // Not mounted without a DOM: no child grid API yet.
    assert.equal(api.getChildGrid('p1'), null);
    m.setCancel((e) => e.rowId === 'p3');
    assert.notEqual(api.toggleDetail('p3').status, 'applied');
    assert.equal(api.isDetailExpanded('p3'), false);
    m.setCancel(null);
    api.toggleDetail('p1');
    assert.equal(api.isDetailExpanded('p1'), false);
    api.expandAllDetails();
    assert.equal(api.isDetailExpanded('p5'), true);
    api.collapseAllDetails();
    assert.equal(api.isDetailExpanded('p5'), false);
    m.unmount();
  });
});
