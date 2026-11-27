import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createElement } from 'react';
import type { DataGridColumn } from '@salmonui/data-grid';
import { count, render, type Person } from './fixtures.ts';

// Column chrome in the server HTML (renderToString): cell spans, the
// toolbar, sticky rows, pinned columns, and stacked headers.

const base: readonly DataGridColumn<Person>[] = [
  { field: 'id', header: 'ID', width: 80 },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'age', header: 'Age', type: 'number', width: 90 },
  { field: 'active', header: 'Active', type: 'boolean', width: 90 },
];

const col = (c: DataGridColumn<Person> & Record<string, unknown>): DataGridColumn<Person> => c as DataGridColumn<Person>;

/** Opening tag of the first element matching `attr` (e.g. `data-row-id="p0"`). */
function tag(html: string, attr: string): string {
  const m = html.match(new RegExp(`<[a-z]+ [^>]*${attr}[^>]*>`));
  assert.ok(m, attr);
  return m[0];
}

/** Inner HTML of the row with `data-row-id` up to the next row. */
function rowHtml(html: string, rowId: string): string {
  const start = html.indexOf(`data-row-id="${rowId}"`);
  assert.ok(start >= 0, `row ${rowId}`);
  const next = html.indexOf('role="row"', start);
  return html.slice(start, next < 0 ? undefined : next);
}

/** Gridcell opening tag for column `id` in a row's HTML. */
function cell(row: string, id: string): string | undefined {
  return row.match(new RegExp(`<div role="gridcell"[^>]*data-column-id="${id.replace('.', '\\.')}"[^>]*>`))?.[0];
}

function toolbarHtml(html: string): string {
  const m = html.match(/<div role="toolbar"[\s\S]*?<\/div>(?=<div[^>]*role="grid")/);
  assert.ok(m, 'toolbar before the grid');
  return m[0];
}

