// Row pinning in the React layer: server markup of the pinned zone
// (sticky top rowgroup, before `stickyRows`, `data-pinned`, aria-rowindex
// in visible order, outside the page window and the virtual window), the
// footer count, and the API methods of a DataGridInstance without a DOM.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, people, render, type Person, newInstance } from './fixtures.ts';

/** Row ids inside the top sticky rowgroup, in DOM order. */
function topIds(html: string): string[] {
  const start = html.indexOf('salmon-data-grid-frozen-rows--top');
  if (start < 0) return [];
  const end = html.indexOf('class="salmon-data-grid-rows"', start);
  return [...html.slice(start, end).matchAll(/data-row-id="(p\d+)"/g)].map((m) => m[1] as string);
}

/** Row ids inside the scrolling rowgroup, in DOM order. */
function scrollingIds(html: string): string[] {
  return [...html.slice(html.indexOf('class="salmon-data-grid-rows"')).matchAll(/data-row-id="(p\d+)"/g)].map((m) => m[1] as string);
}

describe('row pinning SSR', () => {
  it('renders pinned rows first in the top rowgroup with data-pinned, once each', () => {
    const html = render({ rows: 10, defaultPinnedRows: ['p6', 'p2'], virtualization: { rows: false } });
    assert.deepEqual(topIds(html), ['p2', 'p6']);
    assert.match(html, /role="row" aria-rowindex="2"[^>]*data-row-id="p2"[^>]*data-pinned=""/);
    assert.match(html, /role="row" aria-rowindex="3"[^>]*data-row-id="p6"[^>]*data-pinned="last"/);
    assert.deepEqual(scrollingIds(html), ['p0', 'p1', 'p3', 'p4', 'p5', 'p7', 'p8', 'p9']);
    assert.match(html, /role="row" aria-rowindex="4"[^>]*data-row-id="p0"/);
    assert.equal(count(html, /data-pinned="(?:last)?"/), 2);
    assert.equal(count(html, /data-row-id="p6"/), 1);
    assert.match(html, /role="grid"[^>]*aria-rowcount="11"/);
    assert.equal(render({ rows: 10, defaultPinnedRows: ['p6', 'p2'], virtualization: { rows: false } }), html, 'deterministic');
  });

  it('isRowPinned pins by data; stickyRows follow the pinned rows in the same zone', () => {
    const html = render({ rows: 8, isRowPinned: (p: Person) => p.id === 'p5', stickyRows: 1, virtualization: { rows: false } });
    assert.deepEqual(topIds(html), ['p5', 'p0']);
    assert.match(html, /data-row-id="p0"(?![^>]*data-pinned)[^>]*>/);
    assert.deepEqual(scrollingIds(html).slice(0, 2), ['p1', 'p2']);
  });

  it('pinned rows follow the sort and filter and stay outside pageSize', () => {
    const html = render({
      rows: 20,
      defaultPinnedRows: ['p3', 'p15'],
      sorting: { sortBy: [{ field: 'age', direction: 'desc' }] },
      paging: { pageSize: 5 },
    } as Partial<DataGridProps<Person>>);
    assert.deepEqual(topIds(html), ['p15', 'p3']);
    assert.equal(scrollingIds(html).length, 5);
    assert.deepEqual(scrollingIds(html), ['p19', 'p18', 'p17', 'p16', 'p14']);
  });

  it('pinned rows are rendered with row virtualization and are not part of the row window', () => {
    const html = render({ rows: 5000, defaultPinnedRows: ['p4999'] });
    assert.deepEqual(topIds(html), ['p4999']);
    assert.ok(!scrollingIds(html).includes('p4999'));
    assert.ok(scrollingIds(html).length < 100, 'virtualized');
  });

  it('pinned rows meet pinned columns in the top zone', () => {
    const columns: readonly DataGridColumn<Person>[] = [
      { field: 'id', header: 'ID', width: 80, pinned: 'start' },
      { field: 'name', header: 'Name', width: 160 },
      { field: 'age', header: 'Age', type: 'number', width: 90, pinned: 'end' },
    ];
    const html = render({ rows: 5, columns, defaultPinnedRows: ['p3'], virtualization: { rows: false } });
    const row = html.slice(html.indexOf('data-row-id="p3"'), html.indexOf('class="salmon-data-grid-rows"'));
    assert.match(row, /salmon-data-grid-pin salmon-data-grid-pin--left" data-frozen-edge="start"/);
    assert.match(row, /salmon-data-grid-pin salmon-data-grid-pin--right" data-frozen-edge="end"/);
  });

  it('row numbers count scrolling rows; pinned rows have none', () => {
    const columns: readonly DataGridColumn<Person>[] = [{ type: 'rowNumber' }, { field: 'id', primaryKey: true }];
    const html = render({ rows: 12, columns, defaultPinnedRows: ['p0'], paging: { pageSize: 5, page: 2 } });
    const numbers = [...html.matchAll(/data-column-id="__salmon_row_number"[^>]*data-row-number=""[^>]*>([^<]*)</g)].map((m) => m[1]);
    assert.deepEqual(numbers, ['', '6', '7', '8', '9', '10']);
  });

  it('without the props there is no pinned zone and no data-pinned', () => {
    const html = render({ rows: 5, virtualization: { rows: false } });
    assert.doesNotMatch(html, /data-pinned|salmon-data-grid-frozen-rows--top/);
  });
});

describe('row pinning API', () => {
  let seq = 0;
  const make = (props: Partial<DataGridProps<Person>>) => newInstance<Person>({ data: people(6), columns: [{ field: 'id', primaryKey: true }, { field: 'name' }], ...props } as never, `:pin${seq++}:`);
  const ids = (instance: DataGridInstance<Person>) => Array.from({ length: instance.engine.getSnapshot().rows.count }, (_, i) => instance.engine.getRowIdAt(i));

  it('pinRows, unpinRows, isRowPinned and getPinnedRowIds', () => {
    const instance = make({ defaultPinnedRows: [] });
    const api = instance.api;
    assert.deepEqual(api.getPinnedRowIds(), []);
    assert.equal(api.pinRows(['p4', 'p1']).status, 'applied');
    assert.deepEqual(ids(instance), ['p1', 'p4', 'p0', 'p2', 'p3', 'p5']);
    assert.deepEqual(api.getPinnedRowIds(), ['p1', 'p4']);
    assert.equal(api.isRowPinned('p4'), true);
    api.unpinRows('p1');
    assert.deepEqual(api.getPinnedRowIds(), ['p4']);
    assert.equal(api.isRowPinned('p1'), false);
  });

  it('unpinRows overrides isRowPinned; the state part persists it', () => {
    const instance = make({ isRowPinned: (p: Person) => p.id === 'p2' });
    assert.deepEqual(instance.api.getPinnedRowIds(), ['p2']);
    instance.api.unpinRows(['p2']);
    assert.deepEqual(instance.api.getPinnedRowIds(), []);
    assert.deepEqual(instance.api.getState().pinnedRows, { rowIds: [], unpinnedRowIds: ['p2'] });
  });

  it('is rejected while row pinning is off', () => {
    const instance = make({});
    const result = instance.api.pinRows(['p1']);
    assert.equal(result.status, 'rejected');
    assert.equal(instance.api.isRowPinned('p1'), false);
    assert.deepEqual(instance.api.getPinnedRowIds(), []);
    assert.equal(instance.engine.getModuleState('rowPinning'), undefined, 'no module, no stage');
  });
});
