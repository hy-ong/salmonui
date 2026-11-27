// `detail` render feature: detection, the
// SSR markup of detail rows and default-expanded child grids through the
// static registry, the features prop, and the inert parts, selectors and API
// of a grid without the feature.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { detail } from '@salmonui/data-grid/features';
import { defineChildGrid } from '@salmonui/data-grid';
import { requiredFeatures } from '../dist/data-grid/features/detect.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { count, newInstance, people, personColumns, render, type Person } from './fixtures.ts';

interface Order {
  readonly orderId: string;
  readonly personId: string;
}

const orders: Order[] = Array.from({ length: 6 }, (_, i) => ({ orderId: `o${i}`, personId: `p${i % 3}` }));
const childGrid = defineChildGrid<Order, Person>({
  data: orders,
  parentField: 'id',
  childField: 'personId',
  columns: [{ field: 'orderId', header: 'Order', primaryKey: true }],
});
const renderDetail = ({ row }: { row: Person }) => createElement('p', { className: 'probe' }, row.name);

describe('detail render feature detection', () => {
  it('requires detail for renderDetail or childGrid, never without either', () => {
    assert.deepEqual(requiredFeatures({} as never), []);
    assert.deepEqual(requiredFeatures({ renderDetail } as never), ['detail']);
    assert.deepEqual(requiredFeatures({ childGrid } as never), ['detail']);
    // Detail-only props without content turn nothing on.
    assert.deepEqual(requiredFeatures({ defaultExpandedDetails: true, detailHeight: 80 } as never), []);
    assert.deepEqual(requiredFeatures({ paging: true, renderDetail } as never), ['detail', 'paging']);
  });
});

describe('detail render feature (static registry, SSR)', () => {
  it('renders the toggle column and the expanded detail rows on the server, with no placeholder and no boundary', () => {
    const html = render({ rows: 4, renderDetail, defaultExpandedDetails: ['p1'] } as never);
    assert.equal(count(html, /class="salmon-data-grid-detail-toggle"/), 4);
    assert.equal(count(html, /salmon-data-grid-detail-row"/), 1);
    assert.match(html, /<p class="probe">Person 1<\/p>/);
    assert.match(html, /data-expanded="true"/);
    assert.equal(count(html, /data-expanded="false"/), 3);
    assert.doesNotMatch(html, /aria-busy="true"/);
    assert.match(html, /role="grid"[^>]*data-salmon-pending=""/);
    assert.doesNotMatch(html, /<!--\$/);
  });

  it('renders default-expanded child grids on the server', () => {
    const html = render({ rows: 3, childGrid, defaultExpandedDetails: true } as never);
    assert.equal(count(html, /class="salmon-data-grid-child"/), 3);
    // Two orders per parent, each a row of its child grid.
    assert.equal(count(html, /data-row-id="o\d"/), 6);
    assert.doesNotMatch(html, /aria-busy="true"/);
  });

  it('the features prop removes the gate: the same markup without the pending mark', () => {
    const props = { rows: 3, renderDetail, defaultExpandedDetails: true };
    const provided = render({ ...props, features: [detail] } as never);
    assert.doesNotMatch(provided, /data-salmon-pending/);
    assert.equal(provided, render(props as never).replace(' data-salmon-pending=""', ''));
  });

  it('a provided detail feature whose trigger does not hold changes nothing', () => {
    assert.equal(render({ rows: 5, features: [detail] }), render({ rows: 5 }));
  });

  it('the detail toggle column has no column menu (no header menu button) while data columns keep theirs', () => {
    const instance = newInstance<Person>({ data: people(2), columns: personColumns, renderDetail, columnMenu: true } as never, ':det-menu:');
    const byId = instance.engine.getSnapshot().columns.byId;
    assert.ok(byId.get('__salmon_detail'));
    assert.equal(instance.chrome.columnMenuEnabled(byId.get('__salmon_detail') as never), false);
    assert.equal(instance.chrome.columnMenuEnabled(byId.get('name') as never), true);
  });

  it('an instance without the feature has no toggle column, no detail module and the inert parts, selectors and API', () => {
    const props = { data: people(4), columns: personColumns, renderDetail, defaultExpandedDetails: true };
    const instance = newInstance<Person>(props, ':det1:');
    assert.ok(instance.features.parts.DetailRow);
    assert.ok(instance.features.selectors.detailExpanded);
    assert.equal(instance.api.isDetailExpanded('p1'), true);
    const bare = new DataGridInstance<Person>(props as never, ':det2:');
    assert.equal(bare.engine.getModuleState('detail'), undefined);
    assert.equal(bare.features.parts.DetailRow, null);
    assert.equal(bare.features.parts.detailToggleColumn, null);
    assert.equal(bare.features.selectors.detailExpanded, null);
    assert.equal(bare.engine.getSnapshot().columns.visible.some((c) => c.columnId === '__salmon_detail'), false);
    assert.equal(bare.api.expandDetail('p1').status, 'rejected');
    assert.equal(bare.api.isDetailExpanded('p1'), false);
    assert.equal(bare.api.getChildGrid('p1'), null);
  });
});
