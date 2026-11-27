// `grouping` and `aggregates` render features: detection (aggregate children
// and `[]` included), the static registry, the server markup of the group panel, caption rows and footer
// rows through the static registry, and an instance without the features.
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { describe, it } from 'node:test';
import { aggregates, grouping } from '@salmonui/data-grid/features';
import { DataGridAggregate, DataGridAggregateRow } from '@salmonui/data-grid';
import { readFeatures as readStatic } from '../dist/data-grid/features/registry-static.js';
import { requiredFeatures } from '../dist/data-grid/features/detect.js';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { normalizeProps } from '../dist/data-grid/normalize-props.js';
import type { DataGridFeature } from '../dist/data-grid/features/types.js';
import { count, newInstance, people, personColumns, render, type Person } from './fixtures.ts';

const names = (list: readonly DataGridFeature[]) => list.map((f) => f.name);
const detect = (props: object) => requiredFeatures(normalizeProps(props as never));
const ageSum = [{ columns: [{ field: 'age', type: 'sum' as const }] }];

describe('grouping and aggregates detection', () => {
  it('requires grouping when the prop is set, never for false or absent', () => {
    assert.deepEqual(detect({}), []);
    assert.deepEqual(detect({ grouping: false }), []);
    assert.deepEqual(detect({ grouping: true }), ['grouping']);
    assert.deepEqual(detect({ grouping: {} }), ['grouping']);
    // The modules prop is not inspected.
    assert.deepEqual(detect({ modules: [{ name: 'grouping' }, { name: 'aggregates' }] }), []);
  });

  it('requires aggregates when the prop is defined, `[]` included, and for <DataGridAggregateRow> children', () => {
    assert.deepEqual(detect({ aggregates: undefined }), []);
    assert.deepEqual(detect({ aggregates: [] }), ['aggregates']);
    assert.deepEqual(detect({ aggregates: ageSum }), ['aggregates']);
    const children = createElement(DataGridAggregateRow, null, createElement(DataGridAggregate, { field: 'age', type: 'sum' }));
    assert.deepEqual(detect({ children }), ['aggregates']);
    assert.deepEqual(detect({ grouping: { groupBy: ['active'] }, aggregates: ageSum, paging: true }), ['aggregates', 'grouping', 'paging']);
  });

  it('the static registry answers synchronously with both features', () => {
    const out = readStatic(['aggregates', 'grouping'], undefined) as readonly DataGridFeature[];
    assert.ok(Array.isArray(out));
    assert.deepEqual(names(out), ['aggregates', 'grouping']);
    assert.equal(out[0], aggregates);
    assert.equal(out[1], grouping);
  });
});

describe('grouping and aggregates render features (static registry, SSR)', () => {
  const grouped = { rows: 6, grouping: { groupBy: ['active'] }, aggregates: [{ columns: [{ field: 'age', type: 'sum' as const }, { field: 'age', type: 'max' as const, renderGroupFooter: () => 'max' }] }] };

  it('renders the group panel, caption rows, group footers and footer rows on the server, with no placeholder', () => {
    const html = render(grouped);
    assert.match(html, /class="salmon-data-grid-group-panel"[^>]*role="region"/);
    assert.match(html, /class="salmon-data-grid-group-chip" data-column-id="active"/);
    assert.equal(count(html, /class="salmon-data-grid-row salmon-data-grid-group-caption"/), 2, 'one caption per active value');
    assert.equal(count(html, /class="salmon-data-grid-row salmon-data-grid-group-footer"/), 2, 'one group footer per group');
    assert.match(html, /role="rowgroup" class="salmon-data-grid-footer"/);
    assert.match(html, /class="salmon-data-grid-row salmon-data-grid-footer-row"/);
    assert.match(html, /data-grouped=""/);
    assert.doesNotMatch(html, /aria-busy="true"/);
    assert.match(html, /role="grid"[^>]*data-salmon-pending=""/);
    assert.doesNotMatch(html, /<!--\$/);
  });

  it('renders footer rows for aggregate children and none for `[]`', () => {
    const children = createElement(DataGridAggregateRow, null, createElement(DataGridAggregate, { field: 'age', type: 'sum' }));
    assert.match(render({ rows: 5, children } as never), /salmon-data-grid-footer-row/);
    const empty = render({ rows: 5, aggregates: [] });
    assert.doesNotMatch(empty, /salmon-data-grid-footer/);
    assert.match(empty, /data-salmon-pending=""/);
  });

  it('the features prop removes the gate: the same markup without the pending mark', () => {
    const provided = render({ ...grouped, features: [grouping, aggregates] });
    assert.doesNotMatch(provided, /data-salmon-pending/);
    assert.equal(provided, render(grouped).replace(' data-salmon-pending=""', ''));
  });

  it('provided features whose triggers do not hold change nothing', () => {
    assert.equal(render({ rows: 5, features: [grouping, aggregates] }), render({ rows: 5 }));
  });

  it('an instance without the features registers neither module and renders none of their parts', () => {
    const props = { data: people(5), columns: personColumns, grouping: { groupBy: ['active'] }, aggregates: ageSum };
    const instance = newInstance<Person>(props, ':grp1:');
    assert.equal(instance.groupable, true);
    assert.notEqual(instance.engine.getModuleState('aggregates'), undefined);
    assert.ok(instance.features.parts.GroupPanel && instance.features.parts.GroupCaptionRow);
    assert.ok(instance.features.parts.FooterRows && instance.features.parts.GroupFooterRow && instance.features.parts.GroupCaptionAggregates);
    const bare = new DataGridInstance<Person>(props as never, ':grp2:');
    assert.equal(bare.groupable, false);
    assert.equal(bare.engine.getModuleState('grouping'), undefined);
    assert.equal(bare.engine.getModuleState('aggregates'), undefined);
    assert.equal(bare.features.parts.GroupPanel, null);
    assert.equal(bare.features.parts.FooterRows, null);
  });
});
