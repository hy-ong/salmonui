// Query events and reactive query props without a DOM: the `sorting.order` header cycle, a changed
// `sorting.sortBy` / `search.text` prop re-applied through `syncProps`, and
// the search / page before-events (cancel with `preventDefault()`) and
// after-event payloads. Events are wired in `mount()`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridPageChangeEvent, DataGridProps, DataGridSearchChangeEvent, DataGridSortChangeEvent } from '@salmonui/data-grid';
import type { PagingState, SearchState, SortState } from '@salmonui/data-grid/engine';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { people, personColumns, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make(props: Partial<DataGridProps<Person>>) {
  let current = { data: people(30), columns: personColumns, 'aria-label': 'People', ...props } as DataGridProps<Person>;
  const instance = newInstance<Person>(current as never, `:q${seq++}:`);
  const unmount = instance.mount();
  const update = (next: Partial<DataGridProps<Person>>) => {
    current = { ...current, ...next } as DataGridProps<Person>;
    instance.syncProps(current as never);
  };
  const sorting = () => instance.engine.getModuleState<SortState>('sort')?.sorting.map((s) => `${s.columnId}:${s.direction}`) ?? [];
  const firstIds = (n: number) => {
    const count = instance.engine.getSnapshot().rows.count;
    const out: string[] = [];
    for (let i = 0; i < n && i < count; i++) out.push(String(instance.engine.getRowIdAt(i)));
    return out;
  };
  return { instance, api: instance.api, update, sorting, firstIds, unmount };
}

describe('sorting.order header cycle', () => {
  it("sorting.order ['asc', 'desc'] skips the unsorted step on header activation", () => {
    const m = make({ sorting: { order: ['asc', 'desc'] } });
    const states: string[][] = [];
    for (let i = 0; i < 4; i++) {
      assert.equal(m.instance.headerCommand('sort', 'age'), true);
      states.push(m.sorting());
    }
    assert.deepEqual(states, [['age:asc'], ['age:desc'], ['age:asc'], ['age:desc']]);
    m.unmount();
  });

  it('the default order cycles asc -> desc -> none', () => {
    const m = make({ sorting: true });
    const states: string[][] = [];
    for (let i = 0; i < 3; i++) {
      m.instance.headerCommand('sort', 'age');
      states.push(m.sorting());
    }
    assert.deepEqual(states, [['age:asc'], ['age:desc'], []]);
    m.unmount();
  });

  it("a custom cycle ['desc', 'asc', null] starts descending and returns to unsorted", () => {
    const seen: string[] = [];
    const m = make({
      sorting: { order: ['desc', 'asc', null] },
      onSortChange: (e: DataGridSortChangeEvent) => seen.push(`${e.source}:${e.sortBy.map((s) => `${s.field}:${s.direction}`).join(',') || 'none'}`),
    });
    const states: string[][] = [];
    for (let i = 0; i < 4; i++) {
      m.instance.headerCommand('sort', 'name');
      states.push(m.sorting());
    }
    assert.deepEqual(states, [['name:desc'], ['name:asc'], [], ['name:desc']]);
    assert.deepEqual(seen, ['keyboard:name:desc', 'keyboard:name:asc', 'keyboard:none', 'keyboard:name:desc']);
    m.unmount();
  });

  it('a single-direction cycle keeps the column sorted and a column with sortable: false ignores activation', () => {
    const columns = personColumns.map((c) => (c.field === 'active' ? { ...c, sortable: false } : c));
    const m = make({ columns, sorting: { order: ['desc'] } });
    m.instance.headerCommand('sort', 'age');
    m.instance.headerCommand('sort', 'age');
    assert.deepEqual(m.sorting(), ['age:desc']);
    assert.equal(m.instance.headerCommand('sort', 'active'), false);
    assert.deepEqual(m.sorting(), ['age:desc']);
    m.unmount();
  });
});

describe('reactive sorting.sortBy', () => {
  it('a changed sorting.sortBy prop after mount re-applies the sort and reorders the rows', () => {
    let events = 0;
    const m = make({ sorting: { sortBy: [{ field: 'age', direction: 'asc' }] }, onSortChange: () => events++ });
    assert.deepEqual(m.sorting(), ['age:asc']);
    assert.equal(m.api.getRow(m.firstIds(1)[0] as string)?.age, 20);
    m.update({ sorting: { sortBy: [{ field: 'age', direction: 'desc' }] } });
    assert.deepEqual(m.sorting(), ['age:desc']);
    assert.equal(m.api.getRow(m.firstIds(1)[0] as string)?.age, 49);
    m.update({ sorting: { sortBy: [{ field: 'name', direction: 'asc' }] } });
    assert.deepEqual(m.sorting(), ['name:asc']);
    m.update({ sorting: { sortBy: [] } });
    assert.deepEqual(m.sorting(), []);
    assert.deepEqual(m.firstIds(3), ['p0', 'p1', 'p2']);
    // Prop sync is not a user action: no onSortChange.
    assert.equal(events, 0);
    m.unmount();
  });
});

describe('search events and reactive search.text', () => {
  it('onBeforeSearchChange preventDefault() cancels the search', () => {
    const before: DataGridSearchChangeEvent[] = [];
    let after = 0;
    const m = make({
      search: true,
      onBeforeSearchChange: (e) => {
        before.push(e);
        e.preventDefault();
      },
      onSearchChange: () => after++,
    });
    const result = m.api.search('Person 1');
    assert.notEqual((result as { status: string }).status, 'applied');
    assert.equal(before.length, 1);
    assert.equal(before[0]?.type, 'beforeSearchChange');
    assert.equal(before[0]?.text, 'Person 1');
    assert.equal(before[0]?.previousText, '');
    assert.equal(before[0]?.defaultPrevented, true);
    assert.equal(m.instance.engine.getModuleState<SearchState>('search')?.text ?? '', '');
    assert.equal(m.instance.engine.getSnapshot().rows.count, 30);
    assert.equal(after, 0);
    m.unmount();
  });

  it('onSearchChange carries { text, previousText } after a search and a clear', () => {
    const before: [string, string][] = [];
    const after: [string, string, string][] = [];
    const m = make({
      search: true,
      onBeforeSearchChange: (e) => before.push([e.text, e.previousText]),
      onSearchChange: (e) => after.push([e.type, e.text, e.previousText]),
    });
    m.api.search('Person 1');
    assert.equal(m.instance.engine.getSnapshot().rows.count, 11); // Person 1, 10..19
    m.api.search('Person 2');
    m.api.clearSearch();
    assert.deepEqual(before, [
      ['Person 1', ''],
      ['Person 2', 'Person 1'],
      ['', 'Person 2'],
    ]);
    assert.deepEqual(after, [
      ['searchChange', 'Person 1', ''],
      ['searchChange', 'Person 2', 'Person 1'],
      ['searchChange', '', 'Person 2'],
    ]);
    m.unmount();
  });

  it('a changed search.text prop on a mounted grid re-runs the search without events', () => {
    let events = 0;
    const m = make({ search: { text: 'Person 1' }, onSearchChange: () => events++, onBeforeSearchChange: () => events++ });
    assert.equal(m.instance.engine.getSnapshot().rows.count, 11);
    m.update({ search: { text: 'Person 29' } });
    assert.equal(m.instance.engine.getModuleState<SearchState>('search')?.text, 'Person 29');
    assert.deepEqual(m.firstIds(5), ['p29']);
    m.update({ search: { text: '' } });
    assert.equal(m.instance.engine.getSnapshot().rows.count, 30);
    assert.equal(events, 0);
    m.unmount();
  });
});

describe('page events', () => {
  it('onBeforePageChange / onPageChange payloads for goToPage, next and setPageSize', () => {
    const before: DataGridPageChangeEvent[] = [];
    const after: DataGridPageChangeEvent[] = [];
    const m = make({ paging: { pageSize: 10 }, onBeforePageChange: (e) => before.push(e), onPageChange: (e) => after.push(e) });
    const pick = (e: DataGridPageChangeEvent) => ({ type: e.type, source: e.source, page: e.page, previousPage: e.previousPage, pageSize: e.pageSize, previousPageSize: e.previousPageSize });
    m.api.goToPage(2);
    assert.deepEqual(before.map(pick), [{ type: 'beforePageChange', source: 'api', page: 2, previousPage: 1, pageSize: 10, previousPageSize: 10 }]);
    assert.deepEqual(after.map(pick), [{ type: 'pageChange', source: 'api', page: 2, previousPage: 1, pageSize: 10, previousPageSize: 10 }]);
    m.instance.dispatchFrom('keyboard', { type: 'paging.next' });
    assert.deepEqual(pick(after[1] as DataGridPageChangeEvent), { type: 'pageChange', source: 'keyboard', page: 3, previousPage: 2, pageSize: 10, previousPageSize: 10 });
    m.api.setPageSize(5);
    // Start row 21 stays on screen: page 5 of size 5.
    assert.deepEqual(pick(before[2] as DataGridPageChangeEvent), { type: 'beforePageChange', source: 'api', page: 5, previousPage: 3, pageSize: 5, previousPageSize: 10 });
    assert.deepEqual(pick(after[2] as DataGridPageChangeEvent), { type: 'pageChange', source: 'api', page: 5, previousPage: 3, pageSize: 5, previousPageSize: 10 });
    assert.equal(m.api.getPageInfo()?.page, 5);
    m.unmount();
  });

  it('a cancelled paging command keeps the page and fires no onPageChange', () => {
    let after = 0;
    let errors = 0;
    const m = make({
      paging: { pageSize: 10 },
      onBeforePageChange: (e) => {
        if (e.page === 3 || e.pageSize === 5) e.preventDefault();
      },
      onPageChange: () => after++,
      onError: () => errors++,
    });
    m.api.goToPage(2);
    assert.equal(after, 1);
    const result = m.api.goToPage(3);
    assert.notEqual((result as { status: string }).status, 'applied');
    m.instance.dispatchFrom('keyboard', { type: 'paging.next' });
    m.api.setPageSize(5);
    assert.equal(m.api.getPageInfo()?.page, 2);
    assert.equal(m.instance.engine.getModuleState<PagingState>('paging')?.pageSize, 10);
    assert.equal(after, 1);
    // A cancel is not an error.
    assert.equal(errors, 0);
    m.unmount();
  });

  it('page prop changes through syncProps fire no page events', () => {
    let events = 0;
    const m = make({ paging: { pageSize: 10 }, onBeforePageChange: () => events++, onPageChange: () => events++ });
    m.update({ paging: { pageSize: 10, page: 3 } });
    assert.equal(m.api.getPageInfo()?.page, 3);
    assert.equal(events, 0);
    m.unmount();
  });
});
