---
title: PieChart
description: Pie, doughnut, semi pie and concentric ring charts from @salmonui/charts/pie-chart with explosion, grouping, smart labels, a legend toolbar, selection, tooltips and keyboard navigation.
category: Data Visualization
order: 20
demos: [pie-chart-basic, pie-chart-variants]
---

`PieChart` draws pies, doughnuts, semi pies and concentric rings. It lives in `@salmonui/charts/pie-chart` together with
[FunnelChart](/docs/data-visualization/funnel-chart) and loads no axis or
cartesian series code.

```tsx
import { PieChart } from '@salmonui/charts/pie-chart';
import '@salmonui/charts/pie-chart/styles.css';

<PieChart title="Sales" data={rows} valueField="sales" labelField="region" height={320} />
```

<!-- demo: pie-chart-basic -->

## Geometry

| Prop | Meaning |
| --- | --- |
| `radius` | outer radius in px or a percent of half the shorter plot side |
| `innerRadius` | doughnut hole in px or a percent of the radius |
| `center` | `{ x, y }` in px or percents of the plot |
| `startAngle`, `endAngle` | degrees clockwise from 12 o'clock (semi pies: `-90` to `90`) |
| `padAngle` | gap between slices in degrees |
| `series` | concentric rings, inner to outer: `[{ data, valueField, labelField, name }]` |
| `size="small"` | the pie sparkline: no title, legend or labels |

`radius` defaults to `'80%'`, `innerRadius` to 0, `startAngle` / `endAngle`
to 0 / 360. `centerLabel` is a node or `({ point, total }) => node`; it
shows the hovered or focused slice (`point` is null at rest). `explode`
(`true` or `{ offset, all }`, offset default 10 px) offsets slices; with it
a click or Enter toggles the slice through the `explodedPoints` /
`defaultExplodedPoints` / `onExplodedPointsChange` triad (indices of the
outer ring).

## Data and colors

`data` is records (or plain numbers). `emptyPoints` treats null values as
`'drop'` (default), `'zero'` or `'average'` of the neighbours.
`groupSmall: { threshold, by: 'value' | 'count', label }` merges slices
under a percent (or beyond the N largest) into one "Others" slice. Colors
come from the derived `--salmon-chart-*` palette; `colorField`, `palette`
and `getPointStyle` take data colors, and `patterns` overlays one system
fill pattern per slot for non-color encoding.

`labels` is `true` (default), `false` or `{ position, connector, maxWidth }`:
`'auto'` puts a label inside when it fits the slice and outside otherwise,
`'inside'` and `'outside'` force it. Outside labels sit in one column per
side, pushed apart so they never overlap, with `'line'` or `'curve'`
connectors; labels that cannot fit the box are hidden (the accessible table
still has every value). `formatLabel(point)` changes the text.

<!-- demo: pie-chart-variants -->

## Legend, selection, tooltip

`legend` (default on; `false`, or `{ position: 'top' | 'bottom' | 'start'
| 'end', title, toggle }`) is an APG toolbar of toggle buttons (one tab
stop, arrow keys; `toggle: false` makes the items static) bound to `hiddenPoints` / `defaultHiddenPoints` /
`onHiddenPointsChange` (point indices). `selection` (`true` or
`{ multiple }`, multiple by default) toggles points on click, Enter and
Space through `selectedPoints` / `defaultSelectedPoints` /
`onSelectedPointsChange` (`{ series, index }` references). Each triad is
controlled when the value prop is set and uncontrolled from the `default*`
prop otherwise; the change callbacks receive the new list and
`{ source, reason }`. Hovering dims the other slices (`highlight`, default
on) and shows the tooltip (`tooltip`, default on, or `{ format, render }`),
which mounts on the client only. `onPointClick(point, event)` and
`onPointHover(point | null)` receive `{ series, index, label, value,
fraction, color, datum }`. `annotations: [{ x, y, content }]` lays HTML
over the drawing.

## Keyboard and accessibility

The figure is labelled by the title and described by an automatic summary;
a visually hidden table (`accessibleTable={false}` leaves it out,
`showDataTable` shows it) lists label, value and percent. The plot is one tab stop: arrow keys move between slices,
Home / End to the first and last slice, PageUp / PageDown between rings,
Enter and Space select (and explode), Escape closes the tooltip,
and a polite live region announces "North: 42, 42%".

`ref` receives the instance: `element`, `export({ format, fileName })`,
`toBlob`, `toDataURL`, `toSVGString`, `print` and `focus`.

## Server rendering

Slices, labels, the legend and the table are server-rendered. Without
`height` (prop or CSS) the server renders the nominal size and the chart
relays out once after hydration (`onResize`); the tooltip and the entrance
animation are client only. See
[Size, animation and RTL](/docs/data-visualization/size-animation-rtl).

## Design notes

There is no 3D pie or doughnut; `PieChart` draws them flat, which
keeps angles and areas readable (see
[Chart](/docs/data-visualization/chart), "3D and specialized charts").
`patterns` is a single switch for non-color encoding, and fonts
and borders are system-owned, not props; see
[Rendering and colors](/docs/data-visualization/rendering-and-colors).
Every prop of `PieChart` and `FunnelChart` is listed in the
[API reference](/docs/reference/charts/pie-chart).
