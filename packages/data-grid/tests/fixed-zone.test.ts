import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, people, render, type Person, newInstance } from './fixtures.ts';

// Fixed zone (column `pinned: 'center'`): server markup and the
// runtime pin path.

const columns: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80, pinned: 'start' },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 90, pinned: 'center' },
  { field: 'active', header: 'Active', type: 'boolean', width: 90 },
];

/** Inner HTML of the row with `data-row-id` up to the next row. */
function rowHtml(html: string, rowId: string): string {
  const start = html.indexOf(`data-row-id="${rowId}"`);
  assert.ok(start >= 0, `row ${rowId}`);
  const next = html.indexOf('role="row"', start);
  return html.slice(start, next < 0 ? undefined : next);
}

describe('fixed zone markup', () => {
  it('wraps the fixed column in a sticky box in its center slot, header and rows', () => {
    const html = render({ rows: 2, columns });
    const r0 = rowHtml(html, 'p0');
    // Visual, keyboard and aria-colindex order is unchanged: start, center with the fixed slot, end.
    assert.deepEqual(
      [...r0.matchAll(/role="gridcell" aria-colindex="(\d)"[^>]*data-column-id="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`),
      ['1:id', '2:name', '3:age', '4:active'],
    );
    assert.match(r0, /<div class="salmon-data-grid-center" data-fixed="">/);
    assert.match(r0, /<div class="salmon-data-grid-fixed" style="inset-inline-start:var\(--salmon-data-grid-fx-2\);inset-inline-end:var\(--salmon-data-grid-fe-2\)" data-frozen-edge="fixed"><div role="gridcell" aria-colindex="3"/);
    assert.match(html, /class="salmon-data-grid-fixed"[^>]*><div role="columnheader" aria-colindex="3"[^>]*data-column-id="age"/);
    // Sticky insets: start zone plus earlier fixed columns; end zone plus later fixed columns.
    assert.match(html, /--salmon-data-grid-fx-2:80px;--salmon-data-grid-fe-2:0px/);
    // Every fixed slot is in the server slice: no lead / trail boxes.
    assert.equal(count(html, /data-lead|data-trail/), 0);
  });

  it('fixed columns stack their insets on each other and on the start / end zones', () => {
    const html = render({
      rows: 1,
      columns: [
        { field: 'id', width: 80, pinned: 'center' },
        { field: 'name', width: 160 },
        { field: 'age', width: 90, pinned: 'center' },
        { field: 'active', width: 70, pinned: 'end' },
      ],
    });
    assert.match(html, /--salmon-data-grid-fx-0:0px;--salmon-data-grid-fx-2:80px;--salmon-data-grid-fe-2:70px;--salmon-data-grid-fe-0:160px/);
  });

  it('renders nothing extra without a fixed column', () => {
    const html = render({ rows: 2, columns: columns.map((c) => ({ ...c, pinned: c.pinned === 'center' ? undefined : c.pinned }) as DataGridColumn<Person>) });
    assert.equal(count(html, /salmon-data-grid-fixed|data-fixed|--salmon-data-grid-fx-|--salmon-data-grid-fe-/), 0);
  });

  it('stacked headers: a fixed leaf at the top level keeps its sticky box in the header', () => {
    const html = render({
      rows: 1,
      columns: [
        { field: 'id', width: 80 },
        { header: 'Person', columns: [{ field: 'name', width: 160 }, { field: 'active', width: 90 }] } as DataGridColumn<Person>,
        { field: 'age', width: 90, pinned: 'center' },
      ],
    });
    assert.match(html, /class="salmon-data-grid-fixed"[^>]*><div role="columnheader"[^>]*data-column-id="age"/);
  });
});

describe('fixed zone runtime pin', () => {
  let seq = 0;
  const make = (props: Partial<DataGridProps<Person>> = {}) => {
    const instance = newInstance<Person>({ data: people(5), columns: columns.map((c) => ({ ...c, pinned: undefined })), ...props } as never, `:fz${seq++}:`);
    return { instance, api: instance.api, engine: instance.engine };
  };

  it('api.pinColumn(field, center) fixes a column in place and raises the pin events with center', () => {
    const before: unknown[] = [];
    const after: unknown[] = [];
    const m = make({
      onBeforeColumnPinChange: (e) => before.push([e.field, e.pinned, e.previousPinned]),
      onColumnPinChange: (e) => after.push([e.field, e.pinned, e.previousPinned]),
    });
    assert.equal(m.api.pinColumn('age', 'center').status, 'applied');
    const snap = m.engine.getSnapshot().columns;
    assert.deepEqual(snap.center.map((c) => c.columnId), ['id', 'name', 'age', 'active']);
    assert.deepEqual(snap.fixed.map((c) => c.columnId), ['age']);
    assert.deepEqual(before, [['age', 'center', null]]);
    assert.deepEqual(after, [['age', 'center', null]]);
    m.api.pinColumn('age', 'start');
    assert.deepEqual(after.at(-1), ['age', 'start', 'center']);
    m.api.pinColumn('age', 'center');
    assert.deepEqual(m.engine.getSnapshot().columns.fixed.map((c) => c.columnId), ['age']);
    m.api.pinColumn('age', null);
    assert.deepEqual(after.at(-1), ['age', null, 'center']);
    assert.equal(m.engine.getSnapshot().columns.fixed.length, 0);
  });
});
