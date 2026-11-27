// SSR output of detail rows, child grids, and the row drag handle: deterministic markup, the
// toggle column and `aria-expanded`, one spanning gridcell per detail row,
// nested child grids that inherit locale and direction, and the handle
// column with its ARIA role description. Interaction is covered by the
// browser suite (tests/browser/detail.spec.ts).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { defineChildGrid, DataGrid, type DataGridProps } from '@salmonui/data-grid';
import { count, people, personColumns, render, type Person } from './fixtures.ts';

interface Order {
  readonly orderId: string;
  readonly personId: string;
  readonly total: number;
}
interface Line {
  readonly lineId: string;
  readonly orderId: string;
  readonly sku: string;
}

const orders: Order[] = [];
for (let i = 0; i < 30; i++) orders.push({ orderId: `o${i}`, personId: `p${i % 5}`, total: 1000 + i * 10.5 });
const lines: Line[] = orders.flatMap((o, i) => [0, 1].map((k) => ({ lineId: `${o.orderId}-${k}`, orderId: o.orderId, sku: `SKU-${i}-${k}` })));

const childGrid = defineChildGrid<Order, Person>({
  data: orders,
  childField: 'personId',
  parentField: 'id',
  columns: [
    { field: 'orderId', header: 'Order', primaryKey: true },
    { field: 'total', header: 'Total', type: 'number', format: 'N2' },
  ],
  childGrid: defineChildGrid<Line, Order>({ data: lines, joinField: 'orderId', columns: [{ field: 'lineId', header: 'Line', primaryKey: true }, { field: 'sku', header: 'SKU' }] }),
});

const clean = (html: string): string => html.replaceAll('<!-- -->', '');

