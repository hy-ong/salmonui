---
title: Columns, bars and stacks
description: Column and bar series stacked, stacked to 100 % or grouped side by side or overlapping, with stack totals, band widths, range columns and a horizontal chart that combines bars with a line.
category: data-visualization
---

Switch `type` between `'column'` and `'bar'`, and `stack` between none,
`true` and `'percent'`; the negative "Returns" series stacks below zero
on its own. With `stack: true` the chart draws `stackLabels` (the totals).
Without a stack, `grouping` places the columns side by side or overlapping,
and the slider sets `bandWidth` (a fraction of the category).

The second chart is `orientation="horizontal"`: its range columns
(`lowField` / `highField`) become horizontal bars and combine with a line
series in the same chart.
