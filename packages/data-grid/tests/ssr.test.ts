import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { DataGridRow, type DataGridColumn } from '@salmonui/data-grid';
import { getDataGridInitialRange } from '@salmonui/data-grid/server';
import { count, people, personColumns, render, type Person } from './fixtures.ts';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

describe('SSR output', () => {
  it('a column header is named by its label only, not by its resize handle or menu button', () => {
    const html = render({ rows: 1, resizable: true, columnMenu: true });
    const headers = [...html.matchAll(/<div role="columnheader"[^>]*>/g)].map((m) => m[0]);
    assert.ok(headers.length > 0);
    for (const tag of headers) {
      const id = /aria-labelledby="([^"]+)"/.exec(tag)?.[1];
      assert.ok(id, `labelled header: ${tag}`);
      // The referenced element is the label content, which closes before the in-header controls.
      const start = html.indexOf(`id="${id}"`);
      assert.ok(start > 0, `label element ${id}`);
      const label = html.slice(start, html.indexOf('</div>', start));
      assert.doesNotMatch(label, /salmon-data-grid-resize-handle|salmon-data-grid-column-menu-button/);
    }
    assert.match(html, /class="salmon-data-grid-resize-handle" role="button"[^>]*aria-label="Resize /);
  });

  it('is deterministic and renders only the initial range', () => {
    const a = render({ rows: 1000 });
    const b = render({ rows: 1000 });
    assert.equal(a, b);
    assert.equal(count(a, /role="row" aria-rowindex/), 1 + 20, 'header row + 20 initial rows');
    assert.equal(count(a, /role="gridcell"/), 20 * personColumns.length);
    assert.match(a, /role="grid"[^>]*aria-rowcount="1001"[^>]*aria-colcount="5"/);
  });

  it('markup does not depend on the total row count beyond counts and spacer height', () => {
    const small = render({ rows: 1_000 });
    const large = render({ rows: 100_000 });
    const normalize = (html: string) => html.replace(/aria-rowcount="\d+"/, '').replace(/class="salmon-data-grid-body" style="height:\d+px"/, '');
    assert.equal(normalize(small), normalize(large));
    assert.match(large, /class="salmon-data-grid-body" style="height:3600000px"/);
  });

  it('server work scales with the initial range, not the dataset', () => {
    let accessorCalls = 0;
    const columns: DataGridColumn<Person>[] = personColumns.map((c) => ({
      ...c,
      id: c.field as string,
      valueGetter: (row: Person) => {
        accessorCalls++;
        return row[c.field as keyof Person];
      },
    }));
    render({ rows: 100_000, columns, initialRows: 10 });
    assert.ok(accessorCalls <= 10 * columns.length + columns.length * 100, `accessor calls ${accessorCalls}`);
  });

  it('renders 20 x 20 cells within the SSR budget @perf', () => {
    const columns: DataGridColumn<Person>[] = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, field: personColumns[i % 5]!.field as string, width: 100 } as DataGridColumn<Person>));
    render({ rows: 1000, columns });
    const t0 = performance.now();
    const html = render({ rows: 1000, columns });
    const ms = performance.now() - t0;
    assert.equal(count(html, /role="gridcell"/), 400);
    console.log(`[perf] renderToString 20x20: ${ms.toFixed(2)}ms`);
    assertBudget(ms, 50, 'renderToString 20x20', { strict: true });
  });

  it('getDataGridInitialRange matches the rendered range', () => {
    assert.deepEqual(getDataGridInitialRange({ rowCount: 5, centerColumnCount: 50 }).rows, { start: 0, end: 5, overscanStart: 0, overscanEnd: 5 });
    assert.equal(getDataGridInitialRange({ rowCount: 1e6, centerColumnCount: 50, initialColumns: 8 }).columns.end, 8);
  });
});