describe('cell spans', () => {
  let warnings: string[] = [];
  const original = console.warn;
  beforeEach(() => {
    warnings = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };
  });
  afterEach(() => {
    console.warn = original;
  });

  it('a colSpan function covers the following columns and skips their cells', () => {
    const columns = [col({ ...base[0]!, colSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex === 1 ? 3 : 1) }), base[1]!, base[2]!, base[3]!];
    const html = render({ id: 'span-fn', rows: 3, columns });
    const r1 = rowHtml(html, 'p1');
    assert.match(cell(r1, 'id') ?? '', /aria-colindex="1" aria-colspan="3"/);
    assert.equal(cell(r1, 'name'), undefined);
    assert.equal(cell(r1, 'age'), undefined);
    assert.match(cell(r1, 'active') ?? '', /aria-colindex="4"/);
    assert.match(cell(r1, 'id') ?? '', /width:calc\(var\(--salmon-data-grid-cw-0\) \+ var\(--salmon-data-grid-cw-1\) \+ var\(--salmon-data-grid-cw-2\)\)/);
    // Other rows keep one cell per column.
    assert.doesNotMatch(rowHtml(html, 'p0'), /aria-colspan/);
    assert.equal(count(rowHtml(html, 'p0'), /role="gridcell"/), 4);
  });

  it('the span context carries row, rowId, rowIndex, field and value', () => {
    const seen: unknown[] = [];
    const columns = [
      col({ ...base[1]!, colSpan: (ctx: { rowId: string; rowIndex: number; field: string; value: unknown; row: Person }) => (seen.push([ctx.rowId, ctx.rowIndex, ctx.field, ctx.value, ctx.row.id]), 1) }),
      base[2]!,
    ];
    render({ id: 'span-ctx', rows: 2, columns });
    assert.deepEqual(seen, [
      ['p0', 0, 'name', 'Person 0', 'p0'],
      ['p1', 1, 'name', 'Person 1', 'p1'],
    ]);
  });

  it('a colSpan past the last column is clamped to the zone; the render itself never warns', () => {
    const columns = [base[0]!, base[1]!, col({ ...base[2]!, colSpan: () => 5 }), base[3]!];
    const html = render({ id: 'span-last', rows: 1, columns });
    assert.match(cell(rowHtml(html, 'p0'), 'age') ?? '', /aria-colspan="2"/);
    // The span-edge warning is raised from a layout effect on the client (hardening.test.ts), never during render.
    assert.ok(!warnings.some((w) => /span-last.*colSpan/.test(w)), warnings.join('\n'));
  });

  it('a colSpan never crosses a pin edge: a pinned-start span stays in the left zone', () => {
    const columns = [col({ ...base[0]!, pinned: 'start', colSpan: () => 3 }), col({ ...base[1]!, pinned: 'start' }), base[2]!, base[3]!];
    const html = render({ id: 'span-pin', rows: 1, columns });
    const r0 = rowHtml(html, 'p0');
    assert.match(cell(r0, 'id') ?? '', /aria-colspan="2"/);
    assert.ok(cell(r0, 'age'), 'the first center cell still renders');
  });

  it('a center span never reaches into the right pinned zone', () => {
    const columns = [base[0]!, col({ ...base[1]!, colSpan: () => 3 }), base[2]!, col({ ...base[3]!, pinned: 'end' })];
    const html = render({ id: 'span-right', rows: 1, columns });
    const r0 = rowHtml(html, 'p0');
    assert.match(cell(r0, 'name') ?? '', /aria-colspan="2"/);
    assert.match(cell(r0, 'active') ?? '', /aria-colindex="4"/);
  });

  it('colSpan: true merges equal adjacent values of columns that opt in', () => {
    const columns = [
      col({ id: 'a', header: 'A', width: 80, valueGetter: () => 'x', colSpan: true }),
      col({ id: 'b', header: 'B', width: 80, valueGetter: () => 'x', colSpan: true }),
      col({ id: 'c', header: 'C', width: 80, valueGetter: () => 'x' }),
    ];
    const html = render({ id: 'span-true', rows: 1, columns });
    const r0 = rowHtml(html, 'p0');
    assert.match(cell(r0, 'a') ?? '', /aria-colspan="2"/);
    assert.ok(cell(r0, 'c'), 'c does not opt in');
  });

  it('empty values never merge', () => {
    const columns = [col({ id: 'a', header: 'A', width: 80, valueGetter: () => '' }), col({ id: 'b', header: 'B', width: 80, valueGetter: () => '' })];
    const html = render({ id: 'span-empty', rows: 1, columns, mergeCells: true, virtualization: { rows: false } });
    assert.doesNotMatch(html, /aria-colspan|aria-rowspan/);
  });

  it('mergeCells: "rows" merges equal values down a column; covered cells become hidden spacers', () => {
    const columns = [col({ id: 'g', header: 'G', width: 80, valueGetter: (row: Person) => (row.id === 'p3' ? 'other' : 'same') }), base[1]!];
    const html = render({ id: 'span-rows', rows: 4, columns, mergeCells: 'rows', virtualization: { rows: false } });
    assert.match(cell(rowHtml(html, 'p0'), 'g') ?? '', /aria-rowspan="3"/);
    assert.match(cell(rowHtml(html, 'p0'), 'g') ?? '', /height:calc\(var\(--salmon-data-grid-row-height\) \* 3\)/);
    for (const id of ['p1', 'p2']) {
      assert.equal(cell(rowHtml(html, id), 'g'), undefined, id);
      assert.match(rowHtml(html, id), /class="salmon-data-grid-cell-spacer"[^>]*aria-hidden="true"/);
    }
    assert.doesNotMatch(cell(rowHtml(html, 'p3'), 'g') ?? '', /aria-rowspan/);
    // `name` values differ per row: no column merging under "rows".
    assert.doesNotMatch(html, /aria-colspan/);
  });

  it('mergeCells: true merges both rows and columns', () => {
    const columns = [col({ id: 'a', header: 'A', width: 80, valueGetter: () => 'x' }), col({ id: 'b', header: 'B', width: 80, valueGetter: () => 'x' })];
    const html = render({ id: 'span-both', rows: 2, columns, mergeCells: true, virtualization: { rows: false } });
    const first = cell(rowHtml(html, 'p0'), 'a') ?? '';
    assert.match(first, /aria-colspan="2"/);
    assert.match(first, /aria-rowspan="2"/);
    assert.equal(count(rowHtml(html, 'p1'), /role="gridcell"/), 0);
  });

  it('a cell with rowSpan and colSpan covers its whole block in the rows below', () => {
    const columns = [
      base[0]!,
      col({ ...base[1]!, colSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex === 0 ? 2 : 1), rowSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex === 0 ? 2 : 1) }),
      base[2]!,
      base[3]!,
    ];
    const html = render({ id: 'span-block', rows: 3, columns, virtualization: { rows: false } });
    const r0 = rowHtml(html, 'p0');
    assert.match(cell(r0, 'name') ?? '', /aria-colindex="2" aria-colspan="2" aria-rowspan="2"/);
    const r1 = rowHtml(html, 'p1');
    assert.equal(cell(r1, 'name'), undefined);
    assert.equal(cell(r1, 'age'), undefined);
    assert.equal(count(r1, /salmon-data-grid-cell-spacer/), 2);
    assert.match(cell(r1, 'id') ?? '', /aria-colindex="1"/);
    assert.match(cell(r1, 'active') ?? '', /aria-colindex="4"/);
    assert.equal(count(rowHtml(html, 'p2'), /role="gridcell"/), 4);
  });

  it('a colSpan function returning less than 1 or a fraction renders a single cell', () => {
    const columns = [col({ ...base[0]!, colSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex === 0 ? 0 : 1.9) }), base[1]!];
    const html = render({ id: 'span-floor', rows: 2, columns });
    assert.doesNotMatch(html, /aria-colspan/);
  });
});

