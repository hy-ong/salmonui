import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Chart, type ChartPointContext, type ChartProps, type ChartSeriesOptions } from '@salmonui/charts/chart';
import {
  PivotAxisBar,
  PIVOT_DEFAULT_LOCALE_TEXT,
  PivotController,
  PivotFieldList,
  PivotTable,
  PivotToolbar,
  drillChartPoint,
  pivotChartImage,
  pivotChartProps,
  pivotChartSeriesOptions,
  pivotToSeries,
  type PivotChartSeriesType,
  type PivotLocaleText,
  type PivotModelInput,
} from '@salmonui/pivot-table';
import { axisItems, moveField, VALUES_FIELD } from '../dist/pivot-table/model-ops.js';
import { buildView, safeId, matchesRule, conditionalStyle } from '../dist/pivot-table/grid-model.js';
import { exportPivotTable, pivotCsv } from '../dist/pivot-table/export-impl.js';
import { createText } from '../dist/pivot-table/locale.js';
import { cellOf } from '../dist/pivot-table/columns.js';
import { pivotAccumulationProps, pivotChartFamily } from '@salmonui/pivot-table/chart';
import { createPivotEngine, type PivotResult } from '@salmonui/pivot-table/engine';
import { createJsonPivotSource } from '@salmonui/data/json';
import { createPivotQueryHandler } from '@salmonui/data/server';

// Pivot Table React parts: controller commands and events, model edits,
// server rendering.

interface Sale {
  region: string;
  country: string;
  year: number;
  amount: number;
  units: number;
}

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'] };
function sales(n = 40): Sale[] {
  const out: Sale[] = [];
  for (let i = 0; i < n; i++) {
    const region = i % 2 === 0 ? 'Asia' : 'Europe';
    out.push({ region, country: (COUNTRIES[region] as string[])[Math.floor(i / 2) % 2] as string, year: 2024 + (i % 3), amount: i * 10, units: i });
  }
  return out;
}

const MODEL: PivotModelInput = { rows: [{ field: 'region' }, { field: 'country' }], columns: [{ field: 'year' }], values: [{ field: 'amount', aggregate: 'sum' }] };

function controller(extra: Record<string, unknown> = {}) {
  const log: string[] = [];
  const handlers: Record<string, (e: { type: string; action?: string; preventDefault(): void }) => void> = {};
  for (const name of ['onBeforePivotModelChange', 'onPivotModelChange', 'onBeforeExpandedChange', 'onExpandedChange', 'onBeforeFilterChange', 'onFilterChange', 'onBeforeFieldMove', 'onFieldMove', 'onComputeStart', 'onComputeEnd', 'onBeforeMemberEditorOpen', 'onBeforeSortChange', 'onSortChange', 'onBeforeSelectionChange', 'onSelectionChange', 'onBeforeCalculatedFieldChange', 'onCalculatedFieldChange', 'onBeforeDrillThrough', 'onDrillThrough']) {
    handlers[name] = (e) => {
      log.push(e.action ? `${e.type}:${e.action}` : e.type);
    };
  }
  const pivot = new PivotController<Sale>({ data: sales(), defaultPivotModel: MODEL, ...handlers, ...extra });
  return { pivot, log };
}

