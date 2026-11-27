---
title: Bubble heat map with custom cells
description: A survey HeatMap of records with a value and a size field drawn as bubbles, long axis labels that trim or wrap, axis position and reversal, a title and subtitle, a custom tooltip, click and double-click events, formatCell and getCellStyle.
category: data-visualization
---

`valueField` colors each bubble and `sizeField` sizes it; switch the bubble
type to compare. The row labels are capped at 120 px by `maxLabelWidth`;
choose how they overflow, move the quarters to the top or reverse the
teams. `formatCell` stars scores of 85 and above, and `getCellStyle` greys
out cells with fewer than 12 responses. Hover a cell (or Tab to the map and
use the arrow keys) for the tooltip; click or double-click to log the
event.
