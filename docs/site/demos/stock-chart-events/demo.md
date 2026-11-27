---
title: Stock events and live prices
description: Earnings, dividend, split and volume events marked on a StockChart with glyph shapes or custom markers, and live prices appended while the selected period keeps its window at the data end.
category: data-visualization
---

`events` marks five dates: a flag, a circle, a pin, an up arrow on the
volume bars (`seriesIds: ['volume']`) and a text label; each has a
description that assistive technology reads from a visually hidden list.
"Custom event markers" passes `renderEvent(event)`.

"Start live prices" appends a trading day every 400 ms by passing a new
`data` array. The 3M period stays selected, so its window moves with the
data end; with "All" the chart follows the full data, and a range you
narrow by hand stays put. For streams that must not re-render the parent,
`ref.current.appendPoints('price', rows, { maxPoints })` writes into the
chart store instead.
