---
title: Pivot chart
description: Compose Chart with PivotTable; pivotChartProps and pivotToSeries turn a pivot result into Chart data and series, point clicks drill down, up or through, and the chart exports, prints and joins the table in one PDF.
category: Drill through and chart
order: 65
demos: [pivot-table-chart-data]
---

A pivot chart is a composition in Salmon UI: the pivot produces `Chart` props, and the app
renders [`Chart`](/docs/data-visualization/chart) from
`@salmonui/charts/chart` next to the table. `PivotTable` has no built-in
chart, and `@salmonui/pivot-table` imports only the chart *types*,
so a table-only page loads no chart code.

## PivotChart: every chart type

`PivotChart` from `@salmonui/pivot-table/chart` picks the family that
draws the type and loads it on demand: `Chart` for the cartesian types,
`Chart` with `features={[polar]}` for `polar` and `radar`, `PieChart` for
`pie` and `doughnut` (one ring per series, or only `seriesId`), and
`FunnelChart` for `funnel` and `pyramid` (`seriesId`, default the first
series). Clicks drill the pivot as they do on `Chart`. Import
`chart/styles.css` for the first two groups and `pie-chart/styles.css` for
the others.

```tsx
import { PivotChart } from '@salmonui/pivot-table/chart';
import '@salmonui/charts/pie-chart/styles.css';

<PivotChart pivot={pivot} type="doughnut" title="Amount by region" legend tooltip height={360} />
```

## Table, chart or both

`displayOption: { view: 'Table' | 'Chart' | 'Both' }` is layout code: both
parts read the same `usePivot()` store.

```tsx
import { Chart } from '@salmonui/charts/chart';
import { PivotTable, usePivot, usePivotChartProps } from '@salmonui/pivot-table';
import '@salmonui/charts/chart/styles.css';
import '@salmonui/pivot-table/styles.css';

function Report() {
  const pivot = usePivot({ data, defaultPivotModel: model });
  const chart = usePivotChartProps(pivot, { type: 'column' });
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <Chart {...chart} title="Amount by region" legend tooltip />
      <PivotTable pivot={pivot} drillThrough />
    </div>
  );
}
```

For `view: 'Chart'` render only the chart (keep a `PivotTable` mounted
when the chart should open drill through, which is a table dialog). For
`primary` switching, put both in [`Tabs`](/docs/navigation/tabs):

```tsx
<Tabs defaultValue="chart">
  <TabList aria-label="Report view">
    <Tab value="chart">Chart</Tab>
    <Tab value="table">Table</Tab>
  </TabList>
  <TabPanel value="chart"><Chart {...chart} /></TabPanel>
  <TabPanel value="table"><PivotTable pivot={pivot} /></TabPanel>
</Tabs>
```

## pivotChartProps

`pivotChartProps(pivot, options)` (or the memoized
`usePivotChartProps(pivot, options)`) returns `ChartProps`: `data`,
`series`, `xAxis` (`scale: 'category'`), `yAxis` (titled with the measure
caption) and an `onPointClick` that drills the pivot. Spread them on
`Chart` and add any other `Chart` prop: `legend`, `tooltip`, `crosshair`,
`zoom`, `axes` for multiple axes, `palette`, `selection`.

| Option | Default | Meaning |
| --- | --- | --- |
| `measure` | the first value field | The measure id to chart: the value field's `field`, or `field#aggregate` when one field is summarized twice. |
| `seriesBy` | `'columns'` | `'columns'`: one series per column member, categories are row members. `'rows'`: the transpose. |
| `type` | `'column'` | The pivot chart type (below). |
| `includeTotals` | `false` | Include subtotal and grand total members. |
| `labelSeparator` | `' / '` | Joins the labels of nested members (`Asia / Japan`). |
| `drill` | `'auto'` | What a point click does (below); `false` for nothing. |
| `onPointClick` | - | `(ctx, point, event)`, after the drill; `point` is the pivot cell (`rowKey`, `columnKey`, ...) or null. |
| `xAxis`, `yAxis` | - | `Chart` axis options merged over the defaults. |

