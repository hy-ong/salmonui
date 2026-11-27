---
title: Chart elements
description: Titles, the legend toolbar with toggling and paging, data labels, last-value badges, inline series labels and annotations.
category: Charts
order: 40
demos: [chart-legend, chart-labels-markers]
---

## Title

`title` and `subtitle` are drawn at the top, start-aligned, and label the
`<figure>` through its `figcaption`. For a custom heading, omit
`title` and pass `aria-labelledby` with the heading's id, or `aria-label`;
they name the figure and the focusable plot and win over `title` and the
generated summary (`aria-labelledby` first). The title position is
fixed, which keeps a consistent reading order for assistive technology; for
a custom layout, render your own heading next to the chart and reference it
with `aria-labelledby`. Without any of them, the accessible name comes from
the generated data summary.

## Legend

The legend appears with two or more series (`legend` forces it,
`legend={false}` hides it). It is drawn in the SVG and covered by an APG
Toolbar of toggle buttons: one tab stop, arrow keys between items (mirrored
in RTL), `aria-pressed` for the visible state, and the full series name as
the accessible name even when the drawn label is truncated.

Toggling proposes a change of the `hiddenSeries` / `defaultHiddenSeries` /
`onHiddenSeriesChange(ids, event)` triad; `legend={{ toggle: false }}` makes
the buttons plain. `legend={{ overflow: 'page' }}` pages a long
legend with previous / next buttons; `legend.title` and
`legend.maxLabelWidth` add a title and truncate labels with an ellipsis.

`legend.position` is `'auto'`, `'top'`, `'bottom'`, `'start'` or `'end'`;
`align: 'start' | 'center' | 'end'` places the legend along that edge and
`orientation: 'vertical'` lays a top or bottom legend out in one column
(side legends are always one column, top and bottom legends wrap in rows by
default); `columns` fixes a grid and `reverse` flips the order.

`legend.mode` picks the items:

- `'series'` (default): one toggle per series.
- `'point'`: one item per point of the first visible series, in the point
  colors (`colorField`, `colorRanges`, `getPointStyle`).
- `'range'`: one item per `colorRanges` entry (`label`, or `from – to`).
- `'gradient'`: one key with the `colorRanges` colors from the lowest
  `from` to the highest `to`.

Point, range and gradient items are keys: they highlight on hover and focus
but do not toggle. `colorRanges={[{ from, to, colors, label }]}` colors every
point by its y value (several colors split the range into equal steps;
data colors).

`legend.renderItem(item)` returns custom content for an item (an icon, an
image, rich text): it is rendered inside the item's toolbar button, on the
server too, and replaces the drawn symbol and text; the accessible name
stays the series name. Custom items are HTML, so they are not part of the
exported SVG. For a legend image, render an `<img>` in
`renderItem`:

```tsx
<Chart legend={{ renderItem: (item) => <><img src={`/icons/${item.id}.svg`} alt="" width={12} />{item.label}</> }} ... />
```

`series.legendShape` picks the drawn symbol per series: any marker shape
(`'circle'`, `'rectangle'`, `'triangle'`, `'diamond'`, `'star'`, ...) or
`'seriesType'` (default, a symbol for the series type).

<!-- demo: chart-legend -->

## Data labels

`series.labels` (or `{ position, format, angle, showZero }`) prints values
at the points; `format` is a preset (`'n0'`, `'c2'`, `'p1'`), a `{value}`
template or a function of the point.
`labels.render(ctx)` returns SVG content placed at the label anchor
(`<text>`, `<tspan>`s, an `<image>`), so custom labels stay in the drawing
and the export.

Smart labels: `labels.overlap` decides what a label that collides
with an earlier one does: `'hide'`, `'shiftY'` / `'shiftX'` (moved up to
three label sizes, inside the plot), `'rotate90'`, or `'none'` (default).
One collision pass runs over every series that sets it, earlier series
first, with the text-width table (identical on the server).
`labels.dedupe` drops a label that repeats the previous label of its
series.

## Markers

`series.markers` (`true` or `{ shape, size, filled }`) draws a symbol per
point. `series.renderMarker(ctx)` returns SVG content centered on each point
instead, for images (`<image href>`) or any custom shape:

```tsx
{ type: 'line', xField: 'month', yField: 'sales', markers: true, renderMarker: () => <image href="/pin.svg" x={-6} y={-6} width={12} height={12} /> }
```

## Badges and inline labels

`series.lastValue` draws the last value at the plot edge and
`series.inlineLabel` the series name at the end of the line.

## Annotations

`annotations={[{ x, y, content }]}` places any `ReactNode` at data
coordinates (`units: 'data'`, default) or pixels (`units: 'pixel'`), on the
axes named by `xAxis` / `yAxis`.

<!-- demo: chart-labels-markers -->

All of these are `Chart` props or `series` fields of
`@salmonui/charts/chart` (`ChartLegendOptions`, `ChartDataLabels`,
`ChartMarkers`, `ChartAnnotation` in the
[API reference](/docs/reference/charts/chart)).
