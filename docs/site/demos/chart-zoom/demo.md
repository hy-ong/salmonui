---
title: Zoom, pan and the zoom toolbar
description: A 2,000-point chart with wheel, pinch and rectangle zoom along x, y or both, pan, deferred pan, the zoom toolbar and a controlled zoom range whose changes and committed visible ranges are logged.
category: data-visualization
---

Drag a rectangle to zoom, use the wheel (or pinch with two fingers on a
touch screen), and Shift + drag or the toolbar's pan tool to pan; with the
plot focused, `+`, `-` and `0` zoom from the keyboard. The toolbar
(`zoom.toolbar`) switches the drag tool and zooms in, out and back.

The chart is controlled: `zoomRange` is demo state, so every committed
step arrives in `onZoomRangeChange(range, event)` with its `reason` and
`source` and is applied by the demo; the buttons set the range from
outside. `onVisibleRangeChange` fires once per committed change of the x
axis (the hook for fetching the visible rows), never per drag frame.
`deferred` moves only the drawn series while panning and lays out once
on release.
