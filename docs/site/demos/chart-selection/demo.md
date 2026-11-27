---
title: Selection, highlight, point events and editing
description: Point, series and cluster selection with a controlled selectedPoints list, hover highlight, styling hooks, point and plot events, range and lasso selection on a scatter chart, and a line whose points are edited by drag or keyboard.
category: data-visualization
---

Click columns (Ctrl / Cmd adds with `multiple`, Enter selects the focused
point). `selection.mode` picks `'point'`, `'series'` or `'cluster'`; the
selection is the controlled `selectedPoints` triad, shown below the chart.
Selected marks carry `data-selected` and dimmed ones `data-dimmed`; the
demo styles them with a class. `highlight` fades everything but the
hovered series, point or cluster, and `legend.highlight` dims the other
series while a legend item is hovered.

The event log shows `onPointClick`, `onPointDoubleClick`, `onPointHover`,
`onPlotClick` (any click on the plot, with data values) and the root
`onContextMenu` DOM handler.

On the scatter chart, drag a rectangle (`mode: 'range'`) or draw a lasso
(`mode: 'lasso'`); `onRangeSelect` reports the ranges and points.

The last chart sets `series.editable: { min, max, step }`: drag a point or
focus the plot and press Up / Down. `onPointChange` proposes the value and
the demo writes it into its data.