describe('detail rows SSR', () => {
  it('renders the toggle column, aria-expanded and expanded detail rows deterministically', () => {
    const props: Partial<DataGridProps<Person>> & { rows?: number } = {
      rows: 10,
      defaultExpandedDetails: ['p1', 'p3'],
      renderDetail: ({ row, rowId }) => createElement('p', { className: 'tpl-detail' }, `Detail of ${row.name} (${rowId})`),
    };
    const a = clean(render(props));
    assert.equal(a, clean(render(props)), 'deterministic');
    assert.match(a, /role="grid"[^>]*aria-rowcount="13"[^>]*aria-colcount="6"/, 'header + 10 rows + 2 detail rows; the toggle column counts');
    assert.match(a, /role="columnheader"[^>]*data-column-id="__salmon_detail"/);
    assert.match(a, /class="salmon-data-grid-visually-hidden">Details</);
    assert.equal(count(a, /class="salmon-data-grid-detail-toggle"/), 10);
    // aria-expanded is on the toggle button only: a role="grid" row may not carry it (axe aria-conditional-attr).
    assert.doesNotMatch(a, /role="row"[^>]*aria-expanded/);
    assert.match(a, /data-row-id="p1"[^>]*data-expanded="true"/);
    assert.match(a, /data-row-id="p0"[^>]*data-expanded="false"/);
    assert.match(a, /class="salmon-data-grid-detail-toggle" aria-expanded="true" aria-label="Collapse details"/);
    assert.match(a, /class="salmon-data-grid-detail-toggle" aria-expanded="false" aria-label="Expand details"/);
    assert.match(a, /aria-label="Collapse details"/);
    assert.match(a, /aria-label="Expand details"/);
    // Detail rows: one spanning gridcell, the template content, after the parent row.
    assert.equal(count(a, /class="salmon-data-grid-row salmon-data-grid-detail-row"/), 2);
    assert.match(a, /role="row" aria-rowindex="4" class="salmon-data-grid-row salmon-data-grid-detail-row" data-row-id="__detail:p1" data-row-index="2"/);
    assert.match(a, /role="gridcell" aria-colindex="1" aria-colspan="6" class="salmon-data-grid-cell salmon-data-grid-detail-row__cell"/);
    assert.match(a, /<p class="tpl-detail">Detail of Person 1 \(p1\)<\/p>/);
    assert.ok(a.indexOf('data-row-id="p1"') < a.indexOf('data-row-id="__detail:p1"'));
    assert.ok(a.indexOf('data-row-id="__detail:p1"') < a.indexOf('data-row-id="p2"'));
  });

  it('expand-all, hasDetail, async loaders start idle on the server', () => {
    const html = clean(
      render({
        rows: 6,
        defaultExpandedDetails: true,
        hasDetail: (row) => row.active,
        loadDetail: async ({ row }) => row.name,
        renderDetail: ({ status }) => createElement('span', { className: 'tpl-status' }, status),
      }),
    );
    assert.equal(count(html, /salmon-data-grid-detail-row"/), 3, 'active rows only');
    assert.equal(count(html, /class="salmon-data-grid-detail-toggle"/), 3, 'no toggle without a detail');
    assert.equal(count(html, /<span class="tpl-status">idle<\/span>/), 3, 'loads start after hydration');
    assert.doesNotMatch(html, /data-row-id="p1"[^>]*data-expanded/);
  });
});

describe('child grids SSR', () => {
  it('renders nested grids scoped by the relation, inheriting locale and direction', () => {
    const element = createElement(DataGrid as (p: DataGridProps<Person>) => ReturnType<typeof DataGrid>, {
      'aria-label': 'People',
      id: 'people',
      data: people(5),
      columns: personColumns,
      timeZone: 'UTC',
      locale: 'de-DE',
      dir: 'rtl',
      childGrid: { ...childGrid, ...(childGrid.childGrid ? { childGrid: { ...childGrid.childGrid } } : {}) },
      defaultExpandedDetails: ['p2'],
    } as DataGridProps<Person>);
    const html = clean(renderToString(element));
    const grids = html.match(/role="grid"/g) ?? [];
    assert.equal(grids.length, 2, 'the root grid and one child grid (nested levels start collapsed)');
    assert.match(html, /id="people\/p2"[^>]*role="grid"[^>]*aria-label="Child rows"/);
    assert.match(html, /id="people\/p2"[^>]*dir="rtl"/);
    // p2 has orders o2, o7, o12, o17, o22, o27 (personId p2); totals formatted for de-DE.
    for (const id of ['o2', 'o7', 'o12', 'o17', 'o22', 'o27']) assert.match(html, new RegExp(`data-row-id="${id}"`));
    assert.doesNotMatch(html, /data-row-id="o3"/);
    assert.match(html, /1\.021,00/, 'de-DE number format inherited by the child grid');
    // The child grid has its own toggle column (next level) and height: auto.
    assert.match(html, /id="people\/p2"[^>]*data-auto-height=""/);
    assert.ok(count(html, /data-column-id="__salmon_detail"/) >= 2);
  });
});

describe('row drag SSR', () => {
  it('renders the handle column with an ARIA role description', () => {
    const html = clean(render({ rows: 5, rowDrag: true }));
    assert.match(html, /role="grid"[^>]*aria-colcount="6"/);
    assert.match(html, /role="columnheader"[^>]*data-column-id="__salmon_drag"/);
    assert.equal(count(html, /class="salmon-data-grid-row-drag-handle" role="button" aria-roledescription="drag handle" aria-label="Drag row"/), 5);
    assert.match(html, /class="salmon-data-grid-row-drop-indicator"/);
    // The handle comes before the detail toggle and both pin with a pinned user column.
    const both = clean(render({ rows: 2, rowDrag: true, renderDetail: () => 'x' }));
    assert.ok(both.indexOf('data-column-id="__salmon_drag"') < both.indexOf('data-column-id="__salmon_detail"'));
    assert.match(both, /salmon-data-grid-pin--left[^]*__salmon_drag[^]*__salmon_detail[^]*data-column-id="id"/);
  });
});
