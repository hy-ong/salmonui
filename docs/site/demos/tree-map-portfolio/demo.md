---
title: Portfolio colored by range, value and opacity
description: A TreeMap of holdings by sector that switches between palette, range, value and opacity color scales, with getItemStyle, hover highlight, a custom tooltip, item hover and click events and a root context-menu handler.
category: data-visualization
---

"Color by" switches `colorScale`: `range` colors by the daily change
(range starts), `value` by the exact analyst rating, and `opacity` fades
the sector color with the position size; "Sector (palette)" uses
`palette` alone. `getItemStyle` keeps the cash tile grey in every mode.

Hover a tile for the tooltip and `onItemHover` (Tab to the map and use the
arrow keys to show the tooltip from the keyboard); turn off "Highlight on hover" to keep tiles unchanged.
Clicking reports `onItemClick` (drilling is off here), and a right-click
reaches the root `onContextMenu` handler.