describe('PivotController', () => {
  it('onComputeStart / onComputeEnd for the initial compute (after mount) and for updates', () => {
    const { pivot, log } = controller();
    assert.equal(pivot.status, 'ready');
    assert.ok(pivot.result);
    const unmount = pivot.mount();
    assert.deepEqual(log.slice(0, 2), ['computeStart', 'computeEnd']);
    log.length = 0;
    pivot.setSort('region', 'desc');
    assert.ok(log.includes('computeStart') && log.includes('computeEnd'));
    unmount();
  });

  it('onBeforePivotModelChange names the action and cancels it', () => {
    const actions: string[] = [];
    const { pivot } = controller({
      onBeforePivotModelChange: (e: { action: string; preventDefault(): void }) => {
        actions.push(e.action);
        if (e.action === 'aggregate') e.preventDefault();
      },
    });
    assert.equal(pivot.setAggregate(0, 'count'), false);
    assert.equal(pivot.model.values[0]?.aggregate, 'sum');
    pivot.setSort('country', 'desc');
    pivot.setTotals({ grand: 'none' });
    assert.deepEqual(actions, ['aggregate', 'sort', 'totals']);
    assert.equal(pivot.model.totals.grand, 'none');
  });

  it('expand and collapse a member through the engine with cancellable events', () => {
    const { pivot, log } = controller();
    const rows = (): number => pivot.result?.rowCount ?? 0;
    const before = rows();
    const asia = pivot.result?.memberAt('rows', 0);
    assert.ok(asia?.expandable);
    assert.equal(pivot.toggle(asia), true);
    assert.equal(rows(), before + 2);
    assert.deepEqual(pivot.model.expanded, [['rows', 'Asia']]);
    assert.ok(log.includes('beforeExpandedChange:expand') && log.includes('expandedChange:expand'));
    assert.equal(pivot.collapse(['rows', 'Asia']), true);
    assert.equal(rows(), before);
    const vetoed = new PivotController<Sale>({ data: sales(), defaultPivotModel: MODEL, onBeforeExpandedChange: (e) => e.preventDefault() });
    assert.equal(vetoed.expand(['rows', 'Asia']), false);
    assert.equal(vetoed.result?.rowCount, before);
    pivot.expandAll();
    assert.equal(pivot.model.expanded, 'all');
    assert.equal(rows(), before + 4);
    pivot.collapseAll();
    assert.equal(rows(), before);
  });

  it('onBeforeFilterChange / onFilterChange and onBeforeMemberEditorOpen', () => {
    const { pivot, log } = controller();
    assert.equal(pivot.setFilter('region', { include: ['Asia'] }), true);
    assert.ok(log.includes('beforeFilterChange') && log.includes('filterChange'));
    assert.equal(pivot.result?.rowCount, 2);
    const vetoed = new PivotController<Sale>({ data: sales(), defaultPivotModel: MODEL, onBeforeFilterChange: (e) => e.preventDefault(), onBeforeMemberEditorOpen: (e) => e.preventDefault() });
    assert.equal(vetoed.setFilter('region', { include: ['Asia'] }), false);
    assert.equal(vetoed.openDialog({ kind: 'memberEditor', field: 'region' }), false);
    assert.equal(vetoed.getSnapshot().dialog, null);
    assert.equal(pivot.openDialog({ kind: 'memberEditor', field: 'region' }), true);
    assert.ok(log.includes('beforeMemberEditorOpen'));
  });

  it('onBeforeFieldMove / onFieldMove carry field, from, to and index; the store replaces update()', () => {
    const moves: unknown[] = [];
    const { pivot } = controller({ onFieldMove: (e: { field: string; from: string; to: string; index: number }) => moves.push([e.field, e.from, e.to, e.index]) });
    pivot.moveField('country', 'columns', 0);
    assert.deepEqual(moves, [['country', 'rows', 'columns', 0]]);
    assert.deepEqual(pivot.model.columns.map((f) => f.field), ['country', 'year']);
    pivot.moveField('country', null);
    assert.deepEqual(pivot.model.columns.map((f) => f.field), ['year']);
    const vetoed = new PivotController<Sale>({ data: sales(), defaultPivotModel: MODEL, onBeforeFieldMove: (e) => e.preventDefault() });
    assert.equal(vetoed.moveField('country', 'filters'), false);
  });

  it('Alt+Arrow reorder (stepField) moves inside the axis', () => {
    const { pivot } = controller();
    assert.equal(pivot.stepField('country', 'rows', -1), true);
    assert.deepEqual(pivot.model.rows.map((f) => f.field), ['country', 'region']);
    assert.equal(pivot.stepField('country', 'rows', -1), false);
  });

  it('defer update edits a draft that Apply commits and Cancel drops', () => {
    const { pivot } = controller();
    pivot.beginDraft();
    pivot.moveField('country', 'columns', -1, { draft: true });
    assert.deepEqual(pivot.model.columns.map((f) => f.field), ['year']);
    assert.deepEqual(pivot.getSnapshot().draft?.columns.map((f) => f.field), ['year', 'country']);
    assert.equal(pivot.applyDraft(), true);
    assert.deepEqual(pivot.model.columns.map((f) => f.field), ['year', 'country']);
    pivot.beginDraft();
    pivot.moveField('region', null, -1, { draft: true });
    pivot.cancelDraft();
    assert.equal(pivot.getSnapshot().draft, null);
    assert.deepEqual(pivot.model.rows.map((f) => f.field), ['region']);
  });

  it('setSelection stores rowKey|columnKey and is cancellable', () => {
    const { pivot, log } = controller();
    assert.equal(pivot.setSelection([{ rowKey: '["Asia"]', columnKey: '[2024]|amount' }]), true);
    assert.deepEqual(pivot.getSnapshot().selection, ['["Asia"]|[2024]|amount']);
    assert.ok(log.includes('beforeSelectionChange') && log.includes('selectionChange'));
  });

  it('reactive pivotModel prop re-applies only on a structural change', () => {
    const { pivot, log } = controller();
    pivot.applyModelProp({ ...MODEL });
    assert.ok(!log.includes('beforePivotModelChange:prop'));
    pivot.applyModelProp({ ...MODEL, columns: [] });
    assert.ok(log.includes('beforePivotModelChange:prop'));
    assert.equal(pivot.model.columns.length, 0);
  });

  it('drill through events, raw rows, and write-through edits re-aggregate', () => {
    const { pivot, log } = controller();
    let rows: readonly Sale[] = [];
    pivot.handlers = { ...pivot.handlers, onDrillThrough: (e) => (rows = e.rows()) };
    assert.equal(pivot.drillThrough(0, 0), true);
    assert.ok(log.includes('beforeDrillThrough'));
    assert.deepEqual(pivot.getSnapshot().dialog?.kind, 'drillThrough');
    assert.ok(rows.length > 0 && rows.every((r) => r.region === 'Asia' && r.year === 2024));
    const indexes = pivot.getCellRowIndexes(0, 0);
    const before = pivot.result?.valueAt(0, 0) ?? 0;
    const first = indexes[0] as number;
    const row = pivot.getData()[first] as Sale;
    let changed = 0;
    pivot.handlers = { ...pivot.handlers, onDataChange: (e) => (changed = e.changes.length) };
    pivot.updateRows([{ index: first, row: { ...row, amount: row.amount + 1000 } }]);
    assert.equal(changed, 1);
    assert.equal(pivot.result?.valueAt(0, 0), before + 1000);
  });

  it('calculated fields join the values and fire their events', () => {
    const { pivot, log } = controller();
    assert.equal(pivot.setCalculatedField('avgPrice', { name: 'avgPrice', formula: '"Sum(amount)" / "Count(amount)"' }), true);
    assert.ok(pivot.model.values.some((v) => v.field === 'avgPrice'));
    assert.ok(log.includes('beforeCalculatedFieldChange') && log.includes('calculatedFieldChange'));
    pivot.setCalculatedField('avgPrice', null);
    assert.ok(!pivot.model.values.some((v) => v.field === 'avgPrice'));
  });

  it('getState / restoreState round trip, schema-versioned', () => {
    const { pivot } = controller();
    pivot.moveField('country', 'columns');
    const saved = JSON.stringify(pivot.getState({ layout: 'tabular' }));
    const { pivot: other } = controller();
    assert.equal(other.restoreState(saved), true);
    assert.deepEqual(other.model.columns.map((f) => f.field), ['year', 'country']);
    const errors: string[] = [];
    other.handlers = { ...other.handlers, onError: (e) => errors.push(e.action) };
    assert.equal(other.restoreState({ version: 2 } as never), false);
    assert.deepEqual(errors, ['restore']);
  });
});

