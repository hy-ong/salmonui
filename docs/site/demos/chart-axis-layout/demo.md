---
title: Multiple axes, panes, crossing and bands
description: A chart with three value axes, a pane for one of them, grid lines and minor ticks, axis titles, value bands and lines, and a second chart whose axes cross at zero and can be reversed.
category: data-visualization
---

The output chart binds its series to axes by id (`series.yAxis`); the
temperature axis moves between the start and `position: 'end'`. With
panes on, `panes={{ rows: ['70%', '30%'] }}` and `axis.pane: { row: 1 }`
put the defects axis and its series in their own pane. That axis hides its
tick marks and line (`ticks: false`, `line: false`). `gridLines` and
`minorTicks` toggle the grid, `titleAngle` rotates the axis titles, and
`bands` / `lines` shade a target zone, a summer shutdown (on the category
axis, by index) and a dashed minimum line.

The second chart draws both axes through the origin with
`crossAt: { value: 0 }`; `labelsAtCross` moves their labels with them and
`reversed` flips the y axis.
