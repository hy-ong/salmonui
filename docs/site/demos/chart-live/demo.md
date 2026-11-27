---
title: Live data and empty state
description: Stream server load into one chart through reactive data and into another through api.appendPoints, clear the data to see the empty state, with series descriptions for screen readers.
category: data-visualization
---

Start the stream: every 250 ms the first chart gets a new `data` array
(oldest point dropped) and the second receives the same point through
`ref.current.appendPoints('cpu', [point], { maxPoints: 60 })`, which
writes the chart store without rendering the demo. "Clear data" passes an
empty array: the axes stay and `renderEmpty()` replaces the localized
"No data" text. Each series has a `description`, appended to the chart
summary and the accessible table caption.
