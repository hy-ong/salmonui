---
title: Chart
description: One Chart component with a series collection covering line, area, column, bar, scatter, bubble, financial, waterfall, histogram, box plot and Pareto series, with curves, stacks and data colors.
category: Charts
order: 10
demos: [chart-line-area, chart-columns-stacks, chart-scatter-bubble, chart-financial, chart-statistical, chart-polar, chart-live]
---

`Chart` lives in `@salmonui/charts/chart` (CSS: `@salmonui/charts/chart/styles.css`).
It is one component with a `series` collection: mixed types combine freely
in one chart.

```tsx
import { Chart } from '@salmonui/charts/chart';
import '@salmonui/charts/chart/styles.css';

<Chart
  title="Sales"
  data={rows}
  series={[
    { type: 'column', xField: 'month', yField: 'north', name: 'North' },
    { type: 'line', xField: 'month', yField: 'south', name: 'South', curve: 'monotone', markers: true },
  ]}
/>;
```

Series can also be written as children, which compile to the same model
(and render identically on the server):

```tsx
import { Chart, ChartAxis, ChartSeries } from '@salmonui/charts/chart';

<Chart data={rows}>
  <ChartSeries type="line" xField="month" yField="north" />
  <ChartAxis direction="y" title="Units" />
</Chart>
```

## Series types

| `type` | Covers | Notes |
| --- | --- | --- |
| `'line'` | line, spline, step line, multicolored line | `curve`, `segments` |
| `'area'` | area, spline area, step area, range area, spline and step range area | `lowField` + `highField` draw a range |
| `'column'`, `'bar'` | column, bar, range column | `bar` transposes; `lowField` + `highField` for ranges |
| `'scatter'`, `'bubble'` | scatter, bubble | `markers.shape`, `sizeField`, `radius: [min, max]` |
| `'hilo'`, `'ohlc'`, `'candle'` | high-low, high-low-open-close, candlestick | `openField`, `highField`, `lowField`, `closeField`; candles use the `success` / `danger` seeds, `upColor`, `downColor`, `hollow`; `volumeField` draws volume columns in the bottom fifth of the plot, in the candle colors, and adds the volume to the tooltip |
| `'waterfall'` | waterfall | `totals`, `subtotals` (indexes or a predicate), `connectors` |
| `'histogram'` | histogram | automatic bins or `binWidth`, `normalCurve` |
| `'boxPlot'` | box and whisker | `yField` holds an array per category; `quartileMethod: 'exclusive' \| 'inclusive' \| 'normal'`, `mean`, `outliers` |
| `'pareto'` | Pareto | sorted columns plus the cumulative percent line on a generated secondary axis; `pareto: { line, markers, color }` |

`orientation="horizontal"` transposes the whole chart, so bars combine with
lines and every other series type.

<!-- demo: chart-line-area -->

## Curves and steps

`series.curve` is `'linear'` (default), `'natural'`, `'monotone'` (no
overshoot), `'cardinal'` with `series.tension`, `'clamped'` or `'step'`.
Steps take `stepPosition: 'start' | 'center' | 'end'` and
`risers: false` to draw the steps without vertical risers.

## Stacks and groups

`series.stack: true | 'percent'` stacks series that share a value axis;
positive and negative values stack separately and `stackGroup` keeps
several stacks side by side. `stackLabels` draws the totals.
Columns of different series sit side by side; `grouping="overlap"`
overlaps them, `series.group` overlaps a subset, `bandWidth` (fraction of
the category, or px above 1) and `gap` size them.

<!-- demo: chart-columns-stacks -->

## Appearance and data colors

`name`, `hidden`, `order` and `opacity` set a series' legend name,
initial visibility, drawing order and opacity. Colors default to the derived palette slot (`--salmon-chart-1`
onward); `series.color`, `palette`, `colorField` and segment colors are
data colors, used as given. `lineStyle: 'solid' | 'dashed' | 'dotted'`
sets the stroke pattern. Segments color a line by value along
`segmentAxis`. `colorRanges` colors points by y value range and
feeds the range and gradient legends (see
[Chart elements](/docs/data-visualization/chart-elements)).

<!-- demo: chart-scatter-bubble -->

<!-- demo: chart-financial -->

## Error bars

`series.errorBars: { kind, amount, direction, caps, axis }` draws whiskers:
`kind` is `'fixed'`, `'percent'`, `'standardDeviation'`,
`'standardError'` or `'custom'` (`plusField` / `minusField`), `direction`
`'both' | 'plus' | 'minus'`, and `axis` `'y'` (default), `'x'` (continuous
x axes) or `'both'`.

<!-- demo: chart-statistical -->

## Live data

`data` is reactive: a new array (for example the old one with a point
appended and the oldest dropped) lays the chart out again, within 2 ms for
a 1,000-point window (`chart-perf.spec.ts`). `api.appendPoints(seriesId,
points, { maxPoints })` streams points through the chart store without a
React render of the parent; `@salmonui/data` live sources feed either.

## Descriptions

`series.description` is appended to the chart summary and the accessible
table caption, so screen readers hear what each series means; keyboard focus
moves through the series in `series` order.

<!-- demo: chart-live -->

## Polar and radar

```tsx
import { Chart } from '@salmonui/charts/chart';
import { polar } from '@salmonui/charts/chart/features';

<Chart
  coordinate="radar"
  features={[polar]}
  xAxis={{ startAngle: 0 }}
  radius={0.9}
  data={wind}
  series={[
    { type: 'area', xField: 'direction', yField: 'speed' },
    { type: 'line', xField: 'direction', yField: 'gust', closed: false },
  ]}
/>;
```

