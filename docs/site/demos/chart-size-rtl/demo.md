---
title: Size, animation, RTL and JSX children
description: A chart sized by its container's CSS that relays out on resize and reports onResize, animated or still data changes, a right-to-left container, and series and axes written as JSX children.
category: data-visualization
---

The chart has no `height` prop: it fills the CSS height of its root
(`style={{ height }}`) and the width of its container. Move the sliders:
one `ResizeObserver` writes the new size into the chart store and
`onResize` reports it. "Change data" plays the update transition when
`animated` is on (the entrance and transitions are off under
`prefers-reduced-motion`). "Right to left" sets `dir="rtl"` on the
container: the title and the legend mirror while the x axis keeps reading
left to right. The series and the y axis title are `ChartSeries` and
`ChartAxis` children, which compile to the same model as the arrays.
