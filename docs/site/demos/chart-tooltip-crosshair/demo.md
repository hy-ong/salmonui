---
title: Tooltip, crosshair and trackball
description: Point, shared and split tooltips at the nearest point, the pointer or a fixed position, a custom tooltip render, crosshair lines with axis labels and category highlight, a snapping trackball, the tooltip and crosshair API, keyboard focus and touch long press.
category: data-visualization
---

Hover the chart, or Tab to the plot and use the arrow keys (Home / End,
PageUp / PageDown between series, Escape closes the tooltip; the focused
point is announced). On a touch screen, a long press shows the tooltip
and the page still scrolls vertically.

- `tooltip.mode`: `'point'`, `'shared'` (one box per x) or `'split'` (one
  per series); `tooltip.position`: `'nearest'`, `'pointer'` or `{ x, y }`;
  `tooltip.offset: 12` and `tooltip.format` for each line. "Custom render"
  passes `tooltip.render(ctx)`. Unchecking "Referral in tooltip" sets
  `series.tooltip: false`.
- `crosshair: { lines, snap, highlightCategory, axisLabels }`; `snap` with
  the shared tooltip is the trackball.
- The buttons call `api.showTooltip({ seriesId, index })`,
  `api.hideTooltip()`, `api.showCrosshair({ x })` and
  `api.hideCrosshair()`.