`coordinate: 'polar' | 'radar'` maps x to the angle (clockwise from
`xAxis.startAngle`, counterclockwise with `xAxis.reversed`) and y to the
radius from the center (`yAxis.reversed` inverts it); `radius` (0..1)
shrinks the circle. Polar charts draw circles, radar charts polygons
between the spokes. Every polar and radar draw type is a series type:
`line`, spline (`curve`), `area`, spline area, `column` (wedges, side by
side per series), range column (`lowField` / `highField`), `scatter`, and
the stacking variants with `stack`; lines and areas close back to the
first point unless `series.closed` is `false`. Hover, focus, tooltips,
selection and the accessible table work as on cartesian charts.

The polar layout is an opt-in feature: pass `features={[polar]}` from
`@salmonui/charts/chart/features`. It renders on the server and the client alike; a chart without it
never loads the code, draws the frame only and warns in development.
`features={[interactions]}` bundles the zoom, pan, selection and drag code
so it is ready on the first pointer event instead of loading after
hydration.

<!-- demo: chart-polar -->

## Field mapping

`xField`, `yField`, `lowField`, `highField`, `openField`, `closeField`,
`sizeField`, `colorField` and `tooltipField` read plain records, including
dotted paths such as `'price.close'`; `series.xAxis` / `series.yAxis` bind a
series to an axis by id. Per-series `data` overrides the chart
`data`.

## State, events and accessibility

Every interactive state is a controlled triad you can also leave
uncontrolled: `hiddenSeries` / `defaultHiddenSeries` /
`onHiddenSeriesChange`, `selectedPoints` / `defaultSelectedPoints` /
`onSelectedPointsChange` and `zoomRange` / `defaultZoomRange` /
`onZoomRangeChange`. Point and plot events (`onPointClick`,
`onPlotClick`, ...) are covered in
[Chart interaction](/docs/data-visualization/chart-interaction).

The chart is a `<figure>` named by `title` (or `aria-label` /
`aria-labelledby`) with an automatic summary and a visually hidden data
table; the plot is one tab stop with arrow-key navigation between points
and the legend is a toolbar of toggle buttons
([Chart interaction](/docs/data-visualization/chart-interaction),
"Keyboard").

The server renders the final SVG at the nominal size (`width`, else 600
px, and `height`, default 300) and the client relays out once after
hydration if the measured size differs, so there are no hydration
warnings; set `locale` and `timeZone` so the server and the browser format
alike ([Rendering and colors](/docs/data-visualization/rendering-and-colors)).

## Features and templates

Features load from their props through lazy chunks; nothing is registered
up front. Two features are explicit opt-in imports because they do not fit
the Chart bundle budget:

```tsx
import { polar, interactions } from '@salmonui/charts/chart/features';
import { technicalIndicators } from '@salmonui/charts/chart/indicators';

<Chart coordinate="polar" features={[polar]} /* ... */ />;
<Chart indicators={indicators} features={[technicalIndicators]} /* ... */ />;
```

Passing `interactions` is optional and makes zoom, pan and selection ready on
the first pointer event.

Custom content comes from render props, never from HTML string templates:
a string template would need HTML parsing and a sanitizer on the render
path and could not be type-checked. Use a tooltip `render`,
`series.renderMarker`, an axis `renderLabel` or `renderEmpty`:

```tsx
<Chart tooltip={{ render: ({ header, points }) => <div>{header}: {points[0]?.yText}</div> }} /* ... */ />
```

## Data, state and lifecycle

**Data.** `Chart` and the other visualizations take an array in
`data`. Load the rows through a `@salmonui/data` source or your own fetch
and pass the result; `Kanban` takes a `@salmonui/data` source directly.

**Persistence.** Components never write to `localStorage`, and
server output never depends on client storage. To restore a view, store the
controlled values from their change callbacks and pass them back:
`zoomRange`, `hiddenSeries` and `selectedPoints` on `Chart`, `value` on
gauges, `path` on `TreeMap`, `view` on `GeoMap` and `columnOrder` on
`Kanban`.

**Lifecycle.** React owns the lifecycle and renders stay pure, so
there are no load or loaded events that mutate the instance. Configure the
chart through props, and run code that needs the rendered chart in an
effect that reads the `ref`. There is no animation-complete callback.

**Updates.** Props are reactive: a changed prop re-renders
only the affected part, so there is no refresh method. If you mutated data
in place, pass a new array. `series` and `axes` are plain arrays with one
source of truth, so there are no methods that add or remove series or axes:
keep them in application state and update the arrays. For streaming, use
`api.appendPoints(seriesId, points)`.

**WebMCP.** WebMCP is a browser API proposal, so components do not
register tools. Your application can register its own tools against the
`ref` APIs.

## 3D and specialized charts

There are no 3D charts, because 3D perspective distorts length and area
judgments and has poor accessibility.

- **3D column and bar series.** Use `Chart` with `column` and `bar`
  series, in any stacking mode.
- **Depth, rotation and tilt.** Not supported. Scientific 3D
  plotting would be a separate WebGL product.
- **3D pie and donut.** Use
  [PieChart](/docs/data-visualization/pie-chart), which has pie, donut,
  explode, labels, legend, tooltip, selection and export.
- **3D legend, tooltip, labels, selection, export and print.** Each
  is available on the flat `Chart` or `PieChart`.
- **Smith chart.** Not built, because it serves radio-frequency
  engineering only; use a dedicated RF plotting library. `coordinate`
  accepts `cartesian`, `polar` and `radar`.
- **Chart wizard.** There is no built-in chart wizard. `Chart` props
  are plain data, so an application can build a guided editor on top.

Every prop is listed in the [API reference](/docs/reference/charts/chart).
