---
title: Renderers, large data and data colors
description: Up to 500,000 points drawn as SVG or on a canvas with min/max or LTTB decimation, a server-rendered SVG figure with an accessible data table, the derived palette or a brand palette, and per-point data colors.
category: data-visualization
---

The signal chart takes up to 500,000 points. `renderer` moves only the
line to a canvas (`'auto'` switches above 20,000 drawn points) while the
axes stay SVG; `decimation` reduces the points per pixel column before
they reach the renderer, and the tooltip still reads the full data.

Both charts are SVG figures rendered on the server (view the page source)
and relaid out once after hydration. Each is a `<figure>` named by its
title with a visually hidden data table; "Show the data table" sets
`showDataTable`. The sales chart reads dotted paths (`'sales.actual'`),
colors its series from the derived `--salmon-chart-*` palette or from a
`palette` of brand data colors, and `getPointStyle` paints the
below-target columns red. In development each chart checks its data
colors against the plot surface and warns below 3:1.
