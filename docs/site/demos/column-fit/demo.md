---
title: Column fit and computed headers
description: Switch `resizeMode` between `'auto'` (columns stretch to fill the grid and a resize re-fits the others) and `'normal'` (widths are kept and the space stays empty), and compute header text with `headerValueGetter`.
---

In `'auto'` mode the six columns stretch to the grid width; Country stops at
its 160px `maxWidth`. Narrow a column by its header edge and the others grow
so the total still matches the grid; widen it past the grid and the grid
scrolls. The Qty, Unit price and Amount headers come from
`headerValueGetter`; switch the currency and the headers, the column chooser
and exports follow.
