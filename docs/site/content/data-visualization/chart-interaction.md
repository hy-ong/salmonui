---
title: Chart interaction
description: Tooltips, trackball, rectangle and wheel zoom, pan, point selection and the instance API, all driven by a per-chart store instead of React state.
category: Charts
order: 30
demos: [chart-tooltip-crosshair, chart-zoom, chart-selection, chart-sync]
---

Pointer, wheel and drag transients live in a per-chart store; React
re-renders only the tooltip layer when the hovered point changes, never per
pointer move. Committed changes go through controlled triads.

## Tooltip

`tooltip` (or `tooltip={{ format, header }}`) shows the hovered point;
`series.tooltip: false` opts a series out. `tooltip.render(ctx)`
returns any `ReactNode` and runs only for the hovered point.
`ref.current.showTooltip({ seriesId, index })` and `hideTooltip()` open and
close it from code.

`tooltip.mode` is `'point'` (default), `'shared'` (one box for every
series at the x) or `'split'` (one box per series, each at its own point). `tooltip.position` is `'nearest'` (default: above the nearest
point, found by binary search on the sorted x, no DOM hit-testing),
`'pointer'` (follows the pointer) or `{ x, y }` (fixed, drawing px), and
`tooltip.offset` is the gap in px. The tooltip, crosshair and
hover marks are a lazy overlay chunk mounted after hydration; a pointer
move costs one store write (the hover handler stays under 1 ms on 100,000
points, `chart-perf.spec.ts`).

## Crosshair

`crosshair` draws lines at the pointer: `lines: 'both' | 'x' | 'y'`,
`snap` (to the nearest point), `highlightCategory` (shades the hovered
category band), `axisLabels` (value boxes on the axes) and
`formatLabel(value, axisId)` for their text. `api.showCrosshair(point)`
takes a point (`{ seriesId, index }`) or data values (`{ x, y }`) and
`api.hideCrosshair()` hides it; the position lives in the chart store.

## Synchronized charts

```tsx
<ChartSyncGroup tooltip crosshair zoom selection>
  <Chart data={a} selection ... />
  <Chart data={b} selection ... />
</ChartSyncGroup>
```

Charts in one `ChartSyncGroup` share the hovered x (tooltip and
crosshair), the x zoom range and, between charts with `selection`, the
selected point indices: a click in one chart proposes the same indices in
the others through `onSelectedPointsChange` with `reason: 'sync'`. Each
group instance has its own store.

<!-- demo: chart-sync -->

## Plot events and touch

`onPlotClick(point, event)` and `onPlotPointerMove(point, event)` fire
anywhere on the plot (not only on points) with drawing coordinates and the
data values under the pointer: `{ x, y, xValue, yValue }`, `xValue` a
category, `Date` or number of the x axis and `yValue` of the first y axis.
`onClick`, `onDoubleClick`, `onContextMenu` and `onPointerDown`,
`onPointerUp`, `onPointerMove` and `onPointerLeave` are DOM handlers on the
chart root. `StockChart` and `Gauge` take the same set, `TreeMap` the click,
double click, context menu and pointer move handlers. `Sparkline` and
`GeoMap` keep their bundles small and take none: put the handlers on a
wrapping element, where these events bubble.

Touch uses Pointer Events: a long press (500 ms) shows the tooltip of the
nearest point and moving the finger cancels it; the plot sets
`touch-action: pan-y` so the page still scrolls vertically, and `none` when
zoom, pan, range or lasso selection or point drag need the gestures.
Layout follows the container size, never device detection.

## Trackball

`crosshair={{ snap: true }}` with `tooltip={{ mode: 'shared' }}` makes a
trackball: the crosshair snaps to the nearest x, every series
at that x is highlighted and listed in one tooltip.

<!-- demo: chart-tooltip-crosshair -->

## Zoom and pan

`zoom` turns on wheel zoom, rectangle selection zoom and pan;
`zoom={{ wheel, selection, pan, mode: 'x' | 'y' | 'xy' }}` picks them.
Shift + drag (or drag with `selection: false`) pans a zoomed
chart; the pan frame stays in the store until release. Every
committed step calls `onZoomRangeChange(range, event)` with
`event.reason` `'wheel' | 'selection' | 'pan' | 'pinch' | 'keyboard' |
'toolbar' | 'reset'`; a controlled chart vetoes by keeping its
`zoomRange`; `+`, `-` and `0` zoom from the keyboard and
`api.resetZoom()` resets. `zoom.wheel` and `zoom.pinch` (two
touches, `touch-action: none` on the plot) zoom around the pointer or
the midpoint of the fingers; the pinch frame stays in the store until the
fingers lift; `zoom.pinch: false` turns pinch off. A wheel step on
100,000 points stays within a 16.7 ms frame at p95 (`chart-perf.spec.ts`).
`zoom.deferred` moves only the drawn series during
a pan and lays out once on release.

### Lazy loading

`onVisibleRangeChange({ axisId, range })` fires when a zoom or pan
commits (never per drag frame), so an application fetches the rows of the
visible range. `createRangeSource` from `@salmonui/data` does the fetching:
it widens each request by half its span, caches loaded ranges, aborts
superseded loads and exposes a snapshot for `useSyncExternalStore`:

