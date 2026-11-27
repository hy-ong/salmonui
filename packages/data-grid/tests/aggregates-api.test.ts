// Aggregates through the React layer:
// the public `DataGridAggregate.custom(rows, column)` mapping, the
// `<DataGridAggregateRow>` / `<DataGridAggregate>` children form, and a non-lazy
// remote result's whole-result `aggregates` reaching `api.getAggregates()`
// and the rendered footer (rendered with react-dom/server inside the grid
// contexts of a mounted instance, so it reflects the live data result).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { CompiledColumn, DataSourceRequest, DataSource } from '@salmonui/data-grid/engine';
import { DataGridAggregate, DataGridAggregateRow, type DataGridColumn, type DataGridProps } from '@salmonui/data-grid';
import { DataGridInstance } from '../dist/data-grid/instance.js';
import { DataGridInstanceContext, DataGridRenderContext } from '../dist/data-grid/context.js';
import { DataGridFooter } from '../dist/data-grid/aggregate-rows.js';
import { people, personColumns, render, type Person, newInstance } from './fixtures.ts';

let seq = 0;
function make(props: Partial<DataGridProps<Person>>): { instance: DataGridInstance<Person>; unmount: () => void } {
  const instance = newInstance<Person>({ data: people(10), columns: personColumns as DataGridColumn<Person>[], 'aria-label': 'People', ...props } as never, `:ag${seq++}:`);
  return { instance, unmount: instance.mount() };
}

const ids = (rows: readonly Person[]): string => rows.map((r) => r.id).join(',');

describe('custom aggregates through <DataGrid>', () => {
  it('DataGridAggregate.custom receives the grid rows, each group\'s rows and the compiled column; the value reaches the footer, group footers and getAggregates()', () => {
    const calls: { rows: string; column: string; header: unknown }[] = [];
    const custom = (rows: readonly Person[], column: CompiledColumn<Person>): unknown => {
      calls.push({ rows: ids(rows), column: column.columnId, header: column.def.header });
      return `ages ${rows.map((r) => r.age).join('+')}`;
    };
    const aggregates = [{ columns: [{ field: 'age', type: 'custom' as const, custom, renderFooter: () => null, renderGroupFooter: () => null }] }];
    const { instance, unmount } = make({ data: people(4), aggregates, grouping: { groupBy: ['active'] } });
    // The grid rows arrive in view order (grouped: false group first).
    assert.deepEqual(instance.api.getAggregates(), { age: { custom: 'ages 21+23+20+22' } });
    assert.deepEqual(instance.api.getAggregates('__g:[["active",false]]'), { age: { custom: 'ages 21+23' } });
    assert.deepEqual(instance.api.getAggregates('__g:[["active",true]]'), { age: { custom: 'ages 20+22' } });
    assert.ok(calls.every((c) => c.column === 'age' && c.header === 'Age'), 'the column argument is the compiled column of the field');
    assert.deepEqual(new Set(calls.map((c) => c.rows)), new Set(['p1,p3,p0,p2', 'p1,p3', 'p0,p2']), 'grid rows and each group\'s rows');
    unmount();

    // SSR: the default template shows the custom value in the footer and the group footers.
    const html = render({ rows: 4, grouping: { groupBy: ['active'] }, aggregates: [{ columns: [{ field: 'age', type: 'custom', custom: (rows) => `n=${rows.length}`, renderGroupFooter: (ctx) => createElement('i', { className: 'tpl-g' }, String(ctx.values['custom'])), renderFooter: (ctx) => createElement('b', { className: 'tpl-f' }, String(ctx.values['custom'])) }] }] });
    assert.match(html, /<b class="tpl-f">n=4<\/b>/);
    assert.equal([...html.matchAll(/<i class="tpl-g">n=2<\/i>/g)].length, 2);
  });
});