### Chart types

| `type` | `Chart` series |
| --- | --- |
| `line`, `column`, `area`, `bar`, `scatter`, `pareto` | The same `type` |
| `bubble` | `bubble`, sized by the value (`sizeField` = `yField`) |
| `spline` | `line` with `curve: 'natural'` |
| `stepLine` | `line` with `curve: 'step'` |
| `stackingColumn`, `stackingBar`, `stackingArea` | `column` / `bar` / `area` with `stack: true` |
| `stackingColumn100`, `stackingBar100`, `stackingArea100` | The same with `stack: 'percent'` |
| `polar`, `radar` | `line` with `closed: true`; `pivotChartProps()` sets `coordinate: 'polar'` or `'radar'` (render `Chart` with `features={[polar]}`) |
| `pie`, `doughnut`, `funnel`, `pyramid` | `column` in `Chart` props; [`PivotChart`](#pivotchart-every-chart-type) draws them with `PieChart` and `FunnelChart` |

`pivotChartSeriesOptions(type)` returns that mapping; every series keeps
the requested type in `pivotType`. A chart type switch is a `type` state in
app code.

## Drill from a point

| `drill` | A point click |
| --- | --- |
| `'auto'` (default) | Expands the category member when it can expand (`pivot.expand(path)`), otherwise opens [drill through](/docs/pivot-table/drill-through) for the point's cell. |
| `'expand'` | Expands only. |
| `'drillThrough'` | Opens drill through only (`pivot.drillThrough(rowIndex, columnIndex)`). |
| `'collapse'` | Drills up: collapses the category's parent member. |

Drill through opens the dialog of a `PivotTable` bound to the same store,
so editing raw records (`editing` on `PivotTable`) works from the chart
too, and the chart follows the re-aggregated result. A "drill up" button
is `drillChartPoint(pivot, chart, seriesId, index, 'collapse')` or
`pivot.collapse(path)`.

## Export and print

`Chart`'s ref exports and prints the chart: `ref.export({ format: 'png' | 'jpeg' | 'svg' | 'csv' })`,
`ref.print()`. For the table and the chart in one PDF, pass the chart
image to the PDF export; each image is a page after the table, scaled to
fit:

```ts
import { pivotChartImage } from '@salmonui/pivot-table';

const chart = await pivotChartImage(chartRef.current); // PNG and its CSS px size
await tableRef.current.exportToPdf({ fileName: 'sales', chart });
// Without React: exportPivot(result, { format: 'pdf', chart }) from '@salmonui/export/pivot'.
```

## pivotToSeries

The data under the props, for other charts or custom drawing:

```ts
import { pivotToSeries } from '@salmonui/pivot-table';

const chart = pivotToSeries(pivot.result, { measure: 'amount', seriesBy: 'columns', type: 'column' });
// chart.data:       [{ category: 'Asia', s0: 4210, s1: 4630 }, ...]
// chart.series:     [{ id: 's0', name: '2025', type: 'column', xField: 'category', yField: 's0', pivotType: 'column' }, ...]
// chart.categories: ['Asia', 'Europe', 'Americas']
// chart.measure:    'amount'
```

Only the visible leaf members are charted: expanding a member replaces it
by its children (`Asia / Japan`, `Asia / India`). Series ids are positional
(`s0`, `s1`, ...); each record holds one value per series id.
`usePivotChartData(pivot, options)` is the same conversion of the store's
current result, and `pivotChartPropsOf(pivot, chart, options)` turns edited
data into props.

## Editing series

The series are plain `ChartSeriesOptions`: map them in ordinary code
before passing them to `Chart`.

```tsx
const props = usePivotChartProps(pivot);
const series = props.series.map((s, i) => (i === props.series.length - 1 ? { ...s, type: 'line' as const } : s));
<Chart {...props} series={series} />;
```

`chart.pointAt(seriesId, index)` returns the pivot cell behind a point:
`{ rowIndex, columnIndex, rowKey, columnKey, categoryPath,
categoryExpandable, parentPath }`.
