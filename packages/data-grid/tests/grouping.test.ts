// SSR output of grouping and aggregates: deterministic markup, caption rows with one spanning
// gridcell, frozen indent, group footers, the sticky footer, templates.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import type { DataGridAggregateRow } from '@salmonui/data-grid';
import { count, render, type Person } from './fixtures.ts';

const aggregates: DataGridAggregateRow<Person>[] = [
  {
    columns: [
      // Without a template the value shows in the footer only.
      { field: 'age', type: ['sum', 'average'], format: 'N1' },
      { field: 'age', type: 'sum', format: 'N1', renderGroupCaption: (ctx) => createElement('em', { className: 'tpl-caption-aggregate' }, `sum ${ctx.formatted['sum']}`) },
      { field: 'active', type: 'trueCount', renderFooter: (ctx) => createElement('b', { className: 'tpl-footer' }, `active ${ctx.formatted['trueCount']}`) },
    ],
  },
  { columns: [{ field: 'age', type: 'max', renderGroupFooter: (ctx) => createElement('i', { className: 'tpl-group-footer' }, `max ${String(ctx.values['max'])} of ${ctx.count}`) }] },
];

describe('grouping SSR', () => {
  it('renders captions, indent, data rows, group footers and the footer deterministically', () => {
    const props = { rows: 40, sorting: true, grouping: { groupBy: ['active'], showGroupedColumns: true }, aggregates };
    const a = render(props).replaceAll('<!-- -->', '');
    const b = render(props).replaceAll('<!-- -->', '');
    assert.equal(a, b, 'deterministic');
    assert.match(a, /class="salmon-data-grid-group-panel"[^>]*role="region"/);
    // The drop area is a sibling before role="grid" (a region owned by a grid fails aria-required-children).
    assert.ok(a.indexOf('salmon-data-grid-group-panel') < a.indexOf('role="grid"'), 'the group panel precedes the grid root');
    assert.doesNotMatch(a, /role="grid"[^>]*>(?:(?!role="rowgroup").)*salmon-data-grid-group-panel/s);
    assert.match(a, /class="salmon-data-grid-group-chip" data-column-id="active"/);
    // Captions: one gridcell spanning every column with aria-expanded and the level as its description
    // (aria-expanded / aria-level / aria-setsize / aria-posinset on a row are treegrid-only).
    const captions = count(a, /class="salmon-data-grid-row salmon-data-grid-group-caption"/);
    assert.equal(captions, 1, "the initial range (20 rows) holds the first group");
    assert.doesNotMatch(a, /role="row"[^>]*aria-expanded=/);
    assert.doesNotMatch(a, /aria-level=|aria-setsize=|aria-posinset=/);
    assert.match(a, /class="salmon-data-grid-row salmon-data-grid-group-caption"[^>]*data-depth="0" data-expanded="true"/);
    assert.match(a, /role="gridcell" aria-colindex="1" aria-colspan="5" aria-expanded="true" aria-description="Level 1, 20 items" class="salmon-data-grid-cell salmon-data-grid-group-caption__cell"/);
    assert.match(a, /aria-label="Collapse Active false"/);
    assert.match(a, /Active: false<\/span><span class="salmon-data-grid-group-caption__count"> - 20 items/);
    assert.match(a, /salmon-data-grid-group-caption__aggregate" data-column-id="age"><em class="tpl-caption-aggregate">sum 800\.0<\/em>/);
    // Data rows carry the frozen indent block before the left zone.
    assert.ok(count(a, /<div class="salmon-data-grid-indent" aria-hidden="true">/) >= 18);
    assert.match(a, /data-grouped=""/);
    assert.match(a, /--salmon-data-grid-indent-width:28px/);
    // The footer rowgroup with templates and aggregate rows.
    assert.match(a, /role="rowgroup" class="salmon-data-grid-footer"/);
    assert.match(a, /<b class="tpl-footer">active 20<\/b>/);
    assert.match(a, /Sum: 1,580\.0/);
    assert.match(a, /aria-rowcount="46"/, "header + 2 captions + 40 rows + 2 group footers + 1 footer row");
  });

  it('starts collapsed with defaultExpanded false and renders group footers when expanded', () => {
    const collapsed = render({ rows: 40, grouping: { groupBy: ['active'], defaultExpanded: false }, aggregates });
    assert.equal(count(collapsed, /class="salmon-data-grid-row salmon-data-grid-group-caption"/), 2);
    assert.equal(count(collapsed, /aria-expanded="false"/) >= 2, true);
    assert.equal(count(collapsed, /class="salmon-data-grid-row" data-row-id="p/), 0);
    // `showGroupedColumns` defaults to false: the grouped column is hidden.
    assert.match(collapsed, /role="grid"[^>]*aria-colcount="4"/);
    assert.doesNotMatch(collapsed, /role="columnheader"[^>]*data-column-id="active"/);
    const small = render({ rows: 6, grouping: { groupBy: ['active'] }, aggregates }).replaceAll('<!-- -->', '');
    assert.equal(count(small, /class="salmon-data-grid-row salmon-data-grid-group-footer"/), 2);
    assert.match(small, /<i class="tpl-group-footer">max 24 of 3<\/i>/);
  });

  it('caption template and hidden drop area', () => {
    const html = render({
      rows: 10,
      grouping: {
        groupBy: ['active'],
        showDropArea: false,
        renderCaption: (ctx) => createElement('span', { className: 'tpl-caption' }, `${ctx.formattedKey}:${ctx.count}`) },
    });
    assert.doesNotMatch(html, /salmon-data-grid-group-panel/);
    assert.match(html, /<span class="tpl-caption">false:5<\/span>/);
    assert.match(html, /class="salmon-data-grid-group-toggle"/, 'the toggle stays with a template');
  });

  it('footer context count follows aggregateScope like the values', () => {
    const footer: DataGridAggregateRow<Person>[] = [
      { columns: [{ field: 'age', type: 'sum', renderFooter: (ctx) => createElement('b', { className: 'tpl-count' }, `sum ${String(ctx.values['sum'])} of ${ctx.count}`) }] },
    ];
    // Ages are 20 + i: page 1 of 10 rows sums 245, all 40 rows sum 1,580.
    const page = render({ rows: 40, paging: { pageSize: 10 }, aggregates: footer }).replaceAll('<!-- -->', '');
    assert.match(page, /<b class="tpl-count">sum 245 of 10<\/b>/);
    const all = render({ rows: 40, paging: { pageSize: 10 }, aggregateScope: 'all', aggregates: footer }).replaceAll('<!-- -->', '');
    assert.match(all, /<b class="tpl-count">sum 1580 of 40<\/b>/);
  });

  it('without grouping the markup has no group parts', () => {
    const html = render({ rows: 10 });
    assert.doesNotMatch(html, /salmon-data-grid-indent|salmon-data-grid-group|salmon-data-grid-footer/);
  });
});
