import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { ViewTracker } from '../dist/data-grid/view-events.js';
import { people, type Person, newInstance } from './fixtures.ts';

// `onViewChange` epochs without a DOM: the tracker the
// `DataGridViewEvents` component selects from the engine snapshot.

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80, primaryKey: true },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 90 },
];

let seq = 0;
function make(props: Partial<DataGridProps<Person>>) {
  let current = { data: people(20), columns, ...props } as DataGridProps<Person>;
  const instance = newInstance<Person>(current as never, `:v${seq++}:`);
  const tracker = new ViewTracker(instance as never);
  const epoch = () => tracker.epochOf(instance.engine.getSnapshot() as never);
  const update = (next: Partial<DataGridProps<Person>>) => {
    current = { ...current, ...next } as DataGridProps<Person>;
    instance.syncProps(current as never);
  };
  return { instance, epoch, update, tracker };
}

describe('onViewChange epochs', () => {
  it('filter options that re-run the filter (matchCase, ignoreAccents) move the epoch with reason filter', () => {
    const filters = [{ field: 'name', operator: 'contains' as const, value: 'person 1' }];
    const m = make({ filtering: { filters } });
    const first = m.epoch();
    assert.equal(m.tracker.reason, 'data');
    m.update({ filtering: { filters, matchCase: true } });
    assert.equal(m.epoch(), first + 1);
    assert.equal(m.tracker.reason, 'filter');
    m.update({ filtering: { filters, matchCase: true, ignoreAccents: true } });
    assert.equal(m.epoch(), first + 2);
    assert.equal(m.tracker.reason, 'filter');
  });

  it('filter options without any filter do not move the epoch (the view is unchanged)', () => {
    const m = make({ filtering: {} });
    const first = m.epoch();
    m.update({ filtering: { matchCase: true } });
    assert.equal(m.epoch(), first);
  });

  it('search options move the epoch with reason search while a search is active', () => {
    const m = make({ search: { text: 'person' } });
    const first = m.epoch();
    m.update({ search: { text: 'person', matchCase: true } });
    assert.equal(m.epoch(), first + 1);
    assert.equal(m.tracker.reason, 'search');
    m.update({ search: { text: 'person', matchCase: true, operator: 'startsWith' } });
    assert.equal(m.epoch(), first + 2);
    m.update({ search: { text: 'person', matchCase: true, operator: 'startsWith', ignoreAccents: true } });
    assert.equal(m.epoch(), first + 3);
  });

  it('sorting moves the epoch with reason sort', () => {
    const m = make({ sorting: { sortBy: [] } });
    const first = m.epoch();
    m.update({ sorting: { sortBy: [{ field: 'age', direction: 'desc' }] } });
    assert.equal(m.epoch(), first + 1);
    assert.equal(m.tracker.reason, 'sort');
    m.update({ sorting: { sortBy: [{ field: 'age', direction: 'asc' }] } });
    assert.equal(m.epoch(), first + 2);
    assert.equal(m.tracker.reason, 'sort');
  });

  it('changing the page moves the epoch with reason page', () => {
    const m = make({ paging: { pageSize: 5, page: 1 } });
    const unmount = m.instance.mount();
    const first = m.epoch();
    m.update({ paging: { pageSize: 5, page: 3 } });
    assert.equal(m.instance.query.pageInfo()?.page, 3);
    assert.equal(m.epoch(), first + 1);
    assert.equal(m.tracker.reason, 'page');
    unmount();
  });

  it('grouping moves the epoch with reason group', () => {
    const m = make({ grouping: { groupBy: [] } });
    const first = m.epoch();
    m.update({ grouping: { groupBy: ['age'] } });
    assert.equal(m.epoch(), first + 1);
    assert.equal(m.tracker.reason, 'group');
    m.update({ grouping: { groupBy: [] } });
    assert.equal(m.epoch(), first + 2);
    assert.equal(m.tracker.reason, 'group');
  });

  it('refresh() moves the epoch with reason refresh; a plain data change reports data', () => {
    const m = make({});
    const unmount = m.instance.mount();
    const first = m.epoch();
    m.instance.api.refresh();
    assert.equal(m.epoch(), first + 1);
    assert.equal(m.tracker.reason, 'refresh');
    m.update({ data: people(10) });
    assert.equal(m.epoch(), first + 2);
    assert.equal(m.tracker.reason, 'data');
    unmount();
  });
});