describe('columns', () => {
  it('widths become CSS variables; % and auto fall back deterministically on the server', () => {
    const html = render({
      columns: [
        { field: 'id', primaryKey: true, width: 75, minWidth: 90 },
        { field: 'name', width: '50%' },
        { field: 'age', width: 'auto' },
        { field: 'active' },
      ],
      defaultColumnWidth: 140,
    });
    assert.match(html, /--salmon-data-grid-cw-0:90px/, 'minWidth clamps');
    assert.match(html, /--salmon-data-grid-cw-1:140px/);
    assert.match(html, /--salmon-data-grid-cw-2:140px/);
    assert.match(html, /--salmon-data-grid-cw-3:140px/);
    assert.match(html, /--salmon-data-grid-total-width:510px/);
  });

  it('alignment, overflow, checkbox display', () => {
    const html = render({
      columns: [
        { field: 'id', primaryKey: true, overflow: 'clip', headerAlign: 'center' },
        { field: 'age', align: 'end', overflow: 'ellipsisWithTooltip' },
        { field: 'active', displayAsCheckbox: true },
      ],
      rows: 2,
    });
    assert.match(html, /role="columnheader"[^>]*data-column-id="id" data-align="center" data-clip="clip"/);
    assert.match(html, /role="gridcell"[^>]*data-column-id="age" data-align="end" data-clip="tooltip">21</);
    assert.match(html, /role="checkbox" aria-checked="true" aria-readonly="true" aria-label="active"/);
  });

  it('column hidden, width and array order apply on the server', () => {
    const byField = (field: string) => personColumns.find((c) => c.field === field)!;
    const html = render({
      columns: [byField('id'), byField('joined'), { ...byField('name'), width: 222 }, { ...byField('age'), hidden: true }, byField('active')],
      rows: 1,
    });
    const headers = [...html.matchAll(/role="columnheader"[^>]*data-column-id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(headers, ['id', 'joined', 'name', 'active']);
    assert.match(html, /--salmon-data-grid-cw-2:222px/);
    assert.match(html, /aria-colcount="4"/);
  });

  it('renderCell, renderHeader, cellProps, cellClassName, headerProps', () => {
    const html = render({
      rows: 2,
      columns: [
        { field: 'id', primaryKey: true },
        {
          field: 'name',
          renderCell: (ctx) => createElement('b', null, `${ctx.formattedValue}@${ctx.rowIndex}`),
          renderHeader: (ctx) => createElement('i', null, `H:${ctx.column.header}:${ctx.sortDirection ?? 'none'}`),
          cellProps: (ctx) => ({ 'data-test': ctx.rowId, className: 'from-props', style: { color: 'red' } }),
          cellClassName: 'extra',
          headerProps: { className: 'hdr', 'data-h': 'x' },
        },
      ],
    });
    assert.match(html, /<b>Person 1@1<\/b>/);
    assert.match(html, /<i>H:name:none<\/i>/);
    assert.match(html, /data-test="p0" role="gridcell"[^>]*class="salmon-data-grid-cell extra from-props" style="color:red;width:var\(--salmon-data-grid-cw-1\)"/);
    assert.match(html, /data-h="x" role="columnheader"[^>]*class="salmon-data-grid-header-cell hdr"/);
  });
});

describe('rows', () => {
  it('row identity: getRowId, one or several primaryKey columns', () => {
    assert.match(render({ rows: 1, getRowId: (r: Person) => r.name }), /data-row-id="Person 0"/);
    const twoKeys: DataGridColumn<Person>[] = personColumns.map((c) => (c.field === 'age' ? { ...c, primaryKey: true } : c));
    assert.match(render({ rows: 1, columns: twoKeys }), /data-row-id="p0\u001f20"/);
    assert.match(render({ rows: 1, getRowId: (r: Person) => `k-${r.id}` }), /data-row-id="k-p0"/);
    assert.match(render({ rows: 1 }), /data-row-id="p0"/);
    const noKey: DataGridColumn<Person>[] = personColumns.map(({ primaryKey: _, ...c }) => c);
    assert.match(render({ rows: 1, columns: noKey }), /data-row-id="p0"/, 'the `id` field is the fallback');
  });

  it('getRowProps, rowClassName, getCellProps, getRowHeight', () => {
    const html = render({
      rows: 2,
      getRowProps: (row) => ({ 'data-age': row.age, style: { opacity: 0.5 } }),
      rowClassName: (row) => (row.active ? 'is-active' : undefined),
      getCellProps: (ctx) => (ctx.field === 'age' ? { className: 'age-cell' } : undefined),
      getRowHeight: (row) => (row.active ? 50 : 30),
    });
    assert.match(html, /data-age="20" role="row"[^>]*class="salmon-data-grid-row is-active"[^>]*style="opacity:0.5;height:50px"/);
    assert.match(html, /data-age="21" role="row"[^>]*class="salmon-data-grid-row"[^>]*style="opacity:0.5;height:30px"[^>]*data-alt=""/);
    assert.match(html, /class="salmon-data-grid-cell age-cell"/);
  });

  it('renderRow keeps the row/gridcell structure through DataGridRow', () => {
    const html = render({
      rows: 2,
      renderRow: ({ rowProps, cells, rowIndex }) =>
        rowIndex === 0 ? createElement(DataGridRow, { ...rowProps, className: `${rowProps.className} custom` }, cells) : null,
    });
    assert.match(html, /role="row" aria-rowindex="2" data-row-id="p0"[^>]*class="salmon-data-grid-row custom"/);
    assert.equal(count(html, /data-row-id="p1"/), 0);
  });

  it('renderEmpty, className, style, classNames, styles, gridLines, striped, hover, textWrap', () => {
    const html = render({
      rows: 0,
      renderEmpty: ({ reason }) => `empty:${reason}`,
      className: 'mine',
      style: { outline: '1px solid' },
      classNames: { root: 'r', header: 'h', body: 'b', empty: 'e' },
      styles: { root: { margin: 1 } },
      gridLines: 'both',
      highlightOnHover: false,
      textWrap: 'header',
    });
    assert.match(html, /class="salmon-data-grid r mine" style="outline:1px solid;margin:1px;/);
    assert.match(html, /data-grid-lines="both" data-striped="" data-text-wrap="header"/);
    assert.doesNotMatch(html, /data-hover/);
    assert.match(html, /class="salmon-data-grid-header h"/);
    assert.match(html, /class="salmon-data-grid-rows b"/);
    assert.match(html, /aria-colspan="5" class="salmon-data-grid-empty__cell e">empty:noData</);
  });

  it('classNames and styles reach every server-rendered part', () => {
    const parts = ['root', 'toolbar', 'header', 'headerCell', 'body', 'row', 'cell', 'footer', 'pager', 'groupDropArea', 'groupCaption', 'detailRow'] as const;
    const classNames = Object.fromEntries(parts.map((p) => [p, `cn-${p}`]));
    const styles = Object.fromEntries(parts.map((p, i) => [p, { outlineOffset: `${i + 1}px` }]));
    const html = render({
      rows: 40,
      classNames,
      styles,
      toolbar: ['search'],
      paging: { pageSize: 10 },
      grouping: { groupBy: ['active'] },
      aggregates: [{ columns: [{ field: 'age', type: 'sum' }] }],
      defaultExpandedDetails: Array.from({ length: 40 }, (_, i) => `p${i}`),
      renderDetail: ({ rowId }) => `detail ${rowId}`,
    });
    const tags = html.match(/<[a-z]+ [^>]*>/g) ?? [];
    parts.forEach((part, i) => {
      const tag = tags.find((t) => new RegExp(`class="[^"]*\\bcn-${part}\\b`).test(t));
      assert.ok(tag, `classNames.${part} is applied`);
      assert.match(tag, new RegExp(`style="[^"]*outline-offset:${i + 1}px`), `styles.${part} is applied`);
    });
  });

  it('striped and hover highlight are on by default', () => {
    const html = render({ rows: 2 });
    assert.match(html, /role="grid"[^>]*data-hover="" data-striped=""/);
    assert.doesNotMatch(render({ rows: 2, striped: false }), /data-striped/);
  });
});

describe('query state in headers', () => {
  it('aria-sort, sort indicator and filter indicator come from the engine query', () => {
    const html = render({
      rows: 3,
      sorting: { multiple: true, sortBy: [{ field: 'age', direction: 'desc' }, { field: 'name', direction: 'asc' }] },
      filtering: { filters: [{ field: 'name', operator: 'contains', value: 'Person' }] },
    });
    assert.match(html, /aria-sort="descending"[^>]*data-column-id="age"[^>]*data-sorted="desc"/);
    assert.match(html, /aria-sort="ascending"[^>]*data-column-id="name"[^>]*data-sorted="asc" data-filtered=""/);
    assert.match(html, /aria-sort="none"[^>]*data-column-id="id"/);
    assert.match(html, /salmon-data-grid-sort-indicator" data-direction="asc" aria-hidden="true"><span class="salmon-data-grid-sort-indicator__order">2</);
    assert.match(html, /salmon-data-grid-sort-indicator" data-direction="desc" aria-hidden="true"><span class="salmon-data-grid-sort-indicator__order">1</, "multi-sort numbers every sorted column");
    const ids = [...html.matchAll(/role="row"[^>]*data-row-id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['p2', 'p1', 'p0'], 'rows follow the sorted model');
  });

  it('without sorting no aria-sort is emitted', () => {
    assert.doesNotMatch(render({ rows: 1 }), /aria-sort/);
    assert.equal(people(3).length, 3);
  });
});

describe('SSR: header value getter', () => {
  it('headerValueGetter text renders in the server header', () => {
    const columns: DataGridColumn<Person>[] = personColumns.map((c) =>
      c.field === 'age' ? { ...c, headerValueGetter: (column) => `Years (${String(column.field)})` } : c,
    );
    const html = render({ rows: 3, columns });
    assert.match(html, /Years \(age\)/);
    assert.doesNotMatch(html, />Age</);
    assert.equal(render({ rows: 3, columns }), html, 'deterministic');
  });
});