describe('pivot model edits', () => {
  it('row stubs of an older view keep reading their own result after the values and columns change', () => {
    const { pivot } = controller();
    pivot.setModel((m) => ({ ...m, values: [...m.values, { field: 'units', aggregate: 'sum' }] }));
    const { view, rows } = buildView(pivot.result!);
    const read = () => rows.map((stub) => view.columnIds.map((id) => [cellOf(stub, id)?.formattedValue, view.result.valueAt(stub.i, view.columnIndex.get(id)!)]));
    const before = read();
    // Two value fields to one while the columns change: the grid may still render the old stubs.
    pivot.setModel((m) => ({ ...m, columns: [{ field: 'country' }], values: [{ field: 'amount', aggregate: 'sum' }] }));
    assert.notEqual(pivot.result, view.result);
    assert.deepEqual(read(), before);
    const next = buildView(pivot.result!);
    assert.equal(next.view.columnIds.length, pivot.result!.columnCount);
    assert.ok(next.rows.every((stub) => next.view.columnIds.every((id) => cellOf(stub, id) !== null)));
  });

  it('the Values item moves between rows and columns', () => {
    const { pivot } = controller();
    pivot.setModel((m) => ({ ...m, values: [...m.values, { field: 'units', aggregate: 'sum' }] }));
    assert.deepEqual(axisItems(pivot.model, 'columns'), ['year', VALUES_FIELD]);
    pivot.moveField(VALUES_FIELD, 'rows', 0);
    assert.deepEqual(pivot.model.valuesPlacement, { axis: 'rows', index: 0 });
    assert.deepEqual(axisItems(pivot.model, 'rows'), [VALUES_FIELD, 'region', 'country']);
  });

  it('moving a field to values picks sum for numbers and count otherwise', () => {
    const { pivot } = controller();
    const next = moveField(pivot.model, 'units', 'values', -1, pivot.getSnapshot().fields);
    assert.equal(next.values?.at(-1)?.aggregate, 'sum');
    const label = moveField(pivot.model, 'country', 'values', -1, pivot.getSnapshot().fields);
    assert.equal(label.values?.at(-1)?.aggregate, 'count');
  });

  it('safe column ids are injective and attribute-safe', () => {
    assert.equal(safeId('[2024]|amount'), 'c_5b_2024_5d__7c_amount');
    assert.notEqual(safeId('a_'), safeId('a%'));
    assert.match(safeId('"x y"'), /^[A-Za-z0-9_-]+$/);
  });

  it('conditional rules match values and map tones to classes', () => {
    assert.equal(matchesRule({ operator: 'between', value: 10, value2: 5 }, 7), true);
    assert.equal(matchesRule({ operator: 'greaterThan', value: 10 }, null), false);
    const { pivot } = controller();
    pivot.setConditionalFormats([{ operator: 'greaterThan', value: 0, tone: 'success', style: { fontWeight: '700' } }]);
    const result = pivot.result!;
    const cell = result.cellAt(0, 0);
    const style = conditionalStyle(result.model, cell);
    assert.equal(style.className, 'salmon-pivot-table-tone-success');
    assert.deepEqual(style.style, { fontWeight: '700' });
  });
});

