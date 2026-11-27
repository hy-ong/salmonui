// SSR output of the name-table features added after the code rename:
// the row number
// column, the public column view of render contexts, column
// `filter.editorProps`, the header group toggle,
// the chip sort toggle following `sorting`, and `paging.syncUrl` rendering
// on the server without browser globals.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { DATA_GRID_ROW_NUMBER_COLUMN_ID, type DataGridColumn, type DataGridColumnInfo } from '@salmonui/data-grid';
import { count, personColumns, render, type Person } from './fixtures.ts';

const numbered: readonly DataGridColumn<Person>[] = [{ type: 'rowNumber' }, ...personColumns];

/** Text of the row number cells, in DOM order. */
function numbers(html: string): string[] {
  return [...html.matchAll(/data-column-id="__salmon_row_number"[^>]*data-row-number=""[^>]*>([^<]*)</g)].map((m) => m[1] as string);
}

describe('rowNumber column', () => {
  it('numbers the rendered rows from 1 with defaults for header, id and alignment', () => {
    const html = render({ rows: 30, columns: numbered });
    assert.equal(DATA_GRID_ROW_NUMBER_COLUMN_ID, '__salmon_row_number');
    assert.deepEqual(numbers(html).slice(0, 5), ['1', '2', '3', '4', '5']);
    assert.match(html, /role="columnheader"[^>]*data-column-id="__salmon_row_number"[^>]*>.*?<span class="salmon-data-grid-header-cell__text">#<\/span>/);
    assert.match(html, /data-column-id="__salmon_row_number"[^>]*data-align="end"/);
    // Not sortable by default, even with sorting on.
    const header = render({ rows: 5, columns: numbered, sorting: true }).match(/<div[^>]*role="columnheader"[^>]*data-column-id="__salmon_row_number"[^>]*>/)?.[0] ?? '';
    assert.doesNotMatch(header, /aria-sort/);
  });

  it('continues across pages', () => {
    const html = render({ rows: 50, columns: numbered, paging: { pageSize: 10, page: 3 } });
    assert.deepEqual(numbers(html), ['21', '22', '23', '24', '25', '26', '27', '28', '29', '30']);
  });

  it('skips group captions', () => {
    const html = render({ rows: 12, columns: numbered, sorting: true, grouping: { groupBy: ['active'], showGroupedColumns: true } });
    assert.deepEqual(numbers(html), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']);
    assert.equal(count(html, /salmon-data-grid-group-caption"/), 2);
  });

  it('localeText.rowNumberColumnHeader and the definition override the defaults', () => {
    const html = render({ rows: 3, columns: [{ type: 'rowNumber', id: 'no', header: 'No.', width: 50 }, ...personColumns] });
    assert.match(html, /data-column-id="no"/);
    assert.match(html, />No\.<\/span>/);
    assert.match(render({ rows: 3, columns: numbered, localeText: { rowNumberColumnHeader: 'Row' } }), />Row<\/span>/);
  });

  it('renderCell receives the number as the value', () => {
    const html = render({ rows: 3, columns: [{ type: 'rowNumber', renderCell: (ctx) => createElement('b', null, `#${String(ctx.value)}`) }, ...personColumns] });
    assert.match(html, /<b>#1<\/b>/);
    assert.match(html, /<b>#3<\/b>/);
  });
});

describe('public column view in render contexts', () => {
  it('renderCell, renderHeader and renderFilterCell receive table names, not engine internals', () => {
    const seen: DataGridColumnInfo<Person>[] = [];
    const columns: readonly DataGridColumn<Person>[] = [
      {
        field: 'name',
        header: 'Name',
        sortable: false,
        pinned: 'start',
        renderCell: (ctx) => {
          seen.push(ctx.column);
          return ctx.column.header;
        },
        renderHeader: (ctx) => {
          seen.push(ctx.column);
          return ctx.column.header;
        },
        renderFilterCell: (ctx) => {
          seen.push(ctx.column);
          return createElement('i', null, ctx.column.field);
        },
      },
    ];
    render({ rows: 2, columns, filtering: { ui: 'row' } });
    assert.ok(seen.length >= 3);
    const view = seen[0] as DataGridColumnInfo<Person>;
    for (const v of seen) assert.equal(v, view, 'one stable view per compiled column');
    assert.equal(view.id, 'name');
    assert.equal(view.field, 'name');
    assert.equal(view.header, 'Name');
    assert.equal(view.sortable, false);
    assert.equal(view.filterable, true);
    assert.equal(view.pinned, 'start');
    assert.equal(view.getValue({ id: 'x', name: 'N', age: 1, active: true, joined: new Date(0) }), 'N');
    for (const internal of ['headerText', 'flags', 'freeze', 'accessor', 'def', 'columnId', 'moduleMeta']) assert.equal(internal in view, false, internal);
    assert.ok(Object.isFrozen(view));
  });
});

describe('column filter.editorProps', () => {
  it('reach the filter row input; value, type and handlers stay the grid', () => {
    const columns: readonly DataGridColumn<Person>[] = [
      { field: 'name', header: 'Name', filter: { editorProps: { placeholder: 'Find a name', className: 'my-editor', 'data-test': 'x', type: 'number', defaultValue: 'nope' } } },
      { field: 'age', header: 'Age', type: 'number' },
    ];
    const html = render({ rows: 2, columns, filtering: { ui: 'row' } });
    const input = html.match(/<input[^>]*placeholder="Find a name"[^>]*>/)?.[0] ?? '';
    assert.ok(input, 'placeholder applied');
    assert.match(input, /class="salmon-data-grid-input salmon-data-grid-filter-bar__input my-editor"/);
    assert.match(input, /data-test="x"/);
    assert.match(input, /type="text"/);
    assert.doesNotMatch(input, /nope/);
    assert.equal(count(html, /placeholder="Find a name"/), 1, 'only the column with editorProps');
  });

  it('renderFilterCell receives them as editorProps', () => {
    let got: unknown;
    const columns: readonly DataGridColumn<Person>[] = [
      { field: 'name', header: 'Name', filter: { editorProps: { min: 3 } }, renderFilterCell: (ctx) => ((got = ctx.editorProps), null) },
    ];
    render({ rows: 1, columns, filtering: { ui: 'row' } });
    assert.deepEqual(got, { min: 3 });
  });
});

describe('header group toggle and chip sort toggle', () => {
  it('grouping.showHeaderToggle adds a pressed-state group button to groupable headers', () => {
    const columns: readonly DataGridColumn<Person>[] = [{ field: 'name', header: 'Name' }, { field: 'age', header: 'Age', groupable: false }, { field: 'active', header: 'Active' }];
    const html = render({ rows: 4, columns, grouping: { groupBy: ['active'], showHeaderToggle: true, showGroupedColumns: true } });
    assert.match(html, /data-kind="group"[^>]*aria-pressed="false"[^>]*aria-label="Group by Name"/);
    assert.match(html, /data-kind="group"[^>]*data-active=""[^>]*aria-pressed="true"[^>]*aria-label="Ungroup by Active"/);
    assert.equal(count(html, /data-kind="group"/), 2, 'not on the non-groupable column');
    assert.equal(count(render({ rows: 4, columns, grouping: true }), /data-kind="group"/), 0, 'off by default');
  });

  it('the chip sort toggle follows sorting, not showHeaderToggle', () => {
    const sorted = render({ rows: 4, sorting: true, grouping: { groupBy: ['active'] } });
    assert.match(sorted, /salmon-data-grid-group-chip__label"[^>]*aria-label="Grouped by Active, ascending. Press to reverse the order"/);
    const unsorted = render({ rows: 4, grouping: { groupBy: ['active'], showHeaderToggle: true } });
    assert.match(unsorted, /aria-label="Grouped by Active, ascending"/);
    assert.doesNotMatch(unsorted, /Press to reverse/);
  });
});

describe('paging.syncUrl and paging.totalRowCount on the server', () => {
  it('render the paging prop page without touching browser globals', () => {
    const html = render({ rows: 40, paging: { pageSize: 10, page: 2, syncUrl: true, totalRowCount: 400 } });
    assert.match(html, /data-row-id="p10"/);
    assert.match(html, /data-page="2"/);
    // Local paging ignores totalRowCount.
    assert.match(html, /data-page-count="4"/);
  });
});
