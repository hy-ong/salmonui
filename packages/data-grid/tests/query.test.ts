// SSR output of the query UI: modules come from the
// `sorting`, `filtering`, `search`, and `paging` props alone (no data-grid-core
// imports), the initial sort, filters, search text, and page render on the
// server, and the markup is deterministic.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataGridSearchBox, type DataGridColumn } from '@salmonui/data-grid';
import { count, personColumns, render, type Person } from './fixtures.ts';

const rowIds = (html: string): string[] => [...html.matchAll(/role="row"[^>]*data-row-id="([^"]+)"/g)].map((m) => m[1] as string);

describe('sorting prop', () => {
  it('sorting.sortBy sorts on the server, with aria-sort and order numbers', () => {
    const props = {
      rows: 6,
      sorting: { multiple: true, sortBy: [{ field: 'active', direction: 'desc' as const }, { field: 'age', direction: 'desc' as const }] },
    };
    const html = render(props);
    assert.equal(render(props), html, 'deterministic');
    assert.deepEqual(rowIds(html), ['p4', 'p2', 'p0', 'p5', 'p3', 'p1']);
    assert.match(html, /aria-sort="descending"[^>]*data-column-id="active"/);
    assert.match(html, /aria-sort="none"[^>]*data-column-id="name"/);
    assert.match(html, /data-column-id="age"[^>]*>.*?salmon-data-grid-sort-indicator__order">2</);
  });

  it('sorting false registers no sorting (no aria-sort)', () => {
    const html = render({ rows: 3, sorting: false });
    assert.deepEqual(rowIds(html), ['p0', 'p1', 'p2']);
    assert.doesNotMatch(html, /aria-sort/);
  });

  it('without query props the grid renders no query UI', () => {
    const html = render({ rows: 3 });
    assert.doesNotMatch(html, /aria-sort|salmon-data-grid-pager|salmon-data-grid-filter-bar|role="search"/);
  });
});

describe('filtering prop', () => {
  it('filter row (default ui): a header row of labelled inputs showing the initial filter', () => {
    const html = render({ rows: 40, filtering: { filters: [{ field: 'name', operator: 'startswith', value: 'Person 1' }] } });
    assert.match(html, /role="row" aria-rowindex="2" class="salmon-data-grid-header-row salmon-data-grid-filter-bar"/);
    assert.equal(count(html, /class="salmon-data-grid-filter-bar__cell"/), personColumns.length);
    assert.match(html, /aria-label="Filter Name"[^>]*value="Person 1"|value="Person 1"[^>]*aria-label="Filter Name"/);
    // Person 1, Person 10..19.
    assert.equal(count(html, /role="row"[^>]*data-row-id=/), 11);
    assert.match(html, /role="row" aria-rowindex="3" class="salmon-data-grid-row" data-row-id="p1"/, 'body rows follow the two header rows');
    assert.match(html, /role="grid"[^>]*aria-rowcount="13"/);
    assert.doesNotMatch(html, /salmon-data-grid-filter-button/);
  });

  it('writes an applied condition back with its operator prefix; between is a text range', () => {
    const prefixed = render({ rows: 40, filtering: { filters: [{ field: 'age', operator: 'greaterThanOrEqual', value: 30 }] } });
    assert.match(prefixed, /aria-label="Filter Age"[^>]*value="&gt;=30"|value="&gt;=30"[^>]*aria-label="Filter Age"/);
    const range = render({ rows: 40, filtering: { filters: [{ field: 'age', operator: 'between', value: [20, 40] }] } });
    assert.match(range, /value="20..40"/);
    // With the operator dropdown, a between range is never written into a number input.
    const withOps = render({ rows: 40, filtering: { showOperators: true, filters: [{ field: 'age', operator: 'between', value: [20, 40] }] } });
    const input = /<input[^>]*aria-label="Filter Age"[^>]*>/.exec(withOps)?.[0] ?? '';
    assert.match(input, /type="text"/);
    assert.match(input, /value="20..40"/);
  });

  it('showOperators renders an operator select per cell', () => {
    const html = render({ rows: 2, filtering: { showOperators: true } });
    assert.equal(count(html, /class="salmon-data-grid-input salmon-data-grid-filter-bar__operator"/), personColumns.length);
    assert.match(html, /aria-label="Age filter operator"/);
  });

  it('menu / excel / checklist render a header filter button instead of the filter row', () => {
    for (const ui of ['menu', 'excel', 'checklist'] as const) {
      const html = render({ rows: 2, filtering: { ui } });
      assert.doesNotMatch(html, /salmon-data-grid-filter-bar/, ui);
      assert.equal(count(html, /class="salmon-data-grid-header-button salmon-data-grid-filter-button"[^>]*aria-haspopup="dialog"/), personColumns.length, ui);
    }
  });

  it('column filter.ui and renderFilterCell', () => {
    const columns: DataGridColumn<Person>[] = personColumns.map((c): DataGridColumn<Person> =>
      c.field === 'active'
        ? { ...c, renderFilterCell: (ctx) => createElement('span', { className: 'tpl-bar' }, `bar:${ctx.field}:${ctx.operator}`) }
        : c.field === 'age'
          ? { ...c, filter: { ui: 'menu' } }
          : c,
    );
    const html = render({ rows: 2, columns, filtering: true });
    assert.match(html, /<span class="tpl-bar">bar:active:equal<\/span>/);
    assert.equal(count(html, /salmon-data-grid-filter-button/), 1, 'only the menu column has a button');
  });

  it('nested filter groups apply on the server', () => {
    const html = render({
      rows: 10,
      filtering: { filters: [{ logic: 'or', filters: [{ field: 'active', operator: 'equal', value: true }, { field: 'name', operator: 'equal', value: 'Person 1' }] }] },
    });
    // The 5 active rows or the inactive p1.
    assert.deepEqual(rowIds(html), ['p0', 'p1', 'p2', 'p4', 'p6', 'p8']);
  });

  it('filtering false renders no filter UI', () => {
    const html = render({ rows: 3, filtering: false });
    assert.doesNotMatch(html, /salmon-data-grid-filter-bar|salmon-data-grid-filter-button/);
  });
});

describe('search prop', () => {
  it('search.text searches on the server', () => {
    const html = render({ rows: 30, search: { text: 'Person 2', fields: ['name'] } });
    // Person 2, Person 20..29.
    assert.equal(count(html, /role="row"[^>]*data-row-id=/), 11);
  });

  it('DataGridSearchBox outside a grid renders a labelled search landmark (disabled without a grid)', () => {
    const html = renderToString(createElement(DataGridSearchBox, { 'aria-label': 'Search people' }));
    assert.match(html, /<div role="search" aria-label="Search people" class="salmon-data-grid-search"><input id="[^"]+" type="search" class="salmon-data-grid-input salmon-data-grid-search__input" aria-label="Search" placeholder="Search" disabled="" value=""\/>/);
  });

  it('the toolbar search item hosts DataGridSearchBox with the applied text', () => {
    const html = render({ rows: 5, toolbar: ['search'], search: { text: 'Person 3' } });
    assert.match(html, /role="search" aria-label="Search grid" class="salmon-data-grid-search salmon-data-grid-toolbar__search"/);
    assert.match(html, /type="search"[^>]*value="Person 3"/);
  });
});

describe('paging prop and the pager', () => {
  it('paging renders the current page and a navigation landmark', () => {
    const props = { rows: 100, paging: { pageSize: 10, page: 3, buttonCount: 4, pageSizeOptions: [10, 20, 'all' as const] } };
    const html = render(props).replaceAll('<!-- -->', '');
    assert.equal(render(props).replaceAll('<!-- -->', ''), html, 'deterministic');
    assert.deepEqual(rowIds(html).slice(0, 2), ['p20', 'p21']);
    assert.equal(count(html, /role="row"[^>]*data-row-id=/), 10);
    assert.match(html, /class="salmon-data-grid-pager" role="navigation" aria-label="Pagination" data-page="3" data-page-count="10"/);
    assert.match(html, /aria-label="Page 3" aria-current="page"/);
    assert.equal(count(html, /salmon-data-grid-pager__number/), 4, 'buttonCount numeric buttons');
    assert.match(html, /salmon-data-grid-pager__next-set" data-page="5" aria-label="Next pages"/);
    assert.doesNotMatch(html, /prev-set/);
    assert.match(html, /3 of 10 pages<\/span> <span class="salmon-data-grid-pager__items">\(100 items\)/);
    assert.match(html, /<option value="10" selected="">10<\/option><option value="20">20<\/option><option value="all">All<\/option>/);
    assert.match(html, /salmon-data-grid-pager__first" data-page="1" aria-label="First page"/);
  });

  it('pageSizeOptions true offers All, 5, 10, 12, 20', () => {
    const html = render({ rows: 30, paging: { pageSizeOptions: true } });
    assert.match(html, /<option value="all">All<\/option><option value="5">5<\/option><option value="10">10<\/option><option value="12" selected="">12<\/option><option value="20">20<\/option>/);
  });

  it('renderPager replaces the pager and receives the pager model', () => {
    const html = render({
      rows: 25,
      paging: { pageSize: 10 },
      renderPager: (ctx) => createElement('span', { className: 'tpl-pager' }, `${ctx.page}/${ctx.pageCount}/${ctx.totalRowCount}`),
    });
    assert.match(html, /role="navigation" aria-label="Pagination"><span class="tpl-pager">1\/3\/25<\/span>/);
  });

  it('paging false renders every row and no pager', () => {
    const html = render({ rows: 15, initialRows: 30, paging: false });
    assert.equal(count(html, /role="row"[^>]*data-row-id=/), 15);
    assert.doesNotMatch(html, /salmon-data-grid-pager/);
  });
});