describe('PivotTable rendering (SSR)', () => {
  const render = (el: Parameters<typeof renderToString>[0]): string => renderToString(el);

  it('compact layout renders row stubs through the Data Grid with drill toggles and virtualized windows', () => {
    const html = render(createElement(PivotTable<Sale>, { data: sales(), pivotModel: MODEL, height: 300 }));
    assert.match(html, /role="grid"/);
    assert.match(html, /data-layout="compact"/);
    assert.match(html, /aria-expanded="false" aria-label="Expand Asia"/);
    assert.match(html, /Grand total/);
    // Value cells come from result.cellAt (formatted).
    assert.match(html, /data-column-id="c_5b_2024_5d__7c_amount"[^>]*>[^<]*<?[^>]*1,260/);
    const view = buildView(new PivotController<Sale>({ data: sales(), defaultPivotModel: MODEL }).result!);
    assert.equal(view.rows.length, 3);
    assert.equal(view.view.columnIds.length, 4);
  });

  it('tabular layout has one pinned column per row field and repeats ancestor labels for assistive tech', () => {
    const html = render(createElement(PivotTable<Sale>, { data: sales(), pivotModel: { ...MODEL, expanded: 'all' }, layout: 'tabular', height: 400 }));
    assert.match(html, /data-column-id="pivot-row-0"/);
    assert.match(html, /data-column-id="pivot-row-1"/);
    assert.match(html, /data-repeat=""/);
  });

  it('renderCell, renderHeader and getCellClassName', () => {
    const html = render(
      createElement(PivotTable<Sale>, {
        data: sales(),
        pivotModel: MODEL,
        renderCell: (ctx) => createElement('b', { 'data-test': 'cell' }, ctx.cell.formattedValue),
        renderHeader: (ctx) => createElement('i', { 'data-test': 'header' }, ctx.header.label),
        getCellClassName: (ctx) => (ctx.cell.kind === 'grandTotal' ? 'is-grand' : undefined),
      }),
    );
    assert.match(html, /<b data-test="cell">1,260<\/b>/);
    assert.match(html, /<i data-test="header">Asia<\/i>/);
    assert.match(html, /is-grand/);
  });

  it('className and style pass through to the root', () => {
    const html = render(createElement(PivotTable<Sale>, { data: sales(), pivotModel: MODEL, className: 'mine', style: { width: 640 } }));
    assert.match(html, /class="salmon-pivot-table mine"[^>]*style="width:640px"/);
  });

  it('emptyCellText fills value cells without rows in the server markup', () => {
    const data: Sale[] = [
      { region: 'Asia', country: 'Japan', year: 2024, amount: 5, units: 1 },
      { region: 'Europe', country: 'France', year: 2025, amount: 7, units: 1 },
    ];
    const html = render(createElement(PivotTable<Sale>, { data, pivotModel: { rows: [{ field: 'region' }], columns: [{ field: 'year' }], values: [{ field: 'amount', aggregate: 'sum' }] }, emptyCellText: 'n/a' }));
    // Asia has no 2025 row and Europe no 2024 row.
    assert.equal(html.match(/>n\/a</g)?.length, 2);
  });

  it('large inputs render a loading state with aria-busy and renderLoading on the server', () => {
    const html = render(createElement(PivotTable<Sale>, { data: sales(), pivotModel: MODEL, deferComputeAbove: 0, renderLoading: (ctx) => createElement('span', { 'data-test': 'loading' }, ctx.status) }));
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /<span data-test="loading">computing<\/span>/);
    assert.match(html, /role="status"/);
  });

  it('row paging uses the Data Grid pager, column paging slices the column tree', () => {
    const html = render(createElement(PivotTable<Sale>, { data: sales(), pivotModel: { ...MODEL, expanded: 'all' }, paging: { rows: 2, columns: 2 } }));
    assert.match(html, /salmon-pivot-table-column-pager/);
    assert.match(html, /Column page 1 of 2/);
    assert.doesNotMatch(html, /data-column-id="c_5b_2026_5d__7c_amount"/);
  });

  it('paging={true} pages 10 rows and 5 column members (the defaults)', () => {
    const model: PivotModelInput = { rows: [{ field: 'region' }, { field: 'country' }, { field: 'year' }], columns: [{ field: 'region' }, { field: 'country' }], values: [{ field: 'amount', aggregate: 'sum' }], expanded: 'all' };
    const paged = render(createElement(PivotTable<Sale>, { data: sales(), pivotModel: model, paging: true }));
    // 19 rows: two row pages through the Data Grid pager; 7 column leaves: two column pages.
    assert.match(paged, /salmon-data-grid-pager/);
    assert.match(paged, /aria-label="Page 2"/);
    assert.doesNotMatch(paged, /aria-label="Page 3"/);
    assert.match(paged, /Column page 1 of 2/);
    assert.equal(render(createElement(PivotTable<Sale>, { data: sales(), pivotModel: model, paging: {} })), paged);
    const unpaged = render(createElement(PivotTable<Sale>, { data: sales(), pivotModel: model }));
    assert.doesNotMatch(unpaged, /salmon-data-grid-pager|salmon-pivot-table-column-pager/);
  });

  it('field list and axis bar render static markup from the shared store', () => {
    const pivot = new PivotController<Sale>({ data: sales(), defaultPivotModel: MODEL });
    const list = render(createElement(PivotFieldList<Sale>, { pivot }));
    assert.match(list, /role="listbox" aria-label="Fields"/);
    assert.match(list, /role="listbox" aria-label="Rows"/);
    assert.match(list, /aria-selected="true"[^>]*data-pivot-field="region"/);
    const bar = render(createElement(PivotAxisBar<Sale>, { pivot, showFieldsPanel: true }));
    assert.match(bar, /role="toolbar" aria-label="Columns"/);
    assert.match(bar, /data-pivot-field="year"/);
    assert.match(bar, /data-pivot-field="units"/);
    const toolbar = render(createElement(PivotToolbar<Sale>, { pivot }));
    assert.match(toolbar, /role="toolbar" aria-label="Pivot table toolbar"/);
  });
});