```tsx
import { createRangeSource } from '@salmonui/data';

const source = createRangeSource({ load: ([from, to], { signal }) => fetch(`/ticks?from=${from}&to=${to}`, { signal }).then((r) => r.json()) });

function LiveChart() {
  const { rows } = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  return <Chart data={rows} zoom xAxis={{ scale: 'time', min: start, max: end }} onVisibleRangeChange={({ range }) => source.request(range)} series={[{ xField: 't', yField: 'v' }]} />;
}
```

There is no axis scrollbar; a linked `RangeSelector` navigator shows and
moves the zoomed window (see
[Chart axes](/docs/data-visualization/chart-axes), "Axis scrollbar").

The drag, wheel and pinch code is a lazy chunk loaded after hydration
when `zoom`, a range or lasso `selection`, or `onPointChange` is on; the
plot gets `data-interactive` once it is ready.

```tsx
import '@salmonui/navigation/toolbar/styles.css';
import '@salmonui/buttons/button/styles.css';

<Chart zoom={{ toolbar: ['zoom', 'pan', 'zoomIn', 'zoomOut', 'reset'], toolbarPosition: 'topEnd' }} {...props} />
```

`zoom.toolbar` (`true` for every tool, or a list) renders the zoom toolbar
after hydration: Navigation's `Toolbar` with a `ToggleButtonGroup` for the
drag tool (rubber-band zoom or pan) and buttons for zoom in, zoom out and
reset (disabled while not zoomed). It loads from the public
`@salmonui/navigation/toolbar` and `@salmonui/buttons/button` entries in a lazy
chunk, so import their stylesheets; `zoom.toolbarPosition` is `'topEnd'`
(default), `'topStart'`, `'bottomEnd'` or `'bottomStart'`, and
`text.zoomToolbar`, `zoomTool`, `zoomIn`, `zoomOut`, `pan` and
`resetZoom` localize the names.

<!-- demo: chart-zoom -->

## Selection

`selection` (or `selection={{ mode: 'point' | 'series', multiple }}`)
selects points by click or Enter; the triad is `selectedPoints` /
`defaultSelectedPoints` / `onSelectedPointsChange(points, event)` with
`{ seriesId, index }` entries, and Ctrl / Cmd adds to the selection.
Selected marks carry `data-selected` for styling; series under a
legend hover carry `data-highlighted` and the others `data-dimmed`.
`mode: 'series'` selects the whole series and `mode: 'cluster'`
every series' point at the clicked index.

`selection={{ mode: 'range', axis: 'x' | 'y' | 'xy' }}` selects the points
inside a dragged rectangle (a band along x or y for one axis) and
`mode: 'lasso'` the points inside a drawn polygon (point-in-polygon on the
model's anchors, no DOM hit-testing). Both propose the points through
`onSelectedPointsChange` with `reason: 'range' | 'lasso'` and call
`onRangeSelect({ ranges, points }, event)` with the data range per axis.

`highlight: 'series' | 'point' | 'cluster'` fades everything but the
hovered series, point or index (`data-faded`, set on the marks without a
React render), and `legend.highlight` dims the other series while a legend
item is hovered or focused. `onPointClick`,
`onPointDoubleClick` and `onPointHover` receive the point context
`{ seriesId, index, datum, x, y, ... }`.

## Editing points

```tsx
<Chart
  data={rows}
  series={[{ xField: 'month', yField: 'units', markers: true, editable: { min: 0, max: 100, step: 1 } }]}
  onPointChange={({ index, value }) => setRows((r) => r.map((d, i) => (i === index ? { ...d, units: value } : d)))}
/>
```

`series.editable` lets the pointer drag a point's value; the preview is a
store overlay and `onPointChange({ seriesId, index, value }, event)` fires
once on release with the value clamped to `min` / `max`. With the plot
focused, Up / Down (Left / Right in a horizontal chart) step the focused
point by `step` (default a tenth of the tick interval, Shift for ten
steps). Edits are proposals: the application updates `data`.

<!-- demo: chart-selection -->

## Keyboard

The plot is one tab stop. Arrow keys move a virtual focus between points,
Home / End jump to the ends, PageUp / PageDown switch series, Enter
selects, Escape closes the tooltip; the focused point is announced through
a polite live region. Every figure family (`PieChart`, `FunnelChart`, `HeatMap`, `TreeMap`,
`SankeyChart`, `GeoMap`, `Gauge`, `BulletChart`) follows the same model:
one tab stop, a virtual focus announced politely, legends as APG
Toolbars; their accessibility trees are pinned as ARIA snapshots.

There are no global shortcuts: a key like Alt+J collides with
screen reader and browser keys, and intercepting Ctrl+P would hijack
browser printing. Each visualization is one tab stop with the full keyboard
model inside. For a shortcut, call `api.focus()` from your own key handler,
and call `api.print()` from a button.

## Reference

`ChartApi` (the `ref`), `ChartTooltipOptions`, `ChartCrosshairOptions`,
`ChartZoomOptions` and `ChartSyncGroupProps` are in the
[API reference](/docs/reference/charts/chart); the `interactions` feature
is in [`@salmonui/charts/chart/features`](/docs/reference/charts/chart-features).
