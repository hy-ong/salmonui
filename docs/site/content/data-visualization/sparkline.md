---
title: Sparkline
description: Tiny line, area, column and win-loss charts from @salmonui/charts/sparkline, server-rendered as static SVG and cheap enough for hundreds of Data Grid cells.
category: Data Visualization
order: 10
demos: [sparkline-basic, sparkline-grid, sparkline-axis-events]
---

`Sparkline` draws a word-sized chart. It lives in `@salmonui/charts/sparkline`
with its own stylesheet and never loads the axis, legend, tooltip-layer or
canvas code of the larger charts: the entry is under 4 KB gzip.

```tsx
import { Sparkline } from '@salmonui/charts/sparkline';
import '@salmonui/charts/sparkline/styles.css';

<Sparkline data={[3, 5, 4, 9, 6, 8]} highlights={{ high: true, low: true }} />
```

<!-- demo: sparkline-basic -->

## Types and data

`type` is `'line'` (default), `'area'`, `'column'` or `'winLoss'` (positive,
negative and tie bars; `tieColor` colors ties). `data` is a number array or
records read through `yField` and `xField` (nested paths such as
`'price.close'` work). Without `xField` points are evenly spaced;
`scale="time"` places them by their x value (numbers or `Date` instances,
epoch ms), `scale="category"` keeps them evenly spaced in data order.

`width` and `height` (default 100 x 24) are the drawing size in px; the SVG
scales to its CSS box through `viewBox`, so there is no `onResize`.
`renderer="canvas"` (or `'auto'`, from 20,000 points) draws the marks on a
canvas when `canvasRenderer={sparklineCanvas}` from
`@salmonui/charts/sparkline/canvas` is passed; without it the marks stay SVG.
`animated` (default `true`) plays the entrance after hydration with
the opt-in `@salmonui/charts/viz-animations.css`.

## Highlights, markers, labels and bands

| Prop | Meaning |
| --- | --- |
| `highlights` | `{ high, low, first, last, negative }`: `true` uses the success, danger and primary seeds, a hex string is a data color |
| `markers` | `'all'` or a list of point kinds that get a dot |
| `labels` | the same selector for value labels, formatted with `format` (`Intl.NumberFormatOptions` or a function) and `locale` |
| `bands` | `[{ from, to, color }]` range bands behind the line |
| `domain` | `{ x: [min, max], y: [min, max] }` fixes the extents |
| `baseline` | draws the axis line at a value (columns and areas grow from it) |
| `padding` | `'none'`, `'normal'` (default) or `'additional'` space around the extent |
| `color`, `palette` | the series data color, and data colors per bar |
| `getPointStyle(point)` | per-point `{ color, hidden }` |

Stroke widths and marker sizes are system-owned.

## Tooltip and events

`tooltip` (`true` or `{ format, render, trackLine }`) makes the sparkline
one focusable image: the tooltip chunk loads on the first pointer enter or
focus, then hover, arrow keys, Home and End move between points and Escape
hides it. `onPointClick` and `onPointHover` receive `{ point, source,
nativeEvent }`; Enter clicks the focused point. Without these props the SVG
has no listener and no state at all.

The root is `<svg role="img">` with an automatic summary as its name
("Sparkline, 12 points, minimum 3, maximum 9, first 4, last 8, trending
up"); pass `label` to replace it. `ref` receives the `<svg>`. The sparkline has
no controlled state; it is a tab stop only when `tooltip` is set.

<!-- demo: sparkline-axis-events -->

## Server rendering

The server markup is the final SVG: no effect, store or observer runs, and
the tooltip chunk and the animation attribute are added on the client only,
so hydration never differs.

## In Data Grid cells

Render a sparkline from a column's `renderCell`. The grid virtualizes rows
and every sparkline is final static markup, so 500 sparklines scrolled at
2,000 px/s keep the Data Grid scroll budgets (a `bench` core path).

<!-- demo: sparkline-grid -->

## Pie sparklines

`Sparkline` has no pie type: a pie layout with labels would grow
the `Sparkline` bundle, which must stay small for grid cells. For a pie in
a cell, use `<PieChart size="small" data={...} valueField="..." />` from
[`@salmonui/charts/pie-chart`](/docs/data-visualization/pie-chart): no
legend, no labels, no title, static until hovered. Stroke widths, marker
sizes and the container area styling are system-owned, not props; see [Rendering and colors](/docs/data-visualization/rendering-and-colors).
Every prop is listed in the [API reference](/docs/reference/charts/sparkline).