describe('Pivot Chart adapters', () => {
  it('pivotToSeries returns plain data and series per column member', () => {
    const { pivot } = controller();
    const chart = pivotToSeries(pivot.result, { measure: 'amount', type: 'line' });
    assert.deepEqual(chart.categories, ['Asia', 'Europe']);
    assert.deepEqual(chart.series.map((s) => s.name), ['2024', '2025', '2026']);
    assert.equal(chart.series[0]?.type, 'line');
    assert.equal(chart.data[0]?.category, 'Asia');
    assert.equal(chart.data[0]?.s0, pivot.result?.valueAt(0, 0));
    // Plain data: the app edits the series before passing them to the chart.
    const edited = chart.series.map((s) => ({ ...s, name: s.name.toUpperCase() }));
    assert.equal(edited[0]?.name, '2024');
    const byRows = pivotToSeries(pivot.result, { seriesBy: 'rows' });
    assert.deepEqual(byRows.series.map((s) => s.name), ['Asia', 'Europe']);
    assert.equal(byRows.pointAt('s1', 2)?.rowKey, '["Europe"]');
  });

  it('drillChartPoint expands the category member, then opens drill through', () => {
    const { pivot } = controller();
    const chart = pivotToSeries(pivot.result);
    assert.equal(drillChartPoint(pivot, chart, 's0', 0), true);
    assert.deepEqual(pivot.model.expanded, [['rows', 'Asia']]);
    const after = pivotToSeries(pivot.result);
    assert.deepEqual(after.categories, ['Asia / India', 'Asia / Japan', 'Europe']);
    assert.equal(drillChartPoint(pivot, after, 's0', 0), true);
    assert.equal(pivot.getSnapshot().dialog?.kind, 'drillThrough');
    // Drill up: the category's parent collapses.
    assert.equal(after.pointAt('s0', 2)?.parentPath, null);
    assert.deepEqual(after.pointAt('s0', 0)?.parentPath, ['rows', 'Asia']);
    assert.equal(drillChartPoint(pivot, after, 's0', 2, 'collapse'), false);
    assert.equal(drillChartPoint(pivot, after, 's0', 0, 'collapse'), true);
    assert.deepEqual(pivot.model.expanded, []);
  });

  it('every pivot chart type maps to Chart series options', () => {
    const { pivot } = controller();
    const expect: [PivotChartSeriesType, Partial<ChartSeriesOptions>][] = [
      ['line', { type: 'line' }],
      ['spline', { type: 'line', curve: 'natural' }],
      ['stepLine', { type: 'line', curve: 'step' }],
      ['stackingColumn', { type: 'column', stack: true }],
      ['stackingColumn100', { type: 'column', stack: 'percent' }],
      ['stackingBar100', { type: 'bar', stack: 'percent' }],
      ['stackingArea', { type: 'area', stack: true }],
      ['pareto', { type: 'pareto' }],
      ['polar', { type: 'line', closed: true }],
      ['pie', { type: 'column' }],
    ];
    for (const [type, shape] of expect) {
      assert.deepEqual(pivotChartSeriesOptions(type), shape, type);
      const [first] = pivotToSeries(pivot.result, { type }).series;
      assert.ok(first);
      const options: ChartSeriesOptions = first;
      for (const [k, v] of Object.entries(shape)) assert.equal((options as Record<string, unknown>)[k], v, `${type}.${k}`);
      assert.equal(first.pivotType, type);
    }
    const bubble = pivotToSeries(pivot.result, { type: 'bubble' }).series[0];
    assert.equal(bubble?.sizeField, bubble?.yField);
  });

  it('each pivot chart type routes to its real chart family', () => {
    const { pivot } = controller();
    for (const type of ['line', 'column', 'area', 'bar', 'spline', 'stepLine', 'stackingColumn', 'scatter', 'bubble', 'pareto'] as const) assert.equal(pivotChartFamily(type), 'cartesian', type);
    for (const type of ['polar', 'radar'] as const) {
      assert.equal(pivotChartFamily(type), 'polar');
      assert.equal(pivotChartProps(pivot, { type }).coordinate, type);
    }
    assert.equal(pivotChartProps(pivot, { type: 'line' }).coordinate, undefined);
    assert.equal(pivotChartFamily('pie'), 'pie');
    assert.equal(pivotChartFamily('doughnut'), 'pie');
    assert.equal(pivotChartFamily('funnel'), 'funnel');
    assert.equal(pivotChartFamily('pyramid'), 'funnel');
  });

  it('pivotAccumulationProps maps series to rings, shapes and drilling clicks', () => {
    const { pivot } = controller();
    const data = pivotToSeries(pivot.result, { type: 'pie' });
    const pie = pivotAccumulationProps(pivot, data, 'pie');
    assert.deepEqual(pie.series?.map((s) => [s.name, s.valueField, s.labelField]), [['2024', 's0', 'category'], ['2025', 's1', 'category'], ['2026', 's2', 'category']]);
    assert.equal(pie.innerRadius, undefined);
    assert.equal(pivotAccumulationProps(pivot, data, 'doughnut').innerRadius, '50%');
    const one = pivotAccumulationProps(pivot, data, 'pie', { seriesId: 's1' });
    assert.equal(one.series, undefined);
    assert.equal(one.valueField, 's1');
    const funnel = pivotAccumulationProps(pivot, data, 'funnel');
    assert.equal(funnel.shape, 'funnel');
    assert.equal(funnel.valueField, 's0');
    assert.equal(pivotAccumulationProps(pivot, data, 'pyramid').shape, 'pyramid');
    const clicks: (string | null)[] = [];
    const clickable = pivotAccumulationProps(pivot, data, 'pie', { onPointClick: (ctx, point) => clicks.push(`${ctx.seriesId}:${point?.rowKey}`) });
    const point = { series: 1, index: 0, label: 'Asia', value: 5, fraction: 0.5, color: '#000', datum: data.data[0] };
    // The grouped "Others" slice has no pivot cell.
    clickable.onPointClick({ ...point, index: -1 }, {} as never);
    assert.deepEqual(pivot.model.expanded, []);
    clickable.onPointClick(point, {} as never);
    assert.deepEqual(clicks, ['s1:["Asia"]']);
    assert.deepEqual(pivot.model.expanded, [['rows', 'Asia']]);
  });

  it('setValueSort fires cancellable sort events and reorders the rows', () => {
    const events: { type: string; field: unknown; sort: unknown; direction?: string | undefined; source: unknown }[] = [];
    let cancel = false;
    const record = (e: { type: string; field: unknown; sort: unknown; valueSort: { direction: string } | null; source: unknown; preventDefault(): void }) => {
      events.push({ type: e.type, field: e.field, sort: e.sort, direction: e.valueSort?.direction, source: e.source });
      if (cancel && e.type === 'beforeSortChange') e.preventDefault();
    };
    const { pivot } = controller({ onBeforeSortChange: record, onSortChange: record });
    const first = () => pivot.result?.memberAt('rows', 0).label;
    assert.equal(first(), 'Asia');
    const desc = { columnKey: '[2024]', measure: 'amount', direction: 'desc' as const, multipleAxis: true };
    cancel = true;
    assert.equal(pivot.setValueSort(desc, { source: 'pointer' }), false);
    assert.equal(pivot.model.valueSort, null);
    assert.deepEqual(events.map((e) => e.type), ['beforeSortChange']);
    cancel = false;
    events.length = 0;
    assert.equal(pivot.setValueSort(desc, { source: 'pointer' }), true);
    assert.deepEqual(events, [
      { type: 'beforeSortChange', field: null, sort: null, direction: 'desc', source: 'pointer' },
      { type: 'sortChange', field: null, sort: null, direction: 'desc', source: 'pointer' },
    ]);
    const column = (() => {
      const r = pivot.result!;
      for (let c = 0; c < r.columnCount; c++) if (r.memberAt('columns', c).key.startsWith('[2024]')) return c;
      throw new Error('no 2024 column');
    })();
    const r = pivot.result!;
    assert.ok((r.valueAt(0, column) as number) >= (r.valueAt(1, column) as number));
    events.length = 0;
    assert.equal(pivot.setValueSort(null), true);
    assert.equal(pivot.model.valueSort, null);
    assert.deepEqual(events.map((e) => [e.type, e.direction]), [['beforeSortChange', undefined], ['sortChange', undefined]]);
  });

  it('valueSorting renders a header sort button only when enabled', () => {
    const off = renderToString(createElement(PivotTable<Sale>, { data: sales(), defaultPivotModel: MODEL }));
    assert.doesNotMatch(off, /salmon-pivot-table-value-sort/);
    const on = renderToString(createElement(PivotTable<Sale>, { data: sales(), defaultPivotModel: MODEL, valueSorting: true }));
    assert.match(on, /salmon-pivot-table-value-sort/);
    assert.match(on, /aria-label="Sort rows by 2024"/);
  });

  it('pivotChartProps feeds Chart and its onPointClick drills the pivot', () => {
    const { pivot } = controller();
    const props = pivotChartProps(pivot, { type: 'column' });
    // The props are `ChartProps` as they are (no cast).
    const chartProps: ChartProps = props;
    assert.deepEqual(chartProps.xAxis, { scale: 'category' });
    assert.equal(props.yAxis.title, 'amount');
    assert.equal(props.series.length, 3);
    assert.deepEqual(props.data[0], { category: 'Asia', s0: pivot.result?.valueAt(0, 0), s1: pivot.result?.valueAt(0, 1), s2: pivot.result?.valueAt(0, 2) });
    // Composition: the app renders `Chart` beside `PivotTable`; both server render.
    const html = renderToString(createElement('div', null, createElement(PivotTable<Sale>, { pivot, 'aria-label': 'Sales' }), createElement(Chart, { ...props, title: 'Sales', width: 480 })));
    assert.match(html, /salmon-pivot-table/);
    assert.match(html, /salmon-chart/);
    assert.match(html, /data-series="s0"/);
    const seen: string[] = [];
    const point = (index: number): ChartPointContext => ({ seriesId: 's0', seriesName: '2024', index, datum: {}, x: '', y: 0, xText: '', yText: '', color: '' });
    const click = (p: ReturnType<typeof pivotChartProps>, index: number) => p.onPointClick(point(index), {} as Parameters<typeof p.onPointClick>[1]);
    const withHook = pivotChartProps(pivot, { onPointClick: (_ctx, cell) => seen.push(cell?.rowKey ?? 'none') });
    click(withHook, 0);
    assert.deepEqual(pivot.model.expanded, [['rows', 'Asia']]);
    assert.deepEqual(seen, ['["Asia"]']);
    // Fresh props on the new result: a leaf point opens drill through for its cell.
    const after = pivotChartProps(pivot);
    assert.equal(after.data[0]?.category, 'Asia / India');
    click(after, 0);
    const dialog = pivot.getSnapshot().dialog;
    assert.equal(dialog?.kind, 'drillThrough');
    assert.equal((dialog as { rowKey?: string }).rowKey, '["Asia","India"]');
    // `drill: false` only reports the click.
    pivot.closeDialog();
    const passive = pivotChartProps(pivot, { drill: false });
    const model = JSON.stringify(pivot.model);
    click(passive, 2);
    assert.equal(JSON.stringify(pivot.model), model);
  });

  it('pivotChartImage reads a chart PNG and its size for the PDF export', async () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 960);
    new DataView(png.buffer).setUint32(20, 600);
    const image = await pivotChartImage({ element: null, toBlob: async () => new Blob([png], { type: 'image/png' }) });
    assert.deepEqual({ type: image.type, width: image.width, height: image.height, length: image.data.length }, { type: 'png', width: 960, height: 600, length: 32 });
  });
});

