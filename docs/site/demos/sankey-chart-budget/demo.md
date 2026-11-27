---
title: Budget flow with custom tooltips
description: A monthly budget SankeyChart with custom node and link tooltips, getNodeStyle and getLinkStyle colors, formatLabel value labels, onResize and SVG / PNG export through the instance.
category: data-visualization
---

Hover a node or a flow (or Tab to the chart and use the arrow keys) to see
the `renderNode` and `renderLink` tooltips. Income nodes are green,
spending orange and savings blue through `getNodeStyle`; `getLinkStyle`
fades flows under $500. Resize the window to see `onResize`, and use the
buttons to call `export()` and `toSVGString()` on the instance.
