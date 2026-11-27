---
title: Chart axes
description: Linear, logarithmic, time, category and time-category axes with nice ticks, calendar-aware time ticks, ranges, multiple axes, label overlap strategies, edge labels and zoom ranges.
category: Charts
order: 20
demos: [chart-axis-scales, chart-axis-layout, chart-axis-labels]
---

Axes are `xAxis`, `yAxis` and any number of extra `axes` (each with an
`id` and a `direction`); a series picks its axes with `series.xAxis` /
`series.yAxis`, and `axis.position: 'end'` opposes an axis.
Every axis option below is a field of `xAxis`, `yAxis`, an `axes` entry or
a `ChartAxis` child of `Chart` (`@salmonui/charts/chart`).

## Panes

`panes` splits the plot into rows and columns; an axis picks its pane with
`axis.pane`, and its series follow it:

```tsx
<Chart
  panes={{ rows: ['70%', '30%'] }}
  axes={[{ id: 'volume', direction: 'y', pane: { row: 1 }, title: 'Volume' }]}
  series={[
    { type: 'line', xField: 'date', yField: 'close' },
    { type: 'column', xField: 'date', yField: 'volume', yAxis: 'volume' },
  ]}
/>
```

Axes on the left or right take a row (`pane.row`), axes on the top or
bottom a column (`pane.column`); `pane.span` covers several. A size is px,
`'n%'` of the plot or `{ size }`; unsized panes share the rest equally.
Axes of one side in different panes share one slot instead of stacking
outward, and each axis draws its line and title along its own pane.

## Scales

- `scale: 'linear'` (the default for numbers) uses 1-2-5 nice ticks.
- `scale: 'time'` (the default for `Date` values and ISO date strings)
  ticks on calendar boundaries: local midnight, the first of a month, ...
  in the chart `timeZone`. `axis.interval: { unit, step }` fixes the
  interval and `axis.format` takes a date skeleton (`'yMMMd'`) or
  `Intl.DateTimeFormatOptions`. Without `timeZone`, server and
  client render in UTC.
- `scale: 'category'` (the default for strings) and `scale: 'timeCategory'`
  (dates without gaps) place one band per value;
  `axis.labelPlacement: 'between' | 'on'` puts labels between ticks or on
  them, and `axis.indexed: true` gives every point index its own band, so
  repeated categories stay separate.
- `scale: 'log'` with `axis.base`.

<!-- demo: chart-axis-scales -->

## Ranges

`axis.min`, `axis.max`, `axis.interval` (numeric step), `axis.tickCount`,
`axis.includeZero` and `axis.padding: 'auto' | 'none' | 'normal' |
'additional' | 'round'` replace `minimum`, `maximum`, `interval`,
`desiredIntervals`, `startFromZero` and `rangePadding`.

## Labels

`axis.labelOverlap` resolves crowded labels: `'hide'` (keep every n-th),
`'trim'`, `'wrap'`, `'stagger'`, `'rotate45'` or `'rotate90'`, and
`axis.labelAngle` sets a fixed rotation. Widths come from a deterministic
text-width table, so server and client agree without measuring text.
`axis.edgeLabels: 'hide' | 'shift'` keeps the first and last
label inside the chart.

`axis.labelPosition` and `axis.tickPosition` (`'inside' | 'outside'`) put
the labels and the tick marks inside or outside the plot independently,
and `axis.plotOffset` (px) pads both ends of the axis.
`axis.ticks: false`, `axis.line: false`, `axis.hidden`, `axis.gridLines`
and `axis.minorTicks` toggle the parts of an axis; `axis.title`
with `axis.titleAngle` (degrees) names it. `axis.format` takes a
preset (`'n1'`, `'c0'`, `'p0'`), a `{value}` template or `Intl` options,
`axis.formatLabel(value)` returns the text, and `axis.renderLabel(ctx)`
returns SVG text content (a string or `<tspan>`s) for a tick.

Formats use the same grammar and output as Data Grid `column.format`:
presets (`'n2'`, `'c2'`, `'p1'`), `Intl.NumberFormatOptions` /
`Intl.DateTimeFormatOptions` and date skeletons (`'yMMMd'`, `'Hm'`), in
the chart `locale` and `timeZone`. There is no catalog-wide
locale context, so `locale` is a prop; set it so the server and the
client format alike.
`onAxisLabelClick({ axisId, value, text, index }, event)` reports a click
on a tick label, and `axis.domain(computed)` adjusts the computed range.

```tsx
<Chart
  data={sales}
  xAxis={{
    labelGroups: [
      { levels: [{ from: 'Jan', to: 'Mar', label: 'Q1' }, { from: 'Apr', to: 'Jun', label: 'Q2' }] },
      { levels: [{ from: 'Jan', to: 'Jun', label: 'H1' }], border: 'brace' },
    ],
  }}
  onAxisLabelGroupClick={({ label }) => console.log(label)}
  series={[{ type: 'column', xField: 'month', yField: 'north' }]}
/>
```

`axis.labelGroups` draws multi-level labels: one row per group (a column
on a vertical axis), one cell per level from a category (or value) to
another, with `border: 'rectangle' | 'brace' | 'curlyBrace' | 'none' |
'noTop' | 'noTopBottom'`; `onAxisLabelGroupClick` reports a click on a
cell.

<!-- demo: chart-axis-labels -->

## Crossing and bands

`axis.crossAt: { value, axis }` draws the axis line where the crossing
axis (default: the primary axis of the other direction) has `value`; the
labels stay at the plot edge unless `axis.labelsAtCross` moves them with
the line. `axis.reversed` inverts an axis.
`axis.bands: [{ from, to, every, until, layer, label, color, crossFrom,
crossTo }]` shades ranges behind or over the series, repeating with
`every`, and `crossFrom` / `crossTo` limit a band to a segment of the
crossing axis; `axis.lines` draws labelled value lines.

<!-- demo: chart-axis-layout -->

## Zoom range

The zoom range is a controlled triad: `zoomRange` / `defaultZoomRange` /
`onZoomRangeChange`, keyed by axis id in data units
(`{ x: [start, end] }`). Ticks are recomputed for the visible range.
`onVisibleRangeChange({ axisId, range })` fires once per committed change of
a continuous axis (never per drag frame), the hook for loading the data of
the visible range from the application or a `@salmonui/data` source.
See [Chart interaction](/docs/data-visualization/chart-interaction).

The zoom range demo is on [Chart interaction](/docs/data-visualization/chart-interaction).
Every axis field is listed under `ChartAxisOptions` in the
[API reference](/docs/reference/charts/chart).

## Axis scrollbar

There is no axis scrollbar, because it does not fit the Chart
bundle budget and its job is already covered: a zoomed chart pans by drag,
wheel and keyboard and through the zoom toolbar. To see and move the zoomed
window, link a [RangeSelector](/docs/data-visualization/range-selector):

```tsx
const [zoom, setZoom] = useState<ChartZoomRange>({ x: [0, 100] });

<Chart zoom zoomRange={zoom} onZoomRangeChange={(range) => setZoom(range)} /* ... */ />
<RangeSelector value={zoom.x} onValueCommit={(x) => setZoom({ x })} /* ... */ />
```

Run code that reacts to scrolling in `onZoomRangeChange`.