describe('pivot export', () => {
  it('CSV of the result with column paths and raw numbers', () => {
    const { pivot } = controller();
    const csv = pivotCsv(pivot.result!, createText(undefined));
    const lines = csv.trim().split('\r\n');
    assert.equal(lines[0], 'Row labels,2024,2025,2026,Grand total');
    assert.equal(lines.length, 4);
    assert.match(lines[1] as string, /^Asia,1260,/);
  });

  it('exportToExcel / Csv / Pdf go through exportPivot of the loaded writer with the format, with onBeforeExport / onExport', async () => {
    const { pivot } = controller();
    const events: string[] = [];
    pivot.handlers = { ...pivot.handlers, onBeforeExport: (e) => events.push(`${e.type}:${e.format}`), onExport: (e) => events.push(`${e.type}:${e.format}`) };
    const writers = { pivot: () => import('@salmonui/export/pivot') as never };
    const text = createText(undefined);
    const xlsx = await exportPivotTable(pivot as never, 'xlsx', { download: false, fileName: 'sales' }, writers, text);
    assert.equal(xlsx?.fileName, 'sales.xlsx');
    assert.ok(xlsx?.data instanceof Uint8Array && xlsx.data[0] === 0x50 && xlsx.data[1] === 0x4b); // PK zip
    const pdf = await exportPivotTable(pivot as never, 'pdf', { download: false }, writers, text);
    assert.equal(pdf?.mimeType, 'application/pdf');
    assert.match(new TextDecoder().decode((pdf?.data as Uint8Array).slice(0, 5)), /%PDF-/);
    const csv = await exportPivotTable(pivot as never, 'csv', { download: false }, writers, text);
    assert.match(String(csv?.data), /Asia/);
    assert.deepEqual(events, ['beforeExport:xlsx', 'export:xlsx', 'beforeExport:pdf', 'export:pdf', 'beforeExport:csv', 'export:csv']);
    // Without a writer: CSV falls back to the built-in writer; Excel reports through onError.
    const fallback = await exportPivotTable(pivot as never, 'csv', { download: false }, undefined, text);
    assert.match(String(fallback?.data), /^Row labels,/);
    const errors: string[] = [];
    pivot.handlers = { ...pivot.handlers, onError: (e) => errors.push(e.action), onBeforeExport: undefined };
    assert.equal(await exportPivotTable(pivot as never, 'xlsx', { download: false }, undefined, text), null);
    assert.deepEqual(errors, ['export']);
    pivot.handlers = { ...pivot.handlers, onBeforeExport: (e) => e.preventDefault() };
    assert.equal(await exportPivotTable(pivot as never, 'csv', { download: false }, writers, text), null);
  });
});

