---
title: Scatter, bubble and data colors
description: Scatter series with marker shapes, a bubble chart sized by population and colored per point, and columns colored by value ranges with a series, point, range or gradient legend.
category: data-visualization
---

The scatter chart plots two series; pick the marker shape of the second
(`markers.shape`). The bubble chart sizes each point by `sizeField`
between `radius: [6, 30]` px and colors it from `colorField` (data colors);
its legend is in `'point'` mode, one key per country (named by `tooltipField`). The column chart
colors points by `colorRanges`; switch `legend.mode` between `'series'`,
`'point'`, `'range'` and `'gradient'`.
