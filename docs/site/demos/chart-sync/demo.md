---
title: Synchronized charts
description: Two charts in a ChartSyncGroup share the hovered day (tooltip and crosshair), the x zoom range and the selected points; each kind of sync can be switched off.
category: data-visualization
---

Hover one chart and the other shows its tooltip and crosshair at the
same day; zoom one (drag or wheel) and the other follows; click a point
and the other chart proposes the same index through
`onSelectedPointsChange` with `reason: 'sync'`. The group's `tooltip`,
`crosshair`, `zoom` and `selection` props pick what is shared. Each group
instance has its own store, so several groups on a page stay independent.