describe('toolbar', () => {
  it('is the previous sibling of role="grid", not a descendant, with role="toolbar" and a label', () => {
    const html = render({ rows: 2, toolbar: ['add'] });
    const toolbarAt = html.indexOf('role="toolbar"');
    const gridAt = html.indexOf('role="grid"');
    assert.ok(toolbarAt >= 0 && toolbarAt < gridAt);
    assert.match(html, /^<div role="toolbar" aria-label="Data Grid toolbar" aria-orientation="horizontal" class="salmon-data-grid-toolbar">/);
    // The toolbar closes before the grid opens.
    assert.match(html, /<\/button><\/div><div id="[^"]+" role="grid"/);
  });

  it('renders no toolbar without the prop or for an empty list', () => {
    assert.doesNotMatch(render({ rows: 2 }), /role="toolbar"/);
    assert.doesNotMatch(render({ rows: 2, toolbar: [] }), /role="toolbar"/);
  });

  it('localeText.toolbarLabel names the toolbar', () => {
    const html = render({ rows: 2, toolbar: ['add'], localeText: { toolbarLabel: 'Werkzeuge' } as never });
    assert.match(html, /role="toolbar" aria-label="Werkzeuge"/);
  });

  it('renders built-in items in order with default labels and data-builtin', () => {
    const ids = ['add', 'edit', 'delete', 'save', 'cancel', 'print', 'columnChooser', 'exportExcel', 'exportPdf', 'exportCsv', 'expandAll', 'collapseAll'] as const;
    const tb = toolbarHtml(render({ rows: 2, toolbar: [...ids] }));
    const order = [...tb.matchAll(/data-toolbar-item="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, [...ids]);
    for (const id of ids) assert.match(tb, new RegExp(`data-toolbar-item="${id}"[^>]*data-builtin="${id}"`));
    assert.match(tb, /<span>Add<\/span>/);
    assert.match(tb, /<span>Columns<\/span>/);
    assert.match(tb, /<span>Expand all<\/span>/);
  });

  it('unavailable built-ins are aria-disabled with a reason title; available ones are enabled', () => {
    const tb = toolbarHtml(render({ rows: 2, toolbar: ['print', 'exportExcel', 'exportPdf', 'exportCsv', 'expandAll', 'columnChooser'] }));
    assert.match(tb, /aria-disabled="true" title="Excel export is not available" data-toolbar-item="exportExcel"/);
    assert.match(tb, /aria-disabled="true" title="PDF export is not available" data-toolbar-item="exportPdf"/);
    // Print and CSV export are built in.
    for (const id of ['print', 'exportCsv']) assert.doesNotMatch(tb.match(new RegExp(`<button[^>]*data-toolbar-item="${id}"[^>]*>`))?.[0] ?? '', /aria-disabled/, id);
    assert.match(tb, /aria-disabled="true" title="Grouping is not available" data-toolbar-item="expandAll"/);
    // The chooser needs no module.
    assert.doesNotMatch(tb.match(/<button[^>]*data-toolbar-item="columnChooser"[^>]*>/)?.[0] ?? '', /aria-disabled/);
  });

  it('expandAll / collapseAll are enabled with grouping', () => {
    const tb = toolbarHtml(render({ rows: 4, grouping: { groupBy: ['active'] }, toolbar: ['expandAll', 'collapseAll'] }));
    assert.doesNotMatch(tb, /aria-disabled/);
  });

  it('custom items keep id, label, icon, title, disabled and render', () => {
    const tb = toolbarHtml(
      render({
        rows: 2,
        toolbar: [
          { id: 'refresh', label: 'Refresh', title: 'Reload rows', icon: createElement('b', null, 'R') },
          { id: 'off', label: 'Off', disabled: true },
          { id: 'custom', render: ({ disabled }) => createElement('i', { 'data-x': String(disabled) }, 'Custom') },
        ],
      }),
    );
    assert.match(tb, /title="Reload rows" data-toolbar-item="refresh" data-stop="0" data-align="start"/);
    assert.match(tb, /<span class="salmon-data-grid-toolbar__icon" aria-hidden="true"><b>R<\/b><\/span><span>Refresh<\/span>/);
    assert.match(tb, /aria-disabled="true" data-toolbar-item="off"/);
    assert.match(tb, /data-toolbar-item="custom"[^>]*><i data-x="false">Custom<\/i><\/button>/);
    assert.doesNotMatch(tb, /data-builtin/);
  });

  it('align start / center / end lands in data-align; search defaults to end', () => {
    const tb = toolbarHtml(
      render({
        rows: 2,
        search: true,
        toolbar: ['add', { id: 'mid', label: 'Mid', align: 'center' }, { id: 'right', label: 'Right', align: 'end' }, 'search', { id: 'print', align: 'center' }],
      }),
    );
    assert.match(tb, /data-toolbar-item="add"[^>]*data-align="start"/);
    assert.match(tb, /data-toolbar-item="mid"[^>]*data-align="center"/);
    assert.match(tb, /data-toolbar-item="right"[^>]*data-align="end"/);
    assert.match(tb, /data-toolbar-item="search"[^>]*data-align="end"/);
    assert.match(tb, /data-toolbar-item="print"[^>]*data-align="center"[^>]*data-builtin="print"/);
  });

  it('the search item is disabled without the search module and enabled with it', () => {
    const off = toolbarHtml(render({ rows: 2, toolbar: ['search'] }));
    assert.match(off, /role="search"/);
    assert.match(off, /<input[^>]*disabled=""/);
    assert.match(off, /title="Search is not available"/);
    const on = toolbarHtml(render({ rows: 2, search: true, toolbar: ['search'] }));
    assert.doesNotMatch(on, /<input[^>]*disabled=""/);
  });

  it('roving tabindex: exactly one stop is tabbable, the first one', () => {
    const tb = toolbarHtml(render({ rows: 2, search: true, toolbar: ['add', { id: 'x', label: 'X' }, 'search', 'print'] }));
    assert.equal(count(tb, /tabindex="0"/), 1);
    assert.match(tb, /<button[^>]*tabindex="0"[^>]*data-toolbar-item="add"[^>]*data-stop="0"/);
    assert.equal(count(tb, /tabindex="-1"/), 3);
    const stops = [...tb.matchAll(/data-stop="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(stops, [0, 1, 2, 3]);
  });

  it('a disabled first item still holds the initial tab stop', () => {
    const tb = toolbarHtml(render({ rows: 2, toolbar: ['add', { id: 'x', label: 'X' }] }));
    assert.match(tb, /<button[^>]*tabindex="0"[^>]*aria-disabled="true"[^>]*data-toolbar-item="add"/);
  });

  it('renderToolbar replaces the toolbar; ctx gives the items, the default toolbar and the api', () => {
    let ctxItems: readonly { id: string }[] = [];
    let hasApi = false;
    const html = render({
      rows: 2,
      toolbar: ['add', { id: 'x', label: 'X' }],
      renderToolbar: ({ items, defaultToolbar, api }) => {
        ctxItems = items;
        hasApi = typeof api.runCommand === 'function';
        return createElement('section', { 'data-custom-toolbar': '' }, createElement('h2', null, 'Tools'), defaultToolbar);
      },
    });
    assert.deepEqual(ctxItems.map((i) => i.id), ['add', 'x']);
    assert.ok(hasApi);
    assert.match(html, /^<section data-custom-toolbar=""><h2>Tools<\/h2><div role="toolbar"/);
    assert.ok(html.indexOf('data-custom-toolbar') < html.indexOf('role="grid"'));
  });

  it('renderToolbar alone renders without a toolbar prop', () => {
    const html = render({ rows: 2, renderToolbar: () => createElement('nav', { 'data-own': '' }, 'mine') });
    assert.match(html, /^<nav data-own="">mine<\/nav><div id="[^"]+" role="grid"/);
  });
});

describe('sticky rows', () => {
  const rowgroup = (html: string, cls: string): string => {
    const m = html.match(new RegExp(`<div role="rowgroup" class="salmon-data-grid-frozen-rows ${cls}"[^>]*>([\\s\\S]*?)</div></div></div>(?=<div role="rowgroup"|</div><div class="salmon-data-grid-drop)`));
    assert.ok(m, cls);
    return m[1] as string;
  };

  it('stickyRows renders the first rows in a top rowgroup with their own aria-rowindex', () => {
    const html = render({ rows: 10, stickyRows: 2, virtualization: { rows: false } });
    assert.match(html, /class="salmon-data-grid-body"[^>]*data-frozen-rows=""/);
    const top = rowgroup(html, 'salmon-data-grid-frozen-rows--top');
    assert.deepEqual([...top.matchAll(/data-row-id="(p\d+)"/g)].map((m) => m[1]), ['p0', 'p1']);
    assert.match(html, /role="row" aria-rowindex="2"[^>]*data-row-id="p0"/);
    assert.match(html, /role="row" aria-rowindex="3"[^>]*data-row-id="p1"/);
    // The scrolling rowgroup skips them and keeps counting after them.
    const scrolling = html.slice(html.indexOf('class="salmon-data-grid-rows"'));
    assert.doesNotMatch(scrolling, /data-row-id="p[01]"/);
    assert.match(scrolling, /role="row" aria-rowindex="4"[^>]*data-row-id="p2"/);
    assert.equal(count(html, /data-row-id="p0"/), 1);
    assert.doesNotMatch(html, /salmon-data-grid-frozen-rows--bottom/);
  });

  it('stickyBottomRows renders the last rows in a bottom rowgroup after the scrolling rows', () => {
    const html = render({ rows: 6, stickyBottomRows: 2, virtualization: { rows: false } });
    const bottomAt = html.indexOf('salmon-data-grid-frozen-rows--bottom');
    assert.ok(bottomAt > html.indexOf('class="salmon-data-grid-rows"'));
    const bottom = html.slice(bottomAt);
    assert.deepEqual([...bottom.matchAll(/data-row-id="(p\d+)"/g)].map((m) => m[1]), ['p4', 'p5']);
    assert.match(bottom, /role="row" aria-rowindex="6"[^>]*data-row-id="p4"/);
    assert.match(bottom, /role="row" aria-rowindex="7"[^>]*data-row-id="p5"/);
    assert.doesNotMatch(html.slice(0, bottomAt), /data-row-id="p[45]"/);
    assert.match(html, /role="grid"[^>]*aria-rowcount="7"/);
  });

  it('top and bottom together never take more rows than exist', () => {
    const html = render({ rows: 3, stickyRows: 2, stickyBottomRows: 5, virtualization: { rows: false } });
    assert.equal(count(html, /data-row-id="p\d"/), 3);
    for (const id of ['p0', 'p1', 'p2']) assert.equal(count(html, new RegExp(`data-row-id="${id}"`)), 1, id);
  });

  it('sticky rows keep their aria-rowindex below stacked headers and the filter bar', () => {
    const columns = [col({ id: 'g', header: 'G', columns: [base[0]!, base[1]!] }), base[2]!];
    const html = render({ rows: 4, columns, stickyRows: 1, filtering: { ui: 'row' } });
    // 2 header levels + 1 filter row.
    assert.match(html, /role="row" aria-rowindex="4"[^>]*data-row-id="p0"/);
  });

  it(
    'a row span never crosses the sticky rowgroup edge',
    () => {
      const columns = [col({ id: 'g', header: 'G', width: 80, valueGetter: () => 'same' }), base[1]!];
      const html = render({ rows: 3, columns, mergeCells: 'rows', stickyRows: 1, virtualization: { rows: false } });
      const top = html.slice(html.indexOf('salmon-data-grid-frozen-rows--top'), html.indexOf('class="salmon-data-grid-rows"'));
      assert.doesNotMatch(top, /aria-rowspan/, 'the sticky row cell stays inside its rowgroup');
      assert.ok(cell(rowHtml(html, 'p1'), 'g'), 'the first scrolling row renders its own cell');
    },
  );

  it('negative and fractional counts are floored to zero', () => {
    const html = render({ rows: 3, stickyRows: -1, stickyBottomRows: 0.5 });
    assert.doesNotMatch(html, /salmon-data-grid-frozen-rows|data-frozen-rows/);
  });
});

describe('pinned columns in SSR markup', () => {
  const zone = (html: string, side: 'left' | 'right', rowId: string): string => {
    const row = rowHtml(html, rowId);
    return row.match(new RegExp(`<div class="salmon-data-grid-pin salmon-data-grid-pin--${side}" data-frozen-edge="${side === 'left' ? 'start' : 'end'}">(.*?)</div></div>(?=<div class="salmon-data-grid-(center|pin))`))?.[1] ?? row.match(new RegExp(`salmon-data-grid-pin--${side}"[^>]*>(.*)$`))?.[1] ?? '';
  };

  it('column pinned start / end renders in the left / right pin zones of header and rows', () => {
    const columns = [base[0]!, col({ ...base[1]!, pinned: 'end' }), col({ ...base[2]!, pinned: 'start' }), base[3]!];
    const html = render({ rows: 2, columns });
    assert.match(zone(html, 'left', 'p0'), /data-column-id="age"/);
    assert.doesNotMatch(zone(html, 'left', 'p0'), /data-column-id="(id|name|active)"/);
    assert.match(zone(html, 'right', 'p0'), /data-column-id="name"/);
    // Display order: left, center, right.
    const r0 = rowHtml(html, 'p0');
    assert.deepEqual([...r0.matchAll(/role="gridcell" aria-colindex="(\d)"[^>]*data-column-id="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`), ['1:age', '2:id', '3:active', '4:name']);
    // Header cells carry the zone.
    assert.match(html, /role="columnheader" aria-colindex="1"[^>]*data-column-id="age" data-frozen="left"/);
    assert.match(html, /role="columnheader" aria-colindex="4"[^>]*data-column-id="name" data-frozen="right"/);
    assert.doesNotMatch(tag(html, 'role="columnheader" aria-colindex="2"'), /data-frozen/);
    assert.match(html, /--salmon-data-grid-left-width:90px;--salmon-data-grid-center-width:170px;--salmon-data-grid-right-width:160px/);
  });

  it('pinnedColumns.start / .end pin the first / last visible columns', () => {
    const html = render({ rows: 2, columns: base, pinnedColumns: { start: 2, end: 1 } });
    assert.match(html, /data-column-id="id" data-frozen="left"/);
    assert.match(html, /data-column-id="name" data-frozen="left"/);
    assert.match(html, /data-column-id="active" data-frozen="right"/);
    assert.doesNotMatch(tag(html, 'role="columnheader"[^>]*data-column-id="age"'), /data-frozen/);
    assert.match(zone(html, 'right', 'p1'), /data-column-id="active"/);
  });

  it('pinnedColumns beats a column pin for the counted positions; other pins still apply', () => {
    const columns = [col({ ...base[0]!, pinned: 'end' }), base[1]!, base[2]!, col({ ...base[3]!, pinned: 'start' })];
    const html = render({ rows: 1, columns, pinnedColumns: { start: 1 } });
    assert.match(html, /data-column-id="id" data-frozen="left"/);
    assert.match(html, /data-column-id="active" data-frozen="left"/);
    assert.doesNotMatch(html, /salmon-data-grid-pin--right/);
  });

  it('no pin zones without pins; zero and invalid counts pin nothing', () => {
    for (const pinnedColumns of [undefined, { start: 0 }, { start: -2, end: Number.NaN }]) {
      const html = render({ rows: 1, columns: base, ...(pinnedColumns ? { pinnedColumns } : {}) });
      assert.doesNotMatch(html, /salmon-data-grid-pin--|data-frozen=/);
    }
  });
});

describe('stacked headers', () => {
  const stacked: readonly DataGridColumn<Person>[] = [
    base[0]!,
    col({ id: 'person', header: 'Person', columns: [base[1]!, col({ id: 'facts', header: 'Facts', columns: [base[2]!, base[3]!] })] }),
  ];

  it('renders one role=row per header level with aria-rowindex and counts them in aria-rowcount', () => {
    const html = render({ rows: 2, columns: stacked });
    const header = html.slice(html.indexOf('class="salmon-data-grid-header"'), html.indexOf('class="salmon-data-grid-body"'));
    assert.equal(count(header, /role="row"/), 3);
    for (const level of [0, 1, 2]) assert.match(header, new RegExp(`role="row" aria-rowindex="${level + 1}" class="salmon-data-grid-header-row" data-level="${level}"`));
    assert.match(html, /class="salmon-data-grid-header" data-stacked=""/);
    assert.match(html, /role="grid"[^>]*aria-rowcount="5"/);
    assert.match(html, /role="row" aria-rowindex="4"[^>]*data-row-id="p0"/);
  });

  it('group cells carry aria-colspan over their leaves; shallow leaves span the rows below', () => {
    const html = render({ rows: 1, columns: stacked });
    assert.match(html, /role="columnheader" aria-colindex="2" aria-colspan="3" class="salmon-data-grid-header-cell salmon-data-grid-header-group"[^>]*data-group-id="person"/);
    assert.match(html, /role="columnheader" aria-colindex="3" aria-colspan="2" class="salmon-data-grid-header-cell salmon-data-grid-header-group"[^>]*data-group-id="facts"/);
    // `id` sits at depth 0 of a 3-level header: it spans 3 rows; `name` at depth 1 spans 2.
    assert.match(html, /role="columnheader" aria-colindex="1" aria-rowspan="3"[^>]*data-column-id="id"[^>]*data-rowspan="3"/);
    assert.match(html, /role="columnheader" aria-colindex="2" aria-rowspan="2"[^>]*data-column-id="name"/);
    assert.match(html, /role="columnheader" aria-colindex="3" (?:aria-labelledby="[^"]+" )?class="salmon-data-grid-header-cell"[^>]*data-column-id="age"/);
    assert.doesNotMatch(tag(html, 'data-column-id="age"'), /aria-rowspan/);
    // Group cells are not focus stops.
    assert.doesNotMatch(tag(html, 'data-group-id="person"'), /tabindex/);
    // Spacers keep the columns aligned under the leaves that span rows.
    assert.ok(count(html, /class="salmon-data-grid-header-spacer"/) >= 3);
  });

  it('group cell width is the sum of its leaf width variables', () => {
    const html = render({ rows: 1, columns: stacked });
    assert.match(tag(html, 'data-group-id="person"'), /width:calc\(var\(--salmon-data-grid-cw-1\) \+ var\(--salmon-data-grid-cw-2\) \+ var\(--salmon-data-grid-cw-3\)\)/);
  });

  it('group headers take headerAlign (default center), headerProps and renderHeader', () => {
    const columns = [
      col({ id: 'g1', header: 'One', headerAlign: 'end', headerProps: { className: 'mine', 'data-x': 'y' } as never, columns: [base[0]!, base[1]!] }),
      col({ id: 'g2', header: 'Two', renderHeader: ({ column }: { column: { header: string } }) => createElement('em', null, `<${column.header}>`), columns: [base[2]!, base[3]!] }),
    ];
    const html = render({ rows: 1, columns });
    const g1 = tag(html, 'data-group-id="g1"');
    assert.match(g1, /class="salmon-data-grid-header-cell salmon-data-grid-header-group mine"/);
    assert.match(g1, /data-x="y"/);
    assert.match(g1, /data-align="end"/);
    assert.match(tag(html, 'data-group-id="g2"'), /data-align="center"/);
    assert.match(html, /<em>&lt;Two&gt;<\/em>/);
  });

  it('a group split by a pin edge renders one group cell per zone', () => {
    const columns = [col({ id: 'g', header: 'G', columns: [col({ ...base[0]!, pinned: 'start' }), base[1]!] }), base[2]!];
    const html = render({ rows: 1, columns });
    assert.equal(count(html, /data-group-id="g"/), 2);
    const left = html.match(/<div class="salmon-data-grid-pin salmon-data-grid-pin--left"[^>]*>(.*?)<div class="salmon-data-grid-center">/)?.[1] ?? '';
    assert.match(left, /data-group-id="g"/);
  });
});

describe('toolbar width', () => {
  it('the toolbar takes the grid width prop, since it renders outside the grid root', () => {
    const html = render({ rows: 2, width: 480, toolbar: ['search'] });
    assert.match(html, /role="toolbar"[^>]*style="width:480px"/);
  });
});
