---
title: Sparkline axis, labels and events
description: Three monthly temperature sparklines on a shared y domain with a 0 °C baseline, padding modes, high and low labels, per-point colors and point hover and click events.
category: data-visualization
---

`domain` puts the three regions on one scale so they compare; `baseline`
draws the 0 °C line; `padding` changes the space around the line.
`labels={['high', 'low']}` with `format` writes the extremes, and
`getPointStyle` colors freezing months blue and hot months red. Hover a
sparkline, or Tab to it and use the arrow keys and Enter, to see
`onPointHover` and `onPointClick` in the status line.