describe('localization', () => {
  const ALL_TOOLBAR = ['fieldList', 'totals', 'subtotals', 'grandTotals', 'formatting', 'numberFormat', 'conditionalFormat', 'calculatedField', 'export', 'expandAll', 'collapseAll'] as const;
  // Every catalog key mapped to a marked translation that keeps its `{param}` placeholders.
  const marked = Object.fromEntries(Object.entries(PIVOT_DEFAULT_LOCALE_TEXT).map(([key, value]) => [key, `«${key}${(value.match(/\{\w+\}/g) ?? []).join('')}»`])) as PivotLocaleText;
  const renderAll = (localeText: PivotLocaleText | undefined, locale?: string, paged = true) => {
    const pivot = new PivotController<Sale>({ data: sales(), defaultPivotModel: { ...MODEL, filters: [{ field: 'units' }] }, ...(locale ? { locale } : {}) });
    return [
      renderToString(createElement(PivotTable<Sale>, { pivot, localeText, axisBar: { showFieldsPanel: true }, toolbar: ALL_TOOLBAR, height: 300, ...(paged ? { paging: { rows: 2, columns: 2 } } : {}) })),
      renderToString(createElement(PivotFieldList<Sale>, { pivot, localeText, deferUpdate: true })),
    ].join('\n');
  };

  // What a person or assistive tech gets: text nodes plus aria-label, placeholder and title values.
  const visible = (html: string) => [...html.matchAll(/>([^<]+)</g), ...html.matchAll(/(?:aria-label|placeholder|title)="([^"]*)"/g)].map((m) => m[1]).join('\n');

  it('localeText replaces every catalog string the table, axis bar, toolbar and field list render', () => {
    const english = visible(renderAll(undefined));
    const html = visible(renderAll(marked));
    // Rendered catalog keys, in the default and the translated markup.
    const used = Object.keys(PIVOT_DEFAULT_LOCALE_TEXT).filter((key) => html.includes(`«${key}`));
    assert.ok(used.length >= 15, `only ${used.length} catalog keys rendered: ${used.join(', ')}`);
    for (const key of ['grandTotal', 'expand', 'pivotTable', 'fields', 'rows', 'columns', 'values', 'filters', 'apply', 'cancel', 'searchFields', 'toolbar', 'columnPage']) assert.ok(used.includes(key), `${key} is not rendered`);
    // No default English string of a rendered key survives the translation.
    for (const key of used) {
      const fixed = (PIVOT_DEFAULT_LOCALE_TEXT as Record<string, string>)[key]!.split(/\{\w+\}/).filter((part) => part.trim().length > 3);
      for (const part of fixed) {
        const word = new RegExp(`(?<!\\p{L})${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'gu');
        const count = (s: string) => s.match(word)?.length ?? 0;
        assert.ok(count(html) < count(english) || count(english) === 0, `"${part}" (${key}) still renders untranslated: ${html.split('\n').filter((l) => l.includes(part)).join(' | ')}`);
      }
    }
    // Parameters substitute into translated templates.
    assert.match(html, /«expand(Asia|Europe)»/);
    assert.match(html, /«columnPage12»/);
  });

  it('locale formats the value cells (de-DE grouping) while localeText stays independent', () => {
    const html = renderAll({ grandTotal: 'Gesamtergebnis' }, 'de-DE', false);
    assert.match(html, /1\.260/);
    assert.match(html, /Gesamtergebnis/);
    assert.doesNotMatch(html, />Grand total</);
  });
});

describe('remote engine', () => {
  const until = async (check: () => boolean): Promise<void> => {
    for (let i = 0; i < 200 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(check(), 'condition not reached');
  };

  it('drives createJsonPivotSource().createEngine() through the window adapter: windows, drill, members, drill through', async () => {
    const rows = sales().map((row, id) => ({ id, ...row }));
    const handler = createPivotQueryHandler(rows, { engine: createPivotEngine, key: 'id' });
    const source = createJsonPivotSource({ transport: handler.transport() });
    const local = new PivotController<Sale>({ data: sales(), defaultPivotModel: MODEL });
    const pivot = new PivotController<Sale>({
      defaultPivotModel: MODEL,
      fields: [{ field: 'region', caption: 'Region' }, { field: 'country' }, { field: 'year', type: 'number' }, { field: 'amount', type: 'number' }, { field: 'units', type: 'number' }],
      createEngine: (o) => source.createEngine({ model: o.model as never }),
    });
    // The server renders the loading state; the engine is created after mount.
    assert.equal(pivot.status, 'computing');
    // The definitions' captions show while the first request is pending (no raw field names).
    assert.equal(pivot.getSnapshot().fields.find((f) => f.field === 'region')?.caption, 'Region');
    const unmount = pivot.mount();
    assert.equal(pivot.getSnapshot().fields.find((f) => f.field === 'region')?.caption, 'Region');
    const loaded = () => {
      const r = pivot.result as (PivotResult & { isLoaded(r: number, c: number): boolean }) | null;
      return !!r && r.rowCount > 0 && r.isLoaded(0, 0) && pivot.status === 'ready';
    };
    await until(loaded);
    const same = () => {
      const a = local.result as PivotResult;
      const b = pivot.result as PivotResult;
      assert.equal(b.rowCount, a.rowCount);
      assert.equal(b.columnCount, a.columnCount);
      for (let r = 0; r < a.rowCount; r++) {
        assert.equal(b.memberAt('rows', r).label, a.memberAt('rows', r).label);
        for (let c = 0; c < a.columnCount; c++) assert.equal(b.valueAt(r, c), a.valueAt(r, c));
      }
    };
    same();
    assert.equal(pivot.getSnapshot().fields.find((f) => f.field === 'region')?.caption, 'Region');
    // A drill is one model change on the server.
    pivot.expand(['rows', 'Asia']);
    local.expand(['rows', 'Asia']);
    await until(() => loaded() && (pivot.result as PivotResult).rowCount === (local.result as PivotResult).rowCount);
    same();
    assert.deepEqual(
      (await pivot.getMembersAsync('country')).map((m) => m.label),
      local.getMembers('country').map((m) => m.label),
    );
    const drilled = await pivot.getCellRowsAsync(1, 0);
    assert.equal(drilled.length, local.getCellRows(1, 0).length);
    assert.ok(drilled.length > 0);
    unmount();
  });
});