describe('<DataGridAggregateRow> / <DataGridAggregate> children', () => {
  it('children compile to the same aggregates as the array form: equal SSR markup and equal getAggregates()', () => {
    const tpl = (ctx: { values: Readonly<Record<string, unknown>>; count: number }) => createElement('b', { className: 'tpl-footer' }, `max ${String(ctx.values['max'])} of ${ctx.count}`);
    const array = [
      { columns: [{ field: 'age', type: ['sum', 'average'] as const, format: 'N1' }, { field: 'active', type: 'trueCount' as const }] },
      { columns: [{ field: 'age', type: 'max' as const, renderFooter: tpl, renderGroupFooter: tpl }] },
    ];
    const children = [
      createElement(DataGridAggregateRow, { key: 'r0' }, createElement(DataGridAggregate<Person>, { field: 'age', type: ['sum', 'average'], format: 'N1' }), createElement(DataGridAggregate<Person>, { field: 'active', type: 'trueCount' })),
      createElement(DataGridAggregateRow, { key: 'r1' }, createElement(DataGridAggregate<Person>, { field: 'age', type: 'max', renderFooter: tpl, renderGroupFooter: tpl })),
    ];
    const base = { rows: 6, grouping: { groupBy: ['active'], showGroupedColumns: true } } as const;
    const fromArray = render({ ...base, aggregates: array as never });
    const fromChildren = render({ ...base, children });
    assert.equal(fromChildren, fromArray, 'identical first-paint markup');
    assert.match(fromChildren, /role="rowgroup" class="salmon-data-grid-footer"/);
    assert.equal([...fromChildren.matchAll(/class="salmon-data-grid-row salmon-data-grid-footer-row"/g)].length, 2, 'two stacked footer rows');
    assert.match(fromChildren.replaceAll('<!-- -->', ''), /<b class="tpl-footer">max 25 of 6<\/b>/);
    const footer = fromChildren.slice(fromChildren.indexOf('class="salmon-data-grid-footer"')).replaceAll('<!-- -->', '');
    assert.match(footer, /data-type="sum">Sum: 135\.0<\/span><span class="salmon-data-grid-aggregate__value" data-type="average"> Average: 22\.5</);
    assert.match(footer, /data-column-id="active"><span><span class="salmon-data-grid-aggregate__value" data-type="trueCount">True: 3</);

    const a = make({ data: people(6), aggregates: array as never });
    const c = make({ data: people(6), children } as never);
    assert.deepEqual(c.instance.api.getAggregates(), a.instance.api.getAggregates());
    assert.deepEqual(c.instance.api.getAggregates(), { age: { sum: 135, average: 22.5, max: 25 }, active: { trueCount: 3 } });
    a.unmount();
    c.unmount();
  });
});

// ---------------------------------------------------------------------------
// remote footer totals
// ---------------------------------------------------------------------------

/** Non-lazy remote source: answers one page and server totals over every matching row. */
function remoteSource(all: readonly Person[], requests: DataSourceRequest[]): DataSource<Person> {
  return {
    mode: 'remote',
    read(request) {
      requests.push(request);
      const page = request.query.paging;
      const start = page ? (page.page - 1) * page.pageSize : 0;
      const rows = page ? all.slice(start, start + page.pageSize) : all;
      return {
        version: request.version,
        rows,
        totalRowCount: all.length,
        performed: ['search', 'filter', 'sort', 'aggregate', 'page'],
        // Deliberately not the page's values: the footer must show the server's.
        aggregates: { age: { sum: 9999, max: 69 }, active: { trueCount: 25 } },
      };
    },
  };
}

/**
 * The footer of a mounted instance as the client renders it after hydration:
 * react-dom/server reads `getServerSnapshot`, so the engine's server snapshot
 * is pointed at the live snapshot for this render.
 */
function renderFooter(instance: DataGridInstance<Person>): string {
  const engine = instance.engine;
  // The engine is frozen: a derived object overrides the one read.
  const live = Object.create(engine, { getServerSnapshot: { value: () => engine.getSnapshot() } }) as typeof engine;
  const view = new Proxy(instance, { get: (target, key) => (key === 'engine' ? live : Reflect.get(target, key)) });
  const renderOptions = {
    text: instance.text,
    headerRows: 1,
    resizable: false,
    reorderable: false,
    filterBar: false,
    frozenTop: 0,
    frozenBottom: 0,
    cellRangeBorder: false,
    headerGroupToggle: false,
    sortIndicators: false,
    searchHighlight: null,
  };
  const element: ReactElement = createElement(
    DataGridInstanceContext,
    { value: view as never },
    createElement(DataGridRenderContext, { value: renderOptions as never }, createElement(DataGridFooter)),
  );
  return renderToString(element).replaceAll('<!-- -->', '');
}

async function idle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('remote footer aggregates', () => {
  it('a non-lazy remote result with aggregates and performed aggregate drives getAggregates() and the React footer, count = totalRowCount', async () => {
    const all = people(50);
    const requests: DataSourceRequest[] = [];
    const ctxCounts: number[] = [];
    const { instance, unmount } = make({
      data: remoteSource(all, requests),
      paging: { pageSize: 10 },
      aggregates: [
        { columns: [{ field: 'age', type: ['sum', 'max'] }] },
        { columns: [{ field: 'active', type: 'trueCount', renderFooter: (ctx) => { ctxCounts.push(ctx.count); return createElement('b', { className: 'tpl-count' }, `${String(ctx.values['trueCount'])} of ${ctx.count}`); } }] },
      ],
    });
    await idle();
    assert.ok(requests.length >= 1);
    assert.deepEqual(
      requests[0]?.query.aggregates.map((a) => [a.columnId, a.type]),
      [['age', 'sum'], ['age', 'max'], ['active', 'trueCount']],
      'the aggregates are part of the remote query',
    );
    assert.equal(instance.engine.getSnapshot().rows.count, 10, 'one page loaded');
    assert.deepEqual(instance.api.getAggregates(), { age: { sum: 9999, max: 69 }, active: { trueCount: 25 } });
    const html = renderFooter(instance);
    assert.match(html, /role="rowgroup" class="salmon-data-grid-footer"/);
    assert.match(html, /Sum: 9999/);
    assert.match(html, /Max: 69/);
    assert.match(html, /<b class="tpl-count">25 of 50<\/b>/, 'the footer count is every matching row (totalRowCount), not the page');
    assert.equal(ctxCounts.at(-1), 50);
    unmount();
  });
});
